import { NextRequest, NextResponse } from 'next/server';

// Server-side proxy for the destination autocomplete → {hotels, cities, countries}.
// - hotels are routed through the booking-engine search (which already collapses
//   RateHawk+Hummingbird siblings to ONE entry via canonical_supplier_mappings),
//   so we no longer show "two Gili Lankanfushi".
// - country is normalised (Hummingbird emits ISO codes like "MV", RateHawk emits
//   "Maldives") so the dropdown reads consistently.
// The Meilisearch key + booking key never reach the browser.

const MEILI_HOST = process.env.MEILI_HOST || 'http://34.40.151.242:7700';
const MEILI_KEY = process.env.MEILI_SEARCH_API_KEY || '';
const BOOKING_API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://booking-engine-api-91901273027.australia-southeast1.run.app';
const BOOKING_API_KEY = process.env.BOOKING_API_KEY || '';

// ISO-3166-1 alpha-2 → display name for the destinations we actually sell, plus
// common ones. Unknown 2-letter codes are left as-is; full names pass through.
const ISO_COUNTRY: Record<string, string> = {
  MV: 'Maldives', TH: 'Thailand', ID: 'Indonesia', LK: 'Sri Lanka', MU: 'Mauritius',
  AE: 'United Arab Emirates', QA: 'Qatar', OM: 'Oman', SC: 'Seychelles',
  FR: 'France', IT: 'Italy', GR: 'Greece', ES: 'Spain', PT: 'Portugal', GB: 'United Kingdom',
  CH: 'Switzerland', AT: 'Austria', DE: 'Germany', NL: 'Netherlands', HR: 'Croatia',
  US: 'United States', JP: 'Japan', SG: 'Singapore', HK: 'Hong Kong', VN: 'Vietnam',
  AU: 'Australia', NZ: 'New Zealand', FJ: 'Fiji', PF: 'French Polynesia', ZA: 'South Africa',
};
function normCountry(c?: string): string {
  if (!c) return '';
  const t = c.trim();
  if (/^[A-Z]{2}$/.test(t) && ISO_COUNTRY[t]) return ISO_COUNTRY[t];
  return t;
}

async function meili(index: string, q: string, limit: number) {
  const r = await fetch(`${MEILI_HOST}/indexes/${index}/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${MEILI_KEY}` },
    body: JSON.stringify({ q, limit }),
  });
  if (!r.ok) return [];
  const json = await r.json();
  return json.hits || [];
}

// Hotels via the booking-engine (canonical-collapsed). Falls back to raw Meili if
// the engine is unreachable, so the dropdown still works (with possible dupes).
async function collapsedHotels(q: string, limit: number) {
  try {
    const r = await fetch(`${BOOKING_API_URL}/api/admin/search/hotels`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': BOOKING_API_KEY, 'X-Admin-Key': BOOKING_API_KEY },
      body: JSON.stringify({ q, limit }),
    });
    if (r.ok) {
      const j = await r.json();
      return (j.data?.hits || []).map((h: Record<string, unknown>) => ({ ...h, country: normCountry(h.country as string) }));
    }
  } catch { /* fall through */ }
  return (await meili('hotels', q, limit)).map((h: Record<string, unknown>) => ({ ...h, country: normCountry(h.country as string) }));
}

export async function POST(req: NextRequest) {
  try {
    const { q = '', limit = 6 } = await req.json();
    if (!q || q.trim().length < 2) {
      return NextResponse.json({ hotels: [], cities: [], countries: [] });
    }
    const [hotels, cities, countries] = await Promise.all([
      collapsedHotels(q, limit),
      meili('cities', q, limit),
      meili('countries', q, Math.min(limit, 3)),
    ]);
    const normList = (rows: Array<Record<string, unknown>>) =>
      rows.map((r) => ({ ...r, country: normCountry(r.country as string) }));
    return NextResponse.json({ hotels, cities: normList(cities), countries: normList(countries) });
  } catch (err) {
    console.error('[search/multi proxy] error:', err);
    return NextResponse.json({ hotels: [], cities: [], countries: [] }, { status: 200 });
  }
}
