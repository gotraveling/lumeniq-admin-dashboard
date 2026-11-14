#!/usr/bin/env node
/**
 * Scripted check: a Hotelbeds certifier login reaches the Hotelbeds API routes
 * and nothing else, and never sees net or markup.
 *
 *   CONSOLE_BASE=http://localhost:3999 \
 *   CERT_EMAIL=hotelbeds-cert@firstclass.com.au CERT_PASSWORD=... \
 *   node scripts/check-certifier-access.mjs
 *
 * The console under test must list CERT_EMAIL in CONSOLE_CERTIFIER_EMAILS.
 * Signs in through Firebase's public REST endpoint with the console's web API
 * key (public, same as the browser uses). Or pass CERT_TOKEN directly.
 *
 * Spends Hotelbeds quota only on the two hotelbeds checks (status without
 * ?live, so none; one availability), and none at all against a fixture engine.
 */

const BASE = process.env.CONSOLE_BASE || 'http://localhost:3999';
const WEB_KEY = process.env.FIREBASE_WEB_API_KEY || 'AIzaSyBrhc2KFBKfSTGZa68rd4DBmogHrLySRpU';

async function token() {
  if (process.env.CERT_TOKEN) return process.env.CERT_TOKEN;
  const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${WEB_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: process.env.CERT_EMAIL, password: process.env.CERT_PASSWORD, returnSecureToken: true }),
  });
  const d = await res.json();
  if (!d.idToken) throw new Error(`sign-in failed: ${JSON.stringify(d.error || d)}`);
  return d.idToken;
}

const day = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

const CASES = [
  // [method, path, body, expected status]
  ['GET', '/api/console/me', null, 200],
  // Routes that verify the caller (apiAuth.requireConsoleUser).
  ['POST', '/api/admin/bookings', { rateKey: 'x' }, 403],
  ['POST', '/api/admin/prebook', { hash: 'x' }, 403],
  ['GET', '/api/bookings', null, 403],
  ['GET', '/api/admin/settings', null, 403],
  ['GET', '/api/pricing/rules', null, 403],
  // Routes that check no token at all: refused by src/proxy.ts.
  ['GET', '/api/admin/search/hotels?q=maldives', null, 403],
  ['GET', '/api/admin/search/rates/1?checkIn=2027-02-15&checkOut=2027-02-18', null, 403],
  ['POST', '/api/admin/search/rates/compare', {}, 403],
  ['GET', '/api/suppliers', null, 403],
  // Theirs.
  ['GET', '/api/admin/hotelbeds/status', null, 200],
  ['POST', '/api/admin/hotelbeds/availability', { checkIn: day(90), checkOut: day(93), destinationCode: 'PMI', maxHotels: 3 }, 200],
];

const HIDDEN = ['_admin', 'markup', 'supplierNet', 'totalNet', 'net'];
function leaks(v, path = '$', out = []) {
  if (Array.isArray(v)) v.forEach((x, i) => leaks(x, `${path}[${i}]`, out));
  else if (v && typeof v === 'object') {
    for (const [k, x] of Object.entries(v)) {
      if (HIDDEN.includes(k)) out.push(`${path}.${k}`);
      leaks(x, `${path}.${k}`, out);
    }
  }
  return out;
}

const t = await token();
let failed = 0;
for (const [method, path, body, want] of CASES) {
  const res = await fetch(BASE + path, {
    method,
    headers: { Authorization: `Bearer ${t}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null; try { json = JSON.parse(text); } catch { /* html */ }
  let ok = res.status === want;
  let note = '';
  if (ok && path === '/api/console/me' && json?.certifier !== true) { ok = false; note = 'login is not a certifier on this console'; }
  if (ok && want === 200 && path.startsWith('/api/admin/hotelbeds/')) {
    const l = leaks(json);
    if (l.length) { ok = false; note = `net/markup visible: ${l.slice(0, 3).join(', ')}`; }
  }
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${method.padEnd(6)} ${path.padEnd(70)} ${res.status} (want ${want})${note ? '  ' + note : ''}`);
}

// No token at all: the Hotelbeds routes are not open.
const anon = await fetch(BASE + '/api/admin/hotelbeds/status');
const anonOk = anon.status === 401;
if (!anonOk) failed++;
console.log(`${anonOk ? 'PASS' : 'FAIL'}  GET    /api/admin/hotelbeds/status (no token)${' '.repeat(36)} ${anon.status} (want 401)`);

console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
process.exit(failed ? 1 : 0);
