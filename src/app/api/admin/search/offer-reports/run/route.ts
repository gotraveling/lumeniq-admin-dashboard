import { NextRequest, NextResponse } from 'next/server';

const BOOKING_API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://booking-engine-api-91901273027.australia-southeast1.run.app';
const API_KEY = process.env.BOOKING_API_KEY || '';
const HEADERS = { 'X-Admin-Key': API_KEY, 'X-API-Key': API_KEY, 'Content-Type': 'application/json' };

/**
 * Kick off a discovery run across the watchlist. Every hotel is several live
 * supplier calls, paced to stay inside RateHawk's rate limit, so this is slow
 * by design — the nightly schedule is the normal path and this is the "run it
 * now" button.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const res = await fetch(`${BOOKING_API_URL}/api/admin/search/offer-reports/run`, {
      method: 'POST', headers: HEADERS, body: JSON.stringify(body),
      signal: AbortSignal.timeout(15 * 60 * 1000),
    });
    return NextResponse.json(await res.json(), { status: res.status });
  } catch (err) {
    return NextResponse.json({ error: 'proxy_failed', detail: String(err) }, { status: 500 });
  }
}
