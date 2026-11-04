import { NextRequest, NextResponse } from 'next/server';

/**
 * Proxy for the room pick list. Forwards to the hotel-api's
 * GET /api/room-mappings/rooms?hotelId= → each supplier's room names for
 * the property, for the pick list. Read-only; no key needed.
 * See ../route.ts for the write-side notes.
 */
const HOTEL_API_URL = process.env.HOTEL_API_URL
  || process.env.NEXT_PUBLIC_HOTEL_API_URL
  || 'https://hotel-api-91901273027.australia-southeast1.run.app';

export async function GET(request: NextRequest) {
  try {
    const res = await fetch(`${HOTEL_API_URL}/api/room-mappings/rooms?${request.nextUrl.searchParams.toString()}`, {
      cache: 'no-store',
    });
    return NextResponse.json(await res.json().catch(() => ({})), { status: res.status });
  } catch (err) {
    console.error('[admin/room-mappings/rooms GET] error:', err);
    return NextResponse.json({ error: 'proxy_failed' }, { status: 500 });
  }
}
