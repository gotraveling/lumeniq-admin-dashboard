import { NextRequest, NextResponse } from 'next/server';

const BOOKING_API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://booking-engine-api-91901273027.us-central1.run.app';
const API_KEY = process.env.BOOKING_API_KEY || '';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ hotelId: string }> }
) {
  try {
    const { hotelId } = await params;
    const qs = request.nextUrl.searchParams.toString();
    const url = `${BOOKING_API_URL}/api/admin/search/rates/${hotelId}${qs ? `?${qs}` : ''}`;
    const res = await fetch(url, {
      headers: { 'X-Admin-Key': API_KEY, 'X-API-Key': API_KEY }
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    console.error('[admin/search/rates proxy] error:', err);
    return NextResponse.json({ error: 'proxy_failed' }, { status: 500 });
  }
}
