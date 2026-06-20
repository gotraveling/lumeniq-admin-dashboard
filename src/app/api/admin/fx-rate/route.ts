import { NextRequest, NextResponse } from 'next/server';

/**
 * Server-side proxy for the USD→AUD FX rate used across search/booking
 * display. Forwards to the booking-engine's GET/PUT
 * /api/admin/search/fx-rate so the admin credentials never reach the
 * browser. The console settings page calls THIS route, never the
 * booking-engine directly.
 *
 * The booking-engine gates this endpoint behind both X-API-Key and
 * X-Admin-Key — we send the same server-side BOOKING_API_KEY for both.
 *
 * Response shape: { quote: 'AUD', rate, updatedAt }.
 */

const BOOKING_API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://booking-engine-api-91901273027.australia-southeast1.run.app';
const API_KEY = process.env.BOOKING_API_KEY || '';

const FX_ENDPOINT = `${BOOKING_API_URL}/api/admin/search/fx-rate`;

function adminHeaders(extra?: Record<string, string>) {
  return {
    'X-API-Key': API_KEY,
    'X-Admin-Key': API_KEY,
    ...extra
  };
}

export async function GET() {
  try {
    const res = await fetch(FX_ENDPOINT, {
      method: 'GET',
      headers: adminHeaders(),
      cache: 'no-store'
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    console.error('[admin/fx-rate proxy GET] error:', err);
    return NextResponse.json({ error: 'proxy_failed' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const rate = Number(body?.rate);
    if (!Number.isFinite(rate) || rate <= 0) {
      return NextResponse.json({ error: 'rate must be a positive number' }, { status: 400 });
    }
    const res = await fetch(FX_ENDPOINT, {
      method: 'PUT',
      headers: adminHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ rate })
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    console.error('[admin/fx-rate proxy PUT] error:', err);
    return NextResponse.json({ error: 'proxy_failed' }, { status: 500 });
  }
}
