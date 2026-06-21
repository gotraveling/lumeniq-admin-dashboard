import { NextRequest, NextResponse } from 'next/server';

/**
 * Proxy for the room-mapping hotel picker. Forwards to the hotel-api's
 * GET /api/room-mappings/hotels → distinct hotels with mapping rows + per-status
 * counts ([{hotel_id, total, needs_review}]). Read-only; no key needed.
 * See ../route.ts for the write-side notes.
 */
const HOTEL_API_URL = process.env.HOTEL_API_URL
  || process.env.NEXT_PUBLIC_HOTEL_API_URL
  || 'https://hotel-api-91901273027.australia-southeast1.run.app';

export async function GET(_request: NextRequest) {
  try {
    const res = await fetch(`${HOTEL_API_URL}/api/room-mappings/hotels`, {
      cache: 'no-store',
    });
    return NextResponse.json(await res.json().catch(() => ([])), { status: res.status });
  } catch (err) {
    console.error('[admin/room-mappings/hotels GET] error:', err);
    return NextResponse.json({ error: 'proxy_failed' }, { status: 500 });
  }
}
