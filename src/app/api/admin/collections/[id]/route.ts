import { NextRequest, NextResponse } from 'next/server';
import { requireConsoleUser } from '@/lib/apiAuth';

/** Update collection meta (PUT) / delete a collection (DELETE). See ../route.ts. */
const HOTEL_API_URL = process.env.HOTEL_API_URL
  || process.env.NEXT_PUBLIC_HOTEL_API_URL
  || 'https://hotel-api-91901273027.australia-southeast1.run.app';
const ADMIN_KEY = process.env.COLLECTIONS_ADMIN_KEY || '';

/**
 * GET a single collection's detail (incl. its hotels[]). The hotel-api keys
 * detail by slug (GET /api/collections/:slug), so callers that only have the
 * numeric id should pass the slug here — Express matches either. Used by the
 * console's Collections membership picker to learn which collections contain
 * a given hotel without loading every detail eagerly.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireConsoleUser(request);
  if ('response' in auth) return auth.response;
  const { id } = await params;
  try {
    const res = await fetch(`${HOTEL_API_URL}/api/collections/${encodeURIComponent(id)}?includeHidden=true`, {
      cache: 'no-store',
    });
    return NextResponse.json(await res.json().catch(() => ({})), { status: res.status });
  } catch (err) {
    console.error('[admin/collections GET :id] error:', err);
    return NextResponse.json({ error: 'proxy_failed' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireConsoleUser(request);
  if ('response' in auth) return auth.response;
  const { id } = await params;
  try {
    const body = await request.json();
    const res = await fetch(`${HOTEL_API_URL}/api/collections/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': ADMIN_KEY },
      body: JSON.stringify(body),
    });
    return NextResponse.json(await res.json(), { status: res.status });
  } catch (err) {
    console.error('[admin/collections PUT] error:', err);
    return NextResponse.json({ error: 'proxy_failed' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireConsoleUser(request);
  if ('response' in auth) return auth.response;
  const { id } = await params;
  try {
    const res = await fetch(`${HOTEL_API_URL}/api/collections/${id}`, {
      method: 'DELETE',
      headers: { 'x-admin-key': ADMIN_KEY },
    });
    return NextResponse.json(await res.json(), { status: res.status });
  } catch (err) {
    console.error('[admin/collections DELETE] error:', err);
    return NextResponse.json({ error: 'proxy_failed' }, { status: 500 });
  }
}
