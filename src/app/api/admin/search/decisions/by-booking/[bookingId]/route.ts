import { NextRequest, NextResponse } from 'next/server';

const BOOKING_API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://booking-engine-api-91901273027.australia-southeast1.run.app';
const API_KEY = process.env.BOOKING_API_KEY || '';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ bookingId: string }> }
) {
  try {
    const { bookingId } = await params;
    const res = await fetch(`${BOOKING_API_URL}/api/admin/search/decisions/by-booking/${bookingId}`, {
      headers: { 'X-Admin-Key': API_KEY, 'X-API-Key': API_KEY }
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    console.error('[admin/search/decisions/by-booking proxy] error:', err);
    return NextResponse.json({ error: 'proxy_failed' }, { status: 500 });
  }
}
