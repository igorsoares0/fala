/** Google sign-in is optional in development; it is enabled only when both credentials are set. */
export function isGoogleSignInEnabled() {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}
