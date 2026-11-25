import { NextRequest, NextResponse } from 'next/server';
import { requireConsoleUser } from '@/lib/apiAuth';

/**
 * Proxy for the room descriptions we keep (hotel-api room_content).
 *
 * GET /api/admin/room-mappings/content?hotelId=123  → { rooms: { name: { description, source } }, hotel }
 * PUT /api/admin/room-mappings/content              → { hotelId, room_name, description, updated_by }
 *
 * Writes attach the COLLECTIONS_ADMIN_KEY server-side, same as the mapping rows.
 */
const HOTEL_API_URL = process.env.HOTEL_API_URL
  || process.env.NEXT_PUBLIC_HOTEL_API_URL
  || 'https://hotel-api-91901273027.australia-southeast1.run.app';
const ADMIN_KEY = process.env.COLLECTIONS_ADMIN_KEY || '';

export async function GET(request: NextRequest) {
  const auth = await requireConsoleUser(request);
  if ('response' in auth) return auth.response;
  const qs = request.nextUrl.searchParams.toString();
  try {
    const res = await fetch(`${HOTEL_API_URL}/api/room-mappings/content${qs ? `?${qs}` : ''}`, { cache: 'no-store' });
    return NextResponse.json(await res.json().catch(() => ({})), { status: res.status });
  } catch (err) {
    console.error('[admin/room-mappings/content GET] error:', err);
    return NextResponse.json({ error: 'proxy_failed' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const auth = await requireConsoleUser(request);
  if ('response' in auth) return auth.response;
  try {
    const body = await request.json();
    const res = await fetch(`${HOTEL_API_URL}/api/room-mappings/content`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': ADMIN_KEY },
      body: JSON.stringify(body),
    });
    return NextResponse.json(await res.json().catch(() => ({})), { status: res.status });
  } catch (err) {
    console.error('[admin/room-mappings/content PUT] error:', err);
    return NextResponse.json({ error: 'proxy_failed' }, { status: 500 });
  }
}
