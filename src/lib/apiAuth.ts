import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { getApps, initializeApp, applicationDefault } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

/**
 * Server-side proof of who is calling.
 *
 * Every route under src/app/api attaches the engine's privileged API key on the
 * way out. Until now the only thing standing in front of them was a role check
 * in the browser, which stops a consultant clicking the wrong button and stops
 * nobody else: the console is deployed with public ingress, so a plain curl to
 * the Cloud Run URL could cancel a booking, rewrite markup or move the FX rate.
 *
 * So each sensitive route now asks this, and this verifies a real Firebase ID
 * token against the lumeniq-platform project. firebase-admin was already a
 * dependency; it was never wired up.
 *
 * The browser sends the token because the console patches fetch once at start
 * up (see consoleFetch in src/app/console/_shell.tsx) — no call site changed.
 */

const PROJECT_ID =
  process.env.FIREBASE_PROJECT_ID ||
  process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
  'lumeniq-platform';

function adminAuth() {
  if (!getApps().length) {
    // On Cloud Run this picks up the service account automatically. Verifying a
    // token needs only the project id and Google's public keys, so no key file
    // and no signing permission is required.
    initializeApp({ credential: applicationDefault(), projectId: PROJECT_ID });
  }
  return getAuth();
}

export type ConsoleUser = {
  uid: string;
  email: string | null;
  admin: boolean;
};

/**
 * Returns the caller, or null when the token is missing, malformed, expired or
 * from another project. Never throws: a route decides what to do about it.
 */
export async function getConsoleUser(request: NextRequest): Promise<ConsoleUser | null> {
  const header = request.headers.get('authorization') || '';
  const token = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : '';
  if (!token) return null;
  try {
    const decoded = await adminAuth().verifyIdToken(token);
    return {
      uid: decoded.uid,
      email: decoded.email ?? null,
      // Set as a custom claim; see the console-users memory note for how.
      admin: decoded.admin === true || decoded.role === 'admin',
    };
  } catch {
    return null;
  }
}

/**
 * Guard for a route handler. Returns either the caller or the 401 to return.
 *
 *   const auth = await requireConsoleUser(request);
 *   if ('response' in auth) return auth.response;
 *   // auth.user.email is now trustworthy
 */
export async function requireConsoleUser(
  request: NextRequest
): Promise<{ user: ConsoleUser } | { response: NextResponse }> {
  const user = await getConsoleUser(request);
  if (!user) {
    return {
      response: NextResponse.json(
        { error: 'unauthorized', message: 'Sign in to the console to do that.' },
        { status: 401 }
      ),
    };
  }
  return { user };
}

/**
 * The consultant's own address, proven rather than claimed.
 *
 * Several engine routes record who did something from the x-consultant-email
 * header. That header is whatever the browser chose to send, so anything
 * written from it is a claim. Prefer this.
 */
export function actorEmail(user: ConsoleUser, fallback?: string | null): string {
  return user.email || fallback || user.uid;
}
