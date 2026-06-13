import { NextRequest, NextResponse } from 'next/server';
import { toConsole, toBackend } from '@/lib/pricingRulesMap';

const BOOKING_API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://booking-engine-api-91901273027.australia-southeast1.run.app';
const API_KEY = process.env.BOOKING_API_KEY || '';

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const input = await request.json();
    const r = await fetch(`${BOOKING_API_URL}/api/inventory/pricing-rules/${id}`, {
      method: 'PUT',
      headers: { 'X-API-Key': API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(toBackend(input)),
    });
    if (!r.ok) return NextResponse.json(await r.json().catch(() => ({ message: `HTTP ${r.status}` })), { status: r.status });
    const body = await r.json();
    return NextResponse.json(toConsole(body?.data ?? body));
  } catch (e: any) {
    console.error('pricing rules PUT proxy error:', e?.message);
    return NextResponse.json({ message: 'Failed to update pricing rule' }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const r = await fetch(`${BOOKING_API_URL}/api/inventory/pricing-rules/${id}`, {
      method: 'DELETE',
      headers: { 'X-API-Key': API_KEY, 'Content-Type': 'application/json' },
    });
    if (!r.ok) return NextResponse.json(await r.json().catch(() => ({ message: `HTTP ${r.status}` })), { status: r.status });
    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error('pricing rules DELETE proxy error:', e?.message);
    return NextResponse.json({ message: 'Failed to delete pricing rule' }, { status: 500 });
  }
}
