import { NextRequest, NextResponse } from 'next/server';
import { toConsole, toBackend, TENANT } from '@/lib/pricingRulesMap';

// Server-side proxy to the AUTHORITATIVE pricing rules — the booking-engine
// `pricing_rules` table that pricingService.js actually applies as markup.
// (The old hotel-api /api/pricing/rules is a dead duplicate; do not use it.)
const BOOKING_API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://booking-engine-api-91901273027.australia-southeast1.run.app';
const API_KEY = process.env.BOOKING_API_KEY || '';

export async function GET() {
  try {
    const r = await fetch(`${BOOKING_API_URL}/api/inventory/pricing-rules/${TENANT}`, {
      headers: { 'X-API-Key': API_KEY, 'Content-Type': 'application/json' },
      cache: 'no-store',
    });
    if (!r.ok) return NextResponse.json(await r.json().catch(() => ({ error: `HTTP ${r.status}` })), { status: r.status });
    const body = await r.json();
    const rows = Array.isArray(body) ? body : body?.data || [];
    return NextResponse.json(rows.map(toConsole));
  } catch (e: any) {
    console.error('pricing rules GET proxy error:', e?.message);
    return NextResponse.json({ error: 'Failed to fetch pricing rules' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const input = await request.json();
    const r = await fetch(`${BOOKING_API_URL}/api/inventory/pricing-rules`, {
      method: 'POST',
      headers: { 'X-API-Key': API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(toBackend(input)),
    });
    if (!r.ok) return NextResponse.json(await r.json().catch(() => ({ message: `HTTP ${r.status}` })), { status: r.status });
    const body = await r.json();
    return NextResponse.json(toConsole(body?.data ?? body), { status: 201 });
  } catch (e: any) {
    console.error('pricing rules POST proxy error:', e?.message);
    return NextResponse.json({ message: 'Failed to create pricing rule' }, { status: 500 });
  }
}
