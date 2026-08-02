import { NextRequest, NextResponse } from 'next/server';

/**
 * Read a composable page + its ordered blocks. Proxied server-side (rather than
 * hit from the browser) so the shared admin key never reaches the client —
 * same pattern as ../../collections/route.ts.
 */
const HOTEL_API_URL = process.env.HOTEL_API_URL
  || process.env.NEXT_PUBLIC_HOTEL_API_URL
  || 'https://hotel-api-91901273027.australia-southeast1.run.app';
const ADMIN_KEY = process.env.COLLECTIONS_ADMIN_KEY || '';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  try {
    const res = await fetch(`${HOTEL_API_URL}/api/pages/${encodeURIComponent(slug)}`, {
      headers: { 'x-admin-key': ADMIN_KEY },
      cache: 'no-store',
    });
    return NextResponse.json(await res.json(), { status: res.status });
  } catch (err) {
    console.error('[admin/pages GET] error:', err);
    return NextResponse.json({ error: 'proxy_failed' }, { status: 500 });
  }
}
