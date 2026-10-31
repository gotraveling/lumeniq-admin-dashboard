import { NextRequest, NextResponse } from 'next/server';
import { requireConsoleUser } from '@/lib/apiAuth';

/**
 * "Near a place" (console test page /console/near), passed on to hotel-api's
 * /api/places with the admin key. Only a signed-in console user gets through,
 * and only to the paths below, so this is not an open proxy.
 *
 * GET    config | search?q=&category= | :placeId/hotels?radius_km= | hotels/:hotelId/knowledge
 *        near?lat=&lng=&name=&google_id=      hotels around a Google result
 *        searches/top                         most searched places we do not have
 * POST   :placeId/travel-times                 body { hotel_ids }
 *        google                                body { google_id, category? }  save a Google place
 *        searches/:id/choice                   body { place_id? | google_id? }
 * PUT    :placeId/hotels/:hotelId/note          body { proximity?, note? }
 * DELETE :placeId/hotels/:hotelId/note
 * PUT    hotels/:hotelId/attributes/:attr       body { note? }
 * DELETE hotels/:hotelId/attributes/:attr
 */
const HOTEL_API_URL = process.env.HOTEL_API_URL
  || process.env.NEXT_PUBLIC_HOTEL_API_URL
  || 'https://hotel-api-91901273027.australia-southeast1.run.app';
const ADMIN_KEY = process.env.COLLECTIONS_ADMIN_KEY || '';

const ALLOWED: Record<string, RegExp[]> = {
  GET: [/^config$/, /^search$/, /^near$/, /^searches\/top$/, /^\d+\/hotels$/, /^hotels\/\d+\/knowledge$/],
  POST: [/^\d+\/travel-times$/, /^google$/, /^searches\/\d+\/choice$/],
  PUT: [/^\d+\/hotels\/\d+\/note$/, /^hotels\/\d+\/attributes\/[a-z0-9-]{1,60}$/],
  DELETE: [/^\d+\/hotels\/\d+\/note$/, /^hotels\/\d+\/attributes\/[a-z0-9-]{1,60}$/],
};

type Ctx = { params: Promise<{ path: string[] }> };

async function forward(request: NextRequest, ctx: Ctx, method: string) {
  const auth = await requireConsoleUser(request);
  if ('response' in auth) return auth.response;

  const { path } = await ctx.params;
  const sub = (path || []).join('/');
  if (!ALLOWED[method]?.some((re) => re.test(sub))) {
    return NextResponse.json({ success: false, error: 'not found' }, { status: 404 });
  }

  const url = `${HOTEL_API_URL}/api/places/${sub}${request.nextUrl.search}`;
  // x-search-channel marks the search log rows as console searches.
  const init: RequestInit = { method, headers: { 'x-admin-key': ADMIN_KEY, 'x-search-channel': 'console' }, cache: 'no-store' };
  if (method === 'POST' || method === 'PUT') {
    const body = await request.json().catch(() => ({}));
    init.headers = { ...init.headers, 'Content-Type': 'application/json' };
    // Who saved it comes from the verified login, never from the browser.
    init.body = JSON.stringify({ ...(body || {}), updated_by: auth.user.email || auth.user.uid });
  }

  const res = await fetch(url, init);
  const out = await res.json().catch(() => ({ success: false, error: `HTTP ${res.status}` }));
  return NextResponse.json(out, { status: res.status });
}

export const GET = (r: NextRequest, c: Ctx) => forward(r, c, 'GET');
export const POST = (r: NextRequest, c: Ctx) => forward(r, c, 'POST');
export const PUT = (r: NextRequest, c: Ctx) => forward(r, c, 'PUT');
export const DELETE = (r: NextRequest, c: Ctx) => forward(r, c, 'DELETE');
