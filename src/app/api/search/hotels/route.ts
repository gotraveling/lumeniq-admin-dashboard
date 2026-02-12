import { NextRequest, NextResponse } from 'next/server';

// Use PostgreSQL directly for admin dashboard to get both hotel_id and supplier codes
const HOTEL_API_URL = process.env.HOTEL_API_URL || 'https://hotel-api-91901273027.us-central1.run.app';

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
