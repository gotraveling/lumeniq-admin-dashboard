import { NextRequest, NextResponse } from 'next/server';

const BOOKING_API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://booking-engine-api-91901273027.australia-southeast1.run.app';
const API_KEY = process.env.BOOKING_API_KEY || '';

// Proxy: update guest names + flight details on a booking.
// The booking-engine resolves the booking's supplier and dispatches to its
// adapter — implemented for Hummingbird, 501 for suppliers (e.g. RateHawk)
// that capture guest names at booking time. We pass the supplier's response
// (incl. 501) straight through so the UI can surface it.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: bookingId } = await params;
    const body = await request.json().catch(() => ({}));

    const response = await fetch(
      `${BOOKING_API_URL}/api/bookings/${bookingId}/guest-details`,
      {
        method: 'POST',
        headers: {
          'X-API-Key': API_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      }
    );

    const data = await response.json().catch(() => ({}));
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('Error updating guest details:', error);
    return NextResponse.json(
      { error: 'Failed to update guest details' },
      { status: 500 }
    );
  }
}
