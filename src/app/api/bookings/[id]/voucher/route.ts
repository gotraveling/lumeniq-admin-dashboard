import { NextRequest, NextResponse } from 'next/server';
import { requireConsoleUser } from '@/lib/apiAuth';

// Server-side proxy: keeps BOOKING_API_KEY out of the browser bundle.
const BOOKING_API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://booking-engine-api-91901273027.australia-southeast1.run.app';
const API_KEY = process.env.BOOKING_API_KEY || '';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireConsoleUser(request);
  if ('response' in auth) return auth.response;
  try {
    const { id: bookingId } = await params;
    const response = await fetch(`${BOOKING_API_URL}/api/bookings/${bookingId}/voucher`, {
      headers: { 'X-API-Key': API_KEY, 'X-Admin-Key': API_KEY },
      cache: 'no-store',
    });
    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (err) {
    console.error('[bookings/voucher proxy] error:', err);
    return NextResponse.json({ error: 'proxy_failed' }, { status: 500 });
  }
}
