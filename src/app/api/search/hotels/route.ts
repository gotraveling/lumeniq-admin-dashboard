import { NextRequest, NextResponse } from 'next/server';

// Use PostgreSQL directly for admin dashboard to get both hotel_id and supplier codes
const HOTEL_API_URL = process.env.HOTEL_API_URL || 'https://hotel-api-91901273027.australia-southeast1.run.app';

const MEILI_HOST = process.env.MEILI_HOST || 'http://34.40.151.242:7700';
const MEILI_KEY = process.env.MEILI_SEARCH_API_KEY || '';

// Word-wise hotel search. Kept server-side so the Meili key never reaches the
// browser. Shapes hits like the hotel-api branch below, minus hummingbird_code
// which only hotel-api's source_data carries.
async function meiliHotels(q: string, limit: number) {
  try {
    const r = await fetch(`${MEILI_HOST}/indexes/hotels/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${MEILI_KEY}` },
      body: JSON.stringify({ q, limit, matchingStrategy: 'all' }),
    });
    if (!r.ok) return [];
    const j = await r.json();
    return (j.hits || []).map((h: any) => ({
      id: String(h.id ?? h.hotel_id),
      hotel_id: Number(h.id ?? h.hotel_id),
      name: h.name,
      city: h.city,
      country: h.country,
      hummingbird_code: null,
    })).filter((h: any) => Number.isFinite(h.hotel_id));
  } catch {
    return [];
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { q, limit = 20 } = body;

    if (!q || q.length < 2) {
      return NextResponse.json({ hits: [] }, { status: 200 });
    }

    // Check if query looks like a supplier code (starts with 'h' followed by alphanumeric)
    const isSupplierCode = /^h[a-z0-9]+$/i.test(q);

    // Use hotel-api search endpoint which queries PostgreSQL directly
    const searchParam = isSupplierCode ? `supplier_code=${encodeURIComponent(q)}` : `query=${encodeURIComponent(q)}`;
    const response = await fetch(`${HOTEL_API_URL}/api/hotels/search?${searchParam}&limit=${limit}`);

    if (!response.ok) {
      throw new Error('Hotel API request failed');
    }

    const data = await response.json();

    // hotel-api matches the WHOLE query as one contiguous substring of the
    // name, so "four seasons cairo" finds nothing — the real name is "Four
    // Seasons Hotel Cairo at Nile Plaza" and those words are never adjacent in
    // that order. Brand + city is how people actually search, so it failed on
    // the most natural input and returned an empty list with no error.
    //
    // Fall back to Meilisearch (matchingStrategy 'all' — every typed word must
    // match) only when hotel-api finds nothing. hotel-api stays the primary
    // because it is the only source of the supplier hotel_code that the
    // inventory pages read off these results; the fallback loses that field,
    // but the alternative today is no result at all.
    if (!isSupplierCode && !(data.hotels || []).length) {
      const fallback = await meiliHotels(q, limit);
      if (fallback.length) return NextResponse.json({ hits: fallback });
    }

    // Transform to match Meilisearch format for compatibility
    const hits = (data.hotels || []).map((hotel: any) => {
      // Extract supplier hotel code from source_data
      const supplierCode = hotel.source_data?.[0]?.hotel_code || null;

      return {
        id: hotel.hotel_id.toString(),
        hotel_id: hotel.hotel_id,
        name: hotel.name,
        city: hotel.city,
        country: hotel.country,
        hummingbird_code: supplierCode // This is the supplier-specific hotel code
      };
    });

    return NextResponse.json({ hits });
  } catch (error) {
    console.error('Search API error:', error);
    return NextResponse.json(
      { error: 'Search failed', hits: [] },
      { status: 500 }
    );
  }
}
