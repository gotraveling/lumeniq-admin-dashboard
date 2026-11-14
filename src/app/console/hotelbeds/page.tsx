'use client';

/**
 * /console/hotelbeds — the Hotelbeds-only booking flow Hotelbeds' certifiers
 * test us on. Every call goes through /api/admin/hotelbeds/* to the booking
 * engine's admin Hotelbeds routes, in the Hotelbeds TEST environment.
 *
 * Workflow (certification 2.1, 2.2, 2.5):
 *   Availability → CheckRate ONLY when the rate is RECHECK → Booking.
 * The selected rate is held in state from the results, so nothing repeats an
 * availability or a CheckRate before booking. A BOOKABLE rate whose comments
 * were not in the availability response gets them from the Content API
 * through the same /checkrate route, which does NOT call CheckRate for it.
 *
 * Opaque rates (packaging: true) are hidden: the engine drops them, and this
 * page filters them again in case a caller asks for them. Pay-at-hotel
 * (AT_HOTEL) rates are hidden too: we book on agency credit, never with a card.
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Minus, Plus, Search } from 'lucide-react';
import { useConsoleRole } from '@/lib/useConsoleRole';
import {
  AvailabilityResponse, HbxHotel, HbxRate, RoomQuery, SearchQuery,
  amount, childAgesValid, day, hbx, money, nights, starsOf,
} from './_lib';
import { HbxTabs, Penalties, RateComments, RefundPill, Stars, StepIndicator, StepState, TestEnvBanner } from './_components';

const PAGE_SIZE = 10;
const RATES_SHOWN = 6;
const MAX_ROOMS = 9;

function plusDays(n: number): string {
  const d = new Date(Date.now() + n * 86400000);
  return d.toISOString().slice(0, 10);
}

type Selected = {
  hotel: HbxHotel;
  rate: HbxRate;
  // What we book with. For a RECHECK rate this is the key CheckRate returned.
  bookingRateKey: string;
  checkRate: 'skipped' | 'done';
  rateComments: string | null;
  commentsLoading: boolean;
  // Sell price and terms at booking time (CheckRate may re-quote a RECHECK rate).
  price: HbxRate;
  priceChanged: boolean;
};

type Confirmation = {
  reference: string;
  clientReference: string;
  status: string;
  internalBookingId: string | null;
};

export default function HotelbedsPage() {
  const { isCertifier } = useConsoleRole();
  const [q, setQ] = useState<SearchQuery>({
    mode: 'destination',
    destinationCode: 'PMI',
    hotelCodes: '',
    checkIn: plusDays(90),
    checkOut: plusDays(93),
    rooms: [{ adults: 2, children: [] }],
    sourceMarket: '',
    maxHotels: 50,
  });
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [results, setResults] = useState<{ hotels: HbxHotel[]; query: SearchQuery; sourceMarket: string | null } | null>(null);
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Selected | null>(null);
  const [selectError, setSelectError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);

  const step: 'search' | 'results' | 'book' | 'done' = confirmation ? 'done' : selected ? 'book' : results ? 'results' : 'search';

  const steps: Array<{ label: string; note?: string; state: StepState }> = [
    { label: 'Availability', note: results ? `${results.hotels.length} hotels` : 'search', state: results ? 'done' : 'current' },
    {
      label: 'CheckRate',
      note: !selected ? 'only for RECHECK rates'
        : selected.checkRate === 'done' ? 'done (RECHECK rate)' : 'not needed (BOOKABLE rate)',
      state: !selected ? 'todo' : selected.checkRate === 'done' ? 'done' : 'skipped',
    },
    { label: 'Booking', note: confirmation ? confirmation.reference : 'confirm', state: confirmation ? 'done' : selected ? 'current' : 'todo' },
    { label: 'Voucher', note: 'print / PDF', state: confirmation ? 'current' : 'todo' },
  ];

  async function runSearch() {
    setSearchError(null);
    if (!childAgesValid(q.rooms)) { setSearchError('Every child needs an age (0–17).'); return; }
    if (q.checkOut <= q.checkIn) { setSearchError('Check-out must be after check-in.'); return; }
    const codes = q.hotelCodes.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
    if (q.mode === 'hotels' && codes.length === 0) { setSearchError('Enter at least one Hotelbeds hotel code.'); return; }
    if (q.mode === 'hotels' && codes.length > 2000) { setSearchError('At most 2000 hotel codes per search.'); return; }
    if (q.mode === 'destination' && !q.destinationCode.trim()) { setSearchError('Enter a Hotelbeds destination code, e.g. PMI.'); return; }
    if (q.sourceMarket && !/^[A-Za-z]{2}$/.test(q.sourceMarket)) { setSearchError('Source market is a 2-letter country code, e.g. AU.'); return; }

    setSearching(true);
    try {
      // All rooms go in ONE availability call (certification 3.2).
      const body: Record<string, unknown> = {
        checkIn: q.checkIn,
        checkOut: q.checkOut,
        guests: q.rooms.map((r) => ({ adults: r.adults, children: r.children as number[] })),
        maxHotels: q.maxHotels,
        ...(q.sourceMarket ? { sourceMarket: q.sourceMarket.toUpperCase() } : {}),
        ...(q.mode === 'hotels' ? { hotelCodes: codes } : { destinationCode: q.destinationCode.trim().toUpperCase() }),
      };
      const res = await hbx<AvailabilityResponse>('availability', { method: 'POST', body });
      const hotels = (res.hotels || [])
        .map((h) => ({ ...h, rates: (h.rates || []).filter(sellable) }))
        .filter((h) => h.rates.length > 0)
        .sort((a, b) => cheapest(a) - cheapest(b));
      setResults({ hotels, query: q, sourceMarket: res.sourceMarket || null });
      setPage(0);
      setSelected(null);
      setConfirmation(null);
    } catch (e) {
      setSearchError((e as Error).message);
    } finally {
      setSearching(false);
    }
  }

  async function choose(hotel: HbxHotel, rate: HbxRate) {
    setSelectError(null);
    setConfirmation(null);
    const base: Selected = {
      hotel, rate, bookingRateKey: rate.rateKey, checkRate: 'skipped',
      rateComments: rate.rateComments, commentsLoading: false, price: rate, priceChanged: false,
    };
    if (rate.rateType === 'RECHECK') {
      // Certification 2.5: CheckRate for RECHECK rates, and only for them.
      setSelected({ ...base, commentsLoading: true });
      try {
        const r = await hbx<any>('checkrate', { method: 'POST', body: { rateKey: rate.rateKey } });
        const d = r.data || {};
        const priced: HbxRate | undefined = d.pricedRate;
        setSelected({
          ...base,
          bookingRateKey: d.bookHash || rate.rateKey,
          checkRate: 'done',
          rateComments: d.rateComments ?? rate.rateComments,
          commentsLoading: false,
          price: priced ? { ...rate, ...priced, roomTypeName: rate.roomTypeName } : rate,
          priceChanged: !!d.priceChanged,
        });
      } catch (e) {
        setSelected(null);
        setSelectError(`CheckRate failed: ${(e as Error).message}. Search again for a fresh rate.`);
      }
      return;
    }
    if (rate.rateCommentsPending) {
      // BOOKABLE: no CheckRate. The comment text comes from the Content API.
      setSelected({ ...base, commentsLoading: true });
      try {
        const r = await hbx<any>('checkrate', { method: 'POST', body: { rateKey: rate.rateKey } });
        setSelected({ ...base, rateComments: r.data?.rateComments ?? null, commentsLoading: false });
      } catch (e) {
        setSelected({ ...base, commentsLoading: false });
        setSelectError(`Rate comments could not be loaded: ${(e as Error).message}`);
      }
      return;
    }
    setSelected(base);
  }

  return (
    <div>
      <div className="c-page-head">
        <div>
          <h1 className="c-page-title">Hotelbeds</h1>
          <p className="c-page-sub">Search, check and book Hotelbeds rates. Test environment.</p>
        </div>
      </div>
      <TestEnvBanner />
      <HbxTabs />
      <StepIndicator steps={steps} />

      {step !== 'done' && (
        <SearchForm q={q} setQ={setQ} onSearch={runSearch} searching={searching} collapsed={!!selected} onEdit={() => setSelected(null)} />
      )}
      {searchError && <div className="c-error" style={{ marginBottom: 16 }}>{searchError}</div>}
      {selectError && <div className="c-error" style={{ marginBottom: 16 }}>{selectError}</div>}

      {step === 'results' && results && (
        <Results
          results={results}
          page={page}
          setPage={setPage}
          onChoose={choose}
          showNet={!isCertifier}
        />
      )}

      {step === 'book' && selected && results && (
        <BookStep
          sel={selected}
          query={results.query}
          sourceMarket={results.sourceMarket}
          showNet={!isCertifier}
          onBack={() => setSelected(null)}
          onBooked={setConfirmation}
        />
      )}

      {step === 'done' && confirmation && selected && (
        <Confirmed c={confirmation} sel={selected} onNew={() => { setConfirmation(null); setSelected(null); setResults(null); }} />
      )}
    </div>
  );
}

// What we sell: no opaque (packaging) rates, since we sell hotel only (cert
// 3.5); no pay-at-hotel rates, which need card details we never collect.
function sellable(r: HbxRate): boolean {
  return !r.packaging && r.paymentType !== 'AT_HOTEL';
}

function cheapest(h: HbxHotel): number {
  return Math.min(...h.rates.map((r) => r.totalRate?.amount ?? Infinity));
}

// ─── search ───────────────────────────────────────────────────────────────

function SearchForm({ q, setQ, onSearch, searching, collapsed, onEdit }: {
  q: SearchQuery; setQ: (q: SearchQuery) => void; onSearch: () => void; searching: boolean; collapsed: boolean; onEdit: () => void;
}) {
  if (collapsed) {
    return (
      <div className="c-card" style={{ marginBottom: 18 }}>
        <div className="c-card-head">
          <span style={{ fontSize: 13 }}>
            {q.mode === 'destination' ? `Destination ${q.destinationCode}` : `Hotel codes ${q.hotelCodes}`} · {day(q.checkIn)} → {day(q.checkOut)} ·{' '}
            {q.rooms.length} room{q.rooms.length > 1 ? 's' : ''}
            {q.sourceMarket ? ` · source market ${q.sourceMarket.toUpperCase()}` : ''}
          </span>
          <button className="c-btn" onClick={onEdit}>Back to results</button>
        </div>
      </div>
    );
  }
  const setRoom = (i: number, r: RoomQuery) => setQ({ ...q, rooms: q.rooms.map((x, j) => (j === i ? r : x)) });
  return (
    <form className="c-card" style={{ marginBottom: 18 }} onSubmit={(e) => { e.preventDefault(); onSearch(); }}>
      <div className="c-card-head"><h2 className="c-card-title">Availability search</h2></div>
      <div style={{ padding: 16, display: 'grid', gap: 14 }}>
        <div className="c-filter-row" style={{ marginBottom: 0 }}>
          <div>
            <label className="c-label" htmlFor="hbx-mode">Search by</label>
            <select id="hbx-mode" className="c-select" value={q.mode} onChange={(e) => setQ({ ...q, mode: e.target.value as SearchQuery['mode'] })}>
              <option value="destination">Destination code</option>
              <option value="hotels">Hotel codes</option>
            </select>
          </div>
          {q.mode === 'destination' ? (
            <div>
              <label className="c-label" htmlFor="hbx-dest">Destination</label>
              <input id="hbx-dest" className="c-input" value={q.destinationCode} placeholder="PMI" maxLength={10}
                onChange={(e) => setQ({ ...q, destinationCode: e.target.value })} />
            </div>
          ) : (
            <div style={{ minWidth: 260, flex: '1 1 260px' }}>
              <label className="c-label" htmlFor="hbx-codes">Hotel codes (up to 2000)</label>
              <input id="hbx-codes" className="c-input" value={q.hotelCodes} placeholder="766, 1524, 9746"
                onChange={(e) => setQ({ ...q, hotelCodes: e.target.value })} />
            </div>
          )}
          <div>
            <label className="c-label" htmlFor="hbx-in">Check-in</label>
            <input id="hbx-in" type="date" className="c-input" value={q.checkIn} onChange={(e) => setQ({ ...q, checkIn: e.target.value })} />
          </div>
          <div>
            <label className="c-label" htmlFor="hbx-out">Check-out</label>
            <input id="hbx-out" type="date" className="c-input" value={q.checkOut} onChange={(e) => setQ({ ...q, checkOut: e.target.value })} />
          </div>
          <div style={{ minWidth: 120 }}>
            <label className="c-label" htmlFor="hbx-sm">Source market</label>
            <input id="hbx-sm" className="c-input" value={q.sourceMarket} placeholder="optional, e.g. AU" maxLength={2}
              onChange={(e) => setQ({ ...q, sourceMarket: e.target.value.toUpperCase() })} />
          </div>
          <div style={{ minWidth: 100 }}>
            <label className="c-label" htmlFor="hbx-max">Max hotels</label>
            <input id="hbx-max" type="number" min={1} max={2000} className="c-input" value={q.maxHotels}
              onChange={(e) => setQ({ ...q, maxHotels: Math.max(1, Math.min(2000, Number(e.target.value) || 1)) })} />
          </div>
        </div>

        <div>
          <div className="c-label">Rooms (all rooms are priced in one availability call)</div>
          <div style={{ display: 'grid', gap: 8 }}>
            {q.rooms.map((r, i) => (
              <div key={i} style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap', padding: '8px 10px', border: '1px solid var(--c-line-soft)', borderRadius: 6 }}>
                <strong style={{ minWidth: 60 }}>Room {i + 1}</strong>
                <Counter label="Adults" value={r.adults} min={1} max={9} onChange={(v) => setRoom(i, { ...r, adults: v })} />
                <Counter label="Children" value={r.children.length} min={0} max={4}
                  onChange={(v) => setRoom(i, { ...r, children: v > r.children.length ? [...r.children, ...Array(v - r.children.length).fill(null)] : r.children.slice(0, v) })} />
                {r.children.map((age, k) => (
                  <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                    Child {k + 1} age
                    <select className="c-select" style={{ width: 80, borderColor: age == null ? 'var(--c-danger)' : undefined }}
                      value={age == null ? '' : String(age)} aria-required
                      onChange={(e) => setRoom(i, { ...r, children: r.children.map((x, j) => (j === k ? (e.target.value === '' ? null : Number(e.target.value)) : x)) })}>
                      <option value="">Age</option>
                      {Array.from({ length: 18 }, (_, n) => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </label>
                ))}
                {q.rooms.length > 1 && (
                  <button type="button" className="c-btn c-btn-danger" style={{ marginLeft: 'auto' }}
                    onClick={() => setQ({ ...q, rooms: q.rooms.filter((_, j) => j !== i) })}>Remove</button>
                )}
              </div>
            ))}
          </div>
          {q.rooms.length < MAX_ROOMS && (
            <button type="button" className="c-btn" style={{ marginTop: 8 }} onClick={() => setQ({ ...q, rooms: [...q.rooms, { adults: 2, children: [] }] })}>
              <Plus size={14} /> Add room
            </button>
          )}
        </div>

        <div>
          <button type="submit" className="c-btn c-btn-primary" disabled={searching}>
            <Search size={14} /> {searching ? 'Searching Hotelbeds…' : 'Search availability'}
          </button>
        </div>
      </div>
    </form>
  );
}

function Counter({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
      {label}
      <button type="button" className="c-btn" style={{ padding: '3px 6px' }} aria-label={`Fewer ${label.toLowerCase()}`} disabled={value <= min} onClick={() => onChange(value - 1)}><Minus size={12} /></button>
      <strong style={{ minWidth: 14, textAlign: 'center' }}>{value}</strong>
      <button type="button" className="c-btn" style={{ padding: '3px 6px' }} aria-label={`More ${label.toLowerCase()}`} disabled={value >= max} onClick={() => onChange(value + 1)}><Plus size={12} /></button>
    </span>
  );
}

// ─── results ──────────────────────────────────────────────────────────────

function Results({ results, page, setPage, onChoose, showNet }: {
  results: { hotels: HbxHotel[]; query: SearchQuery; sourceMarket: string | null };
  page: number; setPage: (n: number) => void; onChoose: (h: HbxHotel, r: HbxRate) => void; showNet: boolean;
}) {
  const { hotels, query, sourceMarket } = results;
  const pages = Math.max(1, Math.ceil(hotels.length / PAGE_SIZE));
  const shown = hotels.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  if (hotels.length === 0) {
    return <div className="c-card"><div className="c-empty"><div className="c-empty-title">No Hotelbeds availability</div>Try other dates or another destination.</div></div>;
  }
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, fontSize: 13 }}>
        <span>
          <strong>{hotels.length}</strong> hotels with Hotelbeds rates · {day(query.checkIn)} → {day(query.checkOut)} ({nights(query.checkIn, query.checkOut)} nights) ·{' '}
          {query.rooms.length} room{query.rooms.length > 1 ? 's' : ''}
          {' · '}
          {sourceMarket ? <strong>Prices for source market {sourceMarket}</strong> : <span>Prices for the account&apos;s default market</span>}
        </span>
        <Pager page={page} pages={pages} setPage={setPage} />
      </div>
      {shown.map((h) => <HotelCard key={h.code} hotel={h} query={query} onChoose={onChoose} showNet={showNet} sourceMarket={sourceMarket} />)}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}><Pager page={page} pages={pages} setPage={setPage} /></div>
    </div>
  );
}

function Pager({ page, pages, setPage }: { page: number; pages: number; setPage: (n: number) => void }) {
  return (
    <nav aria-label="Result pages" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
      <button className="c-btn" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</button>
      <span>Page {page + 1} of {pages}</span>
      <button className="c-btn" disabled={page >= pages - 1} onClick={() => setPage(page + 1)}>Next</button>
    </nav>
  );
}

function HotelCard({ hotel, query, onChoose, showNet, sourceMarket }: {
  hotel: HbxHotel; query: SearchQuery; onChoose: (h: HbxHotel, r: HbxRate) => void; showNet: boolean; sourceMarket: string | null;
}) {
  const [all, setAll] = useState(false);
  const rates = useMemo(() => hotel.rates.slice().sort((a, b) => a.totalRate.amount - b.totalRate.amount), [hotel.rates]);
  const shown = all ? rates : rates.slice(0, RATES_SHOWN);
  const n = nights(query.checkIn, query.checkOut);
  return (
    <div className="c-card">
      <div className="c-card-head" style={{ alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700 }}>{hotel.name}</div>
          <div style={{ fontSize: 13, color: 'var(--c-fg-soft)', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <Stars n={starsOf(hotel.categoryCode, hotel.categoryName)} />
            <span>{hotel.categoryName || hotel.categoryCode || 'Category not stated'}</span>
            <span>·</span>
            <span>{[hotel.zoneName, hotel.destinationName].filter(Boolean).join(', ')}</span>
            <span>·</span>
            <span className="c-mono">Hotelbeds code {hotel.code}</span>
          </div>
        </div>
        <span className="c-pill c-pill-muted">{rates.length} rate{rates.length === 1 ? '' : 's'}</span>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table className="c-table">
          <thead>
            <tr>
              <th>Room type</th>
              <th>Board</th>
              <th>Rooms &amp; dates</th>
              <th>Cancellation</th>
              <th>Promotions &amp; offers</th>
              <th style={{ textAlign: 'right' }}>Price</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.rateKey} className="c-rate-row">
                <td>
                  <div style={{ fontWeight: 600 }}>{r.roomTypeName}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--c-fg-muted)' }}>
                    <span className="c-mono">{r.roomTypeCode}</span> · {r.rateType}{r.rateClass ? ` · ${r.rateClass}` : ''}
                  </div>
                </td>
                <td>{r.boardName || r.boardCode || 'Room only'}</td>
                <td style={{ whiteSpace: 'nowrap', fontSize: 13 }}>
                  {r.roomCount} room{r.roomCount === 1 ? '' : 's'}<br />
                  {day(query.checkIn)} →<br />{day(query.checkOut)}
                </td>
                <td style={{ minWidth: 230 }}>
                  <RefundPill refundable={r.refundable} nonRefundable={r.nonRefundable} />
                  <div style={{ marginTop: 4 }}><Penalties penalties={r.cancellationPenalties} compact /></div>
                </td>
                <td style={{ fontSize: 12.5, minWidth: 160 }}>
                  {(r.promotions || []).map((p, i) => (
                    <div key={`p${i}`}><span className="c-pill c-pill-warn" style={{ marginBottom: 2 }}>Promotion</span> {p.name || p.code}{p.remark ? ` — ${p.remark}` : ''}</div>
                  ))}
                  {(r.offers || []).map((o, i) => (
                    <div key={`o${i}`}><span className="c-pill c-pill-success" style={{ marginBottom: 2 }}>Offer</span> {o.name || o.code} ({amount(o.amount, r.totalRate.currency)})</div>
                  ))}
                  {!(r.promotions?.length || r.offers?.length) && <span style={{ color: 'var(--c-fg-muted)' }}>—</span>}
                </td>
                <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                  <div style={{ fontSize: 15, fontWeight: 700 }}>{money(r.totalRate)}</div>
                  <div style={{ fontSize: 12, color: 'var(--c-fg-soft)' }}>{money(r.nightlyRate)} / night · {n} nights</div>
                  {sourceMarket && <div style={{ fontSize: 11.5, color: 'var(--c-fg-muted)' }}>Source market {sourceMarket}</div>}
                  {r.grossTotal != null && <div style={{ fontSize: 11.5, color: 'var(--c-fg-muted)' }}>offers already deducted</div>}
                  {r.sellingRateFloorApplied && <div style={{ fontSize: 11.5, color: 'var(--c-warn)' }}>Hotel&apos;s minimum selling price</div>}
                  {showNet && r._admin?.net && (
                    <div style={{ fontSize: 11, color: 'var(--c-fg-muted)' }}>
                      net {amount(r._admin.net.totalAmount, r._admin.net.currency)} + markup {amount(r._admin.markup?.amount ?? 0, r.totalRate.currency)}
                    </div>
                  )}
                </td>
                <td><button className="c-btn c-btn-primary" onClick={() => onChoose(hotel, r)}>Select</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rates.length > RATES_SHOWN && (
        <div style={{ padding: '10px 16px', borderTop: '1px solid var(--c-line-soft)' }}>
          <button className="c-btn" onClick={() => setAll(!all)}>{all ? 'Show fewer rates' : `Show all ${rates.length} rates`}</button>
        </div>
      )}
    </div>
  );
}

// ─── review + book ────────────────────────────────────────────────────────

function BookStep({ sel, query, sourceMarket, showNet, onBack, onBooked }: {
  sel: Selected; query: SearchQuery; sourceMarket: string | null; showNet: boolean; onBack: () => void; onBooked: (c: Confirmation) => void;
}) {
  const [holder, setHolder] = useState({ firstName: '', lastName: '', email: '' });
  const [roomGuests, setRoomGuests] = useState(query.rooms.map(() => ({ firstName: '', lastName: '' })));
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const r = sel.price;
  const n = nights(query.checkIn, query.checkOut);

  // Room 1's guest defaults to the holder (the holder is the lead passenger).
  const guestFor = (i: number) => (i === 0 && !roomGuests[0].firstName && !roomGuests[0].lastName
    ? { firstName: holder.firstName, lastName: holder.lastName } : roomGuests[i]);
  const namesOk = holder.firstName.trim() && holder.lastName.trim()
    && query.rooms.every((_, i) => guestFor(i).firstName.trim() && guestFor(i).lastName.trim());
  const canConfirm = !!namesOk && ack && !busy && !sel.commentsLoading;

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      const res = await hbx<any>('bookings', {
        method: 'POST',
        body: {
          rateKey: sel.bookingRateKey,
          holder: { firstName: holder.firstName.trim(), lastName: holder.lastName.trim(), ...(holder.email.trim() ? { email: holder.email.trim() } : {}) },
          roomGuests: query.rooms.map((_, i) => ({ firstName: guestFor(i).firstName.trim(), lastName: guestFor(i).lastName.trim() })),
          checkIn: query.checkIn,
          checkOut: query.checkOut,
          guests: query.rooms.map((x) => ({ adults: x.adults, children: x.children as number[] })),
        },
      });
      if (!res.reference) throw new Error(res.message || 'Hotelbeds did not return a booking reference');
      onBooked({ reference: res.reference, clientReference: res.clientReference, status: res.status, internalBookingId: res.internalBookingId });
    } catch (e) {
      // Never resubmit automatically: a failed confirmation may still have
      // booked. The engine checks by agency reference before reporting.
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.25fr) minmax(0, 1fr)', gap: 16, alignItems: 'start' }} className="hbx-book-grid">
      <style>{`@media (max-width: 960px) { .hbx-book-grid { grid-template-columns: 1fr !important; } }`}</style>
      <div className="c-card">
        <div className="c-card-head"><h2 className="c-card-title">Review before confirming</h2><button className="c-btn" onClick={onBack}>Choose another rate</button></div>
        <div style={{ padding: 16, display: 'grid', gap: 14 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>{sel.hotel.name}</div>
            <div style={{ fontSize: 13, color: 'var(--c-fg-soft)' }}>
              <Stars n={starsOf(sel.hotel.categoryCode, sel.hotel.categoryName)} /> {sel.hotel.categoryName} · {[sel.hotel.zoneName, sel.hotel.destinationName].filter(Boolean).join(', ')}
            </div>
          </div>
          {/* Certification 3.9: rate comments before confirmation, first thing in the review. */}
          <RateComments text={sel.rateComments} loading={sel.commentsLoading} />
          <table className="c-table" style={{ border: '1px solid var(--c-line-soft)' }}>
            <tbody>
              <tr><td style={{ width: 160, fontWeight: 600 }}>Room type</td><td>{r.roomTypeName}</td></tr>
              <tr><td style={{ fontWeight: 600 }}>Board</td><td><strong>{r.boardName || r.boardCode || 'Room only'}</strong></td></tr>
              <tr><td style={{ fontWeight: 600 }}>Dates</td><td>{day(query.checkIn)} → {day(query.checkOut)} ({n} nights)</td></tr>
              <tr><td style={{ fontWeight: 600 }}>Rooms</td><td>{query.rooms.map((x, i) => `Room ${i + 1}: ${x.adults} adult${x.adults > 1 ? 's' : ''}${x.children.length ? `, children aged ${x.children.join(', ')}` : ''}`).join(' · ')}</td></tr>
              <tr>
                <td style={{ fontWeight: 600 }}>Total price</td>
                <td>
                  <span style={{ fontSize: 18, fontWeight: 700 }}>{money(r.totalRate)}</span>
                  <span style={{ fontSize: 12.5, color: 'var(--c-fg-soft)' }}> · {money(r.nightlyRate)} per night</span>
                  {sourceMarket && <div style={{ fontSize: 12 }}>Price for source market {sourceMarket}</div>}
                  {sel.priceChanged && <div style={{ fontSize: 12.5, color: 'var(--c-warn)', fontWeight: 600 }}>CheckRate changed the price; this is the new price.</div>}
                  {r.sellingRateFloorApplied && <div style={{ fontSize: 12, color: 'var(--c-warn)' }}>Shown at the hotel&apos;s minimum selling price.</div>}
                  {showNet && r._admin?.net && <div style={{ fontSize: 11.5, color: 'var(--c-fg-muted)' }}>net {amount(r._admin.net.totalAmount, r._admin.net.currency)}</div>}
                </td>
              </tr>
              {!!r.taxes?.excluded?.length && (
                <tr><td style={{ fontWeight: 600 }}>Payable at hotel</td><td>{r.taxes.excluded.map((t, i) => <div key={i}>{t.name}: {amount(t.amount, t.currency)}</div>)}</td></tr>
              )}
              <tr>
                <td style={{ fontWeight: 600 }}>Cancellation</td>
                <td><RefundPill refundable={r.refundable} nonRefundable={r.nonRefundable} /><div style={{ marginTop: 6 }}><Penalties penalties={r.cancellationPenalties} /></div></td>
              </tr>
              {(r.promotions?.length || r.offers?.length) ? (
                <tr><td style={{ fontWeight: 600 }}>Promotions &amp; offers</td><td>
                  {(r.promotions || []).map((p, i) => <div key={`p${i}`}>{p.name || p.code}{p.remark ? ` — ${p.remark}` : ''}</div>)}
                  {(r.offers || []).map((o, i) => <div key={`o${i}`}>{o.name || o.code} ({amount(o.amount, r.totalRate.currency)}, already deducted)</div>)}
                </td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      <form className="c-card" onSubmit={(e) => { e.preventDefault(); if (canConfirm) confirm(); }}>
        <div className="c-card-head"><h2 className="c-card-title">Guests</h2></div>
        <div style={{ padding: 16, display: 'grid', gap: 14 }}>
          <fieldset style={{ border: 0, padding: 0, margin: 0, display: 'grid', gap: 8 }}>
            <legend className="c-label">Holder (lead passenger)</legend>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <input className="c-input" aria-label="Holder first name" placeholder="First name" value={holder.firstName} maxLength={50} onChange={(e) => setHolder({ ...holder, firstName: e.target.value })} />
              <input className="c-input" aria-label="Holder last name" placeholder="Last name" value={holder.lastName} maxLength={50} onChange={(e) => setHolder({ ...holder, lastName: e.target.value })} />
            </div>
            <input className="c-input" type="email" aria-label="Holder email (optional)" placeholder="Email (optional)" value={holder.email} onChange={(e) => setHolder({ ...holder, email: e.target.value })} />
          </fieldset>

          {query.rooms.map((room, i) => (
            <fieldset key={i} style={{ border: '1px solid var(--c-line-soft)', borderRadius: 6, padding: 10, margin: 0, display: 'grid', gap: 8 }}>
              <legend style={{ fontSize: 12.5, fontWeight: 700, padding: '0 4px' }}>
                Room {i + 1} · {room.adults} adult{room.adults > 1 ? 's' : ''}{room.children.length ? ` · children aged ${room.children.join(', ')}` : ''}
              </legend>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <input className="c-input" aria-label={`Room ${i + 1} guest first name`} placeholder={i === 0 ? 'First name (defaults to holder)' : 'First name'}
                  value={roomGuests[i].firstName} maxLength={50}
                  onChange={(e) => setRoomGuests(roomGuests.map((g, j) => (j === i ? { ...g, firstName: e.target.value } : g)))} />
                <input className="c-input" aria-label={`Room ${i + 1} guest last name`} placeholder={i === 0 ? 'Last name (defaults to holder)' : 'Last name'}
                  value={roomGuests[i].lastName} maxLength={50}
                  onChange={(e) => setRoomGuests(roomGuests.map((g, j) => (j === i ? { ...g, lastName: e.target.value } : g)))} />
              </div>
            </fieldset>
          ))}

          <div style={{ fontSize: 12.5, color: 'var(--c-fg-soft)' }}>
            <strong>Agency reference:</strong> generated by us when you confirm (FC + our booking number) and printed on the voucher.
          </div>

          <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13 }}>
            <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} style={{ marginTop: 3 }} />
            <span>I have read the rate comments, the cancellation policy, the board and the total price.</span>
          </label>

          {error && <div className="c-error">{error} — do not book again until the booking list confirms nothing was made.</div>}

          <button type="submit" className="c-btn c-btn-primary" disabled={!canConfirm}
            style={{ justifyContent: 'center', padding: '10px 14px', fontSize: 14, opacity: canConfirm ? 1 : 0.45, cursor: canConfirm ? 'pointer' : 'not-allowed' }}>
            {busy ? 'Confirming with Hotelbeds…' : `Confirm test booking · ${money(r.totalRate)}`}
          </button>
          {!namesOk && <div style={{ fontSize: 12, color: 'var(--c-fg-muted)' }}>Enter the holder and one guest name per room.</div>}
        </div>
      </form>
    </div>
  );
}

function Confirmed({ c, sel, onNew }: { c: Confirmation; sel: Selected; onNew: () => void }) {
  return (
    <div className="c-card">
      <div className="c-card-head"><h2 className="c-card-title">Booking confirmed (test)</h2></div>
      <div style={{ padding: 16, display: 'grid', gap: 12 }}>
        <div style={{ fontSize: 15 }}>
          <strong>{sel.hotel.name}</strong> · {sel.price.roomTypeName} · {sel.price.boardName || sel.price.boardCode}
        </div>
        <table className="c-table" style={{ maxWidth: 560, border: '1px solid var(--c-line-soft)' }}>
          <tbody>
            <tr><td style={{ width: 200, fontWeight: 600 }}>Hotelbeds reference</td><td className="c-mono">{c.reference}</td></tr>
            <tr><td style={{ fontWeight: 600 }}>Agency reference</td><td className="c-mono">{c.clientReference}</td></tr>
            <tr><td style={{ fontWeight: 600 }}>Status</td><td><span className="c-pill c-pill-success"><span className="dot" />{c.status}</span></td></tr>
          </tbody>
        </table>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Link className="c-btn c-btn-primary" href={`/console/hotelbeds/voucher/${encodeURIComponent(c.reference)}`}>Open voucher</Link>
          <Link className="c-btn" href={`/console/hotelbeds/bookings/${encodeURIComponent(c.reference)}`}>Booking detail &amp; cancel</Link>
          <button className="c-btn" onClick={onNew}>New search</button>
        </div>
      </div>
    </div>
  );
}
