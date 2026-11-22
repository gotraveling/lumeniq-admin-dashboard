import { NextRequest, NextResponse } from 'next/server';
import { requireConsoleUser } from '@/lib/apiAuth';

/**
 * Saves a hotel's extra services (title + the details the guest sees when they
 * tap it), passed on to hotel-api with the admin key. hotel-api refuses the
 * write without it, so only a signed-in console user can change them.
 *
 * PUT ?hotelId=1   body { services: [{ title, details }] }
 */
const HOTEL_API_URL = process.env.HOTEL_API_URL
  || process.env.NEXT_PUBLIC_HOTEL_API_URL
  || 'https://hotel-api-91901273027.australia-southeast1.run.app';
const ADMIN_KEY = process.env.COLLECTIONS_ADMIN_KEY || '';

export async function PUT(request: NextRequest) {
  const auth = await requireConsoleUser(request);
  if ('response' in auth) return auth.response;
  const hotelId = Number(request.nextUrl.searchParams.get('hotelId'));
  if (!Number.isInteger(hotelId) || hotelId <= 0) {
    return NextResponse.json({ success: false, error: 'hotelId required' }, { status: 400 });
  }
  const body = await request.json().catch(() => ({}));
  const res = await fetch(`${HOTEL_API_URL}/api/editorial/hotels/${hotelId}/services`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'x-admin-key': ADMIN_KEY },
    body: JSON.stringify({ services: body?.services, updated_by: auth.user.email || auth.user.uid }),
  });
  const out = await res.json().catch(() => ({ success: false, error: `HTTP ${res.status}` }));
  return NextResponse.json(out, { status: res.status });
}
