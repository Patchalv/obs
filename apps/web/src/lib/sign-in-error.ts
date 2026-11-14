/** What the sign-in form says when Better Auth refuses a sign-in. */
export function signInErrorMessage(error: { status: number; code?: string | undefined }): string {
  if (error.status === 401) return 'That email and password don’t match.';
  if (error.status === 403) return 'This account can’t sign in. Ask a Ping Admin.';
  if (error.status === 429) return 'Too many attempts. Wait a minute, then try again.';
  return 'Something went wrong. Try again.';
}
