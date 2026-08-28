import { createAnonClient } from "./session.server";

/** Re-verifies the caller's current password against Supabase Auth without
 * establishing a new session — signInWithPassword succeeding just confirms
 * the credential is right; the anon client used here never persists it as
 * this request's session. Used as a step-up check immediately before
 * high-risk actions (deleting the account, turning off MFA) so a hijacked
 * session cookie alone isn't enough to perform them. */
export async function verifyCurrentPassword(email: string, password: string): Promise<boolean> {
  const { error } = await createAnonClient().auth.signInWithPassword({ email, password });
  return !error;
}
