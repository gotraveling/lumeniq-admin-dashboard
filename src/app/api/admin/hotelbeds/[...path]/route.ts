import { NextRequest, NextResponse } from 'next/server';
import { requireConsoleUser } from '@/lib/apiAuth';

/**
 * /console/hotelbeds → booking-engine /api/admin/hotelbeds/*, with the admin
 * key attached here so it never reaches the browser. Hotelbeds TEST
 * environment only; every booking it makes is stored as a test row.
 *
 * Who may call: a console admin, or a Hotelbeds certifier (see
 * certifierPolicy). Consultants may not: these calls spend the Hotelbeds
 * evaluation quota and place test bookings.
 *
 * Only the paths below are forwarded, so this is not an open proxy:
 *   GET    status | bookings | bookings/:ref | bookings/:ref/voucher | content/boards
 *   POST   availability | checkrate | bookings | bookings/:ref/cancel-simulation
 *   DELETE bookings/:ref          (?maxFee= refuses a cancel dearer than the simulation)
 *
 * A certifier gets the same responses with every net, markup and margin field
 * removed. Hotelbeds must see only what a customer would: sell prices.
 */
const BOOKING_API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://booking-engine-api-91901273027.australia-southeast1.run.app';
const API_KEY = process.env.BOOKING_API_KEY || '';
const ADMIN_KEY = process.env.BOOKING_ADMIN_KEY || API_KEY;

const REF = '[A-Za-z0-9-]{1,40}';
const ALLOWED: Record<string, RegExp[]> = {
  GET: [/^status$/, /^bookings$/, new RegExp(`^bookings/${REF}$`), new RegExp(`^bookings/${REF}/voucher$`), /^content\/boards$/],
  POST: [/^availability$/, /^checkrate$/, /^bookings$/, new RegExp(`^bookings/${REF}/cancel-simulation$`)],
  DELETE: [new RegExp(`^bookings/${REF}$`)],
};

// Fields a certifier must never see. Removed wherever they appear in the
// response, at any depth.
const CERTIFIER_HIDDEN = new Set([
  '_admin', 'markup', 'supplierNet', 'supplierNetAmount', 'supplierNetCurrency',
  'net', 'totalNet', 'pendingAmount', 'commission', 'commissionAmount', 'margin',
  'rawResponse', 'raw', 'audUnavailable',
  // CheckRate's net re-quote and a cancellation's original net total.
  'rate', 'newPrice', 'contractedPrice', 'contractedCurrency', 'originalAmount', 'originalCurrency',
]);

function stripForCertifier(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(stripForCertifier);
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      if (CERTIFIER_HIDDEN.has(k)) continue;
      out[k] = stripForCertifier(val);
    }
    return out;
  }
  return v;
}

type Ctx = { params: Promise<{ path: string[] }> };

async function forward(request: NextRequest, ctx: Ctx, method: 'GET' | 'POST' | 'DELETE') {
  const auth = await requireConsoleUser(request);
  if ('response' in auth) return auth.response;
  const { user } = auth;
  // Same admin roles as the console UI (useConsoleRole).
  const consoleAdmin = user.admin || ['super_admin', 'admin', 'firstclass_admin'].includes(user.role || '');
  if (!consoleAdmin && !user.certifier) {
    return NextResponse.json({ error: 'forbidden', message: 'Hotelbeds certification screens are for admins.' }, { status: 403 });
  }

  const { path } = await ctx.params;
  const sub = (path || []).join('/');
  if (!ALLOWED[method]?.some((re) => re.test(sub))) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  const init: RequestInit = {
    method,
    headers: { 'X-API-Key': API_KEY, 'X-Admin-Key': ADMIN_KEY },
    cache: 'no-store',
  };
  if (method === 'POST') {
    const body = await request.json().catch(() => ({}));
    init.headers = { ...init.headers, 'Content-Type': 'application/json' };
    init.body = JSON.stringify(body || {});
  }

  let res: Response;
  try {
    res = await fetch(`${BOOKING_API_URL}/api/admin/hotelbeds/${sub}${request.nextUrl.search}`, init);
  } catch (err) {
    console.error('[admin/hotelbeds proxy] error:', err);
    return NextResponse.json({ error: 'proxy_failed' }, { status: 502 });
  }

  const type = res.headers.get('content-type') || '';
  if (type.includes('text/html')) {
    // The engine's own printable voucher. It carries no price.
    return new NextResponse(await res.text(), { status: res.status, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  }
  const data = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
  return NextResponse.json(user.certifier ? stripForCertifier(data) : data, { status: res.status });
}

export const GET = (r: NextRequest, c: Ctx) => forward(r, c, 'GET');
export const POST = (r: NextRequest, c: Ctx) => forward(r, c, 'POST');
export const DELETE = (r: NextRequest, c: Ctx) => forward(r, c, 'DELETE');
