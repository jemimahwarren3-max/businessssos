/** Maps GoTrue/Supabase signup errors to copy a merchant can act on.
 * Duplicate emails stay generic on purpose so this cannot be used to
 * check whether an address already has an account. */
export function friendlySignUpError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("password")) return "Your password must be at least 8 characters.";
  if (m.includes("email") && (m.includes("invalid") || m.includes("valid"))) {
    return "Please enter a valid email address.";
  }
  if (m.includes("rate limit") || m.includes("too many")) {
    return "Too many attempts. Please wait a moment and try again.";
  }
  if (
    m.includes("email_provider_disabled") ||
    m.includes("email signups are disabled") ||
    m.includes("signups not allowed") ||
    m.includes("signup_disabled")
  ) {
    return "Email sign-up is turned off for this project. Continue with Google, or enable Email sign-ups in Supabase → Authentication → Providers → Email.";
  }
  if (
    m.includes("error sending") ||
    m.includes("confirmation email") ||
    m.includes("smtp") ||
    m.includes("error sending confirmation")
  ) {
    return "The account was not finished because confirmation email is not sending. Turn off Confirm email in Supabase until SMTP is set, or continue with Google.";
  }
  // Anything else — including "already registered" — gets a generic
  // message rather than confirming or denying the email is already in use.
  return "We couldn't create that account. Please try again.";
}
