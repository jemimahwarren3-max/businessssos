import { EMAIL_PROVIDER_OFF_MESSAGE } from "./auth-providers";

/** Maps GoTrue/Supabase signup errors to copy a merchant can act on.
 * Duplicate emails stay generic on purpose so this cannot be used to
 * check whether an address already has an account. */
export function friendlySignUpError(message: string): string {
  const m = message.toLowerCase();
  if (isEmailProviderDisabled(m)) return EMAIL_PROVIDER_OFF_MESSAGE;
  if (m.includes("password")) return "Your password must be at least 8 characters.";
  if (m.includes("email") && (m.includes("invalid") || m.includes("valid"))) {
    return "Please enter a valid email address.";
  }
  if (m.includes("rate limit") || m.includes("too many")) {
    return "Too many attempts. Please wait a moment and try again.";
  }
  if (m.includes("email not confirmed") || m.includes("not confirmed")) {
    return "Confirm your email first. Use resend below or check your inbox.";
  }
  if (
    m.includes("error sending") ||
    m.includes("confirmation email") ||
    m.includes("smtp") ||
    m.includes("error sending confirmation")
  ) {
    return "The account was not finished because confirmation email is not sending. Continue with Google for now.";
  }
  if (
    m.includes("already registered") ||
    m.includes("already been registered") ||
    m.includes("user already registered")
  ) {
    return "That email may already have an account. Try Sign in, or reset your password if you forgot it.";
  }
  // Anything else gets generic copy so this cannot be used to confirm addresses.
  return "We couldn't create that account. Please try again.";
}

export function isEmailProviderDisabled(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("email_provider_disabled") ||
    m.includes("email signups are disabled") ||
    m.includes("email logins are disabled") ||
    m.includes("signups not allowed") ||
    m.includes("signup_disabled")
  );
}
