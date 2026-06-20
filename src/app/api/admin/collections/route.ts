import { NextRequest, NextResponse } from 'next/server';

/**
 * Server-side proxy for the collections editor (/console/collections).
 *
 * Collections live on the hotel-api (hotel_data DB), NOT the booking-engine.
 * Writes are guarded there by an x-admin-key; we attach COLLECTIONS_ADMIN_KEY
 * here so the secret never reaches the browser bundle. Reads are public but we
 * proxy them too so the page only ever talks to its own origin.
 */
const HOTEL_API_URL = process.env.HOTEL_API_URL
  || process.env.NEXT_PUBLIC_HOTEL_API_URL
  || 'https://hotel-api-91901273027.australia-southeast1.run.app';
const ADMIN_KEY = process.env.COLLECTIONS_ADMIN_KEY || '';

export async function GET(request: NextRequest) {
  const status = request.nextUrl.searchParams.get('status') || 'all';
  try {
    const res = await fetch(`${HOTEL_API_URL}/api/collections?status=${encodeURIComponent(status)}`, {
      cache: 'no-store',
    });
    return NextResponse.json(await res.json(), { status: res.status });
  } catch (err) {
    console.error('[admin/collections GET] error:', err);
    return NextResponse.json({ error: 'proxy_failed' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const res = await fetch(`${HOTEL_API_URL}/api/collections`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': ADMIN_KEY },
      body: JSON.stringify(body),
    });
    return NextResponse.json(await res.json(), { status: res.status });
  } catch (err) {
    console.error('[admin/collections POST] error:', err);
    return NextResponse.json({ error: 'proxy_failed' }, { status: 500 });
  }
}
