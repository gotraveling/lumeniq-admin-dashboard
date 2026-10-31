import { NextRequest, NextResponse } from 'next/server';
import { requireConsoleUser } from '@/lib/apiAuth';

/**
 * Hotel photo changes from the Main photo picker, passed on to hotel-api with
 * the admin key. hotel-api refuses these without it, so only a signed-in
 * console user can change, hide or upload a hotel's photos.
 *
 * PUT    ?hotelId=1&kind=main|hidden   body { media_url }
 * DELETE ?hotelId=1&kind=main|hidden&media_url=…
 * POST   ?hotelId=1                    body = image bytes (upload)
 */
const HOTEL_API_URL = process.env.HOTEL_API_URL
  || process.env.NEXT_PUBLIC_HOTEL_API_URL
  || 'https://hotel-api-91901273027.australia-southeast1.run.app';
const ADMIN_KEY = process.env.COLLECTIONS_ADMIN_KEY || '';

const PATHS: Record<string, string> = { main: 'featured-photo', hidden: 'hidden-images' };

function target(request: NextRequest, kind?: string): string | NextResponse {
  const hotelId = Number(request.nextUrl.searchParams.get('hotelId'));
  if (!Number.isInteger(hotelId) || hotelId <= 0) {
    return NextResponse.json({ success: false, error: 'hotelId required' }, { status: 400 });
  }
  const base = `${HOTEL_API_URL}/api/editorial/hotels/${hotelId}`;
  if (kind === undefined) return `${base}/photos`;
  const path = PATHS[kind];
  if (!path) return NextResponse.json({ success: false, error: 'kind must be main or hidden' }, { status: 400 });
  return `${base}/${path}`;
}

async function pass(res: Response) {
  const body = await res.json().catch(() => ({ success: false, error: `HTTP ${res.status}` }));
  return NextResponse.json(body, { status: res.status });
}

export async function PUT(request: NextRequest) {
  const auth = await requireConsoleUser(request);
  if ('response' in auth) return auth.response;
  const url = target(request, request.nextUrl.searchParams.get('kind') || '');
  if (typeof url !== 'string') return url;
  const body = await request.json().catch(() => ({}));
  return pass(await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'x-admin-key': ADMIN_KEY },
    body: JSON.stringify({ media_url: body?.media_url, updated_by: auth.user.email || auth.user.uid }),
  }));
}

export async function DELETE(request: NextRequest) {
  const auth = await requireConsoleUser(request);
  if ('response' in auth) return auth.response;
  const url = target(request, request.nextUrl.searchParams.get('kind') || '');
  if (typeof url !== 'string') return url;
  const mediaUrl = request.nextUrl.searchParams.get('media_url');
  const q = mediaUrl ? `?media_url=${encodeURIComponent(mediaUrl)}` : '';
  return pass(await fetch(`${url}${q}`, { method: 'DELETE', headers: { 'x-admin-key': ADMIN_KEY } }));
}

export async function POST(request: NextRequest) {
  const auth = await requireConsoleUser(request);
  if ('response' in auth) return auth.response;
  const url = target(request);
  if (typeof url !== 'string') return url;
  return pass(await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': request.headers.get('content-type') || '', 'x-admin-key': ADMIN_KEY },
    body: await request.arrayBuffer(),
  }));
}
