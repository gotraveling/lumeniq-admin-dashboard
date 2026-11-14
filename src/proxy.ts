import { NextRequest, NextResponse } from 'next/server';
import { certifierMayCall, isCertifierEmail } from '@/lib/certifierPolicy';

/**
 * Keep a Hotelbeds certifier's login to the Hotelbeds API routes.
 *
 * Routes that prove their caller (apiAuth.requireConsoleUser) already refuse a
 * certifier on a verified token. Several read-only routes under /api check no
 * token at all, so this runs in front of every /api request and turns a
 * certifier's token away from anything but their own routes.
 *
 * The token is only DECODED here, not verified. That is safe for this one job:
 * all a forged token can do is get its own request refused. Every decision that
 * grants access still goes through the verified check.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (certifierMayCall(pathname)) return NextResponse.next();
  const email = emailFromBearer(request.headers.get('authorization'));
  if (email && isCertifierEmail(email)) {
    return NextResponse.json(
      { error: 'forbidden', message: 'This login can use the Hotelbeds screens only.' },
      { status: 403 }
    );
  }
  return NextResponse.next();
}

function emailFromBearer(header: string | null): string | null {
  if (!header || !header.toLowerCase().startsWith('bearer ')) return null;
  const parts = header.slice(7).trim().split('.');
  if (parts.length !== 3) return null;
  try {
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4)));
    return typeof payload.email === 'string' ? payload.email : null;
  } catch {
    return null;
  }
}

export const config = { matcher: '/api/:path*' };
