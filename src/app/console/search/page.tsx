'use client';

import { useMemo, useState } from 'react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth } from '@/lib/firebase';
import { Search, Star, MapPin, Loader2, ArrowLeft, Sparkles, Filter, Pencil, CheckCircle2, AlertTriangle } from 'lucide-react';
import AgentPanel from './AgentPanel';
import DestinationAutocomplete from '@/components/console/DestinationAutocomplete';
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
  // Enriched after the compare call:
  priced?: { available: boolean; sellNightly?: number; sellTotal?: number; currency?: string; ratePlan?: string; refundable?: boolean };
};

type AdminRate = {
  supplier: string;
  rateKey: string;
  roomTypeName: string;
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

  // ─── Form state ─────────────────────────────────────────────
  const [q, setQ]               = useState('');
  const [checkIn, setCheckIn]   = useState(todayPlus(30));
  const [checkOut, setCheckOut] = useState(todayPlus(33));
  const [rooms, setRooms]       = useState<RoomGuests[]>([{ adults: 2, childrenAges: [] }]);

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
  // Inline edit-search on the detail header.
  const [editingSearch, setEditingSearch] = useState(false);

  // ─── Book-on-behalf form ────────────────────────────────────
  const [custFirst, setCustFirst] = useState('');
  const [custLast,  setCustLast]  = useState('');
  const [custEmail, setCustEmail] = useState('');
  const [custPhone, setCustPhone] = useState('');
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
        guests: rooms.map(r => ({ adults: r.adults, children: r.childrenAges }))
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

  async function openHotel(h: HotelHit) {
    setDetailHotel(h);
    setChosenRate(null);
    setBookingResult(null);
    setBookingErr(null);
    void loadRatesFor(h);
  }

  async function loadRatesFor(h: HotelHit) {
    setRatesBusy(true);
    setRatesErr(null);
    setRates([]);
    try {
      const qs = new URLSearchParams({ checkIn, checkOut, adults: String(rooms.reduce((s, r) => s + r.adults, 0)), rooms: String(rooms.length) });
      const ages = rooms[0]?.childrenAges || [];
      if (ages.length) qs.set('childAges', JSON.stringify(ages));
      const res = await fetch(`/api/admin/search/rates/${h.id}?${qs.toString()}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.details ? `${json.error}: ${json.details}` : (json.error || 'rates failed'));
      setRates(json.data.rates || []);
    } catch (e: any) {
      setRatesErr(e.message || 'rates failed');
    } finally {
      setRatesBusy(false);
    }
  }

  async function confirmBooking() {
    if (!detailHotel || !chosenRate) return;
    if (!custFirst.trim() || !custLast.trim() || !custEmail.trim()) {
      setBookingErr('Customer first name, last name and email are required.');
      return;
    }
    setBookingBusy(true);
    setBookingErr(null);
    setBookingResult(null);
    try {
      const totalAdults = rooms.reduce((s, r) => s + r.adults, 0);
      const allChildAges = rooms.flatMap(r => r.childrenAges);
      const payload = {
        hotelId: detailHotel.id,
        rateKey: chosenRate.rateKey,
        guestInfo:   { firstName: custFirst.trim(), lastName: custLast.trim(), email: custEmail.trim(), phone: custPhone.trim() || undefined },
        contactInfo: { firstName: custFirst.trim(), lastName: custLast.trim(), email: custEmail.trim(), phone: custPhone.trim() || undefined },
        searchParams: {
          checkIn, checkOut,
          adults:       totalAdults,
          children:     allChildAges.length,
          childrenAges: allChildAges,
          rooms:        rooms.length,
          guests:       rooms.map(r => ({ adults: r.adults, children: r.childrenAges })),
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
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 380px', gap: 20, alignItems: 'start' }}>
      <div style={{ minWidth: 0 }}>
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
                  <div className="c-card" style={{ padding: 14, marginTop: 12, maxWidth: 720 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1.4fr auto', gap: 10, alignItems: 'end' }}>
                      <div>
                        <label style={labelStyle}>Dates</label>
                        <DateRangePicker checkIn={checkIn} checkOut={checkOut} onChange={({ checkIn, checkOut }) => { setCheckIn(checkIn); setCheckOut(checkOut); }} />
                      </div>
                      <div>
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
                      setQ(p.q);
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
                style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 1.6fr) minmax(220px, 1.4fr) minmax(180px, 1.2fr) auto', gap: 10, alignItems: 'end' }}
              >
                <div>
                  <label style={labelStyle}>Destination or hotel name</label>
                  <DestinationAutocomplete
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

            {!chosenRate && rates.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {rates.map((r, i) => (
                  <div key={i} className="c-card" style={{ padding: 12, display: 'grid', gridTemplateColumns: '120px 1fr auto', gap: 16, alignItems: 'center' }}>
                    <div style={{ width: 120, height: 80, borderRadius: 6, overflow: 'hidden', background: 'var(--c-bg-soft)', backgroundImage: r.roomImage ? `url(${r.roomImage})` : undefined, backgroundSize: 'cover', backgroundPosition: 'center' }} />
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 2 }}>{r.roomTypeName}</div>
                      <div style={{ fontSize: 11, color: 'var(--c-fg-soft)', marginBottom: 8 }}>
                        {r.ratePlan} · {r.refundable ? <span style={{ color: 'var(--c-success)' }}>Refundable</span> : <span style={{ color: 'var(--c-danger)' }}>Non-refundable</span>} · {r.supplier}
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, max-content)', gap: 18, fontSize: 11, fontFamily: 'var(--c-mono)' }}>
                        <div>
                          <div style={priceLabelStyle}>NET</div>
                          <div style={{ fontWeight: 600 }}>{fmtMoney(r.pricing.net?.totalAmount)} {r.pricing.currency}</div>
                        </div>
                        <div>
                          <div style={priceLabelStyle}>+ MARKUP</div>
                          <div style={{ fontWeight: 600 }}>{fmtMoney(r.pricing.markup?.amount)} ({r.pricing.markup?.value ?? 0}%)</div>
                        </div>
                        <div>
                          <div style={priceLabelStyle}>SELL</div>
                          <div style={{ fontWeight: 700, color: 'var(--c-accent)' }}>{fmtMoney(r.pricing.sell?.totalAmount)} {r.pricing.currency}</div>
                        </div>
                      </div>
                    </div>
                    <button className="c-btn c-btn-primary" style={{ whiteSpace: 'nowrap' }} onClick={() => setChosenRate(r)}>Book on behalf</button>
                  </div>
                ))}
              </div>
            )}

            {chosenRate && !bookingResult && (
              <div>
                <button onClick={() => { setChosenRate(null); setBookingErr(null); }} style={{ ...iconBtnStyle, marginBottom: 14, padding: '4px 10px', fontSize: 12 }}>
                  ← Back to rates
                </button>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Booking on behalf of customer</div>
                <div style={{ fontSize: 12, color: 'var(--c-fg-soft)', marginBottom: 14 }}>
                  {chosenRate.roomTypeName} · {chosenRate.ratePlan} · {fmtMoney(chosenRate.pricing.sell?.totalAmount)} {chosenRate.pricing.currency}
                </div>
                {bookingErr && (
                  <div style={{ marginBottom: 12, padding: '10px 12px', background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 6, color: 'var(--c-danger)', fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    <AlertTriangle size={14} /> {bookingErr}
                  </div>
                )}
                <div style={{ display: 'grid', gap: 10, maxWidth: 480 }}>
                  <div><label style={labelStyle}>Customer first name</label><input style={inputStyle} value={custFirst} onChange={(e) => setCustFirst(e.target.value)} placeholder="First name" /></div>
                  <div><label style={labelStyle}>Customer last name</label><input style={inputStyle} value={custLast} onChange={(e) => setCustLast(e.target.value)} placeholder="Last name" /></div>
                  <div><label style={labelStyle}>Customer email</label><input style={inputStyle} type="email" value={custEmail} onChange={(e) => setCustEmail(e.target.value)} placeholder="customer@example.com" /></div>
                  <div><label style={labelStyle}>Customer phone</label><input style={inputStyle} type="tel" value={custPhone} onChange={(e) => setCustPhone(e.target.value)} placeholder="+61 ..." /></div>
                  <button
                    className="c-btn c-btn-primary"
                    onClick={confirmBooking}
                    disabled={bookingBusy}
                    style={{ marginTop: 6, justifyContent: 'center' }}
                  >
                    {bookingBusy ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                    {bookingBusy ? 'Booking…' : `Confirm booking · ${fmtMoney(chosenRate.pricing.sell?.totalAmount)} ${chosenRate.pricing.currency}`}
                  </button>
                </div>
              </div>
            )}

            {bookingResult && (
              <div>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 6, color: 'var(--c-success)', fontSize: 14, fontWeight: 600, marginBottom: 14 }}>
                  <CheckCircle2 size={16} /> Booking confirmed
                </div>
                <div style={{ display: 'grid', gap: 6, maxWidth: 480, fontSize: 13 }}>
                  <Row label="Status"             value={String(bookingResult.status || '—')} />
                  <Row label="Supplier order"     value={String(bookingResult.bookingId || bookingResult.confirmationNumber || '—')} />
                  <Row label="Partner order"      value={String(bookingResult.partnerOrderId || '—')} mono />
                  <Row label="Internal booking"   value={String(bookingResult.internalBookingId || '—')} mono />
                  <Row label="Total"              value={`${bookingResult.totalAmount || '—'} ${bookingResult.currency || ''}`} />
                  <Row label="Guest"              value={`${bookingResult.guestInfo?.firstName || ''} ${bookingResult.guestInfo?.lastName || ''}`} />
                </div>
                <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
                  <button
                    className="c-btn"
                    onClick={() => { setBookingResult(null); setChosenRate(null); setCustFirst(''); setCustLast(''); setCustEmail(''); setCustPhone(''); }}
                  >Book another rate</button>
                  <button
                    className="c-btn"
                    onClick={() => { setDetailHotel(null); setChosenRate(null); setBookingResult(null); }}
                  >Back to results</button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Right-column agent panel — always present, never overlapped by booking */}
      <div style={{ position: 'sticky', top: 52, alignSelf: 'start' }}>
        <AgentPanel
          onHotelsFound={(found) => {
            const ids = found.map((h: any) => h.id);
            setHits(found.map((h: any) => ({ id: h.id, name: h.name, city: h.city, country: h.country, starRating: h.starRating, image: h.image, sources: h.sources || [] })));
            void enrichPrices(ids);
          }}
          onHotelClick={(h) => {
            // Click-through from the agent's tool result directly into
            // the canvas detail view. If the hotel isn't yet in `hits`
            // (the agent may have surfaced something via compare we
            // never put on the left), seed it before opening.
            const existing = hits.find(x => x.id === h.id);
            const hit = existing || { id: h.id, name: h.name || '', city: h.city, country: h.country, image: h.image || null, sources: [], starRating: undefined };
            if (!existing) setHits(curr => [hit, ...curr]);
            void openHotel(hit);
          }}
        />
      </div>
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
