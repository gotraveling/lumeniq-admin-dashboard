import { NextRequest, NextResponse } from 'next/server';

/**
 * Server-side proxy for the per-month rate grid.
 *
 * Powers the offer selector in the collections editor: for each month it
 * returns the cheapest warmed check-in, with board, transfer, offer name and
 * the supplier's before-discount price. Read-only, and it reads the prewarmed
 * cache rather than calling a supplier, so opening the selector costs nothing.
 *
 * The booking API key stays server-side.
 *
 * GET /api/admin/rates-by-month?hotelIds=1,2&los=4&months=12
 */
const BOOKING_API_URL = process.env.NEXT_PUBLIC_API_URL
  || 'https://booking-engine-api-91901273027.australia-southeast1.run.app';
const API_KEY = process.env.BOOKING_API_KEY || '';

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  if (!sp.get('hotelIds')) {
    return NextResponse.json({ error: 'hotelIds required' }, { status: 400 });
  }
  const qs = new URLSearchParams();
  for (const k of ['hotelIds', 'los', 'months', 'occupancy', 'channel']) {
    const v = sp.get(k);
    if (v) qs.set(k, v);
  }
  try {
    const r = await fetch(`${BOOKING_API_URL}/api/admin/search/rates-by-month?${qs.toString()}`, {
      headers: { 'X-API-Key': API_KEY },
      cache: 'no-store',
    });
    return NextResponse.json(await r.json().catch(() => ({ error: `HTTP ${r.status}` })), { status: r.status });
  } catch (e: unknown) {
    console.error('[admin/rates-by-month] proxy error:', e instanceof Error ? e.message : e);
    return NextResponse.json({ error: 'proxy_failed' }, { status: 500 });
  }
}
