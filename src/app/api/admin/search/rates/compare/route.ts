import { NextRequest, NextResponse } from 'next/server';

// Same-origin proxy to booking-engine /api/admin/search/rates/compare
// so the admin key stays server-side. Used by /console/search to
// enrich the hotel result cards with "From $X" badges after the
// initial text search returns.

const BOOKING_API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://booking-engine-api-91901273027.us-central1.run.app';
const API_KEY = process.env.BOOKING_API_KEY || '';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const res = await fetch(`${BOOKING_API_URL}/api/admin/search/rates/compare`, {
      method: 'POST',
      headers: {
        'X-Admin-Key': API_KEY,
        'X-API-Key':   API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    console.error('[admin/search/rates/compare proxy] error:', err);
    return NextResponse.json({ error: 'proxy_failed' }, { status: 500 });
  }
}
