import { NextRequest, NextResponse } from 'next/server';
import { requireConsoleUser } from '@/lib/apiAuth';

/**
 * What kind of console login this is, decided on the server.
 *
 * The certifier allowlist (CONSOLE_CERTIFIER_EMAILS) is server-side only, so
 * the browser asks here instead of reading it. The answer only shapes the UI;
 * the API routes enforce the same rule themselves.
 */
export async function GET(request: NextRequest) {
  const auth = await requireConsoleUser(request);
  if ('response' in auth) return auth.response;
  return NextResponse.json(
    { email: auth.user.email, certifier: auth.user.certifier, admin: auth.user.admin },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
