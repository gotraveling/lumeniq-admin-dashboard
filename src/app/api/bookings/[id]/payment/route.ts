import { NextRequest, NextResponse } from 'next/server';

const BOOKING_API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://booking-engine-api-91901273027.australia-southeast1.run.app';
const API_KEY = process.env.BOOKING_API_KEY || '';

// Proxy: record that the client has paid, or been refunded.
// Payment is taken offline on our own terminal, so this only writes the record.
// The consultant's email rides along so the booking history names who marked it.
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: bookingId } = await params;
    const body = await request.json().catch(() => ({}));
    const consultantEmail = request.headers.get('x-consultant-email') || '';

    const response = await fetch(`${BOOKING_API_URL}/api/bookings/${bookingId}/payment`, {
      method: 'PUT',
      headers: {
        'X-API-Key': API_KEY,
        'Content-Type': 'application/json',
        ...(consultantEmail ? { 'X-Consultant-Email': consultantEmail } : {}),
      },
      body: JSON.stringify(body),
    });

    const data = await response.json().catch(() => ({}));
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('Error recording payment:', error);
    return NextResponse.json({ error: 'Failed to record payment' }, { status: 500 });
  }
}
