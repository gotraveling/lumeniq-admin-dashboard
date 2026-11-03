import { NextRequest, NextResponse } from 'next/server';
import { requireConsoleUser } from '@/lib/apiAuth';
import { renderClientVoucher } from '@/lib/clientVoucher';

const BOOKING_API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://booking-engine-api-91901273027.australia-southeast1.run.app';
const API_KEY = process.env.BOOKING_API_KEY || '';
const HOTEL_API_URL = 'https://hotel-api-91901273027.australia-southeast1.run.app';

// Our own voucher for the client, as an HTML page they can print or save as PDF.
// The supplier's voucher (the sibling /voucher route) stays for the consultant;
// this one carries no prices, no "PAID" stamp and no supplier name.
// See src/lib/clientVoucher.ts for what it shows and why.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireConsoleUser(request);
  if ('response' in auth) return auth.response;
  try {
    const { id: bookingId } = await params;

    // include=references brings the supplier's reservation number and the
    // hotel's confirmation number, which the plain detail call leaves out.
    const bRes = await fetch(
      `${BOOKING_API_URL}/api/bookings/${encodeURIComponent(bookingId)}?include=references`,
      { headers: { 'X-API-Key': API_KEY }, cache: 'no-store' }
    );
    const bJson = await bRes.json().catch(() => ({}));
    if (!bRes.ok || !bJson?.data) {
      return NextResponse.json(
        { error: 'booking_unavailable', message: bJson?.message || `Booking not found (${bRes.status})` },
        { status: bRes.status === 404 ? 404 : 502 }
      );
    }
    const booking = bJson.data;

    if (String(booking.status || '').toLowerCase() === 'cancelled') {
      return NextResponse.json(
        { error: 'cancelled', message: 'This booking is cancelled, so there is no voucher to send.' },
        { status: 409 }
      );
    }

    // A voucher without the hotel's name and address is no use at the desk, so
    // fail loudly rather than hand the client a half-empty page.
    const hotelId = booking.bookingDetails?.hotelId;
    const hRes = hotelId
      ? await fetch(`${HOTEL_API_URL}/api/hotels/${encodeURIComponent(String(hotelId))}`, { cache: 'no-store' }).catch(() => null)
      : null;
    const hotel = hRes?.ok ? await hRes.json().catch(() => null) : null;
    if (!hotel?.hotel_name) {
      return NextResponse.json(
        { error: 'hotel_unavailable', message: `Could not load the hotel's details (hotel ${hotelId ?? '?'}). Try again in a moment.` },
        { status: 502 }
      );
    }

    const html = renderClientVoucher(booking, hotel, { printBar: true });
    return new NextResponse(html, {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  } catch (err) {
    console.error('[bookings/client-voucher] error:', err);
    return NextResponse.json({ error: 'voucher_failed' }, { status: 500 });
  }
}
