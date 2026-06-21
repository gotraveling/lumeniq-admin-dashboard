import { NextRequest, NextResponse } from 'next/server';

/**
 * Server-side proxy for the cross-supplier room-mapping review console
 * (/console/room-mappings).
 *
 * Mapping rows live on the hotel-api (hotel_data DB, room_mappings table), NOT
 * the booking-engine. Reads are open there but we proxy them so the page only
 * ever talks to its own origin. Writes (PUT/DELETE on [id]) attach the
 * COLLECTIONS_ADMIN_KEY so the secret never reaches the browser bundle.
 *
 * GET /api/admin/room-mappings?hotelId=123[&status=review_low,hb_only,rh_only]
 * GET /api/admin/room-mappings?hotelIds=1,2,3   → bulk needs-review counts
 */
const HOTEL_API_URL = process.env.HOTEL_API_URL
  || process.env.NEXT_PUBLIC_HOTEL_API_URL
  || 'https://hotel-api-91901273027.australia-southeast1.run.app';

export async function GET(request: NextRequest) {
  // Forward the entire querystring through (hotelId / status / hotelIds).
  const qs = request.nextUrl.searchParams.toString();
  try {
    const res = await fetch(`${HOTEL_API_URL}/api/room-mappings${qs ? `?${qs}` : ''}`, {
      cache: 'no-store',
    });
    return NextResponse.json(await res.json().catch(() => ({})), { status: res.status });
  } catch (err) {
    console.error('[admin/room-mappings GET] error:', err);
    return NextResponse.json({ error: 'proxy_failed' }, { status: 500 });
  }
}
