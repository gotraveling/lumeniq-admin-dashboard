import { NextRequest, NextResponse } from 'next/server';

/**
 * Per-hotel editorial overrides + tags proxy.
 *
 * GET  /api/admin/editorial?hotelId=123
 *   → fetches /api/editorial/hotels/:id/overrides AND /api/editorial/hotels/:id/tags
 *   → returns { overrides, tags }
 * POST /api/admin/editorial?hotelId=123  (body = override fields)
 *   → POST /api/editorial/hotels/:id/overrides  (x-admin-key injected)
 *
 * Override reads/writes are unauthenticated on the hotel-api, but we proxy
 * (and attach COLLECTIONS_ADMIN_KEY on writes) so the page only talks to its
 * own origin and the secret never reaches the browser bundle.
 */
const HOTEL_API_URL = process.env.HOTEL_API_URL
  || process.env.NEXT_PUBLIC_HOTEL_API_URL
  || 'https://hotel-api-91901273027.australia-southeast1.run.app';
const ADMIN_KEY = process.env.COLLECTIONS_ADMIN_KEY || '';

export async function GET(request: NextRequest) {
  const hotelId = request.nextUrl.searchParams.get('hotelId');
  if (!hotelId) {
    return NextResponse.json({ error: 'hotelId required' }, { status: 400 });
  }
  const id = encodeURIComponent(hotelId);
  try {
    const [ovRes, tagRes] = await Promise.all([
      fetch(`${HOTEL_API_URL}/api/editorial/hotels/${id}/overrides`, { cache: 'no-store' }),
      fetch(`${HOTEL_API_URL}/api/editorial/hotels/${id}/tags`, { cache: 'no-store' }),
    ]);
    const overrides = ovRes.ok ? await ovRes.json() : null;
    const tags = tagRes.ok ? await tagRes.json() : null;
    return NextResponse.json({ overrides, tags });
  } catch (err) {
    console.error('[admin/editorial GET] error:', err);
    return NextResponse.json({ error: 'proxy_failed' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const hotelId = request.nextUrl.searchParams.get('hotelId');
  if (!hotelId) {
    return NextResponse.json({ error: 'hotelId required' }, { status: 400 });
  }
  try {
    const body = await request.json();
    const res = await fetch(`${HOTEL_API_URL}/api/editorial/hotels/${encodeURIComponent(hotelId)}/overrides`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': ADMIN_KEY },
      body: JSON.stringify(body),
    });
    return NextResponse.json(await res.json(), { status: res.status });
  } catch (err) {
    console.error('[admin/editorial POST] error:', err);
    return NextResponse.json({ error: 'proxy_failed' }, { status: 500 });
  }
}
