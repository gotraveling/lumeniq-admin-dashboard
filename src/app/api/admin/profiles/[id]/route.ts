import { NextRequest, NextResponse } from 'next/server';

/** Fetch (GET) / update meta (PUT) / delete (DELETE) a profile by id. See ../route.ts. */
const HOTEL_API_URL = process.env.HOTEL_API_URL
  || process.env.NEXT_PUBLIC_HOTEL_API_URL
  || 'https://hotel-api-91901273027.australia-southeast1.run.app';
const ADMIN_KEY = process.env.COLLECTIONS_ADMIN_KEY || '';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const res = await fetch(`${HOTEL_API_URL}/api/profiles/${encodeURIComponent(id)}`, {
      cache: 'no-store',
    });
    return NextResponse.json(await res.json(), { status: res.status });
  } catch (err) {
    console.error('[admin/profiles GET by id] error:', err);
    return NextResponse.json({ error: 'proxy_failed' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const body = await request.json();
    const res = await fetch(`${HOTEL_API_URL}/api/profiles/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': ADMIN_KEY },
      body: JSON.stringify(body),
    });
    return NextResponse.json(await res.json(), { status: res.status });
  } catch (err) {
    console.error('[admin/profiles PUT] error:', err);
    return NextResponse.json({ error: 'proxy_failed' }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const res = await fetch(`${HOTEL_API_URL}/api/profiles/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: { 'x-admin-key': ADMIN_KEY },
    });
    return NextResponse.json(await res.json(), { status: res.status });
  } catch (err) {
    console.error('[admin/profiles DELETE] error:', err);
    return NextResponse.json({ error: 'proxy_failed' }, { status: 500 });
  }
}
