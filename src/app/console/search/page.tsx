'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth } from '@/lib/firebase';
import { Search, Star, MapPin, Loader2, ArrowLeft, Sparkles, Filter, Pencil, CheckCircle2, AlertTriangle, X, Maximize2, Minimize2 } from 'lucide-react';
import DestinationAutocomplete, { type DestinationAutocompleteHandle } from '@/components/console/DestinationAutocomplete';
import CountryPicker from '@/components/console/CountryPicker';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import DateRangePicker from '@/components/console/DateRangePicker';
import GuestSelector, { type RoomGuests } from '@/components/console/GuestSelector';

// Pre-fill pills — the agent panel handles open-ended discovery; these
// pills are for the consultant who already knows the brief.
const PROMPT_PILLS: Array<{ label: string; q: string; nights: number; rooms: RoomGuests[] }> = [
  { label: 'Dubai · 3n · 2 adults',         q: 'Dubai',       nights: 3, rooms: [{ adults: 2, childrenAges: [] }] },
  { label: 'LA · 2n · 2 adults',            q: 'Los Angeles', nights: 2, rooms: [{ adults: 2, childrenAges: [] }] },
  { label: 'Maldives · 5n · 2 adults',      q: 'Maldives',    nights: 5, rooms: [{ adults: 2, childrenAges: [] }] },
  { label: 'Bali · 6n · 2 adults + 2 kids', q: 'Bali',        nights: 6, rooms: [{ adults: 2, childrenAges: [7, 9] }] }
];

type HotelHit = {
  id: number;
  name: string;
  city?: string;
  country?: string;
  starRating?: number;
  image?: string | null;
  sources: string[];
  // Canonical-merge metadata (server-side dedupe): when the same
  // physical property has records under multiple suppliers, the
  // backend collapses them into one hit. linkedHotelIds names every
  // supplier id mapped to the canonical so the rates fan-out can
  // call each supplier.
  canonicalId?: number | null;
  linkedHotelIds?: number[];
  // Enriched after the compare call:
  priced?: {
    available: boolean;
    supplier?: string;          // cheapest-supplier surfaced on the card (= cheapestSupplier from compare)
    sellNightly?: number;
    sellTotal?: number;
    netNightly?: number;
    netTotal?: number;
    markupPct?: number;
    currency?: string;
    roomTypeName?: string;
    ratePlan?: string;
    refundable?: boolean;
    breakfastIncluded?: boolean | null;
    cancellationDeadlineUtc?: string | null;
    ratesCount?: number;
    onRequest?: boolean;
    // Multi-supplier quotes (one per linked supplier). When length > 1
    // we render stacked quote rows on the card so consultant can
    // compare and pick. The recommended-by-score gets a gold border.
    quotes?: Quote[];
  };
};

type Quote = {
  supplier: string | null;
  available: boolean;
  reason?: string;
  sellNightly?: number;
  sellTotal?: number;
  netNightly?: number;
  markupPct?: number;
  markupAmount?: number;
  currency?: string;
  ratePlan?: string;
  refundable?: boolean | null;
  breakfastIncluded?: boolean | null;
  cancellationDeadlineUtc?: string | null;
  ratesCount?: number;
};

type AdminRate = {
  supplier: string;
  // RateHawk channel that produced this rate: 'cug' (member) or 'b2c'.
  // Drives the per-rate badge + which credentials prebook/booking use.
  _channel?: 'cug' | 'b2c';
  rateKey: string;
  roomTypeName: string;
  // Precise sub-variant from static content (room_groups[].name on
  // RateHawk, room_types[].name on Hummingbird). RateHawk often
  // refines "Ocean Villa" → "Ocean Villa, 1 king bed, ocean view".
  // Frontend groups by this so view/bedding/floor variations become
  // separate cards instead of getting flattened.
  roomGroupName?: string | null;
  ratePlan: string;
  refundable: boolean;
  breakfastIncluded: boolean;
  roomImage?: string | null;
  // Tier of rg_ext / name match that resolved roomImage + roomGroupName.
  // 'strict' = ETG §2.4 (all 12 rg_ext fields). Degraded tiers
  // (class_bedding / class) cover sandbox rg_ext drift on luxury cert
  // hotels — Valentin, ETG 2026-05-27. Surfaced behind ?debug=rgmatch.
  matchTier?: 'strict' | 'class_bedding' | 'class' | 'name' | 'none' | null;
  cancellationPolicy?: string | null;
  cancellationDeadlineUtc?: string | null;
  // ETG cert §6 — included/excluded split from supplier. Sidebar
  // itemises excluded taxes on top of the rate; included taxes are
  // already in pricing.sell.totalAmount and must never be re-summed.
  taxes?: {
    included?: Array<{ name?: string; type?: string; amount: number; currency?: string }>;
    excluded?: Array<{ name?: string; type?: string; amount: number; currency?: string }>;
    excludedTotal?: number;
  } | null;
  pricing: {
    currency: string;
    net?: { totalAmount: number; nightlyAmount: number };
    sell?: { totalAmount: number; nightlyAmount: number };
    markup?: { type: string; value: number; amount: number; ruleName?: string };
  };
};

function todayPlus(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export default function ConsoleSearchPage() {
  const [user] = useAuthState(auth);
  const sp = useSearchParams();
  const router = useRouter();

  // Push current search/detail context into the URL so refresh, share,
  // and back-button preserve state. Uses router.replace (not push) so
  // a long search session doesn't pollute browser history with every
  // edit. Mirrors only durable state — pending price enrichment and
  // transient UI flags stay in React.
  const syncUrl = (patch: Record<string, string | number | null | undefined>) => {
    const next = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === undefined || v === '') next.delete(k);
      else next.set(k, String(v));
    }
    router.replace(next.toString() ? `/console/search?${next}` : '/console/search');
  };

  // ─── Form state ─────────────────────────────────────────────
  const [q, setQ]               = useState('');
  const destRef                 = useRef<DestinationAutocompleteHandle>(null);
  const [checkIn, setCheckIn]   = useState(todayPlus(30));
  const [checkOut, setCheckOut] = useState(todayPlus(33));
  const [rooms, setRooms]       = useState<RoomGuests[]>([{ adults: 2, childrenAges: [] }]);
  // Citizenship of the GUEST — drives RateHawk's residency-based pricing.
  // ETG cert spec §3.8 requires this, and FirstClass's main market is AU
  // so default there.
  const [citizenship, setCitizenship] = useState('AU');

  // ─── Results state ──────────────────────────────────────────
  const [hits, setHits]                 = useState<HotelHit[]>([]);
  const [searching, setSearching]       = useState(false);
  const [enrichingPrices, setEnriching] = useState(false);
  const [searchErr, setSearchErr]       = useState<string | null>(null);

  // ─── Result filters ─────────────────────────────────────────
  const [filterSupplier,    setFilterSupplier]    = useState<'all' | 'ratehawk' | 'hummingbird'>('all');
  const [filterRefundable,  setFilterRefundable]  = useState(false);
  const [showUnavailable,   setShowUnavailable]   = useState(false);

  // ─── Detail view: right slide-over drawer over the (dimmed) results
  // list, so the consultant keeps the search results + scroll position
  // and can bounce between hotels. `detailExpanded` widens the drawer to
  // near-full-width for the form-heavy booking step. ─────────────────
  const [detailHotel, setDetailHotel]   = useState<HotelHit | null>(null);
  const [detailExpanded, setDetailExpanded] = useState(false);
  const [rates, setRates]               = useState<AdminRate[]>([]);
  const [ratesBusy, setRatesBusy]       = useState(false);
  const [ratesErr, setRatesErr]         = useState<string | null>(null);
  // Lazy B2C compare: false until the consultant clicks "Compare B2C" on the
  // open hotel (so we don't pay 2x ETG calls on every search). Base channel
  // is always Member (cug); B2C rates are merged in on demand, tagged.
  const [b2cLoaded, setB2cLoaded]       = useState(false);
  const [b2cBusy,   setB2cBusy]         = useState(false);
  const [chosenRate, setChosenRate]     = useState<AdminRate | null>(null);
  // rate_decisions audit-trail identifiers. Set once when rates land,
  // re-used on /choose POST and forwarded into /api/bookings so the
  // backend can stamp the row with the booking id later.
  const [searchId, setSearchId]                       = useState<string | null>(null);
  const [recommendedRateKey, setRecommendedRateKey]   = useState<string | null>(null);
  // Prebook state — set when the consultant picks a rate. We verify
  // availability + price BEFORE they fill the form. Per ETG cert §1.1
  // ("Moving prebook to the separate step is also highly recommended").
  type PrebookInfo = {
    prebookHash: string;
    // Truthful: did the supplier-locked sell price differ from the
    // search-time quote? Used for informational rendering and as the
    // LLM-readable signal in MCP responses.
    priceChanged: boolean;
    // Strict: did the supplier flip changes.price_changed=true? Per
    // ETG cert, this is the ONLY signal that gates the "Accept new
    // total" banner — silent shifts inside RH's own tolerance band
    // must not interrupt the consultant.
    supplierFlaggedChange: boolean;
    originalPrice?: number | null;
    newPrice?: number | null;
    currency?: string | null;
    isFreeCancellation?: boolean | null;
    partnerOrderId?: string;
    supplier?: string;
    skipped?: string;
  };
  const [prebook, setPrebook]               = useState<PrebookInfo | null>(null);
  const [prebookBusy, setPrebookBusy]       = useState(false);
  const [prebookErr, setPrebookErr]         = useState<string | null>(null);
  const [acceptedNewPrice, setAcceptedNewPrice] = useState(false);
  // Inline edit-search on the detail header.
  const [editingSearch, setEditingSearch] = useState(false);

  // ─── Book-on-behalf form ────────────────────────────────────
  const [custFirst, setCustFirst] = useState('');
  const [custLast,  setCustLast]  = useState('');
  const [custEmail, setCustEmail] = useState('');
  const [custPhone, setCustPhone] = useState('');
  // ETG cert §5 — per-room lead-guest names for multi-room bookings.
  // Indexes 0…N-2 hold names for rooms 2…N. Room 1 uses custFirst /
  // custLast (the main customer block).
  const [extraRoomGuests, setExtraRoomGuests] = useState<Array<{ firstName: string; lastName: string }>>([]);
  useEffect(() => {
    const extras = Math.max(0, rooms.length - 1);
    setExtraRoomGuests(prev => {
      if (prev.length === extras) return prev;
      return Array.from({ length: extras }, (_, i) => prev[i] || { firstName: '', lastName: '' });
    });
  }, [rooms.length]);
  const [bookingBusy,   setBookingBusy]   = useState(false);
  const [bookingErr,    setBookingErr]    = useState<string | null>(null);
  const [bookingResult, setBookingResult] = useState<any>(null);

  // ───────────────────────────────────────────────────────────
  async function runSearch(qOverride?: string) {
    const query = (qOverride !== undefined ? qOverride : q).trim();
    if (!query) return;
    // Encode the full per-room composition (adults + children ages
    // per room). URL form: r=2|3&r=4|5,8  → room 1 has 2 adults + 1
    // child age 3, room 2 has 4 adults + 2 children (ages 5 and 8).
    // Round-trips losslessly via paramsToRooms() on read. We keep
    // the legacy adults/rooms shorthand so AI-agent deep-links (which
    // only carry totals) still work.
    const r = rooms.map(rm =>
      `${rm.adults}${(rm.childrenAges && rm.childrenAges.length) ? '|' + rm.childrenAges.join(',') : ''}`
    );
    const next = new URLSearchParams(sp.toString());
    next.delete('r');
    r.forEach(v => next.append('r', v));
    next.delete('adults');
    next.delete('rooms');
    next.set('q', query);
    next.set('checkIn', checkIn);
    next.set('checkOut', checkOut);
    next.set('citizenship', citizenship);
    next.delete('hotelId');
    router.replace(`/console/search?${next.toString()}`);
    setSearching(true);
    setSearchErr(null);
    setHits([]);
    setDetailHotel(null);
    try {
      const res = await fetch('/api/admin/search/hotels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ q: query, limit: 20 })
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'search failed');
      const initial: HotelHit[] = (json.data.hits || []).map((h: any) => ({ ...h }));
      setHits(initial);
      // fire-and-forget price enrichment so the page paints fast
      void enrichPrices(initial.map(h => h.id));
    } catch (e: any) {
      setSearchErr(e.message || 'search failed');
    } finally {
      setSearching(false);
    }
  }

  async function enrichPrices(ids: number[]) {
    if (ids.length === 0) return;
    setEnriching(true);
    try {
      const body = {
        hotelIds: ids,
        checkIn,
        checkOut,
        guests: rooms.map(r => ({ adults: r.adults, children: r.childrenAges })),
        nationalityCode: citizenship
      };
      const res = await fetch('/api/admin/search/rates/compare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const json = await res.json();
      if (!json.success) return;
      const byId = new Map<number, any>();
      for (const r of (json.data.results || [])) byId.set(Number(r.hotelId), r);
      setHits(curr => curr.map(h => {
        const r = byId.get(h.id);
        if (!r || !r.available) return { ...h, priced: { available: false } };
        // ETG cert §10 — hotel may be available without a quotable
        // headline price (all rates on-request, supplier echoed
        // null amounts). Card surfaces "Price on request" so it
        // stays visible instead of getting bucketed as sold out.
        // Multi-supplier compare returns quotes[]. When absent, the
        // single-supplier path still populates the legacy fields, so
        // downstream readers fall back cleanly.
        const apiQuotes: any[] = Array.isArray(r.quotes) ? r.quotes : [];
        const quotes: Quote[] = apiQuotes.map(q => {
          const sell = q.cheapestRate?.pricing?.sell;
          const net  = q.cheapestRate?.pricing?.net;
          return {
            supplier:                q.supplier,
            available:               !!q.available,
            reason:                  q.reason,
            sellNightly:             sell?.nightlyAmount,
            sellTotal:               sell?.totalAmount,
            netNightly:              net?.nightlyAmount,
            markupPct:               q.cheapestRate?.pricing?.markup?.value,
            markupAmount:            q.cheapestRate?.pricing?.markup?.amount,
            currency:                sell?.currency,
            ratePlan:                q.cheapestRate?.ratePlan,
            refundable:              q.cheapestRate?.refundable,
            breakfastIncluded:       q.cheapestRate?.breakfastIncluded,
            cancellationDeadlineUtc: q.cheapestRate?.cancellationDeadlineUtc,
            ratesCount:              q.ratesCount
          };
        });
        if (!r.cheapestRate) {
          return {
            ...h,
            priced: {
              available: true, supplier: r.cheapestSupplier || r.supplier, onRequest: true,
              ratesCount: r.ratesCount,
              quotes: quotes.length ? quotes : undefined
            }
          };
        }
        const sell = r.cheapestRate?.pricing?.sell;
        const net  = r.cheapestRate?.pricing?.net;
        return {
          ...h,
          priced: {
            available: true,
            supplier:                r.cheapestSupplier || r.supplier,
            sellNightly:             sell?.nightlyAmount,
            sellTotal:               sell?.totalAmount,
            netNightly:              net?.nightlyAmount,
            netTotal:                net?.totalAmount,
            markupPct:               r.cheapestRate?.pricing?.markup?.value,
            currency:                sell?.currency,
            roomTypeName:            r.cheapestRate?.roomTypeName,
            ratePlan:                r.cheapestRate?.ratePlan,
            refundable:              r.cheapestRate?.refundable,
            breakfastIncluded:       r.cheapestRate?.breakfastIncluded,
            cancellationDeadlineUtc: r.cheapestRate?.cancellationDeadlineUtc,
            ratesCount:              r.ratesCount,
            quotes:                  quotes.length ? quotes : undefined
          }
        };
      }).sort((a, b) => {
        // available first, cheapest first
        const aa = a.priced?.available ? (a.priced.sellNightly ?? Infinity) : Infinity;
        const bb = b.priced?.available ? (b.priced.sellNightly ?? Infinity) : Infinity;
        return aa - bb;
      }));
    } catch {
      /* swallow — leaves cards without price badge */
    } finally {
      setEnriching(false);
    }
  }

  // Detail-view hotel content (description / amenities / metapolicy)
  // surfaced by the admin rates endpoint alongside the rate list.
  const [detailContent, setDetailContent] = useState<any>(null);

  // Detail view supports an optional supplier filter so clicking a
  // specific supplier row on the list opens the rate table pre-filtered
  // to that supplier's quotes. Null filter = show both. The filter
  // lives in URL state via `&supplier=…` so refresh/share round-trip
  // correctly.
  const [supplierFocus, setSupplierFocus] = useState<string | null>(null);
  async function openHotel(h: HotelHit, supplier?: string | null) {
    setDetailHotel(h);
    setDetailContent(null);
    setChosenRate(null);
    setPrebook(null);
    setPrebookErr(null);
    setAcceptedNewPrice(false);
    setBookingResult(null);
    setBookingErr(null);
    setSupplierFocus(supplier || null);
    syncUrl({ hotelId: h.id, supplier: supplier || null });
    void loadRatesFor(h);
  }

  async function loadRatesFor(h: HotelHit, channel: 'cug' | 'b2c' = 'cug') {
    setRatesBusy(true);
    setRatesErr(null);
    setRates([]);
    setB2cLoaded(false);
    try {
      // ETG cert §4: send per-room guests so the backend doesn't have
      // to floor-distribute adults or shove all children into room 1.
      // Equivalent fix to the B2C HotelSearchForm.
      const qs = new URLSearchParams({ checkIn, checkOut, nationalityCode: citizenship, accountType: channel });
      qs.set('guests', JSON.stringify(rooms.map(r => ({
        adults: r.adults,
        children: r.childrenAges || []
      }))));
      const res = await fetch(`/api/admin/search/rates/${h.id}?${qs.toString()}`);
      const json = await res.json();
      if (res.status === 429) {
        throw new Error(json.message || 'Supplier rate limit — wait ~30 seconds and try again.');
      }
      if (!json.success) throw new Error(json.details ? `${json.error}: ${json.details}` : (json.error || 'rates failed'));
      setRates((json.data.rates || []).map((r: AdminRate) => ({ ...r, _channel: channel })));
      setDetailContent(json.data.hotel || null);
      // Persist the rate_decisions audit trail id so /choose and
      // /api/bookings can stamp the same row when the consultant
      // progresses through the funnel. Backend recommendedRateKey is
      // already reflected in each rate's `score` field for the UI
      // border, but we keep it here for the future override-rate dashboard.
      setSearchId(json.data.searchId || null);
      setRecommendedRateKey(json.data.recommendedRateKey || null);
    } catch (e: any) {
      setRatesErr(e.message || 'rates failed');
    } finally {
      setRatesBusy(false);
    }
  }

  // Lazy compare: fetch the B2C channel's rates for the OPEN hotel on demand
  // and merge them (tagged) into the Member list so the consultant sees both
  // — without paying the 2x ETG cost on every search.
  async function addB2CRates(h: HotelHit) {
    if (b2cLoaded || b2cBusy) return;
    setB2cBusy(true);
    try {
      const qs = new URLSearchParams({ checkIn, checkOut, nationalityCode: citizenship, accountType: 'b2c' });
      qs.set('guests', JSON.stringify(rooms.map(r => ({ adults: r.adults, children: r.childrenAges || [] }))));
      const res = await fetch(`/api/admin/search/rates/${h.id}?${qs.toString()}`);
      const json = await res.json();
      if (res.status === 429) throw new Error(json.message || 'Supplier rate limit — wait ~30 seconds and try again.');
      if (!json.success) throw new Error(json.error || 'b2c rates failed');
      const b2c: AdminRate[] = (json.data.rates || []).map((r: AdminRate) => ({ ...r, _channel: 'b2c' as const }));
      setRates(prev => {
        const seen = new Set(prev.map(r => r.rateKey));
        return [...prev, ...b2c.filter(r => !seen.has(r.rateKey))];
      });
      setB2cLoaded(true);
    } catch (e: any) {
      setRatesErr(e.message || 'b2c rates failed');
    } finally {
      setB2cBusy(false);
    }
  }

  // When the consultant picks a rate, immediately fire a prebook
  // so we verify availability + price BEFORE they fill the form.
  // Skipped if there's already a prebook for this rateKey (consultant
  // re-opening the same sidebar). The supplier holds the rate for a
  // short window after prebook — consultant has minutes, not hours,
  // to complete the form. That's fine for a B2B console.
  useEffect(() => {
    if (!chosenRate || !detailHotel) return;
    if (prebook?.prebookHash && (prebook as any)._forKey === chosenRate.rateKey) return;
    setPrebookBusy(true);
    setPrebookErr(null);
    setPrebook(null);
    setAcceptedNewPrice(false);
    (async () => {
      try {
        const totalAdults = rooms.reduce((s, r) => s + r.adults, 0);
        const allChildAges = rooms.flatMap(r => r.childrenAges);
        const r = await fetch('/api/admin/prebook', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            hotelId: detailHotel.id,
            // Route prebook to the chosen rate's supplier (multi-supplier
            // fan-out) — not the hotel's default supplier.
            supplier: chosenRate.supplier,
            rateKey: chosenRate.rateKey,
            searchParams: {
              checkIn, checkOut,
              adults: totalAdults,
              childrenAges: allChildAges,
              rooms: rooms.length,
              guests: rooms.map(r => ({ adults: r.adults, children: r.childrenAges })),
              nationalityCode: citizenship
            },
            expectedTotalAmount: chosenRate.pricing.sell?.totalAmount,
            expectedCurrency:    chosenRate.pricing.currency,
            // Use the CHOSEN rate's own channel so prebook hits the same
            // credentials/pool the rate was quoted under (member vs b2c).
            accountType: chosenRate._channel || 'cug'
          })
        });
        const json = await r.json();
        if (!r.ok || !json.success) throw new Error(json.error || 'Prebook failed');
        // Default supplierFlaggedChange to priceChanged on older API
        // responses that don't carry the strict flag yet.
        const info: PrebookInfo & { _forKey?: string } = {
          ...json.data,
          supplierFlaggedChange: json.data.supplierFlaggedChange ?? json.data.priceChanged,
          _forKey: chosenRate.rateKey
        };
        setPrebook(info);
        // Auto-accept when the SUPPLIER didn't flag a change (cert-
        // compliant banner gate). Silent shifts within RateHawk's
        // own tolerance still let the consultant submit without an
        // explicit confirm — the rate panel pill shows the new total
        // unconditionally so they can see what they're locking in.
        if (!info.supplierFlaggedChange) setAcceptedNewPrice(true);
      } catch (e: any) {
        setPrebookErr(e?.message || 'Could not verify rate');
      } finally {
        setPrebookBusy(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chosenRate?.rateKey, detailHotel?.id]);

  async function confirmBooking() {
    if (!detailHotel || !chosenRate) return;
    const missingExtra = extraRoomGuests.findIndex(g => !g.firstName.trim() || !g.lastName.trim());
    if (missingExtra !== -1) {
      setBookingErr(`Lead guest for Room ${missingExtra + 2} is required (ETG cert §5).`);
      return;
    }
    if (!custFirst.trim() || !custLast.trim() || !custEmail.trim()) {
      setBookingErr('Customer first name, last name and email are required.');
      return;
    }
    setBookingBusy(true);
    setBookingErr(null);

    // Two-checkpoint cert pattern: re-verify the rate right before
    // posting the booking. The Choose-time prebook may have run
    // minutes ago while the consultant filled the form. If the
    // supplier's price has moved since, we surface the banner again
    // — consultant must re-accept before the actual booking submit.
    try {
      const totalAdults = rooms.reduce((s, r) => s + r.adults, 0);
      const allChildAges = rooms.flatMap(r => r.childrenAges);
      const verify = await fetch('/api/admin/prebook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hotelId: detailHotel.id,
          supplier: chosenRate.supplier,
          // IMPORTANT: re-verify with the ORIGINAL h-* rateKey, not
          // the p-* prebookHash. RateHawk's prebook on an existing
          // p-hash isn't supported; we need a fresh round.
          rateKey: chosenRate.rateKey,
          expectedTotalAmount: prebook?.newPrice || chosenRate.pricing.sell?.totalAmount,
          expectedCurrency:    chosenRate.pricing.currency,
          accountType: chosenRate._channel || 'cug',
          searchParams: {
            checkIn, checkOut,
            adults: totalAdults,
            childrenAges: allChildAges,
            rooms: rooms.length,
            guests: rooms.map(r => ({ adults: r.adults, children: r.childrenAges })),
            nationalityCode: citizenship
          }
        })
      });
      const verifyJson = await verify.json();
      if (verify.ok && verifyJson?.success && verifyJson.data) {
        if (verifyJson.data.supplierFlaggedChange ?? verifyJson.data.priceChanged) {
          // Price moved between Choose and Submit. Replace the prebook
          // state with the new figures, lock submit, force re-accept.
          const info: PrebookInfo & { _forKey?: string } = {
            ...verifyJson.data,
            _forKey: chosenRate.rateKey
          };
          setPrebook(info);
          setAcceptedNewPrice(false);
          setBookingBusy(false);
          setBookingErr('Price changed since rate was picked. Review the new total and accept again to continue.');
          return;
        }
        // Same price; latch onto the fresh prebookHash so finish uses
        // the freshest p-hash (RateHawk holds it for a short window).
        setPrebook((prev) => prev ? { ...prev, prebookHash: verifyJson.data.prebookHash, partnerOrderId: verifyJson.data.partnerOrderId } : prev);
      }
    } catch (e) {
      // Don't block on verify failure — backend's inline prebook is
      // the final guard. Log and continue.
      console.warn('[confirmBooking] submit-time prebook check failed:', e);
    }
    setBookingResult(null);
    try {
      const totalAdults = rooms.reduce((s, r) => s + r.adults, 0);
      const allChildAges = rooms.flatMap(r => r.childrenAges);
      const payload = {
        hotelId: detailHotel.id,
        // Route the booking to the chosen rate's supplier (multi-supplier
        // fan-out) so it doesn't default to the hotel's surface supplier.
        supplier: chosenRate.supplier,
        // Use the prebooked p-* hash when available — createBooking
        // skips its inline prebook step and goes straight to the
        // booking form. Falls back to the search-time rateKey for
        // suppliers where prebook was skipped (Hummingbird).
        rateKey: prebook?.prebookHash || chosenRate.rateKey,
        partnerOrderIdOverride: prebook?.partnerOrderId,
        guestInfo:   { firstName: custFirst.trim(), lastName: custLast.trim(), email: custEmail.trim(), phone: custPhone.trim() || undefined },
        contactInfo: { firstName: custFirst.trim(), lastName: custLast.trim(), email: custEmail.trim(), phone: custPhone.trim() || undefined },
        searchParams: {
          checkIn, checkOut,
          adults:       totalAdults,
          children:     allChildAges.length,
          childrenAges: allChildAges,
          rooms:        rooms.length,
          guests:       rooms.map(r => ({ adults: r.adults, children: r.childrenAges })),
          // ETG cert §5: per-room lead-guest names so the backend
          // doesn't book the same person into every room.
          roomGuests: [
            { firstName: custFirst.trim(), lastName: custLast.trim() },
            ...extraRoomGuests.map(g => ({ firstName: g.firstName.trim(), lastName: g.lastName.trim() }))
          ],
          nationalityCode: 'AU'
        },
        specialRequests:     'B2B book-on-behalf via console',
        // Prefer the prebook-locked supplier sell price. priceChanged=false
        // just means RateHawk didn't flip its banner flag — the supplier
        // can still silently raise within our 10% tolerance, and the
        // booking row + audit + email must record what the customer is
        // actually charged, not the stale search-time quote. Falls back
        // to chosenRate when prebook never ran (e.g. Hummingbird).
        expectedTotalAmount: prebook?.newPrice || chosenRate.pricing.sell?.totalAmount,
        expectedCurrency:    prebook?.currency || chosenRate.pricing.currency,
        availabilityType:    'free_sell',
        // Audit-trail handoff: stamp the rate_decisions row with this
        // booking's internalBookingId once it's created.
        searchId:            searchId || undefined
      };
      const res = await fetch('/api/admin/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-consultant-email': user?.email || '' },
        body: JSON.stringify(payload)
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || json.details || 'Booking failed');
      setBookingResult(json.data);
    } catch (e: any) {
      setBookingErr(e.message || 'Booking failed');
    } finally {
      setBookingBusy(false);
    }
  }

  // Restore state from URL on initial mount. Two entry shapes:
  //   1. Deep-link from AI agent or shared link →
  //      ?q=Dubai&checkIn=…&checkOut=…&adults=2&rooms=1&citizenship=AU[&hotelId=N]
  //      Re-runs the search; opens the detail view if hotelId is set.
  //   2. Legacy deep-link from the agent with only hotelId (no q) →
  //      opens the detail directly, no list re-run.
  //
  // Form-state writes back to the URL via syncUrl() on search submit
  // and on detail open/close so refresh, share, and back-button all
  // round-trip cleanly.
  useEffect(() => {
    const ci = sp.get('checkIn');
    const co = sp.get('checkOut');
    if (ci && /^\d{4}-\d{2}-\d{2}$/.test(ci)) setCheckIn(ci);
    if (co && /^\d{4}-\d{2}-\d{2}$/.test(co)) setCheckOut(co);
    // Primary: r=2|3&r=4|5,8 per-room composition (lossless).
    const rParams = sp.getAll('r');
    if (rParams.length > 0) {
      const parsed: RoomGuests[] = rParams.map(v => {
        const [aStr, kStr] = v.split('|');
        const a = Math.max(1, Math.min(10, Number(aStr) || 2));
        const kids = (kStr || '')
          .split(',')
          .map(s => Number(s))
          .filter(n => Number.isFinite(n) && n >= 0 && n <= 17);
        return { adults: a, childrenAges: kids };
      });
      if (parsed.length) setRooms(parsed);
    } else {
      // Legacy: ?adults=N&rooms=M (no children) — kept for AI-agent
      // deep-links that only know totals.
      const adultsParam = Number(sp.get('adults'));
      const roomsParam  = Number(sp.get('rooms')) || 1;
      if (Number.isFinite(adultsParam) && adultsParam > 0) {
        const perRoom = Math.floor(adultsParam / roomsParam);
        const extra   = adultsParam % roomsParam;
        setRooms(Array.from({ length: roomsParam }, (_, i) => ({
          adults: perRoom + (i < extra ? 1 : 0),
          childrenAges: []
        })));
      }
    }
    const cit = sp.get('citizenship');
    if (cit && /^[A-Z]{2}$/.test(cit)) setCitizenship(cit);
    const qParam = sp.get('q');
    if (qParam) setQ(qParam);

    const id = sp.get('hotelId');
    if (id) {
      const n = Number(id);
      if (Number.isFinite(n) && !detailHotel) {
        const stub: HotelHit = { id: n, name: '', sources: [] };
        const sup = sp.get('supplier');
        void openHotel(stub, sup || null);
        return;
      }
    }
    if (qParam) {
      // Re-run the search so the list rehydrates on refresh.
      void runSearch(qParam);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── filter computation ─────────────────────────────────────
  // Default behaviour: only reveal hotels that have come back priced
  // and available. While compare() is enriching, pending hits stay
  // hidden and we render N skeleton rows for them instead — avoids
  // the "list pops in with junk, then prices dribble in" effect the
  // user flagged on /console/search.
  const filteredHits = useMemo(() => {
    return hits.filter(h => {
      if (filterSupplier !== 'all' && !h.sources.includes(filterSupplier)) return false;
      // Still loading prices on this hit — hide unless the user has
      // explicitly asked to see everything.
      if (!showUnavailable && h.priced === undefined) return false;
      if (!showUnavailable && h.priced !== undefined && !h.priced.available) return false;
      if (filterRefundable && h.priced && h.priced.available && !h.priced.refundable) return false;
      return true;
    });
  }, [hits, filterSupplier, filterRefundable, showUnavailable]);

  // Count of hits still resolving — drives skeleton row count.
  const pendingCount = useMemo(() => hits.filter(h => h.priced === undefined).length, [hits]);
  const unavailableCount = useMemo(() => hits.filter(h => h.priced && !h.priced.available).length, [hits]);

  // ───────────────────────────────────────────────────────────
  return (
    <div style={{ minWidth: 0 }}>
      <div>
        {/* Header swaps to a breadcrumb when in detail view */}
        <div className="c-page-head">
          <div>
            <h1 className="c-page-title">B2B Search</h1>
            <p className="c-page-sub">
              Find hotels, see net cost + markup + sell price per rate, book on behalf of the customer.
            </p>
          </div>
        </div>

        {/* Quick prompts + search form — stays mounted; detail opens as a drawer */}
        {(
          <>
            <div style={{ marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <Sparkles size={14} style={{ color: 'var(--c-accent)' }} />
                <span style={{ fontSize: 12, color: 'var(--c-fg-muted)', letterSpacing: '0.04em', textTransform: 'uppercase', fontWeight: 700 }}>
                  Quick prompts
                </span>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {PROMPT_PILLS.map((p, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      // Use the silent setter so the autocomplete
                      // doesn't pop the dropdown after a programmatic
                      // fill (otherwise the consultant has to click
                      // the suggestion to dismiss it).
                      destRef.current?.setSilent(p.q);
                      setCheckIn(todayPlus(30));
                      setCheckOut(todayPlus(30 + p.nights));
                      setRooms(p.rooms);
                      runSearch(p.q);
                    }}
                    style={{ border: '1px solid var(--c-line)', borderRadius: 999, padding: '6px 12px', fontSize: 12, background: 'var(--c-bg)', color: 'var(--c-fg-soft)', cursor: 'pointer' }}
                  >{p.label}</button>
                ))}
              </div>
            </div>

            <div className="c-card" style={{ padding: 14, marginBottom: 20, overflow: 'visible' }}>
              <form
                onSubmit={(e) => { e.preventDefault(); runSearch(); }}
                style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 1.6fr) minmax(200px, 1.3fr) minmax(160px, 1.1fr) minmax(120px, 0.7fr) auto', gap: 10, alignItems: 'end' }}
              >
                <div>
                  <label style={labelStyle}>Destination or hotel name</label>
                  <DestinationAutocomplete
                    ref={destRef}
                    value={q}
                    onChange={setQ}
                    onSelectHotel={(h) => setQ(h.name || '')}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Dates</label>
                  <DateRangePicker checkIn={checkIn} checkOut={checkOut} onChange={({ checkIn, checkOut }) => { setCheckIn(checkIn); setCheckOut(checkOut); }} />
                </div>
                <div>
                  <label style={labelStyle}>Guests</label>
                  <GuestSelector rooms={rooms} onChange={setRooms} />
                </div>
                <div>
                  {/* Country picker with flags + typeahead search.
                      Same component used in B2C ReserveSidebar — keeps
                      input consistent across audiences. Consultants
                      type a lot of citizenship values; typeahead beats
                      a 12-option <select>. */}
                  <CountryPicker
                    value={citizenship}
                    onChange={setCitizenship}
                    label="Citizenship"
                  />
                </div>
                <button type="submit" className="c-btn c-btn-primary" disabled={searching}>
                  {searching ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
                  {searching ? 'Searching…' : 'Search'}
                </button>
              </form>
            </div>
          </>
        )}

        {/* Errors */}
        {searchErr && <div style={{ color: 'var(--c-danger)', fontSize: 13, marginBottom: 14 }}>Error: {searchErr}</div>}

        {/* Empty state */}
        {hits.length === 0 && !searching && (
          <div className="c-card" style={{ padding: 32, textAlign: 'center', color: 'var(--c-fg-muted)', fontSize: 13 }}>
            Type a destination or hotel name above, or ask the agent on the right.
          </div>
        )}

        {/* Results list — stays mounted behind the detail drawer */}
        {hits.length > 0 && (
          <>
            {/* Filter row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
              <Filter size={13} style={{ color: 'var(--c-fg-muted)' }} />
              <div style={{ display: 'flex', gap: 4 }}>
                {(['all','ratehawk','hummingbird'] as const).map(s => (
                  <button
                    key={s}
                    onClick={() => setFilterSupplier(s)}
                    style={{
                      fontSize: 12, padding: '4px 12px', borderRadius: 999,
                      border: '1px solid var(--c-line)', cursor: 'pointer',
                      background: filterSupplier === s ? 'var(--c-accent-soft)' : 'var(--c-bg)',
                      color: filterSupplier === s ? 'var(--c-fg)' : 'var(--c-fg-soft)',
                      fontWeight: filterSupplier === s ? 600 : 500,
                      textTransform: s === 'all' ? 'none' : 'capitalize'
                    }}
                  >{s === 'all' ? 'All suppliers' : s}</button>
                ))}
              </div>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer', color: 'var(--c-fg-soft)' }}>
                <input type="checkbox" checked={filterRefundable} onChange={(e) => setFilterRefundable(e.target.checked)} />
                Refundable only
              </label>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer', color: 'var(--c-fg-soft)' }}>
                <input type="checkbox" checked={showUnavailable} onChange={(e) => setShowUnavailable(e.target.checked)} />
                Show unavailable
              </label>
              <span style={{ fontSize: 11, color: 'var(--c-fg-muted)', marginLeft: 'auto' }}>
                {filteredHits.length} bookable
                {pendingCount > 0 && <span> · {pendingCount} loading</span>}
                {!enrichingPrices && unavailableCount > 0 && !showUnavailable && (
                  <span> · {unavailableCount} unavailable hidden</span>
                )}
                {enrichingPrices && <span> · <Loader2 size={11} style={{ verticalAlign: 'middle' }} className="animate-spin" /> </span>}
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 10 }}>
              {filteredHits.map((h) => (
                <MultiSupplierCard
                  key={h.id}
                  h={h}
                  onOpen={(supplier) => openHotel(h, supplier)}
                  showUnavailable={showUnavailable}
                />
              ))}
              {/* Skeleton placeholders for hotels still being priced.
                  Renders N blocks (one per pending hit) so the user
                  sees the work in flight instead of an empty list or
                  half-populated rows. Hidden once enrichment lands. */}
              {pendingCount > 0 && Array.from({ length: pendingCount }).map((_, i) => (
                <div
                  key={`skeleton-${i}`}
                  className="c-card c-skeleton"
                  style={{
                    display: 'grid', gridTemplateColumns: '120px 1fr auto',
                    gap: 16, alignItems: 'center', padding: 12,
                    background: 'var(--c-bg)', border: '1px solid var(--c-line-soft)'
                  }}
                  aria-hidden="true"
                >
                  <div style={{ width: 120, height: 80, borderRadius: 6, background: 'var(--c-bg-soft)' }} />
                  <div>
                    <div style={{ height: 14, width: '55%', borderRadius: 3, background: 'var(--c-bg-soft)', marginBottom: 8 }} />
                    <div style={{ height: 10, width: '35%', borderRadius: 3, background: 'var(--c-bg-soft)' }} />
                  </div>
                  <div style={{ width: 130 }}>
                    <div style={{ height: 10, width: '60%', borderRadius: 3, background: 'var(--c-bg-soft)', marginBottom: 6, marginLeft: 'auto' }} />
                    <div style={{ height: 16, width: '80%', borderRadius: 3, background: 'var(--c-bg-soft)', marginLeft: 'auto' }} />
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Detail drawer — slides over the dimmed results list so the
            consultant keeps the results + scroll position and can bounce
            between hotels. Expand widens it for the booking step. */}
        {detailHotel && (
          <>
            <div
              onClick={() => { setDetailHotel(null); setDetailExpanded(false); setEditingSearch(false); syncUrl({ hotelId: null }); }}
              style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.32)', zIndex: 40 }}
            />
            <aside
              role="dialog"
              aria-label={`${detailHotel.name} rates`}
              style={{
                position: 'fixed', top: 0, right: 0, bottom: 0,
                width: detailExpanded ? 'min(1320px, 98vw)' : 'min(900px, 96vw)',
                background: 'var(--c-bg)', borderLeft: '1px solid var(--c-line)',
                boxShadow: '-8px 0 28px rgba(0,0,0,0.18)', zIndex: 41,
                display: 'flex', flexDirection: 'column', transition: 'width 160ms ease'
              }}
            >
              {/* Drawer header */}
              <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--c-line)', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <button
                  onClick={() => { setDetailHotel(null); setDetailExpanded(false); setEditingSearch(false); syncUrl({ hotelId: null }); }}
                  title="Back to results"
                  style={{ ...iconBtnStyle, marginTop: 2 }}
                >
                  <ArrowLeft size={14} />
                </button>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: 'var(--c-fg)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{detailHotel.name}</h2>
                  <p className="c-page-sub" style={{ margin: '2px 0 0' }}>
                    {[detailHotel.city, detailHotel.country].filter(Boolean).join(', ')}
                    {' · '}{checkIn} → {checkOut}{' · '}
                    {rooms.reduce((s, r) => s + r.adults, 0)} adult{rooms.reduce((s, r) => s + r.adults, 0) > 1 ? 's' : ''}
                    {' · '}{rooms.length} room{rooms.length > 1 ? 's' : ''}
                    {' · '}
                    <button
                      onClick={() => setEditingSearch(s => !s)}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--c-accent)', background: 'none', border: 0, cursor: 'pointer', padding: 0, fontWeight: 600 }}
                    >
                      <Pencil size={11} /> Edit
                    </button>
                  </p>
                </div>
                <button onClick={() => setDetailExpanded(x => !x)} title={detailExpanded ? 'Collapse' : 'Expand'} style={{ ...iconBtnStyle, marginTop: 2 }}>
                  {detailExpanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                </button>
                <button
                  onClick={() => { setDetailHotel(null); setDetailExpanded(false); setEditingSearch(false); syncUrl({ hotelId: null }); }}
                  title="Close"
                  style={{ ...iconBtnStyle, marginTop: 2 }}
                >
                  <X size={14} />
                </button>
              </div>

              {/* Edit-search re-check form */}
              {editingSearch && (
                <div className="c-card" style={{ padding: 14, margin: '14px 18px 0', overflow: 'visible', position: 'relative', zIndex: 10 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 10, alignItems: 'end' }}>
                    <div style={{ position: 'relative' }}>
                      <label style={labelStyle}>Dates</label>
                      <DateRangePicker checkIn={checkIn} checkOut={checkOut} onChange={({ checkIn, checkOut }) => { setCheckIn(checkIn); setCheckOut(checkOut); }} />
                    </div>
                    <div style={{ position: 'relative' }}>
                      <label style={labelStyle}>Guests</label>
                      <GuestSelector rooms={rooms} onChange={setRooms} />
                    </div>
                    <button className="c-btn c-btn-primary" onClick={() => { void loadRatesFor(detailHotel); setEditingSearch(false); }} disabled={ratesBusy}>
                      {ratesBusy ? <Loader2 size={13} className="animate-spin" /> : <Search size={13} />}
                      Re-check
                    </button>
                  </div>
                </div>
              )}

              {/* Drawer body (scrollable both axes — the rate table is wide,
                  so allow horizontal scroll as a safety net; ⤢ expand widens
                  the drawer to near-full-width for the booking step). */}
              <div style={{ flex: 1, overflowY: 'auto', overflowX: 'auto', padding: 18 }}>
            {ratesBusy && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--c-fg-soft)', fontSize: 13 }}>
                <Loader2 size={14} className="animate-spin" /> Fetching rates…
              </div>
            )}
            {ratesErr && <div style={{ color: 'var(--c-danger)', fontSize: 13 }}>Error: {ratesErr}</div>}
            {!ratesBusy && !ratesErr && rates.length === 0 && (
              <div style={{ color: 'var(--c-fg-muted)', fontSize: 13 }}>No rates returned for these dates.</div>
            )}

            {/* Hotel info section — appears above the rate list so the
                consultant has context (description, amenities, policies)
                while picking a rate to book. */}
            {!chosenRate && detailContent && (
              <HotelInfo content={detailContent} />
            )}

            {/* Supplier filter banner: when user clicked a supplier row
                on the list card, we focus the detail view on just that
                supplier. Banner offers to expand back to all suppliers. */}
            {supplierFocus && rates.some(r => r.supplier && r.supplier !== supplierFocus) && (
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                gap: 12, padding: '8px 12px', marginBottom: 10,
                background: 'var(--c-bg-soft)', border: '1px dashed var(--c-line)', borderRadius: 6,
                fontSize: 12.5
              }}>
                <span>
                  Showing <strong>{supplierFocus}</strong> rates only ({rates.filter(r => r.supplier === supplierFocus).length} of {rates.length})
                </span>
                <button
                  onClick={() => { setSupplierFocus(null); syncUrl({ supplier: null }); }}
                  style={{ background: 'none', border: 0, color: 'var(--c-accent)', fontWeight: 600, fontSize: 12, cursor: 'pointer' }}
                >Show all suppliers</button>
              </div>
            )}
            {/* Lazy rate-channel compare. Rates default to Member (CUG)
                everywhere. On demand we fetch the B2C channel for THIS hotel
                and merge it in (tagged), so consultants see both side by side
                without paying the 2x ETG cost (10/min cap) on every search. */}
            {rates.length > 0 && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10,
                fontSize: 12.5, color: 'var(--c-fg-soft)'
              }}>
                <span>Showing <strong>Member</strong> rates{b2cLoaded ? ' + B2C' : ''}.</span>
                {!b2cLoaded && (
                  <button
                    onClick={() => detailHotel && void addB2CRates(detailHotel)}
                    disabled={b2cBusy}
                    title="Fetch public B2C rates for this hotel and compare against Member rates"
                    style={{
                      fontSize: 12, padding: '4px 12px', borderRadius: 999,
                      border: '1px solid var(--c-line)', cursor: b2cBusy ? 'wait' : 'pointer',
                      background: 'var(--c-bg)', color: 'var(--c-accent)', fontWeight: 600,
                      opacity: b2cBusy ? 0.6 : 1,
                    }}
                  >{b2cBusy ? 'Loading B2C…' : 'Compare B2C'}</button>
                )}
              </div>
            )}
            {rates.length > 0 && (
              <RoomGroupedRates
                rates={supplierFocus ? rates.filter(r => r.supplier === supplierFocus) : rates}
                onChoose={(r) => {
                  setChosenRate(r);
                  // Audit: tell the backend which rate the consultant
                  // picked. Fire-and-forget — the user shouldn't wait
                  // on this and a write failure must not block the
                  // booking flow.
                  if (searchId) {
                    fetch(`/api/admin/search/decisions/${searchId}/choose`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ rateKey: r.rateKey, supplier: r.supplier })
                    }).catch(() => {});
                  }
                }}
                marginTop={detailContent ? 18 : 0}
              />
            )}

            {/* Booking opens in BookingSidebar (rendered after the drawer). */}
              </div>
            </aside>
          </>
        )}
      </div>

      {/* Booking sidebar — slides in from the right when consultant
          clicks 'Choose' on a rate. Keeps the hotel info + rate
          table visible on the left while they fill customer details. */}
      {chosenRate && (
        <BookingSidebar
          hotel={detailHotel}
          rate={chosenRate}
          checkIn={checkIn}
          checkOut={checkOut}
          rooms={rooms}
          citizenship={citizenship}
          custFirst={custFirst}  setCustFirst={setCustFirst}
          custLast={custLast}    setCustLast={setCustLast}
          extraRoomGuests={extraRoomGuests}
          setExtraRoomGuests={setExtraRoomGuests}
          custEmail={custEmail}  setCustEmail={setCustEmail}
          custPhone={custPhone}  setCustPhone={setCustPhone}
          busy={bookingBusy}
          error={bookingErr}
          result={bookingResult}
          // Prebook state — sidebar shows "Verifying rate…" until done
          // and surfaces the price-change banner / cancellation-policy
          // confirmation before unlocking the submit button.
          prebookBusy={prebookBusy}
          prebookErr={prebookErr}
          prebook={prebook}
          acceptedNewPrice={acceptedNewPrice}
          onAcceptNewPrice={() => setAcceptedNewPrice(true)}
          canSubmit={!!prebook?.prebookHash && acceptedNewPrice}
          onClose={() => { setChosenRate(null); setBookingErr(null); setBookingResult(null); }}
          onConfirm={confirmBooking}
          onBookAnother={() => { setBookingResult(null); setChosenRate(null); setCustFirst(''); setCustLast(''); setCustEmail(''); setCustPhone(''); }}
        />
      )}

      {/* Agent lives on its own page now — /console/ai */}
    </div>
  );
}

// ─── small style helpers ────────────────────────────────────────
const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 11, color: 'var(--c-fg-muted)', textTransform: 'uppercase',
  letterSpacing: '0.04em', marginBottom: 4, fontWeight: 700
};
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 10px', fontSize: 14,
  border: '1px solid var(--c-line)', borderRadius: 6, background: 'var(--c-bg)', color: 'var(--c-fg)'
};
const iconBtnStyle: React.CSSProperties = {
  border: '1px solid var(--c-line)', borderRadius: 6, background: 'var(--c-bg)', cursor: 'pointer',
  padding: 6, color: 'var(--c-fg-soft)'
};
const priceLabelStyle: React.CSSProperties = {
  fontSize: 10, color: 'var(--c-fg-muted)', letterSpacing: '0.04em', marginBottom: 2, fontWeight: 700
};
function badgeStyle(supplier: string): React.CSSProperties {
  const map: Record<string, string> = { ratehawk: '#1f6feb', hummingbird: '#7c3aed' };
  const color = map[supplier] || '#525252';
  return {
    fontSize: 10, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase',
    color, border: `1px solid ${color}33`, background: `${color}11`, padding: '2px 8px', borderRadius: 999
  };
}
// Rate-channel badge — Member (CUG) vs public B2C. Only shown once the
// consultant has clicked "Compare B2C" so both channels coexist in the list.
function channelBadgeStyle(channel: 'cug' | 'b2c'): React.CSSProperties {
  const color = channel === 'cug' ? '#0a7d3e' : '#b45309';
  return {
    marginLeft: 5,
    fontSize: 10, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase',
    color, border: `1px solid ${color}33`, background: `${color}11`, padding: '2px 8px', borderRadius: 999
  };
}
function fmtMoney(n?: number) {
  if (n === undefined || n === null || isNaN(n)) return '—';
  return n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

// Composite rate scorer — Valentin's recommendation (2026-05-28) is
// "don't optimize only for lowest price; surface 3–5 rates with
// different conditions per room type." This scores each rate so the
// UI can rank within a room group and highlight one with a
// "Recommended" border. Signals (per user 2026-05-28 decision):
//   • sell price (lower = better, normalised against the pool's min)
//   • refundability (with cancellation-window distance reinforcing)
//   • margin tie-break for B2B (consultant sees both quotes anyway)
// Meal plan and supplier preference are intentionally NOT in the
// score (user excluded; consultants pick by meal manually).
type ScorableRate = {
  pricing?: {
    sell?: { totalAmount?: number; nightlyAmount?: number };
    markup?: { amount?: number };
  };
  refundable?: boolean | null;
  cancellationDeadlineUtc?: string | null;
};
function scoreRate(rate: ScorableRate, poolMinSellTotal: number, opts?: { isB2B?: boolean }): number {
  let score = 0;
  // Price: normalise against the pool min. Cheapest gets +0; each
  // 1% over loses ~1 point. A rate 20% above cheapest loses 20 pts.
  const sell = rate.pricing?.sell?.totalAmount ?? Infinity;
  if (poolMinSellTotal > 0 && isFinite(sell)) {
    const ratio = sell / poolMinSellTotal;
    score -= (ratio - 1) * 100;
  } else if (!isFinite(sell)) {
    score -= 200;
  }
  // Refundability: solid bump. Reinforced when there's real cushion
  // on the cancellation deadline (consultants love a wide window).
  if (rate.refundable) {
    score += 25;
    if (rate.cancellationDeadlineUtc) {
      const daysOut = (new Date(rate.cancellationDeadlineUtc).getTime() - Date.now()) / 86400000;
      if (daysOut > 7) score += 15;
      else if (daysOut > 2) score += 8;
    }
  }
  // Margin tie-break (B2B only): nudge toward higher-markup options
  // when the rest is equal. Small weight so this never trumps a real
  // price/refund difference.
  if (opts?.isB2B && typeof rate.pricing?.markup?.amount === 'number') {
    score += rate.pricing.markup.amount * 0.05;
  }
  return score;
}

// Short cancellation deadline rendering for the search list. Full ISO
// timestamp would crowd the card — consultants only need date + time
// in local format ("25 Jun 14:00"). Detail page shows the full UTC
// timestamp per ETG cert §5.
function fmtCancelDate(iso?: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) +
    ' ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });
}

function Row({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: 12, alignItems: 'baseline' }}>
      <span style={{ fontSize: 11, color: 'var(--c-fg-muted)', textTransform: 'uppercase', letterSpacing: 0.04, fontWeight: 700 }}>{label}</span>
      <span style={{ fontFamily: mono ? 'var(--c-mono)' : undefined, fontSize: mono ? 12.5 : 13, color: 'var(--c-fg)' }}>{value}</span>
    </div>
  );
}

/**
 * Compact hotel detail card — description, top amenities, key policies
 * (check-in / check-out / metapolicy snapshot). Renders above the
 * rate list so the consultant has context while picking a rate.
 */
/**
 * Multi-supplier hotel card. Hotel header on top, one full-width row
 * per supplier underneath. Recommended row gets a gold outline.
 * Clicking the hotel header opens detail unfiltered; clicking a
 * supplier row opens detail pre-filtered to that supplier.
 *
 * Used only when h.priced.quotes.length > 1. Singletons stay on the
 * compact stacked layout — see filteredHits.map for the dispatch.
 */
function MultiSupplierCard({ h, onOpen, showUnavailable }: { h: HotelHit; onOpen: (supplier: string | null) => void; showUnavailable: boolean }) {
  // Use the per-supplier quotes when present; otherwise synthesise a single
  // quote from the legacy priced fields so single-supplier hotels render in
  // the same card (one unified layout for the whole list).
  const quotes: Quote[] = (h.priced?.quotes && h.priced.quotes.length > 0)
    ? h.priced.quotes
    : (h.priced?.available ? [{
        supplier: h.priced.supplier || null, available: true,
        sellNightly: h.priced.sellNightly, sellTotal: h.priced.sellTotal,
        netNightly: h.priced.netNightly, markupPct: h.priced.markupPct,
        currency: h.priced.currency, ratePlan: h.priced.ratePlan,
        refundable: h.priced.refundable, breakfastIncluded: h.priced.breakfastIncluded,
        cancellationDeadlineUtc: h.priced.cancellationDeadlineUtc, ratesCount: h.priced.ratesCount,
      }] : []);
  // Score the quotes so the highest-scored gets the Recommended border.
  const minSell = Math.min(...quotes
    .filter(q => q.available && typeof q.sellTotal === 'number')
    .map(q => q.sellTotal as number));
  const scored = quotes.map(q => ({
    q,
    score: scoreRate({
      pricing: { sell: { totalAmount: q.sellTotal, nightlyAmount: q.sellNightly }, markup: { amount: q.markupAmount } },
      refundable: q.refundable, cancellationDeadlineUtc: q.cancellationDeadlineUtc
    }, minSell, { isB2B: true })
  }));
  const avail = quotes.filter(q => q.available);
  const best = scored.filter(s => s.q.available).sort((a, b) => b.score - a.score)[0]?.q;

  return (
    <button
      onClick={() => onOpen(null)}
      className="c-card"
      style={{
        display: 'grid', gridTemplateColumns: '150px 1fr auto', gap: 16, alignItems: 'stretch',
        padding: 12, width: '100%', textAlign: 'left', cursor: 'pointer',
        background: 'var(--c-bg)', border: '1px solid var(--c-line)',
        opacity: best ? 1 : 0.6
      }}
    >
      {/* Image */}
      <div style={{ width: 150, height: 104, borderRadius: 8, overflow: 'hidden', background: 'var(--c-bg-soft)', backgroundImage: h.image ? `url(${h.image})` : undefined, backgroundSize: 'cover', backgroundPosition: 'center' }} />

      {/* Hotel info */}
      <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ fontSize: 16, fontWeight: 600, lineHeight: 1.2 }}>{h.name}</div>
        <div style={{ fontSize: 12.5, color: 'var(--c-fg-soft)', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <MapPin size={12} /> {[h.city, h.country].filter(Boolean).join(', ')}
          </span>
          {!!h.starRating && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
              {Array.from({ length: Math.round(h.starRating) }).map((_, i) => (
                <Star key={i} size={11} fill="var(--c-accent)" style={{ color: 'var(--c-accent)' }} />
              ))}
            </span>
          )}
        </div>
        {/* Supplier-count chip + best-rate badges (per-supplier breakdown is in the drawer) */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 'auto' }}>
          {quotes.length > 1 && (
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--c-fg-soft)', background: 'var(--c-bg-soft)', border: '1px solid var(--c-line)', borderRadius: 999, padding: '2px 9px' }}>
              {showUnavailable
                ? `${avail.length} of ${quotes.length} suppliers`
                : (avail.length > 1 ? `${avail.length} suppliers` : '1 supplier')}
            </span>
          )}
          {best?.roomTypeName && <span style={{ fontSize: 11.5, color: 'var(--c-fg)' }}>{best.roomTypeName}</span>}
          {best && (best.refundable
            ? <span style={{ fontSize: 11.5, color: 'var(--c-success)' }}>{best.cancellationDeadlineUtc ? `Free cancel to ${fmtCancelDate(best.cancellationDeadlineUtc)}` : 'Refundable'}</span>
            : <span style={{ fontSize: 11.5, color: 'var(--c-danger)' }}>Non-refundable</span>)}
          {best?.breakfastIncluded && <span style={{ fontSize: 11.5, color: 'var(--c-success)' }}>· Breakfast</span>}
        </div>
      </div>

      {/* Headline price — cheapest/recommended across suppliers */}
      <div style={{ textAlign: 'right', minWidth: 168, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 2 }}>
        {!best ? (
          <span style={{ fontSize: 12, color: 'var(--c-fg-muted)' }}>No rates for these dates</span>
        ) : best.sellNightly == null ? (
          <span style={{ fontSize: 13, color: 'var(--c-fg-soft)', fontStyle: 'italic' }}>Price on request</span>
        ) : (
          <>
            <div style={{ fontSize: 10, color: 'var(--c-fg-muted)', letterSpacing: '0.04em', fontWeight: 700 }}>FROM</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--c-accent)', fontFamily: 'var(--c-mono)', lineHeight: 1.15 }}>
              {fmtMoney(best.sellNightly)}<span style={{ fontSize: 11, color: 'var(--c-fg-muted)', fontFamily: 'inherit' }}> / nt</span>
            </div>
            {best.sellTotal != null && best.sellTotal !== best.sellNightly && (
              <div style={{ fontSize: 11.5, color: 'var(--c-fg-soft)', fontFamily: 'var(--c-mono)' }}>
                {fmtMoney(best.sellTotal)} total{best.currency ? ` ${best.currency}` : ''}
              </div>
            )}
            {best.netNightly != null && (
              <div style={{ fontSize: 11, color: 'var(--c-fg-soft)', fontFamily: 'var(--c-mono)' }}>
                NET {fmtMoney(best.netNightly)}{best.markupPct != null ? ` · +${best.markupPct}%` : ''}
              </div>
            )}
            <div style={{ fontSize: 11, color: 'var(--c-accent)', fontWeight: 600, marginTop: 4 }}>Open →</div>
          </>
        )}
      </div>
    </button>
  );
}

function HotelInfo({ content }: { content: any }) {
  const desc = typeof content.description === 'string'
    ? content.description
    : (Array.isArray(content.description) ? content.description.map((s: any) => s.paragraphs?.join(' ') || '').join('\n\n').trim() : null);
  const ag: any[] = Array.isArray(content.amenity_groups) ? content.amenity_groups : [];
  const topAmenities = ag.flatMap(g => Array.isArray(g.amenities) ? g.amenities : []).slice(0, 12);
  const mp = content.metapolicy_struct || {};
  const mpItems: Array<{ k: string; v: string }> = [];
  if (mp.deposit) mpItems.push({ k: 'Deposit', v: 'Required' });
  if (mp.no_show) mpItems.push({ k: 'No-show', v: 'Penalty' });
  if (mp.cot && Array.isArray(mp.cot) && mp.cot.length) mpItems.push({ k: 'Cots', v: 'Available' });
  if (mp.pets && Array.isArray(mp.pets) && mp.pets.length) mpItems.push({ k: 'Pets', v: 'Conditional' });
  if (mp.parking && Array.isArray(mp.parking) && mp.parking.length) mpItems.push({ k: 'Parking', v: 'Available' });
  if (mp.smoking_policy && Array.isArray(mp.smoking_policy) && mp.smoking_policy.length) mpItems.push({ k: 'Smoking', v: 'See policy' });
  if (mp.shuttle && Array.isArray(mp.shuttle) && mp.shuttle.length) mpItems.push({ k: 'Shuttle', v: 'Available' });

  const [descExpanded, setDescExpanded] = useState(false);
  // RateHawk descriptions occasionally contain HTML (<em>X</em>,
  // <strong>X</strong>, <br/>) mixed with markdown. ReactMarkdown
  // escapes raw HTML by default — adding rehype-raw would let it
  // through but pulls a new dep. Cheaper: rewrite the handful of
  // tags suppliers actually emit into their markdown equivalents,
  // then strip anything residual so we never render `<tag>` as
  // visible text.
  const cleanDesc = desc
    ? desc
        .replace(/<\s*(em|i)\s*>([\s\S]*?)<\s*\/\s*\1\s*>/gi, '*$2*')
        .replace(/<\s*(strong|b)\s*>([\s\S]*?)<\s*\/\s*\1\s*>/gi, '**$2**')
        .replace(/<\s*br\s*\/?\s*>/gi, '\n')
        .replace(/<\s*p\s*>/gi, '\n\n')
        .replace(/<\s*\/\s*p\s*>/gi, '')
        .replace(/<[^>]+>/g, '')   // strip anything else
        .trim()
    : null;
  const trimmedDesc = cleanDesc && cleanDesc.length > 320 && !descExpanded ? cleanDesc.slice(0, 320) + '…' : cleanDesc;

  return (
    <div style={{ display: 'grid', gap: 14, marginBottom: 12 }}>
      {cleanDesc && (
        <div>
          <SectionLabel>About the property</SectionLabel>
          {/* RateHawk descriptions contain markdown — bold section
              headers (**Location**, **At the hotel**) and bulleted
              lists. Render as markdown not raw text. */}
          <div className="agent-md" style={{ fontSize: 13.5, lineHeight: 1.55, color: 'var(--c-fg)' }}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{trimmedDesc}</ReactMarkdown>
          </div>
          {desc.length > 320 && (
            <button onClick={() => setDescExpanded(x => !x)} style={{ marginTop: 4, fontSize: 12, color: 'var(--c-accent)', background: 'none', border: 0, cursor: 'pointer', padding: 0, fontWeight: 600 }}>
              {descExpanded ? 'Show less' : 'Read more'}
            </button>
          )}
        </div>
      )}

      {(content.check_in_time || content.check_out_time || content.phone || content.email || content.address || content.hotel_chain || content.property_type) && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
          {content.address && (() => {
            // Address shape varies by supplier: RateHawk = string or { text },
            // Hummingbird = object { addressLine1, addressLine2, city, state,
            // zipCode, country, ... }. Always render a STRING — never the raw
            // object (that throws React error #31 and blanks the page).
            const a = content.address;
            const addr = typeof a === 'string'
              ? a
              : (a && typeof a === 'object'
                  ? (typeof a.text === 'string' && a.text
                      ? a.text
                      : [a.addressLine1, a.addressLine2, a.city, a.state, a.zipCode, a.country].filter(Boolean).join(', '))
                  : '');
            if (!addr) return null;
            return (
              <FactCell
                label="Address"
                value={
                  content.latitude && content.longitude ? (
                    <a
                      href={`https://www.google.com/maps?q=${content.latitude},${content.longitude}`}
                      target="_blank" rel="noreferrer"
                      style={{ color: 'var(--c-accent)', textDecoration: 'none', borderBottom: '1px dashed var(--c-line)' }}
                    >{addr}</a>
                  ) : addr
                }
              />
            );
          })()}
          {content.check_in_time && <FactCell label="Check-in"  value={content.check_in_time} />}
          {content.check_out_time && <FactCell label="Check-out" value={content.check_out_time} />}
          {content.phone &&        <FactCell label="Phone"      value={content.phone} />}
          {content.email &&        <FactCell label="Email"      value={content.email} />}
          {content.hotel_chain &&  <FactCell label="Chain"      value={content.hotel_chain} />}
          {content.property_type && <FactCell label="Type"      value={content.property_type} />}
          {content.front_desk_time_start && content.front_desk_time_end && (
            <FactCell label="Front desk" value={`${content.front_desk_time_start}–${content.front_desk_time_end}`} />
          )}
          {content.number_of_rooms && <FactCell label="Rooms"   value={String(content.number_of_rooms)} />}
        </div>
      )}

      {Array.isArray(content.restaurants) && content.restaurants.length > 0 && (
        <div>
          <SectionLabel>Restaurants & bars ({content.restaurants.length})</SectionLabel>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {content.restaurants.slice(0, 8).map((r: any, i: number) => (
              <span key={i} style={{ fontSize: 12, padding: '3px 9px', borderRadius: 999, background: 'var(--c-bg-soft)', border: '1px solid var(--c-line)', color: 'var(--c-fg-soft)' }}>
                {typeof r === 'string' ? r : (r.name || r.title || 'Restaurant')}
              </span>
            ))}
            {content.restaurants.length > 8 && (
              <span style={{ fontSize: 12, color: 'var(--c-fg-muted)' }}>+{content.restaurants.length - 8} more</span>
            )}
          </div>
        </div>
      )}

      {topAmenities.length > 0 && (
        <div>
          <SectionLabel>Top amenities</SectionLabel>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {topAmenities.map((a, i) => (
              <span key={i} style={{ fontSize: 12, padding: '3px 9px', borderRadius: 999, background: 'var(--c-bg-soft)', border: '1px solid var(--c-line)', color: 'var(--c-fg-soft)' }}>{a}</span>
            ))}
          </div>
        </div>
      )}

      {mpItems.length > 0 && (
        <div>
          <SectionLabel>Policies snapshot</SectionLabel>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {mpItems.map((m, i) => (
              <span key={i} style={{ fontSize: 12, padding: '3px 9px', borderRadius: 999, background: 'var(--c-bg)', border: '1px dashed var(--c-line)', color: 'var(--c-fg-soft)' }}>
                <strong style={{ color: 'var(--c-fg)' }}>{m.k}:</strong> {m.v}
              </span>
            ))}
          </div>
          {content.metapolicy_extra_info && (
            <div style={{ marginTop: 6, fontSize: 12, color: 'var(--c-fg-muted)', whiteSpace: 'pre-wrap' }}>{content.metapolicy_extra_info}</div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Rates grouped by room type — RateHawk-style. Each unique
 * roomTypeName becomes a card with its image + amenities,
 * then a small table of rates inside (meals, cancellation,
 * NET, markup, sell, Choose).
 */
function RoomGroupedRates({
  rates, onChoose, marginTop = 0
}: {
  rates: AdminRate[];
  onChoose: (r: AdminRate) => void;
  marginTop?: number;
}) {
  const sp = useSearchParams();
  const showRgDebug = sp.get('debug') === 'rgmatch';
  // Group by the precise sub-variant name. roomGroupName is the
  // backend's resolved name from static content — for RateHawk it
  // refines "Ocean Villa" → "Ocean Villa, 1 king bed, ocean view"
  // so each view/bedding/floor combo becomes its own card. Falls
  // back to roomTypeName when no static-content match exists.
  // Group by sub-variant name, then score each rate per group so the
  // table can highlight the recommended option and surface the top-N
  // by default (Valentin, 2026-05-28). Within a group the cheapest
  // rate anchors the score pool — everything else is normalised
  // against it.
  const groups = useMemo(() => {
    const m = new Map<string, AdminRate[]>();
    for (const r of rates) {
      const k = r.roomGroupName || r.roomTypeName || r.rateKey || 'Room';
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(r);
    }
    return Array.from(m.entries()).map(([name, list]) => {
      const sellTotals = list
        .map(r => r.pricing?.sell?.totalAmount)
        .filter((v): v is number => typeof v === 'number' && v > 0);
      const poolMin = sellTotals.length ? Math.min(...sellTotals) : 0;
      const scored = list.map(r => ({
        r,
        score: scoreRate({
          pricing: {
            sell: { totalAmount: r.pricing?.sell?.totalAmount, nightlyAmount: r.pricing?.sell?.nightlyAmount },
            markup: { amount: r.pricing?.markup?.amount }
          },
          refundable: r.refundable,
          cancellationDeadlineUtc: r.cancellationDeadlineUtc
        }, poolMin, { isB2B: true })
      })).sort((a, b) => b.score - a.score);
      return {
        name,
        rates: scored.map(s => s.r),     // already sorted: highest score first
        recommendedKey: scored[0]?.r?.rateKey || null
      };
    });
  }, [rates]);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  return (
    <div style={{ marginTop, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--c-fg)' }}>
        Available rooms ({groups.length})
      </div>
      {groups.map((g) => {
        const cover = g.rates.find(r => r.roomImage)?.roomImage || null;
        // Valentin (2026-05-28): show 3–5 rate options per room with
        // different conditions, not just the cheapest. We surface the
        // top 3 by composite score and collapse the rest behind a
        // toggle. The recommended row gets a gold outline.
        const isExpanded = expandedGroups.has(g.name);
        const visibleRates = isExpanded ? g.rates : g.rates.slice(0, 3);
        const hiddenCount = g.rates.length - visibleRates.length;
        return (
          <div key={g.name} className="c-card" style={{ overflow: 'hidden' }}>
            <div style={{ display: 'grid', gridTemplateColumns: cover ? '160px 1fr' : '1fr', gap: 0 }}>
              {cover && (
                <div style={{
                  width: 160, minHeight: 120,
                  backgroundColor: 'var(--c-bg-soft)',
                  backgroundImage: `url(${cover})`,
                  backgroundSize: 'contain',
                  backgroundRepeat: 'no-repeat',
                  backgroundPosition: 'center'
                }} />
              )}
              <div style={{ padding: '12px 14px' }}>
                <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>{g.name}</div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                  <thead>
                    <tr style={{ textAlign: 'left', color: 'var(--c-fg-muted)' }}>
                      <th style={thStyle}>Supplier</th>
                      <th style={thStyle}>Plan</th>
                      <th style={thStyle}>Cancellation</th>
                      <th style={thStyle}>NET (/ night · total)</th>
                      <th style={thStyle}>Markup</th>
                      <th style={thStyle}>Sell (/ night · total)</th>
                      <th style={thStyle}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleRates.map((r, i) => {
                      const isRecommended = r.rateKey === g.recommendedKey;
                      const rowBorder = isRecommended
                        ? '1.5px solid var(--c-accent)'
                        : '1px solid var(--c-line-soft)';
                      const rowBg = isRecommended ? 'rgba(155,123,51,0.04)' : undefined;
                      return (
                      <tr key={i} style={{ borderTop: rowBorder, background: rowBg }}>
                        <td style={tdStyle}>
                          {r.supplier && <span style={badgeStyle(r.supplier)}>{r.supplier}</span>}
                          {r._channel && (
                            <span style={channelBadgeStyle(r._channel)}>
                              {r._channel === 'cug' ? 'Member' : 'B2C'}
                            </span>
                          )}
                          {isRecommended && (
                            <div style={{
                              marginTop: 3,
                              fontSize: 9.5, fontWeight: 700, letterSpacing: 0.04, textTransform: 'uppercase',
                              color: 'var(--c-accent)'
                            }}>★ Recommended</div>
                          )}
                        </td>
                        <td style={tdStyle}>
                          {r.ratePlan || 'nomeal'}
                          {showRgDebug && r.matchTier && r.matchTier !== 'strict' && (
                            <span style={{
                              marginLeft: 6,
                              padding: '1px 5px',
                              borderRadius: 3,
                              fontSize: 10,
                              fontFamily: 'var(--c-mono)',
                              background: 'var(--c-bg-soft)',
                              color: 'var(--c-fg-soft)',
                              border: '1px solid var(--c-line-soft)'
                            }}>{r.matchTier}</span>
                          )}
                        </td>
                        <td style={tdStyle}>
                          {r.refundable
                            ? (
                              <div style={{ lineHeight: 1.3 }}>
                                <div style={{ color: 'var(--c-success)', fontWeight: 600 }}>Refundable</div>
                                {r.cancellationDeadlineUtc && (
                                  <div style={{ fontSize: 11, color: 'var(--c-fg-soft)' }}>
                                    until {fmtCancelDate(r.cancellationDeadlineUtc)}
                                  </div>
                                )}
                              </div>
                            )
                            : <span style={{ color: 'var(--c-danger)' }}>Non-refundable</span>}
                        </td>
                        <td style={tdStyle}>
                          <div style={{ fontFamily: 'var(--c-mono)', lineHeight: 1.3 }}>
                            <div style={{ fontWeight: 600 }}>
                              {fmtMoney(r.pricing.net?.totalAmount)} <span style={{ color: 'var(--c-fg-muted)', fontSize: 10.5, fontWeight: 500 }}>total</span>
                            </div>
                            <div style={{ color: 'var(--c-fg-soft)', fontSize: 11 }}>
                              {fmtMoney(r.pricing.net?.nightlyAmount)} /nt
                            </div>
                          </div>
                        </td>
                        <td style={tdStyle}>
                          <span style={{ fontFamily: 'var(--c-mono)', color: 'var(--c-fg-soft)' }}>
                            {fmtMoney(r.pricing.markup?.amount)} ({r.pricing.markup?.value ?? 0}%)
                          </span>
                        </td>
                        <td style={tdStyle}>
                          <div style={{ fontFamily: 'var(--c-mono)', lineHeight: 1.3 }}>
                            <div style={{ fontWeight: 700, color: 'var(--c-accent)', fontSize: 14 }}>
                              {fmtMoney(r.pricing.sell?.totalAmount)} {r.pricing.currency} <span style={{ color: 'var(--c-fg-muted)', fontSize: 10.5, fontWeight: 600 }}>total</span>
                            </div>
                            <div style={{ color: 'var(--c-fg-soft)', fontSize: 11, fontWeight: 500 }}>
                              {fmtMoney(r.pricing.sell?.nightlyAmount)} /nt
                            </div>
                          </div>
                        </td>
                        <td style={{ ...tdStyle, textAlign: 'right' }}>
                          <button className="c-btn c-btn-primary" onClick={() => onChoose(r)} style={{ padding: '5px 12px', fontSize: 12 }}>
                            Choose
                          </button>
                        </td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
                {hiddenCount > 0 && (
                  <button
                    onClick={() => setExpandedGroups(prev => {
                      const next = new Set(prev);
                      next.add(g.name);
                      return next;
                    })}
                    style={{
                      marginTop: 6, fontSize: 11.5, color: 'var(--c-accent)',
                      background: 'none', border: 0, cursor: 'pointer', padding: 0, fontWeight: 600
                    }}
                  >Show {hiddenCount} more rate{hiddenCount > 1 ? 's' : ''}</button>
                )}
                {isExpanded && g.rates.length > 3 && (
                  <button
                    onClick={() => setExpandedGroups(prev => {
                      const next = new Set(prev);
                      next.delete(g.name);
                      return next;
                    })}
                    style={{
                      marginTop: 6, fontSize: 11.5, color: 'var(--c-fg-soft)',
                      background: 'none', border: 0, cursor: 'pointer', padding: 0, fontWeight: 600
                    }}
                  >Show top 3 only</button>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
const thStyle: React.CSSProperties = { fontWeight: 700, fontSize: 11, letterSpacing: 0.05, textTransform: 'uppercase', padding: '6px 8px', color: 'var(--c-fg-muted)' };
const tdStyle: React.CSSProperties = { padding: '8px 8px', verticalAlign: 'middle', color: 'var(--c-fg)' };

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.06, textTransform: 'uppercase', color: 'var(--c-fg-muted)', marginBottom: 6 }}>
      {children}
    </div>
  );
}
/**
 * Right-side slide-out booking form. Hotel info + rate table stay
 * visible on the left while the consultant fills customer details.
 * Width capped at 480px on desktop, full width on mobile.
 */
function BookingSidebar(props: {
  hotel: HotelHit | null;
  rate: AdminRate;
  checkIn: string;
  checkOut: string;
  rooms: RoomGuests[];
  citizenship: string;
  custFirst: string; setCustFirst: (s: string) => void;
  custLast:  string; setCustLast:  (s: string) => void;
  custEmail: string; setCustEmail: (s: string) => void;
  custPhone: string; setCustPhone: (s: string) => void;
  extraRoomGuests: Array<{ firstName: string; lastName: string }>;
  setExtraRoomGuests: (g: Array<{ firstName: string; lastName: string }>) => void;
  busy: boolean;
  error: string | null;
  result: any;
  prebookBusy: boolean;
  prebookErr: string | null;
  prebook: {
    prebookHash: string;
    priceChanged: boolean;            // truthful delta — informational
    supplierFlaggedChange: boolean;   // strict — gates the banner
    originalPrice?: number | null;
    newPrice?: number | null;
    currency?: string | null;
    isFreeCancellation?: boolean | null;
    partnerOrderId?: string;
    supplier?: string;
    skipped?: string;
  } | null;
  acceptedNewPrice: boolean;
  onAcceptNewPrice: () => void;
  canSubmit: boolean;
  onClose: () => void;
  onConfirm: () => void;
  onBookAnother: () => void;
}) {
  const r = props.rate;
  const totalAdults = props.rooms.reduce((s, x) => s + x.adults, 0);
  const totalChildren = props.rooms.reduce((s, x) => s + x.childrenAges.length, 0);
  return (
    <>
      {/* dimmed backdrop */}
      <div
        onClick={props.onClose}
        style={{
          position: 'fixed', inset: 0,
          background: 'rgba(15, 15, 15, 0.34)',
          zIndex: 70
        }}
      />
      <aside
        style={{
          position: 'fixed', top: 0, right: 0, bottom: 0,
          width: 'min(480px, 100vw)',
          background: 'var(--c-bg)',
          borderLeft: '1px solid var(--c-line)',
          boxShadow: '-16px 0 36px rgba(0,0,0,0.10)',
          display: 'flex', flexDirection: 'column',
          zIndex: 80
        }}
      >
        {/* header */}
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--c-line)', background: 'var(--c-bg-soft)', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700 }}>
              {props.result ? 'Booking confirmed' : 'Book on behalf of customer'}
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--c-fg-muted)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {props.hotel?.name} · {props.checkIn} → {props.checkOut}
            </div>
          </div>
          <button onClick={props.onClose} style={{ ...iconBtnStyle, padding: 6 }} aria-label="Close">
            <ArrowLeft size={14} />
          </button>
        </div>

        {/* body */}
        <div style={{ flex: 1, overflow: 'auto', padding: 18 }}>
          {/* rate summary */}
          <div className="c-card" style={{ padding: 12, marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>{r.roomTypeName}</div>
            <div style={{ fontSize: 11.5, color: 'var(--c-fg-soft)', marginBottom: 10 }}>
              {r.ratePlan} · {r.refundable ? <span style={{ color: 'var(--c-success)' }}>Refundable</span> : <span style={{ color: 'var(--c-danger)' }}>Non-refundable</span>} · {r.supplier}
            </div>
            {/* ETG cert §6 — full tax transparency for B2B.
                Sell total already contains supplier-included taxes
                (included_by_supplier:true). We show those inline as
                "of which" rows for consultant transparency, then
                excluded taxes as separate line items added on top. */}
            {(() => {
              const sellTotal = r.pricing.sell?.totalAmount || 0;
              const included = r.taxes?.included || [];
              const excluded = r.taxes?.excluded || [];
              const excludedTotal = r.taxes?.excludedTotal || 0;
              const hasIncluded = included.length > 0;
              const hasExcluded = excluded.length > 0 && excludedTotal > 0;
              const grandTotal = sellTotal + excludedTotal;
              const prettify = (t: { name?: string; type?: string }) =>
                String(t.name || t.type || 'Tax').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
              return (
                <div style={{ display: 'grid', gap: 6 }}>
                  {(hasIncluded || hasExcluded) && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--c-fg-soft)' }}>
                      <span>Room rate</span>
                      <span style={{ fontFamily: 'var(--c-mono)' }}>{fmtMoney(sellTotal)} {r.pricing.currency}</span>
                    </div>
                  )}
                  {hasIncluded && included.map((t, i) => (
                    <div key={`inc-${i}`} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, color: 'var(--c-fg-muted)', paddingLeft: 12 }}>
                      <span>↳ {prettify(t)} <span style={{ fontStyle: 'italic' }}>(included)</span></span>
                      <span style={{ fontFamily: 'var(--c-mono)' }}>{fmtMoney(t.amount)} {t.currency || r.pricing.currency}</span>
                    </div>
                  ))}
                  {hasExcluded && excluded.map((t, i) => (
                    <div key={`exc-${i}`} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--c-fg-soft)' }}>
                      <span>{prettify(t)}</span>
                      <span style={{ fontFamily: 'var(--c-mono)' }}>{fmtMoney(t.amount)} {t.currency || r.pricing.currency}</span>
                    </div>
                  ))}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', paddingTop: (hasIncluded || hasExcluded) ? 6 : 0, borderTop: (hasIncluded || hasExcluded) ? '1px solid var(--c-line-soft)' : 'none' }}>
                    <span style={{ fontSize: 12, color: 'var(--c-fg-muted)' }}>Total payable</span>
                    <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--c-accent)', fontFamily: 'var(--c-mono)' }}>
                      {fmtMoney(grandTotal)} {r.pricing.currency}
                    </span>
                  </div>
                  {!hasIncluded && !hasExcluded && (
                    <div style={{ fontSize: 10.5, color: 'var(--c-fg-muted)', textAlign: 'right' }}>
                      Includes taxes & fees (supplier did not return a breakdown)
                    </div>
                  )}
                </div>
              );
            })()}
            <div style={{ marginTop: 6, fontSize: 11, color: 'var(--c-fg-muted)', display: 'flex', justifyContent: 'space-between' }}>
              <span>Net {fmtMoney(r.pricing.net?.totalAmount)} · +Markup {fmtMoney(r.pricing.markup?.amount)} ({r.pricing.markup?.value ?? 0}%)</span>
              <span>{totalAdults} adult{totalAdults !== 1 ? 's' : ''}{totalChildren ? ` · ${totalChildren} child${totalChildren !== 1 ? 'ren' : ''}` : ''}</span>
            </div>
          </div>

          {/* Prebook status — ETG cert §1.1 ─────────────────────────
              Verifying availability + surfacing any price change
              BEFORE the consultant fills the form. */}
          {props.prebookBusy && (
            <div style={{ padding: '10px 14px', background: 'var(--c-bg-soft)', border: '1px solid var(--c-line)', borderRadius: 6, fontSize: 13, color: 'var(--c-fg-soft)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Loader2 size={14} className="animate-spin" />
              Verifying rate with supplier…
            </div>
          )}
          {props.prebookErr && (
            <div style={{ padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, fontSize: 13, color: 'var(--c-danger)', marginBottom: 12 }}>
              Rate verification failed: {props.prebookErr}. <button onClick={props.onClose} style={{ background: 'none', border: 0, color: 'var(--c-danger)', textDecoration: 'underline', cursor: 'pointer', padding: 0 }}>Pick another</button>
            </div>
          )}
          {props.prebook?.supplierFlaggedChange && !props.acceptedNewPrice && (
            // Premium price-change banner — ported from B2C ReserveSidebar
            // for consistency across audiences. Same cert evidence on
            // both flows. Brand-gold accent, serif numbers, single
            // primary CTA.
            <div style={{
              marginBottom: 14,
              borderRadius: 10,
              border: '1px solid #E8DCC4',
              background: 'linear-gradient(180deg, #FDFAF0 0%, #FAF4E2 100%)',
              padding: '16px 16px 14px',
              boxShadow: '0 1px 2px rgba(155, 123, 51, 0.08)'
            }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 6,
                fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em',
                color: '#9B7B33', textTransform: 'uppercase', marginBottom: 10
              }}>
                <AlertTriangle size={12} /> Rate updated by supplier
              </div>
              <div style={{
                display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
                paddingBottom: 10, marginBottom: 10, borderBottom: '1px solid #E8DCC4'
              }}>
                <span style={{ fontSize: 12.5, color: '#7A6635' }}>Previous total</span>
                <span style={{
                  fontSize: 13.5, color: '#9C8B5D',
                  textDecoration: 'line-through', fontFamily: 'Georgia, serif'
                }}>
                  {fmtMoney(props.prebook.originalPrice ?? undefined)} {props.prebook.currency}
                </span>
              </div>
              <div style={{
                display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
                marginBottom: 12
              }}>
                <span style={{ fontSize: 13, color: '#3F2F0E', fontWeight: 600 }}>New total</span>
                <span style={{
                  fontSize: 22, color: '#3F2F0E', fontWeight: 600,
                  fontFamily: 'Georgia, serif', letterSpacing: '-0.01em'
                }}>
                  {fmtMoney(props.prebook.newPrice ?? undefined)} {props.prebook.currency}
                </span>
              </div>
              <button
                onClick={props.onAcceptNewPrice}
                style={{
                  width: '100%', padding: '10px 14px', borderRadius: 8,
                  background: '#9B7B33', color: 'white', border: 0,
                  fontWeight: 600, fontSize: 13, cursor: 'pointer'
                }}
              >
                Accept new total of {fmtMoney(props.prebook.newPrice ?? undefined)} {props.prebook.currency}
              </button>
            </div>
          )}
          {props.prebook && !props.prebook.supplierFlaggedChange && !props.prebook.skipped && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '8px 12px', borderRadius: 6, marginBottom: 12,
              background: '#FAF7EE', borderLeft: '3px solid #9B7B33',
              fontSize: 12, color: '#5C4A1F'
            }}>
              <CheckCircle2 size={13} style={{ color: '#9B7B33' }} />
              Rate held at <strong style={{ color: '#3F2F0E' }}>{fmtMoney((props.prebook.newPrice ?? props.prebook.originalPrice) ?? undefined)} {props.prebook.currency}</strong>
            </div>
          )}

          {/* SUCCESS view */}
          {props.result && (
            <div>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 6, color: 'var(--c-success)', fontSize: 13.5, fontWeight: 700, marginBottom: 14 }}>
                <CheckCircle2 size={16} /> Booking confirmed
              </div>
              <div style={{ display: 'grid', gap: 8, fontSize: 13 }}>
                <Row label="Status"           value={String(props.result.status || '—')} />
                <Row label="Supplier order"   value={String(props.result.bookingId || props.result.confirmationNumber || '—')} />
                <Row label="Partner order"    value={String(props.result.partnerOrderId || '—')} mono />
                <Row label="Internal booking" value={String(props.result.internalBookingId || '—')} mono />
                <Row label="Total"            value={`${props.result.totalAmount || '—'} ${props.result.currency || ''}`} />
                <Row label="Guest"            value={`${props.result.guestInfo?.firstName || ''} ${props.result.guestInfo?.lastName || ''}`} />
                {/* ETG cert §9 — multi-room composition. Read from
                    the rooms[] state (true per-room) rather than the
                    supplier echo, which only carries the lead-guest
                    block. Matches what the consultant entered. */}
                {(() => {
                  const totalAdults   = props.rooms.reduce((s, r) => s + (r.adults || 0), 0);
                  const totalChildren = props.rooms.reduce((s, r) => s + ((r.childrenAges || []).length), 0);
                  const composition = [
                    `${totalAdults}A`,
                    totalChildren > 0 ? `${totalChildren}C` : null,
                    `${props.rooms.length} room${props.rooms.length === 1 ? '' : 's'}`
                  ].filter(Boolean).join(' · ');
                  return <Row label="Guests & rooms" value={composition} />;
                })()}
              </div>
            </div>
          )}

          {/* FORM view */}
          {!props.result && (
            <>
              {props.error && (
                <div style={{ marginBottom: 12, padding: '10px 12px', background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 6, color: 'var(--c-danger)', fontSize: 13, display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                  <AlertTriangle size={14} style={{ marginTop: 2, flexShrink: 0 }} />
                  <span>{props.error}</span>
                </div>
              )}
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--c-fg-soft)', textTransform: 'uppercase', letterSpacing: 0.05, marginBottom: 10 }}>
                Customer details
              </div>
              <div style={{ display: 'grid', gap: 10, gridTemplateColumns: '1fr 1fr' }}>
                <div>
                  <label style={labelStyle}>First name</label>
                  <input style={inputStyle} value={props.custFirst} onChange={(e) => props.setCustFirst(e.target.value)} placeholder="First" />
                </div>
                <div>
                  <label style={labelStyle}>Last name</label>
                  <input style={inputStyle} value={props.custLast} onChange={(e) => props.setCustLast(e.target.value)} placeholder="Last" />
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={labelStyle}>Email</label>
                  <input style={inputStyle} type="email" value={props.custEmail} onChange={(e) => props.setCustEmail(e.target.value)} placeholder="customer@example.com" />
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={labelStyle}>Phone</label>
                  <input style={inputStyle} type="tel" value={props.custPhone} onChange={(e) => props.setCustPhone(e.target.value)} placeholder="+61 ..." />
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={labelStyle}>Citizenship</label>
                  <div style={{ ...inputStyle, background: 'var(--c-bg-soft)', color: 'var(--c-fg-soft)' }}>
                    {props.citizenship} (set on search)
                  </div>
                </div>
              </div>

              {/* ETG cert §5 — per-room lead-guest names. Only shown
                  for multi-room bookings. */}
              {props.extraRoomGuests.length > 0 && (
                <>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--c-fg-soft)', textTransform: 'uppercase', letterSpacing: 0.05, marginTop: 16, marginBottom: 6 }}>
                    Lead guest in each additional room
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--c-fg-muted)', marginBottom: 10, lineHeight: 1.5 }}>
                    Hotels require a real name for the lead guest in each room. The customer above is the lead guest in Room 1.
                  </div>
                  {props.extraRoomGuests.map((rg, i) => (
                    <div key={i} style={{ marginBottom: 10 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--c-fg-soft)', marginBottom: 6 }}>Room {i + 2}</div>
                      <div style={{ display: 'grid', gap: 10, gridTemplateColumns: '1fr 1fr' }}>
                        <div>
                          <label style={labelStyle}>First name</label>
                          <input
                            style={inputStyle}
                            value={rg.firstName}
                            onChange={(e) => props.setExtraRoomGuests(props.extraRoomGuests.map((x, j) => j === i ? { ...x, firstName: e.target.value } : x))}
                            placeholder="First"
                          />
                        </div>
                        <div>
                          <label style={labelStyle}>Last name</label>
                          <input
                            style={inputStyle}
                            value={rg.lastName}
                            onChange={(e) => props.setExtraRoomGuests(props.extraRoomGuests.map((x, j) => j === i ? { ...x, lastName: e.target.value } : x))}
                            placeholder="Last"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </>
          )}
        </div>

        {/* footer / action */}
        <div style={{ padding: 14, borderTop: '1px solid var(--c-line)', display: 'flex', gap: 8 }}>
          {props.result ? (
            <>
              <button className="c-btn" onClick={props.onBookAnother} style={{ flex: 1, justifyContent: 'center' }}>
                Book another rate
              </button>
              <button className="c-btn c-btn-primary" onClick={props.onClose} style={{ flex: 1, justifyContent: 'center' }}>
                Done
              </button>
            </>
          ) : (
            <button
              className="c-btn c-btn-primary"
              onClick={props.onConfirm}
              // Gated on canSubmit: must have a prebookHash AND the
              // consultant must have accepted any price change. Without
              // a hash the booking would 400 at the supplier; without
              // accepting price change ETG §1.1 would flag the booking.
              disabled={props.busy || !props.canSubmit}
              title={!props.canSubmit ? 'Verifying rate or awaiting price-change confirmation' : ''}
              style={{ flex: 1, justifyContent: 'center', opacity: props.canSubmit ? 1 : 0.6 }}
            >
              {props.busy ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
              {props.busy ? 'Booking…' : (() => {
                // Use the prebook-locked newPrice whenever it's
                // present — silent shifts must show on the Confirm
                // button so the consultant sees the real total. Was
                // gated on priceChanged before, which hid moves
                // RateHawk didn't flip the banner flag for.
                const base = props.prebook?.newPrice || r.pricing.sell?.totalAmount || 0;
                const grand = base + (r.taxes?.excludedTotal || 0);
                return `Confirm · ${fmtMoney(grand)} ${r.pricing.currency}`;
              })()}
            </button>
          )}
        </div>
      </aside>
    </>
  );
}

function FactCell({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ background: 'var(--c-bg-soft)', border: '1px solid var(--c-line-soft)', borderRadius: 6, padding: '8px 10px' }}>
      <div style={{ fontSize: 10.5, color: 'var(--c-fg-muted)', textTransform: 'uppercase', letterSpacing: 0.04, fontWeight: 700, marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 13, color: 'var(--c-fg)' }}>{value}</div>
    </div>
  );
}
