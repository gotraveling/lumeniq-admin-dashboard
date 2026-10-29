import { NextRequest, NextResponse } from 'next/server';
import { requireConsoleUser, actorEmail } from '@/lib/apiAuth';

const BOOKING_API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://booking-engine-api-91901273027.australia-southeast1.run.app';
const API_KEY = process.env.BOOKING_API_KEY || '';

// Proxy for supplier payments: the periods list and marking one paid. The
// signed-in user's own address is forwarded so the engine records who paid it.
async function forward(request: NextRequest, path: string[] | undefined, method: 'GET' | 'PUT', email: string) {
  const suffix = (path || []).map(encodeURIComponent).join('/');
  const qs = request.nextUrl.search || '';
  const body = method === 'PUT' ? await request.text().catch(() => '') : undefined;

  const res = await fetch(`${BOOKING_API_URL}/api/admin/supplier-payments${suffix ? `/${suffix}` : ''}${qs}`, {
    method,
    headers: { 'X-API-Key': API_KEY, 'Content-Type': 'application/json', 'X-Consultant-Email': email },
    ...(body ? { body } : {}),
    cache: 'no-store',
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ path?: string[] }> }) {
  const auth = await requireConsoleUser(request);
  if ('response' in auth) return auth.response;
  return forward(request, (await params).path, 'GET', actorEmail(auth.user));
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ path?: string[] }> }) {
  const auth = await requireConsoleUser(request);
  if ('response' in auth) return auth.response;
  return forward(request, (await params).path, 'PUT', actorEmail(auth.user));
}
