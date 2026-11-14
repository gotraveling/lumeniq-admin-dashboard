/**
 * Who counts as a Hotelbeds certifier, and what they may reach.
 *
 * Pure and dependency-free so the request proxy (src/proxy.ts), the verified
 * route check (apiAuth.requireConsoleUser) and the console shell apply the same
 * rule.
 *
 * The allowlist is server-side only: CONSOLE_CERTIFIER_EMAILS, comma separated,
 * defaulting to the one login we hand Hotelbeds.
 */

const DEFAULT_CERTIFIERS = 'hotelbeds-cert@firstclass.com.au';

export function certifierEmails(): Set<string> {
  const raw = process.env.CONSOLE_CERTIFIER_EMAILS ?? DEFAULT_CERTIFIERS;
  return new Set(raw.split(',').map((e) => e.trim().toLowerCase()).filter(Boolean));
}

export function isCertifierEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return certifierEmails().has(String(email).trim().toLowerCase());
}

/**
 * The only API paths a certifier may call: the Hotelbeds proxy, and the
 * endpoint that tells the console which kind of login this is.
 */
export function certifierMayCall(pathname: string): boolean {
  return pathname === '/api/console/me'
    || pathname === '/api/admin/hotelbeds'
    || pathname.startsWith('/api/admin/hotelbeds/');
}

/** The only console pages a certifier may open. */
export function certifierMayOpen(pathname: string): boolean {
  return pathname === '/console/hotelbeds' || pathname.startsWith('/console/hotelbeds/');
}
