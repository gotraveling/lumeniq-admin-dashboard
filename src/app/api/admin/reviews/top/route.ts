import { NextRequest, NextResponse } from 'next/server';

/**
 * Read proxy for the "top rated entities" browse. Forwards to the hotel-api
 * GET /api/reviews/top. See ../route.ts.
 *
 * GET /api/admin/reviews/top?entity_type=hotel[&min_count&limit&tag]
 */
const HOTEL_API_URL = process.env.HOTEL_API_URL
  || process.env.NEXT_PUBLIC_HOTEL_API_URL
  || 'https://hotel-api-91901273027.australia-southeast1.run.app';

export async function GET(request: NextRequest) {
  const qs = request.nextUrl.searchParams.toString();
  try {
    const res = await fetch(`${HOTEL_API_URL}/api/reviews/top${qs ? `?${qs}` : ''}`, {
      cache: 'no-store',
    });
    return NextResponse.json(await res.json().catch(() => ({})), { status: res.status });
  } catch (err) {
    console.error('[admin/reviews/top GET] error:', err);
    return NextResponse.json({ error: 'proxy_failed' }, { status: 500 });
  }
}
