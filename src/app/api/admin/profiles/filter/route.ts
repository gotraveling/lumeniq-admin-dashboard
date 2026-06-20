import { NextRequest, NextResponse } from 'next/server';

/**
 * Compiled-filter preview proxy.
 * GET /api/admin/profiles/filter?slug=<slug>
 *   → forwards to /api/profiles/:slug/filter
 *   → { filter:"<meili string>", profile }
 * Read-only/public; proxied so the page only talks to its own origin.
 */
const HOTEL_API_URL = process.env.HOTEL_API_URL
  || process.env.NEXT_PUBLIC_HOTEL_API_URL
  || 'https://hotel-api-91901273027.australia-southeast1.run.app';

export async function GET(request: NextRequest) {
  const slug = request.nextUrl.searchParams.get('slug');
  if (!slug) {
    return NextResponse.json({ error: 'slug required' }, { status: 400 });
  }
  try {
    const res = await fetch(`${HOTEL_API_URL}/api/profiles/${encodeURIComponent(slug)}/filter`, {
      cache: 'no-store',
    });
    return NextResponse.json(await res.json(), { status: res.status });
  } catch (err) {
    console.error('[admin/profiles/filter GET] error:', err);
    return NextResponse.json({ error: 'proxy_failed' }, { status: 500 });
  }
}
