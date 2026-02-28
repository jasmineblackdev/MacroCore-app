/**
 * authUtils.ts — pure auth-error-mapping logic.
 * Mirrored verbatim in vanilla/app.js as mapAuthError().
 * Tests live in src/__tests__/authEdgeCases.test.ts.
 */

export interface AuthError {
  message?: string;
  status?: number;
  context?: { status?: number };
}

export function mapAuthError(error: unknown): string {
  if (!error || typeof error !== "object") {
    return typeof error === "string" && (error as string).length < 200
      ? (error as string)
      : "Authentication failed. Please try again.";
  }

  const e = error as AuthError;
  const msg = (e.message ?? "").toLowerCase();
  const status = e.status ?? e.context?.status ?? 0;

  // Timeout check must come before the general network check because
  // our own timeout error message contains the word "network".
  if (msg.includes("timed out") || msg.includes("timeout")) {
    return "Connection timed out. Please check your network and try again.";
  }
  if (
    msg.includes("fetch") ||
    msg.includes("network") ||
    msg.includes("failed to fetch") ||
    msg.includes("load failed") ||
    msg.includes("networkrequesterror")
  ) {
    return "Unable to connect. Please check your internet connection and try again.";
  }
  if (status === 503 || msg.includes("service unavailable") || msg.includes("maintenance")) {
    return "MacroCore is temporarily unavailable. Please try again in a few minutes.";
  }
  if (status === 429 || msg.includes("rate limit") || msg.includes("too many requests")) {
    return "Too many attempts. Please wait a minute and try again.";
  }
  if (msg.includes("email not confirmed")) {
    return "Please confirm your email first — check your inbox, then sign in here.";
  }
  if (
    msg.includes("invalid login credentials") ||
    msg.includes("invalid credentials") ||
    msg.includes("invalid email or password")
  ) {
    return "Incorrect email or password. Please check your details and try again.";
  }
  if (
    msg.includes("user already registered") ||
    msg.includes("already been registered") ||
    msg.includes("already exists")
  ) {
    return "An account with this email already exists. Please sign in instead.";
  }
  if (
    msg.includes("password should be at least") ||
    (msg.includes("password") && msg.includes("characters"))
  ) {
    return "Password must be at least 6 characters.";
  }
  if (msg.includes("unable to validate email") || (msg.includes("invalid") && msg.includes("email"))) {
    return "Please enter a valid email address.";
  }
  if (msg.includes("signup is disabled") || msg.includes("signups not allowed")) {
    return "Account creation is temporarily unavailable. Please try again later.";
  }

  return e.message && e.message.length < 120
    ? e.message
    : "Authentication failed. Please try again.";
}

/** Client-side pre-validation before the network round-trip. */
export function validateAuthFields(email: string, password: string): string | null {
  const trimmedEmail = email.trim();
  if (!trimmedEmail) return "Email is required.";
  // RFC 5322 simplified pattern sufficient for UX (server validates fully).
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
    return "Please enter a valid email address.";
  }
  if (!password) return "Password is required.";
  if (password.length < 6) return "Password must be at least 6 characters.";
  return null; // valid
}
