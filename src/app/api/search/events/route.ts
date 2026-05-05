import { NextRequest, NextResponse } from 'next/server';

const BOOKING_API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://booking-engine-api-91901273027.us-central1.run.app';
const API_KEY = process.env.BOOKING_API_KEY || '';

export async function GET(request: NextRequest) {
  try {
    const qs = request.nextUrl.search;
    const resp = await fetch(`${BOOKING_API_URL}/api/search/events${qs}`, {
      headers: { 'X-API-Key': API_KEY },
      // Cloud Run logs tab refreshes a lot — short cache helps.
      next: { revalidate: 0 },
    });
    const data = await resp.json().catch(() => ({}));
    return NextResponse.json(data, { status: resp.status });
  } catch (e) {
    console.error('Error proxying search events:', e);
    return NextResponse.json({ error: 'Failed to fetch search events' }, { status: 500 });
  }
}
