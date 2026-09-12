import { NextRequest, NextResponse } from 'next/server';

// Server-side proxy — keeps BOOKING_API_KEY out of the browser, same pattern as
// the offer-reports proxy next door.
const BOOKING_API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://booking-engine-api-91901273027.australia-southeast1.run.app';
const API_KEY = process.env.BOOKING_API_KEY || '';
const HEADERS = { 'X-Admin-Key': API_KEY, 'X-API-Key': API_KEY, 'Content-Type': 'application/json' };

/**
 * Cheapest stay per hotel PER MONTH, from cached rates.
 *
 * Reads the grid the prewarm job already warms, so it costs no supplier calls
 * and answers instantly. That is the whole point: the old flow fired a matrix
 * of live queries and froze the result, which is why saved reports needed a
 * "created" date — a snapshot goes stale and looks exactly like a fresh one.
 */
export async function GET(request: NextRequest) {
  const qs = request.nextUrl.searchParams.toString();
  try {
    const res = await fetch(`${BOOKING_API_URL}/api/admin/search/rates-by-month?${qs}`, {
      headers: HEADERS, cache: 'no-store',
    });
    return NextResponse.json(await res.json(), { status: res.status });
  } catch {
    return NextResponse.json({ error: 'proxy_failed' }, { status: 500 });
  }
}
