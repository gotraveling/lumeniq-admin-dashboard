import { NextRequest, NextResponse } from 'next/server';

/**
 * Server-side proxy for generic platform settings (settingsService in the
 * booking-engine). Forwards to GET/PUT /api/admin/search/settings so the admin
 * credentials never reach the browser. The console settings page calls THIS
 * route, never the booking-engine directly.
 *
 * The booking-engine gates the endpoint behind both X-API-Key and X-Admin-Key —
 * we send the same server-side BOOKING_API_KEY for both.
 *
 * GET  → { settings: [{ key, type, label, description, group, default, value, updatedAt, updatedBy }] }
 * PUT  { key, value } → upserts one setting.
 */

const BOOKING_API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://booking-engine-api-91901273027.australia-southeast1.run.app';
const API_KEY = process.env.BOOKING_API_KEY || '';

const SETTINGS_ENDPOINT = `${BOOKING_API_URL}/api/admin/search/settings`;

function adminHeaders(extra?: Record<string, string>) {
  return {
    'X-API-Key': API_KEY,
    'X-Admin-Key': API_KEY,
    ...extra
  };
}

export async function GET() {
  try {
    const res = await fetch(SETTINGS_ENDPOINT, {
      method: 'GET',
      headers: adminHeaders(),
      cache: 'no-store'
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    console.error('[admin/settings proxy GET] error:', err);
    return NextResponse.json({ error: 'proxy_failed' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const key = typeof body?.key === 'string' ? body.key : '';
    if (!key) {
      return NextResponse.json({ error: 'key is required' }, { status: 400 });
    }
    const res = await fetch(SETTINGS_ENDPOINT, {
      method: 'PUT',
      headers: adminHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ key, value: body?.value })
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    console.error('[admin/settings proxy PUT] error:', err);
    return NextResponse.json({ error: 'proxy_failed' }, { status: 500 });
  }
}
