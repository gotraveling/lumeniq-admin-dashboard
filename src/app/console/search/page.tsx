'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth } from '@/lib/firebase';
import { Search, Star, MapPin, Loader2, ArrowLeft, Sparkles, Filter, Pencil, CheckCircle2, AlertTriangle } from 'lucide-react';
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
  priced?: { available: boolean; sellNightly?: number; sellTotal?: number; currency?: string; ratePlan?: string; refundable?: boolean };
};

type AdminRate = {
  supplier: string;
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
  cancellationPolicy?: string | null;
  cancellationDeadlineUtc?: string | null;
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

  // ─── In-canvas detail view (Pattern A — no slide-out) ───────
  const [detailHotel, setDetailHotel]   = useState<HotelHit | null>(null);
  const [rates, setRates]               = useState<AdminRate[]>([]);
  const [ratesBusy, setRatesBusy]       = useState(false);
  const [ratesErr, setRatesErr]         = useState<string | null>(null);
  const [chosenRate, setChosenRate]     = useState<AdminRate | null>(null);
  // Prebook state — set when the consultant picks a rate. We verify
  // availability + price BEFORE they fill the form. Per ETG cert §1.1
  // ("Moving prebook to the separate step is also highly recommended").
  type PrebookInfo = {
    prebookHash: string;
    priceChanged: boolean;
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
        const sell = r.cheapestRate?.pricing?.sell;
        return {
          ...h,
          priced: {
            available: true,
            sellNightly: sell?.nightlyAmount,
            sellTotal:   sell?.totalAmount,
            currency:    sell?.currency,
            ratePlan:    r.cheapestRate?.ratePlan,
            refundable:  r.cheapestRate?.refundable
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

  async function openHotel(h: HotelHit) {
    setDetailHotel(h);
    setDetailContent(null);
    setChosenRate(null);
    setPrebook(null);
    setPrebookErr(null);
    setAcceptedNewPrice(false);
    setBookingResult(null);
    setBookingErr(null);
    void loadRatesFor(h);
  }

  async function loadRatesFor(h: HotelHit) {
    setRatesBusy(true);
    setRatesErr(null);
    setRates([]);
    try {
      // ETG cert §4: send per-room guests so the backend doesn't have
      // to floor-distribute adults or shove all children into room 1.
      // Equivalent fix to the B2C HotelSearchForm.
      const qs = new URLSearchParams({ checkIn, checkOut, nationalityCode: citizenship });
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
      setRates(json.data.rates || []);
      setDetailContent(json.data.hotel || null);
    } catch (e: any) {
      setRatesErr(e.message || 'rates failed');
    } finally {
      setRatesBusy(false);
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
            expectedCurrency:    chosenRate.pricing.currency
          })
        });
        const json = await r.json();
        if (!r.ok || !json.success) throw new Error(json.error || 'Prebook failed');
        const info: PrebookInfo & { _forKey?: string } = { ...json.data, _forKey: chosenRate.rateKey };
        setPrebook(info);
        // If supplier reports no price change (or skipped), consultant
        // can submit immediately. If priceChanged, we lock submit
        // until the banner is acknowledged.
        if (!info.priceChanged) setAcceptedNewPrice(true);
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
          // IMPORTANT: re-verify with the ORIGINAL h-* rateKey, not
          // the p-* prebookHash. RateHawk's prebook on an existing
          // p-hash isn't supported; we need a fresh round.
          rateKey: chosenRate.rateKey,
          expectedTotalAmount: prebook?.newPrice || chosenRate.pricing.sell?.totalAmount,
          expectedCurrency:    chosenRate.pricing.currency,
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
        if (verifyJson.data.priceChanged) {
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
        expectedTotalAmount: chosenRate.pricing.sell?.totalAmount,
        expectedCurrency:    chosenRate.pricing.currency,
        availabilityType:    'free_sell'
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

  // Deep-link from the AI agent page —
  //   /console/search?hotelId=N&checkIn=…&checkOut=…&adults=…&rooms=…
  // Carries whatever date/guest context the agent was reasoning about
  // so the consultant doesn't re-enter them. Falls back to the
  // existing form defaults for anything missing.
  useEffect(() => {
    const id = sp.get('hotelId');
    if (!id || detailHotel) return;
    const n = Number(id);
    if (!Number.isFinite(n)) return;
    const ci = sp.get('checkIn');
    const co = sp.get('checkOut');
    if (ci && /^\d{4}-\d{2}-\d{2}$/.test(ci)) setCheckIn(ci);
    if (co && /^\d{4}-\d{2}-\d{2}$/.test(co)) setCheckOut(co);
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
    const stub: HotelHit = { id: n, name: '', sources: [] };
    void openHotel(stub);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sp]);

  // ─── filter computation ─────────────────────────────────────
  const filteredHits = useMemo(() => {
    return hits.filter(h => {
      if (filterSupplier !== 'all' && !h.sources.includes(filterSupplier)) return false;
      // Hide unavailable by default — most consultants only care about
      // bookable options. priced === undefined means prices are still
      // loading, so don't hide those yet.
      if (!showUnavailable && h.priced !== undefined && !h.priced.available) return false;
      if (filterRefundable && h.priced && h.priced.available && !h.priced.refundable) return false;
      return true;
    });
  }, [hits, filterSupplier, filterRefundable, showUnavailable]);

  // ───────────────────────────────────────────────────────────
  return (
    <div style={{ minWidth: 0 }}>
      <div>
        {/* Header swaps to a breadcrumb when in detail view */}
        <div className="c-page-head">
          <div>
            {!detailHotel ? (
              <>
                <h1 className="c-page-title">B2B Search</h1>
                <p className="c-page-sub">
                  Find hotels, see net cost + markup + sell price per rate, book on behalf of the customer.
                </p>
              </>
            ) : (
              <>
                <button
                  onClick={() => setDetailHotel(null)}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--c-fg-soft)', background: 'none', border: 0, cursor: 'pointer', marginBottom: 4 }}
                >
                  <ArrowLeft size={12} /> Back to results
                </button>
                <h1 className="c-page-title">{detailHotel.name}</h1>
                <p className="c-page-sub">
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
                {editingSearch && (
                  // overflow: visible so the date-picker popover and
                  // guest dropdown can break out of the card — same
                  // pattern as the main search form on this page.
                  // position: relative isolates the stacking context
                  // so z-index works inside the popovers.
                  <div className="c-card" style={{ padding: 14, marginTop: 12, maxWidth: 720, overflow: 'visible', position: 'relative', zIndex: 10 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1.4fr auto', gap: 10, alignItems: 'end' }}>
                      <div style={{ position: 'relative' }}>
                        <label style={labelStyle}>Dates</label>
                        <DateRangePicker checkIn={checkIn} checkOut={checkOut} onChange={({ checkIn, checkOut }) => { setCheckIn(checkIn); setCheckOut(checkOut); }} />
                      </div>
                      <div style={{ position: 'relative' }}>
                        <label style={labelStyle}>Guests</label>
                        <GuestSelector rooms={rooms} onChange={setRooms} />
                      </div>
                      <button
                        className="c-btn c-btn-primary"
                        onClick={() => { void loadRatesFor(detailHotel); setEditingSearch(false); }}
                        disabled={ratesBusy}
                      >
                        {ratesBusy ? <Loader2 size={13} className="animate-spin" /> : <Search size={13} />}
                        Re-check rates
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Quick prompts + search form — hidden when viewing detail */}
        {!detailHotel && (
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
        {!detailHotel && hits.length === 0 && !searching && (
          <div className="c-card" style={{ padding: 32, textAlign: 'center', color: 'var(--c-fg-muted)', fontSize: 13 }}>
            Type a destination or hotel name above, or ask the agent on the right.
          </div>
        )}

        {/* Results list */}
        {!detailHotel && hits.length > 0 && (
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
                {filteredHits.length} of {hits.length} hotels
                {enrichingPrices && <span> · <Loader2 size={11} style={{ verticalAlign: 'middle' }} className="animate-spin" /> loading prices…</span>}
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 10 }}>
              {filteredHits.map((h) => (
                <button
                  key={h.id}
                  onClick={() => openHotel(h)}
                  className="c-card"
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '120px 1fr auto',
                    gap: 16, alignItems: 'center', padding: 12,
                    textAlign: 'left', cursor: 'pointer',
                    background: 'var(--c-bg)', border: '1px solid var(--c-line)',
                    opacity: h.priced && !h.priced.available ? 0.55 : 1
                  }}
                >
                  <div style={{ width: 120, height: 80, borderRadius: 6, overflow: 'hidden', background: 'var(--c-bg-soft)', backgroundImage: h.image ? `url(${h.image})` : undefined, backgroundSize: 'cover', backgroundPosition: 'center' }} />
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>{h.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--c-fg-soft)', display: 'flex', gap: 12, alignItems: 'center' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <MapPin size={12} /> {[h.city, h.country].filter(Boolean).join(', ')}
                      </span>
                      {!!h.starRating && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                          {Array.from({ length: Math.round(h.starRating) }).map((_, i) => (
                            <Star key={i} size={11} fill="var(--c-accent)" style={{ color: 'var(--c-accent)' }} />
                          ))}
                        </span>
                      )}
                      {h.sources.map((s) => <span key={s} style={badgeStyle(s)}>{s}</span>)}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    {h.priced === undefined ? (
                      <span style={{ fontSize: 11, color: 'var(--c-fg-muted)' }}>—</span>
                    ) : !h.priced.available ? (
                      <span style={{ fontSize: 12, color: 'var(--c-fg-muted)' }}>Unavailable</span>
                    ) : (
                      <div>
                        <div style={{ fontSize: 11, color: 'var(--c-fg-muted)', letterSpacing: 0.04, textTransform: 'uppercase', fontWeight: 700 }}>From</div>
                        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--c-accent)' }}>
                          {fmtMoney(h.priced.sellNightly)} <span style={{ fontSize: 11, color: 'var(--c-fg-muted)' }}>/ night</span>
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--c-fg-soft)' }}>
                          {h.priced.refundable ? <span style={{ color: 'var(--c-success)' }}>Refundable</span> : <span style={{ color: 'var(--c-danger)' }}>Non-refundable</span>}
                          {h.priced.ratePlan ? ` · ${h.priced.ratePlan}` : ''}
                        </div>
                      </div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </>
        )}

        {/* In-canvas detail view — replaces the right slide-out so the
            agent column stays put. */}
        {detailHotel && (
          <div className="c-card" style={{ padding: 16 }}>
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

            {rates.length > 0 && (
              <RoomGroupedRates
                rates={rates}
                onChoose={(r) => setChosenRate(r)}
                marginTop={detailContent ? 18 : 0}
              />
            )}

            {/* Booking is in a slide-out sidebar (BookingSidebar)
                rendered at the end of the page, outside this card. */}
          </div>
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
function fmtMoney(n?: number) {
  if (n === undefined || n === null || isNaN(n)) return '—';
  return n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
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
  const trimmedDesc = desc && desc.length > 320 && !descExpanded ? desc.slice(0, 320) + '…' : desc;

  return (
    <div style={{ display: 'grid', gap: 14, marginBottom: 12 }}>
      {desc && (
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

      {(content.check_in_time || content.check_out_time || content.phone || content.email) && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
          {content.check_in_time && <FactCell label="Check-in"  value={content.check_in_time} />}
          {content.check_out_time && <FactCell label="Check-out" value={content.check_out_time} />}
          {content.phone &&        <FactCell label="Phone"      value={content.phone} />}
          {content.email &&        <FactCell label="Email"      value={content.email} />}
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
  // Group by the precise sub-variant name. roomGroupName is the
  // backend's resolved name from static content — for RateHawk it
  // refines "Ocean Villa" → "Ocean Villa, 1 king bed, ocean view"
  // so each view/bedding/floor combo becomes its own card. Falls
  // back to roomTypeName when no static-content match exists.
  const groups = useMemo(() => {
    const m = new Map<string, AdminRate[]>();
    for (const r of rates) {
      const k = r.roomGroupName || r.roomTypeName || r.rateKey || 'Room';
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(r);
    }
    return Array.from(m.entries()).map(([name, list]) => ({ name, rates: list }));
  }, [rates]);

  return (
    <div style={{ marginTop, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--c-fg)' }}>
        Available rooms ({groups.length})
      </div>
      {groups.map((g) => {
        // Mirror B2C RoomGrid behaviour: show the thumbnail only when
        // an image actually exists. Empty grey boxes look broken in a
        // long room list, especially when most rooms don't have an
        // image (rg_ext match miss). When no image, collapse to a
        // single-column card.
        const cover = g.rates.find(r => r.roomImage)?.roomImage || null;
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
                      <th style={thStyle}>Plan</th>
                      <th style={thStyle}>Cancellation</th>
                      <th style={thStyle}>NET</th>
                      <th style={thStyle}>Markup</th>
                      <th style={thStyle}>Sell</th>
                      <th style={thStyle}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.rates.map((r, i) => (
                      <tr key={i} style={{ borderTop: '1px solid var(--c-line-soft)' }}>
                        <td style={tdStyle}>{r.ratePlan || 'nomeal'}</td>
                        <td style={tdStyle}>
                          {r.refundable
                            ? <span style={{ color: 'var(--c-success)', fontWeight: 600 }}>Refundable</span>
                            : <span style={{ color: 'var(--c-danger)' }}>Non-refundable</span>}
                        </td>
                        <td style={tdStyle}>
                          <span style={{ fontFamily: 'var(--c-mono)' }}>{fmtMoney(r.pricing.net?.totalAmount)}</span>
                        </td>
                        <td style={tdStyle}>
                          <span style={{ fontFamily: 'var(--c-mono)', color: 'var(--c-fg-soft)' }}>
                            {fmtMoney(r.pricing.markup?.amount)} ({r.pricing.markup?.value ?? 0}%)
                          </span>
                        </td>
                        <td style={tdStyle}>
                          <span style={{ fontFamily: 'var(--c-mono)', fontWeight: 700, color: 'var(--c-accent)' }}>
                            {fmtMoney(r.pricing.sell?.totalAmount)} {r.pricing.currency}
                          </span>
                        </td>
                        <td style={{ ...tdStyle, textAlign: 'right' }}>
                          <button className="c-btn c-btn-primary" onClick={() => onChoose(r)} style={{ padding: '5px 12px', fontSize: 12 }}>
                            Choose
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
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
    priceChanged: boolean;
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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span style={{ fontSize: 12, color: 'var(--c-fg-muted)' }}>Total payable</span>
              <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--c-accent)', fontFamily: 'var(--c-mono)' }}>
                {fmtMoney(r.pricing.sell?.totalAmount)} {r.pricing.currency}
              </span>
            </div>
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
          {props.prebook?.priceChanged && !props.acceptedNewPrice && (
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
          {props.prebook && !props.prebook.priceChanged && !props.prebook.skipped && (
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
              {props.busy ? 'Booking…' : `Confirm · ${fmtMoney((props.prebook?.priceChanged && props.prebook?.newPrice) || r.pricing.sell?.totalAmount)} ${r.pricing.currency}`}
            </button>
          )}
        </div>
      </aside>
    </>
  );
}

function FactCell({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: 'var(--c-bg-soft)', border: '1px solid var(--c-line-soft)', borderRadius: 6, padding: '8px 10px' }}>
      <div style={{ fontSize: 10.5, color: 'var(--c-fg-muted)', textTransform: 'uppercase', letterSpacing: 0.04, fontWeight: 700, marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 13, color: 'var(--c-fg)' }}>{value}</div>
    </div>
  );
}
