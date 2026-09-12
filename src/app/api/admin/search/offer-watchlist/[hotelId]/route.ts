import { NextRequest, NextResponse } from 'next/server';

const BOOKING_API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://booking-engine-api-91901273027.australia-southeast1.run.app';
const API_KEY = process.env.BOOKING_API_KEY || '';
const HEADERS = { 'X-Admin-Key': API_KEY, 'X-API-Key': API_KEY, 'Content-Type': 'application/json' };

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ hotelId: string }> }) {
  const { hotelId } = await params;
  try {
    const res = await fetch(`${BOOKING_API_URL}/api/admin/search/offer-watchlist/${encodeURIComponent(hotelId)}`, {
      method: 'DELETE', headers: HEADERS,
    });
    return NextResponse.json(await res.json(), { status: res.status });
  } catch {
    return NextResponse.json({ error: 'proxy_failed' }, { status: 500 });
  }
}
