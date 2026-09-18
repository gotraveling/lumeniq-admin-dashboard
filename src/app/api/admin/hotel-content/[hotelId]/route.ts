import { NextRequest, NextResponse } from 'next/server';

const HOTEL_API_URL = process.env.HOTEL_API_URL
  || process.env.NEXT_PUBLIC_HOTEL_API_URL
  || 'https://hotel-api-91901273027.australia-southeast1.run.app';

/**
 * Static hotel content, on its own.
 *
 * The detail drawer used to take its content out of the RATES response, so the
 * property name, address, amenities and photos waited on a live supplier call —
 * 27s for Atlantis The Royal, where RateHawk returns 174 rates. hotel-api
 * serves the same content in ~0.35s, so this exists purely to let the drawer
 * paint the property immediately and stream the rates in underneath.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ hotelId: string }> },
) {
  const { hotelId } = await params;
  if (!/^\d+$/.test(hotelId)) {
    return NextResponse.json({ error: 'bad hotelId' }, { status: 400 });
  }
  try {
    const res = await fetch(`${HOTEL_API_URL}/api/hotels/${hotelId}`, { cache: 'no-store' });
    if (!res.ok) return NextResponse.json({ error: `hotel-api ${res.status}` }, { status: res.status });
    return NextResponse.json(await res.json());
  } catch (e: any) {
    // Content is an enhancement here — the rates response still carries a copy,
    // so a failure must not block the drawer.
    return NextResponse.json({ error: e?.message || 'content fetch failed' }, { status: 502 });
  }
}
