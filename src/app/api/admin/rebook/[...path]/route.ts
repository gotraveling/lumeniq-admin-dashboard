import { NextRequest, NextResponse } from 'next/server';
import { requireConsoleUser } from '@/lib/apiAuth';

const BOOKING_API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://booking-engine-api-91901273027.australia-southeast1.run.app';
const API_KEY = process.env.BOOKING_API_KEY || '';

// Proxy for the rebook watch: candidates, the token lookup behind the alert
// email's link, and the act/dismiss calls. The consultant's email is forwarded
// so the booking engine records who made the decision.
async function forward(request: NextRequest, path: string[], method: 'GET' | 'POST') {
  const suffix = path.map(encodeURIComponent).join('/');
  const qs = request.nextUrl.search || '';
  const consultantEmail = request.headers.get('x-consultant-email') || '';
  const body = method === 'POST' ? await request.text().catch(() => '') : undefined;

  const res = await fetch(`${BOOKING_API_URL}/api/admin/rebook/${suffix}${qs}`, {
    method,
    headers: {
      'X-API-Key': API_KEY,
      'Content-Type': 'application/json',
      ...(consultantEmail ? { 'X-Consultant-Email': consultantEmail } : {}),
    },
    ...(body ? { body } : {}),
    cache: 'no-store',
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const auth = await requireConsoleUser(request);
  if ('response' in auth) return auth.response;
  const { path } = await params;
  return forward(request, path, 'GET');
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const auth = await requireConsoleUser(request);
  if ('response' in auth) return auth.response;
  const { path } = await params;
  return forward(request, path, 'POST');
}
