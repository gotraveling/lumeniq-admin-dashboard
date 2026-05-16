/**
 * Tools the agent can call. Each is a thin shim over the booking-engine
 * /api/admin/search/* endpoints. The agent decides when to invoke them
 * based on the consultant's chat message.
 *
 * Booking itself is NOT a tool — consultants finalise bookings by
 * picking a hotel + rate from the canvas and filling the form. This
 * keeps the agent in a research/recommend role and the booking flow
 * deterministic + auditable.
 */
import 'server-only';
import { tool } from 'ai';
import { z } from 'zod';

const BOOKING_API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://booking-engine-api-91901273027.us-central1.run.app';
const API_KEY = process.env.BOOKING_API_KEY || '';

const HEADERS = {
  'Content-Type': 'application/json',
  'X-Admin-Key': API_KEY,
  'X-API-Key':   API_KEY
};

export const agentTools = {
  search_hotels: tool({
    description: 'Search the hotel inventory by destination or hotel name. Returns up to 20 matching hotels with city, country, star rating, and which supplier carries them. Use this when the consultant asks about a destination or a specific hotel they want to find.',
    inputSchema: z.object({
      query: z.string().describe('Destination city, country, region, or hotel name. Free text. Examples: "Dubai", "Conrad Los Angeles", "Maldives", "Bali"'),
      starMin: z.number().int().min(1).max(5).optional().describe('Minimum star rating filter, e.g. 4 for "luxury only"'),
      city:    z.string().optional(),
      country: z.string().optional(),
      limit:   z.number().int().min(1).max(20).optional().default(10)
    }),
    execute: async (input) => {
      const r = await fetch(`${BOOKING_API_URL}/api/admin/search/hotels`, {
        method: 'POST',
        headers: HEADERS,
        body: JSON.stringify({ q: input.query, starMin: input.starMin, city: input.city, country: input.country, limit: input.limit ?? 10 })
      });
      const json = await r.json();
      if (!json.success) return { error: json.error || 'search failed', hits: [] };
      return {
        total: json.data.total,
        hits: (json.data.hits || []).map((h: any) => ({
          id: h.id, name: h.name, city: h.city, country: h.country,
          starRating: h.starRating, image: h.image,
          sources: h.sources || []
        }))
      };
    }
  }),

  get_rate_breakdown: tool({
    description: 'Get the full rate list for a single hotel on given dates and guest composition. Returns every available rate with the supplier, room name, meal plan, refundability, cancellation deadline, and full pricing breakdown (net + markup + sell). Use this when the consultant wants to see prices for a specific hotel.',
    inputSchema: z.object({
      hotelId:  z.number().int().describe('Internal hotel id from search_hotels.hits[].id'),
      checkIn:  z.string().describe('YYYY-MM-DD'),
      checkOut: z.string().describe('YYYY-MM-DD, must be after checkIn'),
      adults:   z.number().int().min(1).max(10).optional().default(2),
      rooms:    z.number().int().min(1).max(9).optional().default(1),
      childAges: z.array(z.number().int().min(0).max(17)).optional().describe('Ages of any children'),
      nationalityCode: z.string().length(2).optional().describe('ISO-2 passport country, e.g. "AU", "UZ"')
    }),
    execute: async (input) => {
      const qs = new URLSearchParams({
        checkIn:  input.checkIn,
        checkOut: input.checkOut,
        adults:   String(input.adults ?? 2),
        rooms:    String(input.rooms ?? 1)
      });
      if (input.childAges?.length) qs.set('childAges', JSON.stringify(input.childAges));
      if (input.nationalityCode)    qs.set('nationalityCode', input.nationalityCode);
      const r = await fetch(`${BOOKING_API_URL}/api/admin/search/rates/${input.hotelId}?${qs.toString()}`, { headers: HEADERS });
      const json = await r.json();
      if (!json.success) return { error: json.error || 'rates failed', rates: [] };
      return {
        hotel: json.data.hotel,
        ratesCount: json.data.ratesCount,
        rates: (json.data.rates || []).slice(0, 15).map((r: any) => ({
          supplier: r.supplier,
          rateKey:  r.rateKey,
          roomTypeName: r.roomTypeName,
          ratePlan: r.ratePlan,
          refundable: r.refundable,
          cancellationDeadlineUtc: r.cancellationDeadlineUtc,
          net:    r.pricing?.net?.totalAmount,
          markup: r.pricing?.markup?.amount,
          sell:   r.pricing?.sell?.totalAmount,
          currency: r.pricing?.currency
        }))
      };
    }
  }),

  compare_hotels: tool({
    description: 'Compare the cheapest rate across multiple hotels on the same dates. Useful when the consultant has shortlisted 2–5 hotels and wants a side-by-side view.',
    inputSchema: z.object({
      hotelIds: z.array(z.number().int()).min(1).max(10).describe('Internal hotel ids from search_hotels.hits[].id'),
      checkIn:  z.string(),
      checkOut: z.string(),
      adults:   z.number().int().min(1).max(10).optional().default(2),
      rooms:    z.number().int().min(1).max(9).optional().default(1),
      childAges: z.array(z.number().int().min(0).max(17)).optional(),
      nationalityCode: z.string().length(2).optional()
    }),
    execute: async (input) => {
      const r = await fetch(`${BOOKING_API_URL}/api/admin/search/rates/compare`, {
        method: 'POST',
        headers: HEADERS,
        body: JSON.stringify({
          hotelIds: input.hotelIds,
          checkIn:  input.checkIn,
          checkOut: input.checkOut,
          adults:   input.adults ?? 2,
          rooms:    input.rooms ?? 1,
          childAges: input.childAges,
          nationalityCode: input.nationalityCode
        })
      });
      const json = await r.json();
      if (!json.success) return { error: json.error || 'compare failed', results: [] };
      return { results: json.data.results };
    }
  })
};

export type AgentToolName = keyof typeof agentTools;
