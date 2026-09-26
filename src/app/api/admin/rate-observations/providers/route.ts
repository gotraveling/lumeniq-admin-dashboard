import { NextRequest, NextResponse } from 'next/server';
import { requireConsoleUser } from '@/lib/apiAuth';

/**
 * Sellers a consultant has named as cheaper than us, most-seen first.
 *
 * Feeds the suggestions beside "Other", so the same seller is not recorded as
 * "Klook", "klook" and "KLOOK " and counted three times — and, later, answers
 * the question the log exists for: which niche seller beats us, and where.
 */
const HOTEL_API_URL = process.env.HOTEL_API_URL
  || process.env.NEXT_PUBLIC_HOTEL_API_URL
  || 'https://hotel-api-91901273027.australia-southeast1.run.app';

export async function GET(request: NextRequest) {
  const auth = await requireConsoleUser(request);
  if ('response' in auth) return auth.response;
  try {
    const res = await fetch(`${HOTEL_API_URL}/api/rate-observations/providers`, { cache: 'no-store' });
    return NextResponse.json(await res.json(), { status: res.status });
  } catch (err) {
    console.error('[admin/rate-observations/providers] error:', err);
    return NextResponse.json({ error: 'proxy_failed' }, { status: 500 });
  }
}
