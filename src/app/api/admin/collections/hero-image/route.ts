import { NextRequest, NextResponse } from 'next/server';
import { requireConsoleUser } from '@/lib/apiAuth';

/**
 * Collection header images on hotel-api, one folder per collection.
 *
 * GET              every uploaded header image, newest first, with its folder
 * POST ?folder=…   body = the image bytes; stores it and returns its url, which
 *                  the collections editor saves as the hero image
 */
const HOTEL_API_URL = process.env.HOTEL_API_URL
  || process.env.NEXT_PUBLIC_HOTEL_API_URL
  || 'https://hotel-api-91901273027.australia-southeast1.run.app';
const ADMIN_KEY = process.env.COLLECTIONS_ADMIN_KEY || '';

async function pass(res: Response) {
  const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
  return NextResponse.json(body, { status: res.status });
}

export async function GET(request: NextRequest) {
  const auth = await requireConsoleUser(request);
  if ('response' in auth) return auth.response;
  try {
    return pass(await fetch(`${HOTEL_API_URL}/api/collections/hero-images`, {
      headers: { 'x-admin-key': ADMIN_KEY }, cache: 'no-store',
    }));
  } catch (err) {
    console.error('[admin/collections/hero-image GET] error:', err);
    return NextResponse.json({ error: 'proxy_failed' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireConsoleUser(request);
  if ('response' in auth) return auth.response;
  const folder = request.nextUrl.searchParams.get('folder') || '';
  try {
    return pass(await fetch(`${HOTEL_API_URL}/api/collections/hero-image?folder=${encodeURIComponent(folder)}`, {
      method: 'POST',
      headers: { 'Content-Type': request.headers.get('content-type') || '', 'x-admin-key': ADMIN_KEY },
      body: await request.arrayBuffer(),
    }));
  } catch (err) {
    console.error('[admin/collections/hero-image POST] error:', err);
    return NextResponse.json({ error: 'proxy_failed' }, { status: 500 });
  }
}
