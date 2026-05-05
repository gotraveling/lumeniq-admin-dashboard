import { NextRequest, NextResponse } from 'next/server';

const BOOKING_API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://booking-engine-api-91901273027.us-central1.run.app';
const API_KEY = process.env.BOOKING_API_KEY || '';

/**
 * Admin proxy for marking an on-request booking as confirmed or cancelled.
 * Forwards to booking-engine /api/bookings/:id/supplier-confirmation
 * which flips the persisted status, logs an audit event, and (on confirm)
 * fires the standard customer confirmation email so the guest gets the
 * same template as instant bookings.
 *
 * Body: { decision: 'confirmed' | 'cancelled', confirmationNumber?, note? }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const resp = await fetch(
      `${BOOKING_API_URL}/api/bookings/${id}/supplier-confirmation`,
      {
        method: 'POST',
        headers: { 'X-API-Key': API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }
    );
    const data = await resp.json().catch(() => ({}));
    return NextResponse.json(data, { status: resp.status });
  } catch (error) {
    console.error('Error in supplier-confirmation:', error);
    return NextResponse.json({ error: 'Failed to update supplier confirmation' }, { status: 500 });
  }
}
