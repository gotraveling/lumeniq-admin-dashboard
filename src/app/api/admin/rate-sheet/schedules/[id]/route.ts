import { NextRequest, NextResponse } from 'next/server';
import { requireConsoleUser } from '@/lib/apiAuth';

/** Delete one rate-sheet schedule. */
export const dynamic = 'force-dynamic';

const BOOKING_API_URL = process.env.NEXT_PUBLIC_API_URL
  || 'https://booking-engine-api-91901273027.australia-southeast1.run.app';
const API_KEY = process.env.BOOKING_API_KEY || '';

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireConsoleUser(request);
  if ('response' in auth) return auth.response;
  const { id } = await params;
  const res = await fetch(`${BOOKING_API_URL}/api/admin/rate-sheet/schedules/${encodeURIComponent(id)}`, {
    method: 'DELETE', headers: { 'X-API-Key': API_KEY }, cache: 'no-store',
  });
  return NextResponse.json(await res.json().catch(() => ({})), { status: res.status });
}
