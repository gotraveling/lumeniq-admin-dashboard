import { NextRequest, NextResponse } from 'next/server';

/** Replace the ordered block list for a page (bulk save). See ../route.ts. */
const HOTEL_API_URL = process.env.HOTEL_API_URL
  || process.env.NEXT_PUBLIC_HOTEL_API_URL
  || 'https://hotel-api-91901273027.australia-southeast1.run.app';
const ADMIN_KEY = process.env.COLLECTIONS_ADMIN_KEY || '';

export async function PUT(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  try {
    const body = await request.json();
    const res = await fetch(`${HOTEL_API_URL}/api/pages/${encodeURIComponent(slug)}/blocks`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': ADMIN_KEY },
      body: JSON.stringify(body),
    });
    return NextResponse.json(await res.json(), { status: res.status });
  } catch (err) {
    console.error('[admin/pages blocks PUT] error:', err);
    return NextResponse.json({ error: 'proxy_failed' }, { status: 500 });
  }
}
