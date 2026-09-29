import { NextRequest, NextResponse } from 'next/server';
import { requireConsoleUser } from '@/lib/apiAuth';

/** Rate-sheet schedules: list and save. The engine owns the timing. */
export const dynamic = 'force-dynamic';

const BOOKING_API_URL = process.env.NEXT_PUBLIC_API_URL
  || 'https://booking-engine-api-91901273027.australia-southeast1.run.app';
const API_KEY = process.env.BOOKING_API_KEY || '';

export async function GET(request: NextRequest) {
  const auth = await requireConsoleUser(request);
  if ('response' in auth) return auth.response;
  const res = await fetch(`${BOOKING_API_URL}/api/admin/rate-sheet/schedules`, {
    headers: { 'X-API-Key': API_KEY }, cache: 'no-store',
  });
  return NextResponse.json(await res.json().catch(() => ({})), { status: res.status });
}

export async function POST(request: NextRequest) {
  const auth = await requireConsoleUser(request);
  if ('response' in auth) return auth.response;
  const body = await request.json().catch(() => ({}));
  const res = await fetch(`${BOOKING_API_URL}/api/admin/rate-sheet/schedules`, {
    method: 'POST',
    headers: { 'X-API-Key': API_KEY, 'Content-Type': 'application/json' },
    // Who set it up, for the row.
    body: JSON.stringify({ ...body, createdBy: auth.user?.email || null }),
    cache: 'no-store',
  });
  return NextResponse.json(await res.json().catch(() => ({})), { status: res.status });
}
