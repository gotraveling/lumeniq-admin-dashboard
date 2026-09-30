import { NextRequest, NextResponse } from 'next/server';
import { requireConsoleUser } from '@/lib/apiAuth';

/**
 * Collection rate sheet, on demand.
 *
 * GET  → build it with LIVE rates (the engine re-fetches before answering)
 * POST → build it and mail it, whatever has or hasn't moved
 *
 * The weekly schedule only mails on a price drop; pressing a button in the
 * console is a person asking, so it always answers.
 *
 * Slow on purpose: a live fetch is a round of supplier calls per stay window,
 * so this can take a minute or two. maxDuration lifts the platform's default
 * so the answer is not cut off halfway.
 */
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

const BOOKING_API_URL = process.env.NEXT_PUBLIC_API_URL
  || 'https://booking-engine-api-91901273027.australia-southeast1.run.app';
const API_KEY = process.env.BOOKING_API_KEY || '';

export async function GET(request: NextRequest) {
  const auth = await requireConsoleUser(request);
  if ('response' in auth) return auth.response;

  // Pass the question through as asked. Dropping hotelIds/from/to here meant a
  // dated hotel-list search silently became "this collection, next 60 days".
  const p = request.nextUrl.searchParams;
  const slug = p.get('slug') || '';
  const hotelIds = p.get('hotelIds') || '';
  if (!slug && !hotelIds) {
    return NextResponse.json({ error: 'slug or hotelIds required' }, { status: 400 });
  }
  const qs = new URLSearchParams();
  // warm only when actually fetching; ?cached=1 must never cost supplier calls.
  if (p.get('cached') !== '1') qs.set('warm', '1');
  for (const k of ['slug', 'hotelIds', 'nights', 'from', 'to', 'channel', 'cached', 'stream'] as const) {
    const v = p.get(k);
    if (v) qs.set(k, v);
  }
  const res = await fetch(`${BOOKING_API_URL}/api/admin/rate-sheet?${qs}`, {
    headers: { 'X-API-Key': API_KEY },
    cache: 'no-store',
  });

  // Streaming run: pass the body straight through, unbuffered, so the console
  // can render rows as they price instead of after a blank minute.
  if (p.get('stream') === '1' && res.body) {
    return new NextResponse(res.body, {
      status: res.status,
      headers: {
        'Content-Type': 'application/x-ndjson; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
      },
    });
  }
  return NextResponse.json(await res.json().catch(() => ({})), { status: res.status });
}

export async function POST(request: NextRequest) {
  const auth = await requireConsoleUser(request);
  if ('response' in auth) return auth.response;

  const body = await request.json().catch(() => ({}));
  if (!body.slug && !body.slugs) {
    return NextResponse.json({ error: 'slug required' }, { status: 400 });
  }
  const res = await fetch(`${BOOKING_API_URL}/api/admin/rate-sheet/run`, {
    method: 'POST',
    headers: { 'X-API-Key': API_KEY, 'Content-Type': 'application/json' },
    // force: a person pressed the button.
    body: JSON.stringify({ ...body, force: true }),
    cache: 'no-store',
  });
  return NextResponse.json(await res.json().catch(() => ({})), { status: res.status });
}
