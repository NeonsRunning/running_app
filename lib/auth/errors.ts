/**
 * Supabase error codes mapped to dictionary keys under `auth.errors`.
 *
 * Supabase returns English prose (`"Invalid login credentials"`), which cannot
 * be shown to a Spanish-speaking runner. The stable `error.code` is what we
 * translate against; anything unrecognised falls back to a generic message so
 * a new code shows a sentence rather than a blank space.
 */
const CODES: Record<string, string> = {
  invalid_credentials: "invalidCredentials",
  email_not_confirmed: "emailNotConfirmed",
  user_already_exists: "userAlreadyExists",
  email_exists: "userAlreadyExists",
  weak_password: "weakPassword",
  same_password: "samePassword",
  otp_expired: "otpExpired",
  otp_disabled: "otpInvalid",
  over_request_rate_limit: "rateLimited",
  over_email_send_rate_limit: "rateLimited",
  validation_failed: "validationFailed",
  signup_disabled: "signupDisabled",
  provider_disabled: "providerDisabled",
  session_expired: "sessionExpired",
};

export const GENERIC_ERROR = "generic";

/** Translate a Supabase auth error into a key under `auth.errors`. */
export function authErrorKey(error: { code?: string } | null): string {
  if (!error?.code) return GENERIC_ERROR;
  return CODES[error.code] ?? GENERIC_ERROR;
}
