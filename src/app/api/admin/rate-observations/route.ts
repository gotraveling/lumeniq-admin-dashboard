import { NextRequest, NextResponse } from 'next/server';

/**
 * Server-side proxy for the manual rate-comparison log (/console/search drawer).
 *
 * Mirrors /api/admin/control: the rows live on the hotel-api (hotel_data DB) and
 * writes there need an x-admin-key, which we attach here so the secret never
 * reaches the browser bundle.
 *
 * GET    /api/admin/rate-observations?hotelId=123 → observations, latest first
 * POST   /api/admin/rate-observations             → record one (body = fields)
 * DELETE /api/admin/rate-observations?id=7        → remove a mis-keyed row
 */
const HOTEL_API_URL = process.env.HOTEL_API_URL
  || process.env.NEXT_PUBLIC_HOTEL_API_URL
  || 'https://hotel-api-91901273027.australia-southeast1.run.app';
const ADMIN_KEY = process.env.COLLECTIONS_ADMIN_KEY || '';

export async function GET(request: NextRequest) {
  const hotelId = request.nextUrl.searchParams.get('hotelId');
  if (!hotelId) return NextResponse.json({ error: 'hotelId required' }, { status: 400 });
  try {
    const res = await fetch(
      `${HOTEL_API_URL}/api/rate-observations?hotelId=${encodeURIComponent(hotelId)}`,
      { cache: 'no-store' }
    );
    return NextResponse.json(await res.json(), { status: res.status });
  } catch (err) {
    console.error('[admin/rate-observations GET] error:', err);
    return NextResponse.json({ error: 'proxy_failed' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const res = await fetch(`${HOTEL_API_URL}/api/rate-observations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': ADMIN_KEY },
      body: JSON.stringify(body),
    });
    return NextResponse.json(await res.json(), { status: res.status });
  } catch (err) {
    console.error('[admin/rate-observations POST] error:', err);
    return NextResponse.json({ error: 'proxy_failed' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const id = request.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  try {
    const res = await fetch(`${HOTEL_API_URL}/api/rate-observations/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: { 'x-admin-key': ADMIN_KEY },
    });
    return NextResponse.json(await res.json(), { status: res.status });
  } catch (err) {
    console.error('[admin/rate-observations DELETE] error:', err);
    return NextResponse.json({ error: 'proxy_failed' }, { status: 500 });
  }
}
