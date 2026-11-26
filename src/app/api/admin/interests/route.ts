import { NextRequest, NextResponse } from 'next/server';
import { requireConsoleUser } from '@/lib/apiAuth';

/**
 * Server-side proxy for /console/interests (hotel interests: diving, wellness,
 * food ...). They live on the hotel-api (hotel_data, table hotel_interests).
 * Writes need the x-admin-key, attached here so it never reaches the browser.
 *
 * GET  ?hotelId=123                    → { saved: [keys], suggested: { key: words } }
 * GET  ?collection=<slug>&list=page    → the collection's hotels { hotels: [{ hotelId, name }] }
 * GET  ?collection=<slug>&list=more    → its Load More hotels
 * PUT  ?hotelId=123  { interests, updatedBy }
 */
const HOTEL_API_URL = process.env.HOTEL_API_URL
  || process.env.NEXT_PUBLIC_HOTEL_API_URL
  || 'https://hotel-api-91901273027.australia-southeast1.run.app';
const ADMIN_KEY = process.env.COLLECTIONS_ADMIN_KEY || '';

type H = { hotelId?: number; name?: string; hidden?: boolean };

export async function GET(request: NextRequest) {
  const auth = await requireConsoleUser(request);
  if ('response' in auth) return auth.response;
  const sp = request.nextUrl.searchParams;
  try {
    const slug = sp.get('collection');
    if (slug) {
      const more = sp.get('list') === 'more';
      const res = await fetch(
        `${HOTEL_API_URL}/api/collections/${encodeURIComponent(slug)}${more ? '/more' : '?includeHidden=true'}`,
        { cache: 'no-store' });
      if (res.status === 404) return NextResponse.json({ hotels: [] });
      const d = await res.json();
      if (!res.ok) return NextResponse.json(d, { status: res.status });
      const hotels = (Array.isArray(d.hotels) ? d.hotels : [])
        .filter((h: H) => h.hotelId != null)
        .map((h: H) => ({ hotelId: Number(h.hotelId), name: h.name || `Hotel #${h.hotelId}`, hidden: !!h.hidden }));
      return NextResponse.json({ hotels });
    }
    const hotelId = sp.get('hotelId');
    if (!hotelId) return NextResponse.json({ error: 'hotelId or collection required' }, { status: 400 });
    const res = await fetch(`${HOTEL_API_URL}/api/interests/hotels/${encodeURIComponent(hotelId)}`, { cache: 'no-store' });
    return NextResponse.json(await res.json(), { status: res.status });
  } catch (err) {
    console.error('[admin/interests GET] error:', err);
    return NextResponse.json({ error: 'proxy_failed' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const auth = await requireConsoleUser(request);
  if ('response' in auth) return auth.response;
  const hotelId = request.nextUrl.searchParams.get('hotelId');
  if (!hotelId) return NextResponse.json({ error: 'hotelId required' }, { status: 400 });
  try {
    const body = await request.json();
    const res = await fetch(`${HOTEL_API_URL}/api/interests/hotels/${encodeURIComponent(hotelId)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': ADMIN_KEY },
      body: JSON.stringify(body),
    });
    return NextResponse.json(await res.json(), { status: res.status });
  } catch (err) {
    console.error('[admin/interests PUT] error:', err);
    return NextResponse.json({ error: 'proxy_failed' }, { status: 500 });
  }
}
