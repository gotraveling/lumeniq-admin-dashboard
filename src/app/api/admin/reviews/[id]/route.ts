import { NextRequest, NextResponse } from 'next/server';

/**
 * Single-review proxy. Attaches COLLECTIONS_ADMIN_KEY as x-admin-key on writes
 * so the secret never reaches the browser. See ../route.ts.
 *
 * GET    /api/admin/reviews/:id  → one review with tags[] + links[]
 * PUT    /api/admin/reviews/:id  → update review (+ optionally replace links/tags), keyed
 * DELETE /api/admin/reviews/:id  → delete (cascades to links/tags), keyed
 */
const HOTEL_API_URL = process.env.HOTEL_API_URL
  || process.env.NEXT_PUBLIC_HOTEL_API_URL
  || 'https://hotel-api-91901273027.australia-southeast1.run.app';
const ADMIN_KEY = process.env.COLLECTIONS_ADMIN_KEY || '';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const res = await fetch(`${HOTEL_API_URL}/api/reviews/${encodeURIComponent(id)}`, {
      cache: 'no-store',
    });
    return NextResponse.json(await res.json().catch(() => ({})), { status: res.status });
  } catch (err) {
    console.error('[admin/reviews GET :id] error:', err);
    return NextResponse.json({ error: 'proxy_failed' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const body = await request.json();
    const res = await fetch(`${HOTEL_API_URL}/api/reviews/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': ADMIN_KEY },
      body: JSON.stringify(body),
    });
    return NextResponse.json(await res.json().catch(() => ({})), { status: res.status });
  } catch (err) {
    console.error('[admin/reviews PUT] error:', err);
    return NextResponse.json({ error: 'proxy_failed' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const res = await fetch(`${HOTEL_API_URL}/api/reviews/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: { 'x-admin-key': ADMIN_KEY },
    });
    return NextResponse.json(await res.json().catch(() => ({})), { status: res.status });
  } catch (err) {
    console.error('[admin/reviews DELETE] error:', err);
    return NextResponse.json({ error: 'proxy_failed' }, { status: 500 });
  }
}
