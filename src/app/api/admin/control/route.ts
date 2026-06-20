import { NextRequest, NextResponse } from 'next/server';

/**
 * Server-side proxy for the per-hotel "Manage" controls (/console/search drawer).
 *
 * Control rows live on the hotel-api (hotel_data DB), NOT the booking-engine.
 * Writes there are guarded by an x-admin-key; we attach COLLECTIONS_ADMIN_KEY
 * here so the secret never reaches the browser bundle. Reads are proxied too so
 * the page only ever talks to its own origin.
 *
 * GET  /api/admin/control?hotelId=123   → single control row
 * GET  /api/admin/control?ids=1,2,3     → bulk { [id]: row } map
 * PUT  /api/admin/control?hotelId=123   → upsert (body = control fields)
 */
const HOTEL_API_URL = process.env.HOTEL_API_URL
  || process.env.NEXT_PUBLIC_HOTEL_API_URL
  || 'https://hotel-api-91901273027.australia-southeast1.run.app';
const ADMIN_KEY = process.env.COLLECTIONS_ADMIN_KEY || '';

export async function GET(request: NextRequest) {
  const hotelId = request.nextUrl.searchParams.get('hotelId');
  const ids = request.nextUrl.searchParams.get('ids');
  try {
    const url = ids
      ? `${HOTEL_API_URL}/api/control?ids=${encodeURIComponent(ids)}`
      : `${HOTEL_API_URL}/api/control/${encodeURIComponent(hotelId || '')}`;
    const res = await fetch(url, { cache: 'no-store' });
    return NextResponse.json(await res.json(), { status: res.status });
  } catch (err) {
    console.error('[admin/control GET] error:', err);
    return NextResponse.json({ error: 'proxy_failed' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const hotelId = request.nextUrl.searchParams.get('hotelId');
  if (!hotelId) {
    return NextResponse.json({ error: 'hotelId required' }, { status: 400 });
  }
  try {
    const body = await request.json();
    const res = await fetch(`${HOTEL_API_URL}/api/control/${encodeURIComponent(hotelId)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': ADMIN_KEY },
      body: JSON.stringify(body),
    });
    return NextResponse.json(await res.json(), { status: res.status });
  } catch (err) {
    console.error('[admin/control PUT] error:', err);
    return NextResponse.json({ error: 'proxy_failed' }, { status: 500 });
  }
}
