import { NextRequest, NextResponse } from 'next/server';

/**
 * Server-side proxy for the prebook step. The browser POSTs here when
 * the consultant clicks Choose on a rate; we forward to the booking-
 * engine's POST /api/bookings/prebook with the booking API key so the
 * API key never reaches the client.
 *
 * Same shared route the B2C confirmation page hits — just proxied
 * here so we can use the admin-only API key from the server env
 * without exposing it to the dashboard JS.
 */

const BOOKING_API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://booking-engine-api-91901273027.australia-southeast1.run.app';
const API_KEY = process.env.BOOKING_API_KEY || '';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const res = await fetch(`${BOOKING_API_URL}/api/bookings/prebook`, {
      method: 'POST',
      headers: { 'X-API-Key': API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    console.error('[admin/prebook proxy] error:', err);
    return NextResponse.json({ error: 'proxy_failed' }, { status: 500 });
  }
}
