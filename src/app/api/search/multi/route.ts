import { NextRequest, NextResponse } from 'next/server';

// Server-side proxy so the Meilisearch key never reaches the browser.
// Returns {hotels, cities, countries} for the destination autocomplete.

const MEILI_HOST = process.env.MEILI_HOST || 'http://34.9.214.217:7700';
const MEILI_KEY  = process.env.MEILI_SEARCH_API_KEY || '';

async function search(index: string, q: string, limit: number) {
  const r = await fetch(`${MEILI_HOST}/indexes/${index}/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${MEILI_KEY}` },
    body: JSON.stringify({ q, limit })
  });
  if (!r.ok) return [];
  const json = await r.json();
  return json.hits || [];
}

export async function POST(req: NextRequest) {
  try {
    const { q = '', limit = 6 } = await req.json();
    if (!q || q.trim().length < 2) {
      return NextResponse.json({ hotels: [], cities: [], countries: [] });
    }
    const [hotels, cities, countries] = await Promise.all([
      search('hotels',    q, limit),
      search('cities',    q, limit),
      search('countries', q, Math.min(limit, 3))
    ]);
    return NextResponse.json({ hotels, cities, countries });
  } catch (err) {
    console.error('[search/multi proxy] error:', err);
    return NextResponse.json({ hotels: [], cities: [], countries: [] }, { status: 200 });
  }
}
