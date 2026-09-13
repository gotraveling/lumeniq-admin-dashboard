import { NextRequest, NextResponse } from 'next/server';

/**
 * Server-side proxy for the per-PROPERTY markup upsert.
 *
 * Use this instead of POSTing to /api/pricing/rules when setting a hotel's
 * markup from the Manage drawer. Two reasons, both learned the hard way:
 *
 *  - A markup belongs to a property, not to a supplier's hotel_id. A hotel
 *    carried by both Hummingbird and RateHawk has one id per supplier, and a
 *    rule written against one of them used to leave the other untouched —
 *    Patina Maldives sold at 10% under one id while three 35% rules sat on the
 *    other. The engine resolves canonical siblings behind this endpoint, so
 *    one save covers the property whichever id the drawer is showing.
 *  - POSTing created a new rule row on every save and never updated, so a few
 *    clicks left several active rules on one hotel with only the newest
 *    counting. This upserts and retires the duplicates.
 *
 * GET /api/pricing/markup?hotelId=123 → { canonicalId, hotelIds, effective, shadowed }
 * PUT /api/pricing/markup?hotelId=123 → body { markup_percentage, hotel_name? }
 */
const BOOKING_API_URL = process.env.NEXT_PUBLIC_API_URL
  || 'https://booking-engine-api-91901273027.australia-southeast1.run.app';
const API_KEY = process.env.BOOKING_API_KEY || '';

function upstream(hotelId: string) {
  return `${BOOKING_API_URL}/api/admin/search/markup/${encodeURIComponent(hotelId)}`;
}

export async function GET(request: NextRequest) {
  const hotelId = request.nextUrl.searchParams.get('hotelId');
  if (!hotelId) return NextResponse.json({ error: 'hotelId required' }, { status: 400 });
  try {
    const r = await fetch(upstream(hotelId), {
      headers: { 'X-API-Key': API_KEY },
      cache: 'no-store',
    });
    return NextResponse.json(await r.json().catch(() => ({ error: `HTTP ${r.status}` })), { status: r.status });
  } catch (e: any) {
    console.error('[pricing/markup GET] proxy error:', e?.message);
    return NextResponse.json({ error: 'proxy_failed' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const hotelId = request.nextUrl.searchParams.get('hotelId');
  if (!hotelId) return NextResponse.json({ error: 'hotelId required' }, { status: 400 });
  try {
    const body = await request.json();
    // Forward who is making the change so the engine can write it into the
    // markup audit trail. Without it every history row reads "unknown", which
    // is most of the value gone.
    const changedBy = request.headers.get('x-consultant-email') || '';
    const r = await fetch(upstream(hotelId), {
      method: 'PUT',
      headers: {
        'X-API-Key': API_KEY,
        'Content-Type': 'application/json',
        ...(changedBy ? { 'X-Consultant-Email': changedBy } : {}),
      },
      body: JSON.stringify(body),
    });
    return NextResponse.json(await r.json().catch(() => ({ error: `HTTP ${r.status}` })), { status: r.status });
  } catch (e: any) {
    console.error('[pricing/markup PUT] proxy error:', e?.message);
    return NextResponse.json({ error: 'proxy_failed' }, { status: 500 });
  }
}
