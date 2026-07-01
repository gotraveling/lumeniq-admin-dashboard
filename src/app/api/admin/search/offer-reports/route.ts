import { NextRequest, NextResponse } from 'next/server';

// Server-side proxy for saved offer reports — keeps BOOKING_API_KEY out of the
// browser. GET lists reports; POST saves an assembled report.

const BOOKING_API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://booking-engine-api-91901273027.australia-southeast1.run.app';
const API_KEY = process.env.BOOKING_API_KEY || '';
const HEADERS = { 'X-Admin-Key': API_KEY, 'X-API-Key': API_KEY, 'Content-Type': 'application/json' };

export async function GET() {
  try {
    const res = await fetch(`${BOOKING_API_URL}/api/admin/search/offer-reports`, { headers: HEADERS, cache: 'no-store' });
    return NextResponse.json(await res.json(), { status: res.status });
  } catch (err) {
    console.error('[offer-reports proxy GET] error:', err);
    return NextResponse.json({ error: 'proxy_failed' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const res = await fetch(`${BOOKING_API_URL}/api/admin/search/offer-reports`, {
      method: 'POST', headers: HEADERS, body: JSON.stringify(body),
    });
    return NextResponse.json(await res.json(), { status: res.status });
  } catch (err) {
    console.error('[offer-reports proxy POST] error:', err);
    return NextResponse.json({ error: 'proxy_failed' }, { status: 500 });
  }
}
