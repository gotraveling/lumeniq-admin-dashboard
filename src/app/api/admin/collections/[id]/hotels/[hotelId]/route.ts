import { NextRequest, NextResponse } from 'next/server';

/**
 * Single-hotel collection membership proxy.
 *
 * POST   /api/admin/collections/:id/hotels/:hotelId  → add hotel to collection
 * DELETE /api/admin/collections/:id/hotels/:hotelId  → remove hotel from collection
 *
 * Forwards to /api/collections/:id/hotels/:hotelId on the hotel-api with the
 * x-admin-key injected so the secret never reaches the browser bundle. Mirrors
 * the auth/forward pattern in ../route.ts and ../../route.ts.
 */
const HOTEL_API_URL = process.env.HOTEL_API_URL
  || process.env.NEXT_PUBLIC_HOTEL_API_URL
  || 'https://hotel-api-91901273027.australia-southeast1.run.app';
const ADMIN_KEY = process.env.COLLECTIONS_ADMIN_KEY || '';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string; hotelId: string }> }) {
  const { id, hotelId } = await params;
  try {
    const res = await fetch(`${HOTEL_API_URL}/api/collections/${encodeURIComponent(id)}/hotels/${encodeURIComponent(hotelId)}`, {
      method: 'POST',
      headers: { 'x-admin-key': ADMIN_KEY },
    });
    return NextResponse.json(await res.json().catch(() => ({})), { status: res.status });
  } catch (err) {
    console.error('[admin/collections hotels:id POST] error:', err);
    return NextResponse.json({ error: 'proxy_failed' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string; hotelId: string }> }) {
  const { id, hotelId } = await params;
  try {
    const res = await fetch(`${HOTEL_API_URL}/api/collections/${encodeURIComponent(id)}/hotels/${encodeURIComponent(hotelId)}`, {
      method: 'DELETE',
      headers: { 'x-admin-key': ADMIN_KEY },
    });
    return NextResponse.json(await res.json().catch(() => ({})), { status: res.status });
  } catch (err) {
    console.error('[admin/collections hotels:id DELETE] error:', err);
    return NextResponse.json({ error: 'proxy_failed' }, { status: 500 });
  }
}
