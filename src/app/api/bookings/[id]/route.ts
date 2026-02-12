import { NextRequest, NextResponse } from 'next/server';

const BOOKING_API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://booking-engine-api-91901273027.us-central1.run.app';
const API_KEY = process.env.BOOKING_API_KEY || '';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: bookingId } = await params;

    const response = await fetch(
      `${BOOKING_API_URL}/api/bookings/${bookingId}`,
      {
        headers: {
          'X-API-Key': API_KEY,
          'Content-Type': 'application/json'
        }
      }
    );

    if (!response.ok) {
      const error = await response.json();
      return NextResponse.json(error, { status: response.status });
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error fetching booking detail:', error);
    return NextResponse.json(
      { error: 'Failed to fetch booking detail' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: bookingId } = await params;

    const response = await fetch(
      `${BOOKING_API_URL}/api/bookings/${bookingId}`,
      {
        method: 'DELETE',
        headers: {
          'X-API-Key': API_KEY,
          'Content-Type': 'application/json'
        }
      }
    );

    if (!response.ok) {
      const error = await response.json();
      return NextResponse.json(error, { status: response.status });
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error cancelling booking:', error);
    return NextResponse.json(
      { error: 'Failed to cancel booking' },
      { status: 500 }
    );
  }
}
