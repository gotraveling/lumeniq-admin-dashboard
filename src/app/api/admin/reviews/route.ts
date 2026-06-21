import { NextRequest, NextResponse } from 'next/server';

/**
 * Server-side proxy for the entity-agnostic reviews API.
 *
 * Review rows live on the hotel-api (hotel_data DB, reviews/review_links/
 * review_tags tables), NOT the booking-engine. Reads are open there but we proxy
 * them so the page only ever talks to its own origin. Writes (POST here, PUT/
 * DELETE on [id]) attach the COLLECTIONS_ADMIN_KEY so the secret never reaches
 * the browser bundle.
 *
 * GET  /api/admin/reviews?entity_type=hotel&entity_ref=999240927[&status&tag&limit&offset]
 * POST /api/admin/reviews   → create a review (+ links + tags), keyed
 */
const HOTEL_API_URL = process.env.HOTEL_API_URL
  || process.env.NEXT_PUBLIC_HOTEL_API_URL
  || 'https://hotel-api-91901273027.australia-southeast1.run.app';
const ADMIN_KEY = process.env.COLLECTIONS_ADMIN_KEY || '';

export async function GET(request: NextRequest) {
  // Forward the entire querystring through (entity_type / entity_ref / status / tag / limit / offset).
  const qs = request.nextUrl.searchParams.toString();
  try {
    const res = await fetch(`${HOTEL_API_URL}/api/reviews${qs ? `?${qs}` : ''}`, {
      cache: 'no-store',
    });
    return NextResponse.json(await res.json().catch(() => ({})), { status: res.status });
  } catch (err) {
    console.error('[admin/reviews GET] error:', err);
    return NextResponse.json({ error: 'proxy_failed' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const res = await fetch(`${HOTEL_API_URL}/api/reviews`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': ADMIN_KEY },
      body: JSON.stringify(body),
    });
    return NextResponse.json(await res.json().catch(() => ({})), { status: res.status });
  } catch (err) {
    console.error('[admin/reviews POST] error:', err);
    return NextResponse.json({ error: 'proxy_failed' }, { status: 500 });
  }
}
