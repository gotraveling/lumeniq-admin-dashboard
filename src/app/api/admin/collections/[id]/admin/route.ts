import { NextRequest, NextResponse } from 'next/server';
import { requireConsoleUser } from '@/lib/apiAuth';

/**
 * Console-only facts per hotel in a collection: markup (or markup range),
 * current specials and manual rank. The hotel-api guards this with the admin
 * key because markup is margin — it must never reach a public page — so it is
 * proxied here with the key attached server-side.
 */
const HOTEL_API_URL = process.env.HOTEL_API_URL
  || process.env.NEXT_PUBLIC_HOTEL_API_URL
  || 'https://hotel-api-91901273027.australia-southeast1.run.app';
const ADMIN_KEY = process.env.COLLECTIONS_ADMIN_KEY || '';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // Signed-in console users only: this returns markup.
  const auth = await requireConsoleUser(request);
  if ('response' in auth) return auth.response;
  const { id } = await params;
  try {
    const res = await fetch(`${HOTEL_API_URL}/api/collections/${encodeURIComponent(id)}/admin`, {
      headers: { 'x-admin-key': ADMIN_KEY },
      cache: 'no-store',
    });
    return NextResponse.json(await res.json().catch(() => ({})), { status: res.status });
  } catch (err) {
    console.error('[admin/collections admin GET] error:', err);
    return NextResponse.json({ error: 'proxy_failed' }, { status: 500 });
  }
}
