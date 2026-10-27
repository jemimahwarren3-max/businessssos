import { describe } from "vitest";

/** CI runs `vitest run` without a staging token. Skip those files instead of throwing. */
export const describeStaging = process.env["SUPABASE_ACCESS_TOKEN"]?.trim()
  ? describe
  : describe.skip;

// Hardcoded on purpose — these tests must never run against production
// regardless of which project the local .env currently points at (see
// scripts/switch-env.mjs). Every test creates its own throwaway rows and
// cleans them up; nothing here should ever leave staging dirtier than it
// found it.
const STAGING_PROJECT_REF = "slajanbsfqjnuuiohbmg";

function getAccessToken(): string {
  const token = process.env["SUPABASE_ACCESS_TOKEN"];
  if (!token) {
    throw new Error(
      "Missing SUPABASE_ACCESS_TOKEN — set it in .env to run the integration tests (Management API access, not a database password).",
    );
  }
  return token;
}

export class SqlError extends Error {}

const MAX_TRANSIENT_RETRIES = 3;

/** Runs raw SQL against staging via the Supabase Management API — the same
 * method used manually throughout this project's development. Returns the
 * result rows of whatever the script's final statement produces.
 *
 * Retries a handful of times, with backoff, but only on *transient*
 * failures (a non-JSON body — an HTML error/throttling page instead of a
 * real API response — or a network-level fetch rejection). A well-formed
 * JSON error response is a real result (a genuine SQL/RLS/permission
 * error many tests specifically assert on) and must never be retried or
 * swallowed — retrying that would silently turn a real assertion target
 * into a flake instead. */
export async function sql<T = Record<string, unknown>>(query: string): Promise<T[]> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= MAX_TRANSIENT_RETRIES; attempt++) {
    if (attempt > 0) {
      await new Promise((resolve) => setTimeout(resolve, 300 * 2 ** (attempt - 1)));
    }
    let res: Response;
    try {
      res = await fetch(
        `https://api.supabase.com/v1/projects/${STAGING_PROJECT_REF}/database/query`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${getAccessToken()}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ query }),
        },
      );
    } catch (error) {
      lastError = error;
      continue; // network-level failure — transient, retry
    }

    let json: unknown;
    try {
      json = await res.json();
    } catch (error) {
      lastError = error; // non-JSON body (HTML error/throttle page) — transient, retry
      continue;
    }

    if (!res.ok) {
      const message =
        json && typeof json === "object" && "message" in json
          ? String((json as { message: unknown }).message)
          : JSON.stringify(json);
      throw new SqlError(message); // real, well-formed error — never retried
    }
    return json as T[];
  }
  throw lastError instanceof Error
    ? lastError
    : new SqlError(`Management API call failed after ${MAX_TRANSIENT_RETRIES + 1} attempts.`);
}

/** Runs `query` as if it came from an authenticated request from `userId` —
 * the same set_config('request.jwt.claims', ...) + set local role
 * simulation used manually to verify RLS throughout this session. Only
 * valid for the rest of the same script, so the role-sensitive statement(s)
 * must be part of `query` itself, not a follow-up call.
 *
 * Two things this deliberately guards against (found by the tests
 * themselves failing before this was added): a bare `select set_config(...)`
 * is itself a row-producing statement that pollutes the result set the
 * caller's query expects — wrapped in a do-block instead, which produces
 * none. And `reset role` at the end ensures the authenticated role can
 * never bleed into a later, supposedly-unscoped sql() call sharing the same
 * underlying connection. */
export async function asUser<T = Record<string, unknown>>(
  userId: string,
  query: string,
): Promise<T[]> {
  try {
    return await sql<T>(`
      do $$
      begin
        perform set_config('request.jwt.claims', json_build_object('sub', '${userId}', 'role', 'authenticated')::text, true);
      end $$;
      set local role authenticated;
      ${query}
    `);
  } finally {
    // Runs even when `query` threw (several tests expect exactly that) —
    // the role must never be left as `authenticated` for whatever call
    // happens to reuse this connection next.
    await sql(`reset role;`).catch(() => {});
  }
}

/** Runs `query` as service_role — the role PostgREST actually assigns to
 * requests made with the service-role API key (what supabaseAdmin uses in
 * production, e.g. the Paynow webhook handler). Confirmed necessary: the
 * Management API's own connection runs as the `postgres` superuser, which
 * bypasses Postgres's grant system entirely but does *not* satisfy the
 * plain `current_user <> 'service_role'` conditional some functions check
 * internally — a real functional difference from production, not just a
 * permissions technicality, so tests exercising that check need this. */
export async function asServiceRole<T = Record<string, unknown>>(query: string): Promise<T[]> {
  try {
    return await sql<T>(`
      set local role service_role;
      ${query}
    `);
  } finally {
    await sql(`reset role;`).catch(() => {});
  }
}

export function newId(): string {
  return crypto.randomUUID();
}

/** Creates a throwaway auth.users row (no real password — these tests never
 * sign in, only simulate an already-authenticated JWT via asUser). */
export async function createTestUser(email: string): Promise<string> {
  const id = newId();
  await sql(`insert into auth.users (id, email) values ('${id}', '${email}');`);
  return id;
}

export async function deleteTestUser(id: string): Promise<void> {
  await sql(`delete from auth.users where id = '${id}';`);
}

/** Mirrors what create_business_with_owner() does atomically in production
 * (business + owner membership + a trialing 'pro' subscription) — done as
 * plain inserts here since these tests exercise RLS/permissions on other
 * functions, not business creation itself (transactional.test.ts covers
 * create_business_with_owner directly). */
export async function createTestBusiness(ownerId: string, name: string): Promise<string> {
  const id = newId();
  await sql(`
    insert into public.businesses (id, name, business_type, currency, created_by)
    values ('${id}', '${name}', 'other', 'USD', '${ownerId}');
    insert into public.business_members (business_id, user_id, role)
    values ('${id}', '${ownerId}', 'owner');
    insert into public.subscriptions (business_id, plan, status, trial_ends_at, current_period_start, current_period_end)
    values ('${id}', 'pro', 'trialing', now() + interval '3 days', now(), now() + interval '3 days');
    insert into public.locations (business_id, name, is_default, is_active)
    values ('${id}', 'Main', true, true);
    insert into public.cash_sessions (business_id, opened_by, opening_float)
    values ('${id}', '${ownerId}', 0);
    insert into public.cash_movements (business_id, session_id, kind, amount, note, created_by)
    select '${id}', s.id, 'open_float', 0, 'Test float', '${ownerId}'
    from public.cash_sessions s
    where s.business_id = '${id}' and s.closed_at is null;
  `);
  return id;
}

export async function deleteTestBusiness(id: string): Promise<void> {
  await sql(`
    delete from public.subscription_payments where business_id = '${id}';
    delete from public.subscription_events where business_id = '${id}';
    delete from public.subscriptions where business_id = '${id}';
    delete from public.business_members where business_id = '${id}';
    delete from public.businesses where id = '${id}';
  `);
}
