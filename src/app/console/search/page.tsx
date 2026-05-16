'use client';

import { useState } from 'react';
import { Search, Star, MapPin, Loader2, X, Sparkles } from 'lucide-react';
import AgentPanel from './AgentPanel';

// Prompt pills the consultant can tap to pre-fill the form. v1 is just
// presets — once the MCP/LLM piece lands these become real prompts that
// the agent parses into destination + dates + guests.
const PROMPT_PILLS: Array<{ label: string; q: string; nights: number; adults: number; rooms: number }> = [
  { label: 'Beach hotels in Dubai · 3 nights · 2 adults',  q: 'Dubai',        nights: 3, adults: 2, rooms: 1 },
  { label: 'Luxury LA · 2 nights · 2 adults',              q: 'Los Angeles',  nights: 2, adults: 2, rooms: 1 },
  { label: 'Maldives villas · 5 nights · 2 adults',        q: 'Maldives',     nights: 5, adults: 2, rooms: 1 },
  { label: 'Family Bali · 6 nights · 2 adults + 2 kids',   q: 'Bali',         nights: 6, adults: 2, rooms: 1 }
];

type HotelHit = {
  id: number;
  name: string;
  city?: string;
  country?: string;
  starRating?: number;
  image?: string | null;
  sources: string[];
};

type AdminRate = {
  supplier: string;
  rateKey: string;
  roomTypeName: string;
  ratePlan: string;
  refundable: boolean;
  breakfastIncluded: boolean;
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
  const [q, setQ]                 = useState('');
  const [checkIn, setCheckIn]     = useState(todayPlus(30));
  const [checkOut, setCheckOut]   = useState(todayPlus(33));
  const [adults, setAdults]       = useState(2);
  const [rooms, setRooms]         = useState(1);

  const [hits, setHits]           = useState<HotelHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchErr, setSearchErr] = useState<string | null>(null);

  const [selected, setSelected]   = useState<HotelHit | null>(null);
  const [rates, setRates]         = useState<AdminRate[]>([]);
  const [ratesBusy, setRatesBusy] = useState(false);
  const [ratesErr, setRatesErr]   = useState<string | null>(null);
  const [expanded, setExpanded]   = useState(false);
  const [chosenRate, setChosenRate] = useState<AdminRate | null>(null);

  async function runSearch(qOverride?: string) {
    const query = qOverride !== undefined ? qOverride : q;
    setSearching(true);
    setSearchErr(null);
    setHits([]);
    try {
      const res = await fetch('/api/admin/search/hotels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ q: query, limit: 20 })
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'search failed');
      setHits(json.data.hits || []);
    } catch (e: any) {
      setSearchErr(e.message || 'search failed');
    } finally {
      setSearching(false);
    }
  }

  async function openHotel(h: HotelHit) {
    setSelected(h);
    setExpanded(false);
    setChosenRate(null);
    setRatesBusy(true);
    setRatesErr(null);
    setRates([]);
    try {
      const qs = new URLSearchParams({
        checkIn, checkOut,
        adults: String(adults),
        rooms: String(rooms)
      });
      const res = await fetch(`/api/admin/search/rates/${h.id}?${qs.toString()}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'rates failed');
      setRates(json.data.rates || []);
    } catch (e: any) {
      setRatesErr(e.message || 'rates failed');
    } finally {
      setRatesBusy(false);
    }
  }

  function closeSidebar() {
    setSelected(null);
    setExpanded(false);
    setChosenRate(null);
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 380px', gap: 20, alignItems: 'start' }}>
      <div>
      <div className="c-page-head">
        <div>
          <h1 className="c-page-title">B2B Search</h1>
          <p className="c-page-sub">
            Find hotels, see net cost + markup + sell price per rate, book on behalf of the customer.
          </p>
        </div>
      </div>

      {/* Prompt pills (UI placeholder — MCP agent will parse them later) */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <Sparkles size={14} style={{ color: 'var(--c-accent)' }} />
          <span style={{ fontSize: 12, color: 'var(--c-fg-muted)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
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
                setAdults(p.adults);
                setRooms(p.rooms);
                runSearch(p.q);
              }}
              style={{
                border: '1px solid var(--c-line)',
                borderRadius: 999,
                padding: '6px 12px',
                fontSize: 12,
                background: 'var(--c-bg)',
                color: 'var(--c-fg-soft)',
                cursor: 'pointer'
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Search form */}
      <div className="c-card" style={{ padding: 18, marginBottom: 20 }}>
        <form
          onSubmit={(e) => { e.preventDefault(); runSearch(); }}
          style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 90px 90px 110px', gap: 12, alignItems: 'end' }}
        >
          <div>
            <label style={labelStyle}>Destination or hotel name</label>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. Dubai, Conrad LA" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Check-in</label>
            <input type="date" value={checkIn} onChange={(e) => setCheckIn(e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Check-out</label>
            <input type="date" value={checkOut} onChange={(e) => setCheckOut(e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Adults</label>
            <input type="number" min={1} max={10} value={adults} onChange={(e) => setAdults(+e.target.value || 1)} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Rooms</label>
            <input type="number" min={1} max={9} value={rooms} onChange={(e) => setRooms(+e.target.value || 1)} style={inputStyle} />
          </div>
          <button type="submit" className="c-btn c-btn-primary" disabled={searching}>
            {searching ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
            {searching ? 'Searching…' : 'Search'}
          </button>
        </form>
      </div>

      {searchErr && <div style={{ color: 'var(--c-danger)', fontSize: 13, marginBottom: 14 }}>Error: {searchErr}</div>}

      {hits.length === 0 && !searching && (
        <div className="c-card" style={{ padding: 32, textAlign: 'center', color: 'var(--c-fg-muted)', fontSize: 13 }}>
          Type a destination or hotel name above to begin.
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 10 }}>
        {hits.map((h) => (
          <button
            key={h.id}
            onClick={() => openHotel(h)}
            className="c-card"
            style={{
              display: 'grid',
              gridTemplateColumns: '120px 1fr auto',
              gap: 16,
              alignItems: 'center',
              padding: 14,
              textAlign: 'left',
              cursor: 'pointer',
              background: selected?.id === h.id ? 'var(--c-accent-soft)' : 'var(--c-bg)',
              border: selected?.id === h.id ? '1px solid var(--c-accent)' : '1px solid var(--c-line)'
            }}
          >
            <div style={{
              width: 120, height: 80, borderRadius: 8, overflow: 'hidden',
              background: 'var(--c-bg-soft)',
              backgroundImage: h.image ? `url(${h.image})` : undefined,
              backgroundSize: 'cover', backgroundPosition: 'center'
            }} />
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
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              {h.sources.map((s) => (
                <span key={s} style={badgeStyle(s)}>{s}</span>
              ))}
            </div>
          </button>
        ))}
      </div>

      {/* Slide-out right sidebar — expands when "Book on behalf" is clicked
          so the booking form has room. */}
      {selected && (
        <div
          style={{
            position: 'fixed', top: 0, right: 0, bottom: 0,
            width: expanded ? 'min(720px, 90vw)' : 'min(440px, 90vw)',
            background: 'var(--c-bg)',
            borderLeft: '1px solid var(--c-line)',
            boxShadow: '-12px 0 24px rgba(0,0,0,0.06)',
            transition: 'width 200ms ease',
            display: 'flex', flexDirection: 'column',
            zIndex: 50
          }}
        >
          <div style={{ padding: 18, borderBottom: '1px solid var(--c-line)', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 15, fontWeight: 600 }}>{selected.name}</div>
              <div style={{ fontSize: 12, color: 'var(--c-fg-soft)', marginTop: 2 }}>
                {[selected.city, selected.country].filter(Boolean).join(', ')}
                {' · '}
                {checkIn} → {checkOut} · {adults} adult{adults > 1 ? 's' : ''} · {rooms} room{rooms > 1 ? 's' : ''}
              </div>
            </div>
            <button onClick={closeSidebar} style={iconBtnStyle} aria-label="Close">
              <X size={16} />
            </button>
          </div>

          <div style={{ flex: 1, overflow: 'auto', padding: 18 }}>
            {ratesBusy && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--c-fg-soft)', fontSize: 13 }}>
                <Loader2 size={14} className="animate-spin" /> Fetching rates…
              </div>
            )}
            {ratesErr && <div style={{ color: 'var(--c-danger)', fontSize: 13 }}>Error: {ratesErr}</div>}

            {!ratesBusy && !ratesErr && rates.length === 0 && (
              <div style={{ color: 'var(--c-fg-muted)', fontSize: 13 }}>No rates returned for these dates.</div>
            )}

            {!expanded && rates.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {rates.map((r, i) => (
                  <div key={i} className="c-card" style={{ padding: 12 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>{r.roomTypeName}</div>
                    <div style={{ fontSize: 11, color: 'var(--c-fg-soft)', marginBottom: 8 }}>
                      {r.ratePlan} · {r.refundable
                        ? <span style={{ color: 'var(--c-success)' }}>Refundable</span>
                        : <span style={{ color: 'var(--c-danger)' }}>Non-refundable</span>} · {r.supplier}
                    </div>
                    <div style={{
                      display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6,
                      fontSize: 11, fontFamily: 'var(--c-mono)',
                      background: 'var(--c-bg-soft)', borderRadius: 6, padding: '8px 10px'
                    }}>
                      <div>
                        <div style={priceLabelStyle}>NET</div>
                        <div style={{ fontWeight: 600 }}>{fmt(r.pricing.net?.totalAmount)} {r.pricing.currency}</div>
                      </div>
                      <div>
                        <div style={priceLabelStyle}>+ MARKUP</div>
                        <div style={{ fontWeight: 600 }}>{fmt(r.pricing.markup?.amount)} ({r.pricing.markup?.value ?? 0}%)</div>
                      </div>
                      <div>
                        <div style={priceLabelStyle}>SELL</div>
                        <div style={{ fontWeight: 700, color: 'var(--c-accent)' }}>
                          {fmt(r.pricing.sell?.totalAmount)} {r.pricing.currency}
                        </div>
                      </div>
                    </div>
                    <button
                      className="c-btn c-btn-primary"
                      style={{ marginTop: 10, width: '100%', justifyContent: 'center' }}
                      onClick={() => { setChosenRate(r); setExpanded(true); }}
                    >
                      Book on behalf
                    </button>
                  </div>
                ))}
              </div>
            )}

            {expanded && chosenRate && (
              <div>
                <button
                  onClick={() => setExpanded(false)}
                  style={{ ...iconBtnStyle, marginBottom: 14, padding: '4px 10px', fontSize: 12 }}
                >
                  ← Back to rates
                </button>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Booking on behalf of customer</div>
                <div style={{ fontSize: 12, color: 'var(--c-fg-soft)', marginBottom: 14 }}>
                  {chosenRate.roomTypeName} · {chosenRate.ratePlan} · {fmt(chosenRate.pricing.sell?.totalAmount)} {chosenRate.pricing.currency}
                </div>
                <div style={{ display: 'grid', gap: 10 }}>
                  <div>
                    <label style={labelStyle}>Customer first name</label>
                    <input style={inputStyle} placeholder="First name" />
                  </div>
                  <div>
                    <label style={labelStyle}>Customer last name</label>
                    <input style={inputStyle} placeholder="Last name" />
                  </div>
                  <div>
                    <label style={labelStyle}>Customer email</label>
                    <input style={inputStyle} type="email" placeholder="customer@example.com" />
                  </div>
                  <div>
                    <label style={labelStyle}>Customer phone</label>
                    <input style={inputStyle} type="tel" placeholder="+61 ..." />
                  </div>
                  <button
                    className="c-btn c-btn-primary"
                    disabled
                    title="POST /api/admin/bookings — coming next"
                    style={{ marginTop: 6, justifyContent: 'center', opacity: 0.55 }}
                  >
                    Confirm booking (endpoint pending)
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      </div>

      {/* Right-side agent chat. Stays out of the way until the consultant
          asks something. When the agent runs search_hotels its hits
          hydrate the canvas on the left via onHotelsFound. */}
      <div style={{ position: 'sticky', top: 52, alignSelf: 'start' }}>
        <AgentPanel onHotelsFound={(found) => {
          setHits(found.map((h: any) => ({
            id: h.id, name: h.name, city: h.city, country: h.country,
            starRating: h.starRating, image: h.image, sources: h.sources || []
          })));
        }} />
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 11, color: 'var(--c-fg-muted)', textTransform: 'uppercase',
  letterSpacing: '0.04em', marginBottom: 4
};
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '7px 10px', fontSize: 13,
  border: '1px solid var(--c-line)', borderRadius: 6, background: 'var(--c-bg)', color: 'var(--c-fg)'
};
const iconBtnStyle: React.CSSProperties = {
  border: '1px solid var(--c-line)', borderRadius: 6, background: 'var(--c-bg)', cursor: 'pointer',
  padding: 6, color: 'var(--c-fg-soft)'
};
const priceLabelStyle: React.CSSProperties = {
  fontSize: 10, color: 'var(--c-fg-muted)', letterSpacing: '0.04em', marginBottom: 2
};
function badgeStyle(supplier: string): React.CSSProperties {
  const map: Record<string, string> = { ratehawk: '#1f6feb', hummingbird: '#7c3aed' };
  const color = map[supplier] || '#525252';
  return {
    fontSize: 10, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase',
    color, border: `1px solid ${color}33`, background: `${color}11`, padding: '3px 8px', borderRadius: 999
  };
}
function fmt(n?: number) {
  if (n === undefined || n === null || isNaN(n)) return '—';
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
