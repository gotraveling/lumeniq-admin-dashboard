import { NextRequest, NextResponse } from 'next/server';

// Proxy for a single saved offer report — GET (with rows) + DELETE.

const BOOKING_API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://booking-engine-api-91901273027.australia-southeast1.run.app';
const API_KEY = process.env.BOOKING_API_KEY || '';
const HEADERS = { 'X-Admin-Key': API_KEY, 'X-API-Key': API_KEY, 'Content-Type': 'application/json' };

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const res = await fetch(`${BOOKING_API_URL}/api/admin/search/offer-reports/${id}`, { headers: HEADERS, cache: 'no-store' });
    return NextResponse.json(await res.json(), { status: res.status });
  } catch (err) {
    console.error('[offer-reports/:id proxy GET] error:', err);
    return NextResponse.json({ error: 'proxy_failed' }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const res = await fetch(`${BOOKING_API_URL}/api/admin/search/offer-reports/${id}`, { method: 'DELETE', headers: HEADERS });
    return NextResponse.json(await res.json(), { status: res.status });
  } catch (err) {
    console.error('[offer-reports/:id proxy DELETE] error:', err);
    return NextResponse.json({ error: 'proxy_failed' }, { status: 500 });
  }
}
