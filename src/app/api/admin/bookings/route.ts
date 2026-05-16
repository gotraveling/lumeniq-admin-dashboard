import { NextRequest, NextResponse } from 'next/server';

/**
 * Server-side proxy for the consultant book-on-behalf flow.
 *
 * Forwards to the booking-engine /api/bookings endpoint that we've
 * already verified is ETG-cert compliant — children ages in the right
 * shape, multi-room guests array, residency / nationalityCode, all of
 * it (orders 100020511, 100020513, 100020514, 100020541, 100020542
 * are the cert evidence for that pipeline).
 *
 * Difference from a public booking: we tag specialRequests with the
 * signed-in consultant's email so the booking row has audit trail of
 * who placed it. Future: attach a real consultant_id column when the
 * console adds RBAC.
 */
const BOOKING_API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://booking-engine-api-91901273027.us-central1.run.app';
const API_KEY = process.env.BOOKING_API_KEY || '';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const consultantEmail = request.headers.get('x-consultant-email') || body.consultantEmail || null;
    if (consultantEmail) {
      body.specialRequests = `[Booked on behalf by ${consultantEmail}] ${body.specialRequests || ''}`.trim();
    }
    const res = await fetch(`${BOOKING_API_URL}/api/bookings`, {
      method: 'POST',
      headers: {
        'X-API-Key': API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    console.error('[admin/bookings proxy] error:', err);
    return NextResponse.json({ error: 'proxy_failed' }, { status: 500 });
  }
}
