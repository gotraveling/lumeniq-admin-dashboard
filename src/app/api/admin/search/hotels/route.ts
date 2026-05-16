import { NextRequest, NextResponse } from 'next/server';

// Server-side proxy: keeps BOOKING_API_KEY out of the browser bundle.
// Client calls /api/admin/search/hotels (same-origin), we forward to the
// booking-engine admin endpoint with the X-API-Key header.

const BOOKING_API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://booking-engine-api-91901273027.us-central1.run.app';
const API_KEY = process.env.BOOKING_API_KEY || '';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const res = await fetch(`${BOOKING_API_URL}/api/admin/search/hotels`, {
      method: 'POST',
      headers: {
        'X-Admin-Key': API_KEY,
        'X-API-Key': API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    console.error('[admin/search/hotels proxy] error:', err);
    return NextResponse.json({ error: 'proxy_failed' }, { status: 500 });
  }
}
