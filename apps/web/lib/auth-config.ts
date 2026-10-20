/** Google sign-in is optional in development; it is enabled only when both credentials are set. */
export function isGoogleSignInEnabled() {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

/**
 * Where the sign-in rate limit reads the client's IP. Better Auth trusts a single-value
 * `X-Forwarded-For` (what Traefik sends when it is the only proxy); when it can't
 * resolve an IP, every visitor shares one bucket and a few bad requests lock everyone out.
 * - AUTH_IP_HEADER: the header that holds the client IP, e.g. `cf-connecting-ip` behind
 *   the Cloudflare proxy (only safe if the origin accepts traffic from Cloudflare alone).
 * - AUTH_TRUSTED_PROXIES: comma-separated IPs/CIDRs of the proxies in front of the app,
 *   when `X-Forwarded-For` carries more than one hop.
 */
export function authIpAddressOptions(env: Record<string, string | undefined> = process.env) {
  const header = env.AUTH_IP_HEADER?.trim().toLowerCase();
  const proxies = (env.AUTH_TRUSTED_PROXIES ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  return {
    ...(header ? { ipAddressHeaders: [header] } : {}),
    ...(proxies.length > 0 ? { trustedProxies: proxies } : {}),
  };
}
