/**
 * Staging GoTrue auth config via Supabase Management API (slajanbsfqjnuuiohbmg only).
 */
import { STAGING_PROJECT_REF } from "./staging-api.mjs";

const AUTH_CONFIG_URL = `https://api.supabase.com/v1/projects/${STAGING_PROJECT_REF}/config/auth`;

/** @param {string} token */
export async function fetchStagingAuthConfig(token) {
  const res = await fetch(AUTH_CONFIG_URL, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`GET auth config ${res.status}: ${text.slice(0, 1500)}`);
  }
  return JSON.parse(text);
}

let authConfigWriteSkipped = false;

/** @param {string} token @param {Record<string, unknown>} body */
async function patchStagingAuthConfig(token, body) {
  const res = await fetch(AUTH_CONFIG_URL, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (res.status === 403) {
    if (!authConfigWriteSkipped) {
      authConfigWriteSkipped = true;
      console.warn(
        "Skipping Supabase Auth config PATCH: SUPABASE_ACCESS_TOKEN lacks auth_config_write / project_admin_write (SQL migrations still applied).",
      );
    }
    return null;
  }
  if (!res.ok) {
    throw new Error(`PATCH auth config ${res.status}: ${text.slice(0, 1500)}`);
  }
  return text ? JSON.parse(text) : {};
}

/**
 * Enable email sign-in and autoconfirm so beta merchants reach onboarding without inbox delivery.
 * @param {string} token
 */
export async function enableStagingEmailAutoconfirm(token) {
  const updated = await patchStagingAuthConfig(token, {
    external_email_enabled: true,
    mailer_autoconfirm: true,
  });
  if (updated === null) return;
  console.log("Staging Email provider enabled (autoconfirm on for beta).");
}

/** Extract bare email from `Name <addr@domain>` or return trimmed input. */
export function parseFromEmail(raw) {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) return null;
  const angle = trimmed.match(/<([^>]+)>/);
  if (angle?.[1]) return angle[1].trim();
  if (trimmed.includes("@")) return trimmed;
  return null;
}

/**
 * Wire Resend SMTP so GoTrue can mail any address (not just org team members).
 * Requires verified domain in Resend. See docs/auth/SUPABASE_AUTH_EMAIL.md.
 * @param {string} token
 */
export async function configureStagingResendSmtp(token) {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = parseFromEmail(process.env.NOTIFY_FROM_EMAIL);
  if (!apiKey || !from) {
    console.log(
      "RESEND_API_KEY or NOTIFY_FROM_EMAIL not set — skipping Auth SMTP (Supabase built-in mail is team-only).",
    );
    return false;
  }

  const updated = await patchStagingAuthConfig(token, {
    external_email_enabled: true,
    smtp_admin_email: from,
    smtp_host: "smtp.resend.com",
    smtp_port: "465",
    smtp_user: "resend",
    smtp_pass: apiKey,
    smtp_sender_name: "Kwetuu",
  });
  if (updated === null) return false;
  console.log(`Staging Auth SMTP configured via Resend (From: ${from}).`);
  return true;
}

/** @param {string} token */
export async function summarizeStagingAuthEmail(token) {
  const cfg = await fetchStagingAuthConfig(token);
  const smtpConfigured = Boolean(cfg.smtp_host && cfg.smtp_admin_email);
  return {
    site_url: cfg.site_url ?? "(unset)",
    external_email_enabled: cfg.external_email_enabled === true,
    mailer_autoconfirm: cfg.mailer_autoconfirm === true,
    smtp_host: cfg.smtp_host ?? null,
    smtp_admin_email: cfg.smtp_admin_email ?? null,
    smtpConfigured,
    uri_allow_list: cfg.uri_allow_list ?? null,
  };
}
