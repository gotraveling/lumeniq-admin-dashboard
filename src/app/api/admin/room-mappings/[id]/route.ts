import { NextRequest, NextResponse } from 'next/server';

/**
 * Write proxy for a single room-mapping row. Attaches COLLECTIONS_ADMIN_KEY as
 * x-admin-key so the secret never reaches the browser. See ../route.ts.
 *
 * PUT    /api/admin/room-mappings/:id  → update {hb_room_name, rh_room_name, status, updated_by}
 * DELETE /api/admin/room-mappings/:id  → remove a redundant single row
 */
const HOTEL_API_URL = process.env.HOTEL_API_URL
  || process.env.NEXT_PUBLIC_HOTEL_API_URL
  || 'https://hotel-api-91901273027.australia-southeast1.run.app';
const ADMIN_KEY = process.env.COLLECTIONS_ADMIN_KEY || '';

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const body = await request.json();
    const res = await fetch(`${HOTEL_API_URL}/api/room-mappings/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': ADMIN_KEY },
      body: JSON.stringify(body),
    });
    return NextResponse.json(await res.json().catch(() => ({})), { status: res.status });
  } catch (err) {
    console.error('[admin/room-mappings PUT] error:', err);
    return NextResponse.json({ error: 'proxy_failed' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const res = await fetch(`${HOTEL_API_URL}/api/room-mappings/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: { 'x-admin-key': ADMIN_KEY },
    });
    return NextResponse.json(await res.json().catch(() => ({})), { status: res.status });
  } catch (err) {
    console.error('[admin/room-mappings DELETE] error:', err);
    return NextResponse.json({ error: 'proxy_failed' }, { status: 500 });
  }
}
