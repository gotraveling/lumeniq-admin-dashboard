'use client';

/**
 * /console/offers — Offer discovery reports.
 *
 * Finding deals across a region is otherwise a manual slog through supplier
 * sheets. This page runs a MATRIX of live queries — the selected hotels ×
 * check-in months × stay-lengths — extracts the offer on each cheapest rate
 * (promo name, discount %, net/sell, board, transfer), and SAVES the assembled
 * result so it's browsable later without re-querying.
 *
 * Generation runs client-side (same admin rates endpoint as the Discount
 * Scanner) with bounded concurrency + a progress bar, then POSTs the report to
 * the booking-engine to persist it. All figures are data-driven; nothing is
 * fabricated.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Tag, Loader2, Search, Trash2, ArrowLeft, RefreshCw, Link as LinkIcon, FolderOpen } from 'lucide-react';

// ── Types ────────────────────────────────────────────────────────────────────
type Hotel = { id: number; name: string; city?: string; country?: string };
type Row = {
  hotelId: string; hotelName: string; region: string | null;
  checkIn: string; nights: number;
  promoName: string | null; discountPct: number | null;
  netTotal: number | null; sellTotal: number | null; currency: string | null;
  board: string | null; transfer: string | null; refundable: boolean | null; supplier: string | null;
  // From a discovery run. minNightsIsFloor travels with the number: it says the
  // shortest stay probed WAS the answer, so the real minimum may be lower.
  // Without it an observation reads as a contractual term, which is the mistake
  // this whole feature exists to stop.
  minNightsObserved?: number | null; minNightsIsFloor?: boolean | null;
  packageSummary?: string | null; packageInclusions?: string | null;
};
type ReportParams = {
  months?: string[];
  stayLengths?: number[];
  hotelIds?: number[];
  adults?: number;
};
type ReportMeta = {
  id: number; name: string; region: string | null; params: ReportParams | null;
  rowCount: number; offerCount: number; createdBy: string | null; createdAt: string;
};
type Report = ReportMeta & { rows: Row[] };
type AdminRate = {
  pricing?: {
    net?: { aud?: { totalAmount?: number }; totalAmount?: number };
    aud?: { totalAmount?: number };
    sell?: { totalAmount?: number };
    currency?: string;
  };
  grossTotal?: number;
  discountAmount?: number;
  offers?: { name?: string | null }[];
  ratePlan?: string | null;
  transfer?: string | null;
  refundable?: boolean | null;
  supplier?: string | null;
};
type HotelHit = { id: number; name: string; city?: string; country?: string };
type MonthlyRate = {
  month: string;
  checkIn: string;
  nights: number;
  fromTotal: number;
  fromNightly: number | null;
  supplierWasTotal: number | null;
  currency: string | null;
  supplier: string | null;
  board: string | null;
  transfer: string | null;
  freeCancellation: boolean | null;
  offerName: string | null;
};
type MonthlyHotel = {
  months: MonthlyRate[];
  bestMonth: string | null;
  bestTotal: number | null;
  swingPct: number | null;
  dearestMonth: string | null;
};
type MonthlyScout = {
  los: number | null;
  occupancy: string;
  channel: string;
  results: Record<string, MonthlyHotel>;
  missing?: number[];
};

// ── Helpers ──────────────────────────────────────────────────────────────────
// Next 12 months as { key: 'YYYY-MM', label, checkIn: 'YYYY-MM-15' }. A mid-month
// check-in is a fair representative sample of the month's pricing/offers.
function nextMonths(n = 12) {
  const out: { key: string; label: string; checkIn: string }[] = [];
  const now = new Date();
  for (let i = 0; i < n; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 15);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    out.push({ key, label: d.toLocaleDateString('en-AU', { month: 'short', year: 'numeric' }), checkIn: `${key}-15` });
  }
  return out;
}
function addNights(iso: string, nights: number) {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + nights);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function fmtMoney(n?: number | null) {
  if (n == null || isNaN(n)) return '—';
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}
function boardOf(ratePlan?: string) {
  return String(ratePlan || '').split('·')[0].trim() || null;
}
function messageOf(e: unknown, fallback: string) {
  return e instanceof Error ? e.message : fallback;
}

// Run tasks with bounded concurrency, calling onTick after each completes.
async function runPool<T>(items: T[], limit: number, worker: (item: T, i: number) => Promise<void>, onTick: () => void) {
  let idx = 0;
  async function next(): Promise<void> {
    const i = idx++;
    if (i >= items.length) return;
    try { await worker(items[i], i); } catch { /* skip failed combo */ }
    onTick();
    return next();
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => next()));
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Fetch one combo's rates with rate-limit-aware retry. The booking engine
// surfaces supplier throttling as HTTP 429 or {error:'rate_limit'} — on either,
// back off (exponential + jitter) and retry rather than dropping the combo, so
// a big matrix never fails a hotel just because we queried too fast. Returns
// { rates, throttled } — throttled=true if we hit a limit at all (for the UI).
async function fetchRatesRetry(hotelId: number, qs: string, maxTries = 5): Promise<{ rates: AdminRate[]; throttled: boolean }> {
  let throttled = false;
  for (let attempt = 0; attempt < maxTries; attempt++) {
    try {
      const res = await fetch(`/api/admin/search/rates/${hotelId}?${qs}`);
      const json = await res.json().catch(() => ({}));
      const limited = res.status === 429 || json?.error === 'rate_limit' || json?.error === 'endpoint_exceeded_limit';
      if (limited) {
        throttled = true;
        // 1.5s, 3s, 6s, 12s (+ up to 1s jitter)
        await sleep(1500 * Math.pow(2, attempt) + Math.random() * 1000);
        continue;
      }
      return { rates: json?.data?.rates || [], throttled };
    } catch {
      await sleep(1000 * (attempt + 1));
    }
  }
  return { rates: [], throttled };
}

const STAY_OPTIONS = [1, 2, 3, 4, 5, 7, 10];

export default function OffersPage() {
  const [view, setView] = useState<'list' | 'detail'>('list');
  const [reports, setReports] = useState<ReportMeta[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [current, setCurrent] = useState<Report | null>(null);

  // ── New-report form state ──
  const months = useMemo(() => nextMonths(12), []);
  const [dest, setDest] = useState('');
  const [hotels, setHotels] = useState<Hotel[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [searching, setSearching] = useState(false);
  const [selMonths, setSelMonths] = useState<string[]>(months.slice(0, 6).map((m) => m.key));
  const [selStays, setSelStays] = useState<number[]>([5, 7]);
  const [customStay, setCustomStay] = useState('');
  const [adults, setAdults] = useState(2);
  const [gen, setGen] = useState<{ running: boolean; done: number; total: number; throttled: number } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // Add an arbitrary stay length (1–60 nights) so Tina isn't limited to the presets.
  const addCustomStay = () => {
    const n = Math.round(Number(customStay));
    if (!Number.isFinite(n) || n < 1 || n > 60) return;
    setSelStays((s) => (s.includes(n) ? s : [...s, n].sort((a, b) => a - b)));
    setCustomStay('');
  };

  // Deep-link: on mount, open a report if ?report=ID is in the URL (shareable /
  // refreshable). openReport/back keep the URL in sync.
  useEffect(() => {
    const id = Number(new URLSearchParams(window.location.search).get('report'));
    if (id) void openReport(id);
  }, []);

  async function loadList() {
    setLoadingList(true);
    try {
      const res = await fetch('/api/admin/search/offer-reports', { cache: 'no-store' });
      const json = await res.json();
      setReports(json.reports || []);
    } catch { /* keep prior */ } finally { setLoadingList(false); }
  }
  useEffect(() => { void loadList(); }, []);

  async function searchHotels() {
    if (!dest.trim()) return;
    setSearching(true); setErr(null);
    try {
      // The endpoint caps 50/request, so page through ALL matches for the
      // keyword (up to a safety cap) — we don't want to silently miss hotels.
      const PAGE = 50, MAX = 400;
      const all: Hotel[] = [];
      const seen = new Set<number>();
      for (let offset = 0; offset < MAX; offset += PAGE) {
        const res = await fetch('/api/admin/search/hotels', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ q: dest.trim(), limit: PAGE, offset }),
        });
        const json = await res.json();
        if (!json.success) throw new Error(json.error || 'search failed');
        const hits: HotelHit[] = json.data.hits || [];
        for (const h of hits) if (!seen.has(h.id)) { seen.add(h.id); all.push({ id: h.id, name: h.name, city: h.city, country: h.country }); }
        // Stop when the page is short (real end — estimatedTotalHits overshoots).
        if (hits.length < PAGE) break;
      }
      setHotels(all);
      // Select all by default — the goal is completeness. The query count on the
      // Generate button shows the cost, and you can Clear to trim.
      setSelectedIds(new Set(all.map((h) => h.id)));
    } catch (e: unknown) { setErr(messageOf(e, 'Hotel search failed')); } finally { setSearching(false); }
  }

  const selectedHotels = useMemo(() => hotels.filter((h) => selectedIds.has(h.id)), [hotels, selectedIds]);
  const toggleHotel = (id: number) => setSelectedIds((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    return n;
  });

  async function generate() {
    const chosenMonths = months.filter((m) => selMonths.includes(m.key));
    if (!selectedHotels.length || !chosenMonths.length || !selStays.length) {
      setErr('Select at least one hotel, one month, and one stay length.');
      return;
    }
    setErr(null);
    // Build the matrix of combos over the SELECTED hotels only.
    const combos: { hotel: Hotel; checkIn: string; nights: number }[] = [];
    for (const h of selectedHotels) for (const m of chosenMonths) for (const n of selStays) combos.push({ hotel: h, checkIn: m.checkIn, nights: n });

    setGen({ running: true, done: 0, total: combos.length, throttled: 0 });
    const rows: Row[] = [];
    const guests = JSON.stringify([{ adults, children: [] }]);

    // Concurrency 3 + per-combo 429 backoff keeps us comfortably under
    // Hummingbird's limits even for a few hundred queries.
    await runPool(combos, 3, async ({ hotel, checkIn, nights }) => {
      const checkOut = addNights(checkIn, nights);
      const qs = new URLSearchParams({ checkIn, checkOut, guests, accountType: 'cug' });
      const { rates, throttled } = await fetchRatesRetry(hotel.id, qs.toString());
      if (throttled) setGen((g) => g ? { ...g, throttled: g.throttled + 1 } : g);
      if (!rates.length) return;
      // Cheapest bookable rate (the "from" price) — matches the rest of the system.
      const best = rates.reduce((a, b) => {
        const sa = a?.pricing?.sell?.totalAmount ?? Infinity;
        const sb = b?.pricing?.sell?.totalAmount ?? Infinity;
        return sb < sa ? b : a;
      });
      const gross = Number(best.grossTotal) || 0;
      const disc = Number(best.discountAmount) || 0;
      const discountPct = gross > 0 && disc > 0 ? Math.round((disc / gross) * 100) : 0;
      rows.push({
        hotelId: String(hotel.id), hotelName: hotel.name,
        region: hotel.country || null, checkIn, nights,
        promoName: best.offers?.[0]?.name ?? null,
        discountPct,
        netTotal: best.pricing?.net?.aud?.totalAmount ?? best.pricing?.net?.totalAmount ?? null,
        sellTotal: best.pricing?.aud?.totalAmount ?? best.pricing?.sell?.totalAmount ?? null,
        currency: best.pricing?.aud?.totalAmount ? 'AUD' : (best.pricing?.currency ?? null),
        board: boardOf(best.ratePlan ?? undefined), transfer: best.transfer ?? null,
        refundable: typeof best.refundable === 'boolean' ? best.refundable : null,
        supplier: best.supplier ?? null,
      });
    }, () => setGen((g) => g ? { ...g, done: g.done + 1 } : g));

    // Save the assembled report.
    try {
      const name = `${dest.trim() || 'Offers'} · ${selectedHotels.length} hotels · ${chosenMonths.length}mo · ${selStays.join('/')}n`;
      const res = await fetch('/api/admin/search/offer-reports', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name, region: selectedHotels[0]?.country || dest.trim() || null,
          params: { months: selMonths, stayLengths: selStays, hotelIds: selectedHotels.map((h) => h.id), adults },
          rows,
        }),
      });
      const json = await res.json();
      setGen(null);
      await loadList();
      if (json.id) void openReport(json.id);
    } catch (e: unknown) {
      setErr(messageOf(e, 'Save failed'));
      setGen(null);
    }
  }

  async function openReport(id: number) {
    setView('detail'); setCurrent(null);
    window.history.replaceState({}, '', `?report=${id}`);   // deep-linkable
    const res = await fetch(`/api/admin/search/offer-reports/${id}`, { cache: 'no-store' });
    setCurrent(await res.json());
  }
  function backToList() {
    setView('list'); setCurrent(null);
    window.history.replaceState({}, '', window.location.pathname);
  }

  async function deleteReport(id: number) {
    if (!confirm('Delete this report?')) return;
    await fetch(`/api/admin/search/offer-reports/${id}`, { method: 'DELETE' });
    await loadList();
    if (current?.id === id) backToList();
  }

  // ── Detail view ──
  if (view === 'detail') {
    return <ReportDetail report={current} onBack={backToList} />;
  }

  // ── List + New report ──
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <h1 className="c-page-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Tag size={20} /> Offers
        </h1>
        <p className="c-page-sub">
          Cheapest month per hotel, from rates warmed overnight — no supplier calls, no waiting.
          Use the matrix below only when you need a stay length or month the nightly grid does not cover.
        </p>
      </div>

      {/* New report */}
      <div className="c-card" style={{ padding: 16 }}>
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 700 }}>New live report</div>
          <div style={{ fontSize: 12, color: 'var(--c-fg-muted)', marginTop: 2 }}>
            Runs supplier queries now and saves a dated snapshot. Generate it again when you need fresh live data.
          </div>
        </div>

        {/* Destination → hotels */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
          <input
            className="c-input" placeholder="Destination or region (e.g. Maldives)"
            value={dest} onChange={(e) => setDest(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void searchHotels(); }}
            style={{ minWidth: 260 }}
          />
          <button className="c-btn" onClick={() => void searchHotels()} disabled={searching}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            {searching ? <Loader2 size={13} className="animate-spin" /> : <Search size={13} />}
            {searching ? 'Searching…' : 'Find hotels'}
          </button>
          {hotels.length > 0 && (
            <span style={{ fontSize: 12, color: 'var(--c-fg-muted)' }}>
              {selectedIds.size} of {hotels.length} selected
            </span>
          )}
        </div>

        {/* Selectable hotel list — pick exactly which properties to include. */}
        {hotels.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', gap: 12, marginBottom: 6 }}>
              <button onClick={() => setSelectedIds(new Set(hotels.map((h) => h.id)))} style={linkBtn}>Select all</button>
              <button onClick={() => setSelectedIds(new Set())} style={linkBtn}>Clear</button>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, maxHeight: 200, overflowY: 'auto', padding: 2 }}>
              {hotels.map((h) => {
                const on = selectedIds.has(h.id);
                const meta = [h.city, h.country, `#${h.id}`].filter(Boolean).join(' · ');
                return (
                  <button key={h.id} onClick={() => toggleHotel(h.id)} title={meta}
                    style={{
                      ...pill(on),
                      maxWidth: 340,
                      display: 'grid',
                      gap: 2,
                      textAlign: 'left',
                      lineHeight: 1.2,
                    }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {on ? '✓ ' : ''}{h.name}
                    </span>
                    <span style={{ fontSize: 10.5, fontWeight: 500, color: 'var(--c-fg-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {meta}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Months */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.04, color: 'var(--c-fg-muted)', marginBottom: 6 }}>Check-in months</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {months.map((m) => {
              const on = selMonths.includes(m.key);
              return (
                <button key={m.key} onClick={() => setSelMonths((s) => on ? s.filter((x) => x !== m.key) : [...s, m.key])}
                  style={pill(on)}>{m.label}</button>
              );
            })}
          </div>
        </div>

        {/* Stay lengths + guests */}
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.04, color: 'var(--c-fg-muted)', marginBottom: 6 }}>Stay length</div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              {Array.from(new Set([...STAY_OPTIONS, ...selStays])).sort((a, b) => a - b).map((n) => {
                const on = selStays.includes(n);
                return <button key={n} onClick={() => setSelStays((s) => on ? s.filter((x) => x !== n) : [...s, n].sort((a, b) => a - b))} style={pill(on)}>{n} nights</button>;
              })}
              <input
                className="c-input"
                type="number"
                min={1}
                max={60}
                placeholder="custom"
                value={customStay}
                onChange={(e) => setCustomStay(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustomStay(); } }}
                style={{ width: 84 }}
              />
              <button onClick={addCustomStay} style={pill(false)}>Add</button>
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.04, color: 'var(--c-fg-muted)', marginBottom: 6 }}>Adults</div>
            <input className="c-input" type="number" min={1} max={9} value={adults} onChange={(e) => setAdults(Math.max(1, Number(e.target.value) || 2))} style={{ width: 80 }} />
          </div>
        </div>

        {err && <div style={{ color: 'var(--c-danger)', fontSize: 12.5, marginBottom: 10 }}>{err}</div>}

        {gen?.running ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <Loader2 size={15} className="animate-spin" />
            <span style={{ fontSize: 13 }}>Querying {gen.done}/{gen.total}…</span>
            <div style={{ flex: 1, minWidth: 160, maxWidth: 320, height: 6, borderRadius: 999, background: 'var(--c-line-soft)', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${gen.total ? (gen.done / gen.total) * 100 : 0}%`, background: 'var(--c-accent)', transition: 'width 0.2s' }} />
            </div>
            {gen.throttled > 0 && (
              <span style={{ fontSize: 11.5, color: 'var(--c-fg-muted)' }} title="Hit a supplier rate limit and backed off/retried — the report still completes">
                slowing down to respect supplier limits ({gen.throttled})
              </span>
            )}
          </div>
        ) : (
          <button className="c-btn c-btn-primary" onClick={() => void generate()}
            disabled={!selectedIds.size || !selMonths.length || !selStays.length}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Tag size={13} /> Generate report
            {selectedIds.size > 0 && <span style={{ opacity: 0.8, fontWeight: 400 }}>({selectedIds.size * selMonths.length * selStays.length} queries)</span>}
          </button>
        )}
      </div>

      <BestMonths hotels={hotels} selectedIds={selectedIds} />

      <OfferWatchlistPanel />

      {/* Saved reports */}
      <div className="c-card" style={{ padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700 }}>Saved reports</div>
            <div style={{ fontSize: 12, color: 'var(--c-fg-muted)', marginTop: 2 }}>
              Snapshots from the time they were generated. Re-run a live report above to refresh prices/offers.
            </div>
          </div>
          <button className="c-btn" onClick={() => void loadList()} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12 }}>
            <RefreshCw size={12} /> Refresh
          </button>
        </div>
        {loadingList ? (
          <div style={{ color: 'var(--c-fg-muted)', fontSize: 13, padding: 12 }}>Loading…</div>
        ) : reports.length === 0 ? (
          <div style={{ color: 'var(--c-fg-muted)', fontSize: 13, padding: 12 }}>No reports yet — generate one above.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--c-fg-muted)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.04 }}>
                <th style={{ padding: '6px 8px' }}>Report</th>
                <th style={{ padding: '6px 8px' }}>Region</th>
                <th style={{ padding: '6px 8px', textAlign: 'right' }}>Offers</th>
                <th style={{ padding: '6px 8px', textAlign: 'right' }}>Rows</th>
                <th style={{ padding: '6px 8px' }}>Created</th>
                <th style={{ padding: '6px 8px' }}></th>
              </tr>
            </thead>
            <tbody>
              {reports.map((r) => (
                <tr key={r.id} style={{ borderTop: '1px solid var(--c-line-soft)', cursor: 'pointer' }} onClick={() => void openReport(r.id)}>
                  <td style={{ padding: '8px', fontWeight: 600, color: 'var(--c-accent)' }}>{r.name}</td>
                  <td style={{ padding: '8px', color: 'var(--c-fg-muted)' }}>{r.region || '—'}</td>
                  <td style={{ padding: '8px', textAlign: 'right', fontWeight: 700 }}>{r.offerCount}</td>
                  <td style={{ padding: '8px', textAlign: 'right', color: 'var(--c-fg-muted)' }}>{r.rowCount}</td>
                  <td style={{ padding: '8px', color: 'var(--c-fg-muted)' }}>{new Date(r.createdAt).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
                  <td style={{ padding: '8px', textAlign: 'right' }}>
                    <button onClick={(e) => { e.stopPropagation(); void deleteReport(r.id); }} title="Delete" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--c-fg-muted)' }}>
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ── Report detail: filterable/sortable grid ──────────────────────────────────
function ReportDetail({ report, onBack }: { report: Report | null; onBack: () => void }) {
  const [minPct, setMinPct] = useState(0);
  const [onlyOffers, setOnlyOffers] = useState(true);
  const [q, setQ] = useState('');
  const [sortKey, setSortKey] = useState<'discountPct' | 'sellTotal' | 'hotelName' | 'checkIn' | 'perNight'>('perNight');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const reportStays = useMemo(() => {
    const fromParams = Array.isArray(report?.params?.stayLengths) ? report?.params?.stayLengths : [];
    const fromRows = report?.rows?.map((r) => r.nights) || [];
    return [...new Set([...fromParams, ...fromRows].map(Number).filter((n) => Number.isFinite(n) && n > 0))]
      .sort((a, b) => a - b);
  }, [report]);
  const [scoutLos, setScoutLos] = useState<number>(7);
  const [scout, setScout] = useState<MonthlyScout | null>(null);
  const [scoutBusy, setScoutBusy] = useState(false);

  useEffect(() => {
    if (reportStays.length && !reportStays.includes(scoutLos)) setScoutLos(reportStays[0]);
  }, [reportStays, scoutLos]);

  useEffect(() => {
    const hotelIds = [...new Set((report?.rows || []).map((r) => Number(r.hotelId)).filter(Number.isFinite))];
    if (!hotelIds.length || !scoutLos) { setScout(null); return; }
    let cancelled = false;
    setScoutBusy(true);
    const qs = new URLSearchParams({
      hotelIds: hotelIds.join(','),
      los: String(scoutLos),
      occupancy: '2c',
      channel: 'b2c',
      months: '12',
    });
    fetch(`/api/admin/search/rates-by-month?${qs.toString()}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => { if (!cancelled) setScout(j.success ? j : null); })
      .catch(() => { if (!cancelled) setScout(null); })
      .finally(() => { if (!cancelled) setScoutBusy(false); });
    return () => { cancelled = true; };
  }, [report, scoutLos]);

  const rows = useMemo(() => {
    if (!report) return [];
    let r = report.rows.slice();
    if (onlyOffers) r = r.filter((x) => (x.discountPct ?? 0) > 0 || (x.promoName && x.promoName.trim()));
    if (minPct > 0) r = r.filter((x) => (x.discountPct ?? 0) >= minPct);
    if (q.trim()) {
      const t = q.trim().toLowerCase();
      r = r.filter((x) => x.hotelName.toLowerCase().includes(t) || (x.promoName || '').toLowerCase().includes(t));
    }
    r.sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1;
      // perNight is derived, not a stored column — compute it to sort on.
      const val = (row: Row) => sortKey === 'perNight'
        ? (perNight(row) ?? Number.MAX_SAFE_INTEGER)
        : (row[sortKey as keyof Row] ?? (typeof row[sortKey as keyof Row] === 'string' ? '' : 0));
      const av = val(a) as string | number;
      const bv = val(b) as string | number;
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
    return r;
  }, [report, minPct, onlyOffers, q, sortKey, sortDir]);

  function th(label: string, key: typeof sortKey, align: 'left' | 'right' = 'left') {
    const active = sortKey === key;
    return (
      <th onClick={() => { if (active) setSortDir((d) => d === 'asc' ? 'desc' : 'asc'); else { setSortKey(key); setSortDir('desc'); } }}
        style={{ padding: '6px 8px', textAlign: align, cursor: 'pointer', whiteSpace: 'nowrap', color: active ? 'var(--c-accent)' : 'var(--c-fg-muted)' }}>
        {label}{active ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
      </th>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button onClick={onBack} className="c-btn" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5 }}>
          <ArrowLeft size={13} /> All reports
        </button>
        {report && (
          <button
            onClick={() => { navigator.clipboard?.writeText(window.location.href); }}
            className="c-btn" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5 }}
            title="Copy a shareable link to this report">
            <LinkIcon size={13} /> Copy link
          </button>
        )}
      </div>

      {!report ? (
        <div style={{ color: 'var(--c-fg-muted)', fontSize: 13, padding: 12 }}>Loading report…</div>
      ) : (
        <>
          <div>
            <h1 className="c-page-title">{report.name}</h1>
            <p className="c-page-sub">{report.offerCount} offers across {report.rowCount} queries · {report.region || '—'} · saved {new Date(report.createdAt).toLocaleString('en-AU')}</p>
          </div>

          <MonthlyScoutPanel
            report={report}
            scout={scout}
            busy={scoutBusy}
            los={scoutLos}
            stayOptions={reportStays.length ? reportStays : [3, 4, 5, 7]}
            onLos={setScoutLos}
          />

          {/* Filters */}
          <div className="c-card" style={{ padding: 12, display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
            <input className="c-input" placeholder="Filter hotel / promo…" value={q} onChange={(e) => setQ(e.target.value)} style={{ minWidth: 200 }} />
            <label style={{ fontSize: 12.5, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              Min discount
              <input className="c-input" type="number" min={0} max={90} value={minPct} onChange={(e) => setMinPct(Math.max(0, Number(e.target.value) || 0))} style={{ width: 70 }} />%
            </label>
            <label style={{ fontSize: 12.5, display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
              <input type="checkbox" checked={onlyOffers} onChange={(e) => setOnlyOffers(e.target.checked)} /> Only rows with an offer
            </label>
            <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--c-fg-muted)' }}>{rows.length} shown</span>
          </div>

          {/* Grid */}
          <div className="c-card" style={{ padding: 0, overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
              <thead>
                <tr style={{ textAlign: 'left', textTransform: 'uppercase', fontSize: 10.5, letterSpacing: 0.04, borderBottom: '1px solid var(--c-line)' }}>
                  {th('Hotel', 'hotelName')}
                  {th('Check-in', 'checkIn')}
                  <th style={{ padding: '6px 8px' }}>Nights</th>
                  <th style={{ padding: '6px 8px' }}>Promotion</th>
                  {th('Discount', 'discountPct', 'right')}
                  <th style={{ padding: '6px 8px', textAlign: 'right' }}>Net</th>
                  {th('Sell', 'sellTotal', 'right')}
                  {/* The scouting column. Cheapest total is meaningless across
                      different stay lengths; per-night is what ranks hotels. */}
                  <th style={{ padding: '6px 8px', textAlign: 'right' }}>Sell / night</th>
                  <th style={{ padding: '6px 8px' }}>Board</th>
                  <th style={{ padding: '6px 8px' }}>Transfer</th>
                  <th style={{ padding: '6px 8px' }}>Package line</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} style={{ borderTop: '1px solid var(--c-line-soft)' }}>
                    <td style={{ padding: '7px 8px', fontWeight: 600 }}>{r.hotelName}</td>
                    <td style={{ padding: '7px 8px', fontFamily: 'var(--c-mono)', whiteSpace: 'nowrap' }}>{new Date(r.checkIn).toLocaleDateString('en-AU', { month: 'short', year: 'numeric' })}</td>
                    <td style={{ padding: '7px 8px', textAlign: 'center' }}>{r.nights}</td>
                    <td style={{ padding: '7px 8px', color: 'var(--c-fg-soft)' }}>{r.promoName || '—'}</td>
                    <td style={{ padding: '7px 8px', textAlign: 'right', fontWeight: (r.discountPct ?? 0) > 0 ? 700 : 400, color: (r.discountPct ?? 0) > 0 ? 'var(--c-accent)' : 'var(--c-fg-muted)' }}>
                      {(r.discountPct ?? 0) > 0 ? `${r.discountPct}%` : '—'}
                    </td>
                    <td style={{ padding: '7px 8px', textAlign: 'right', color: 'var(--c-fg-muted)', fontFamily: 'var(--c-mono)' }}>{fmtMoney(r.netTotal)}</td>
                    <td style={{ padding: '7px 8px', textAlign: 'right', fontWeight: 600, fontFamily: 'var(--c-mono)', whiteSpace: 'nowrap' }}>{fmtMoney(r.sellTotal)} {r.currency}</td>
                    <td style={{ padding: '7px 8px', textAlign: 'right', fontWeight: 700, fontFamily: 'var(--c-mono)', whiteSpace: 'nowrap' }}>
                      {perNight(r) != null ? fmtMoney(perNight(r)) : '—'}
                    </td>
                    <td style={{ padding: '7px 8px', whiteSpace: 'nowrap' }}>{r.board || '—'}</td>
                    <td style={{ padding: '7px 8px', whiteSpace: 'nowrap' }}>{r.transfer || '—'}</td>
                    <td style={{ padding: '7px 8px', maxWidth: 380 }}>
                      {r.packageSummary ? (
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                          <div style={{ lineHeight: 1.35 }}>
                            <div style={{ fontWeight: 600 }}>
                              {r.packageSummary}
                              {r.minNightsObserved != null && (
                                <span
                                  title={r.minNightsIsFloor
                                    ? `Seen at ${r.minNightsObserved} nights, the shortest stay probed — the real minimum may be lower. Not a contractual term.`
                                    : `Not seen below ${r.minNightsObserved} nights across the stays probed. An observation, not a contractual term.`}
                                  style={{ marginLeft: 6, fontSize: 10.5, fontWeight: 700, padding: '1px 5px', borderRadius: 999, cursor: 'help',
                                           color: r.minNightsIsFloor ? 'var(--c-fg-muted)' : '#92600a',
                                           background: r.minNightsIsFloor ? 'var(--c-bg-soft)' : 'rgba(245,177,66,0.18)' }}
                                >min {r.minNightsObserved}n{r.minNightsIsFloor ? '?' : ''}</span>
                              )}
                            </div>
                            {r.packageInclusions && (
                              <div style={{ fontSize: 11.5, color: 'var(--c-fg-soft)' }}>{r.packageInclusions}</div>
                            )}
                          </div>
                          <button className="c-btn" title="Copy both lines for the collection editor"
                            style={{ padding: '2px 6px', flexShrink: 0 }}
                            onClick={() => navigator.clipboard?.writeText(
                              [r.packageSummary, r.packageInclusions].filter(Boolean).join('\n'))}>
                            <LinkIcon size={11} />
                          </button>
                        </div>
                      ) : <span style={{ color: 'var(--c-fg-muted)' }}>—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function MonthlyScoutPanel({
  report, scout, busy, los, stayOptions, onLos,
}: {
  report: Report;
  scout: MonthlyScout | null;
  busy: boolean;
  los: number;
  stayOptions: number[];
  onLos: (n: number) => void;
}) {
  const names = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of report.rows || []) if (r.hotelId && r.hotelName) m.set(String(r.hotelId), r.hotelName);
    return m;
  }, [report.rows]);

  const rows = useMemo(() => {
    const raw = Object.entries(scout?.results || {}).map(([hotelId, v]) => {
      const best = (v.months || []).find((m) => m.month === v.bestMonth) || null;
      return { hotelId, hotelName: names.get(String(hotelId)) || `Hotel #${hotelId}`, ...v, best };
    });
    return raw
      .filter((r) => r.best && r.best.fromTotal > 0)
      .sort((a, b) => (a.best?.fromTotal || Infinity) - (b.best?.fromTotal || Infinity))
      .slice(0, 12);
  }, [scout, names]);

  const adLine = (r: { hotelName: string; best: MonthlyRate | null; swingPct: number | null }) => {
    if (!r.best) return '';
    const month = new Date(`${r.best.month}-15T00:00:00`).toLocaleDateString('en-AU', { month: 'long', year: 'numeric' });
    const price = `${fmtMoney(r.best.fromTotal)} ${r.best.currency || ''}`.trim();
    const parts = [
      `${r.hotelName}: ${r.best.nights} nights from ${price}`,
      month,
      r.best.board,
      r.best.transfer,
      r.best.offerName,
      r.swingPct != null && r.swingPct > 0 ? `${r.swingPct}% cheaper than the priciest warmed month` : null,
    ].filter(Boolean);
    return parts.join(' · ');
  };

  return (
    <div className="c-card" style={{ padding: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700 }}>Cheapest future windows</div>
          <div style={{ fontSize: 12, color: 'var(--c-fg-muted)', marginTop: 2 }}>
            Cached prewarm prices, ranked by best month for advertising.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          {stayOptions.map((n) => (
            <button key={n} onClick={() => onLos(n)} style={pill(los === n)}>{n} nights</button>
          ))}
        </div>
      </div>

      {busy ? (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', color: 'var(--c-fg-muted)', fontSize: 12, marginTop: 10 }}>
          <Loader2 size={13} className="animate-spin" /> Checking cached months…
        </div>
      ) : rows.length === 0 ? (
        <div className="c-empty" style={{ padding: '10px 0 0', fontSize: 12 }}>
          No cached monthly prices for this report yet. Warm the collection or wait for the nightly prewarm.
        </div>
      ) : (
        <div style={{ marginTop: 10, overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
            <thead>
              <tr style={{ textAlign: 'left', textTransform: 'uppercase', fontSize: 10.5, letterSpacing: 0.04, color: 'var(--c-fg-muted)' }}>
                <th style={{ padding: '6px 8px' }}>Hotel</th>
                <th style={{ padding: '6px 8px' }}>Best month</th>
                <th style={{ padding: '6px 8px', textAlign: 'right' }}>From</th>
                <th style={{ padding: '6px 8px', textAlign: 'right' }}>Swing</th>
                <th style={{ padding: '6px 8px' }}>Supplier / inclusions</th>
                <th style={{ padding: '6px 8px' }}></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.hotelId} style={{ borderTop: '1px solid var(--c-line-soft)' }}>
                  <td style={{ padding: '7px 8px', fontWeight: 600 }}>{r.hotelName}</td>
                  <td style={{ padding: '7px 8px', whiteSpace: 'nowrap' }}>{r.best ? fmtMonth(r.best.month) : '—'}</td>
                  <td style={{ padding: '7px 8px', textAlign: 'right', fontFamily: 'var(--c-mono)', fontWeight: 700 }}>
                    {r.best ? `${fmtMoney(r.best.fromTotal)} ${r.best.currency || ''}` : '—'}
                  </td>
                  <td style={{ padding: '7px 8px', textAlign: 'right', color: (r.swingPct || 0) > 0 ? 'var(--c-accent)' : 'var(--c-fg-muted)', fontWeight: 700 }}>
                    {r.swingPct != null && r.swingPct > 0 ? `${r.swingPct}%` : '—'}
                  </td>
                  <td style={{ padding: '7px 8px', color: 'var(--c-fg-soft)' }}>
                    {[r.best?.supplier, r.best?.board, r.best?.transfer, r.best?.offerName].filter(Boolean).join(' · ') || '—'}
                  </td>
                  <td style={{ padding: '7px 8px', textAlign: 'right' }}>
                    <button className="c-btn" title="Copy advertising line" onClick={() => navigator.clipboard?.writeText(adLine(r))}>
                      <LinkIcon size={11} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function fmtMonth(month: string) {
  return new Date(`${month}-15T00:00:00`).toLocaleDateString('en-AU', { month: 'short', year: 'numeric' });
}

/** Per-night is what makes hotels comparable; a total conflates price with length. */
function perNight(r: Row): number | null {
  const total = r.sellTotal;
  if (!total || !r.nights) return null;
  return Math.round(total / r.nights);
}

function pill(active: boolean): React.CSSProperties {
  return {
    fontSize: 12, fontWeight: 600, padding: '4px 11px', borderRadius: 999, cursor: 'pointer',
    border: active ? '1px solid var(--c-accent)' : '1px solid var(--c-line)',
    background: active ? 'rgba(155,123,51,0.08)' : 'var(--c-bg)',
    color: active ? 'var(--c-accent)' : 'var(--c-fg)',
  };
}
const linkBtn: React.CSSProperties = {
  background: 'none', border: 'none', cursor: 'pointer', padding: 0,
  fontSize: 11.5, fontWeight: 600, color: 'var(--c-accent)',
};


// ── Best month per hotel ─────────────────────────────────────────────────────

type MonthRow = {
  month: string; checkIn: string; nights: number;
  fromTotal: number; fromNightly: number | null;
  supplierWasTotal: number | null;
  currency: string | null; supplier: string | null;
  board: string | null; transfer: string | null;
  freeCancellation: boolean | null; offerName: string | null;
  fetchedAt: string | null;
};
type MonthResult = {
  months: MonthRow[]; bestMonth: string | null; bestTotal: number | null;
  swingPct: number | null; dearestMonth: string | null;
};

const monthLabel = (ym: string) => {
  const [y, m] = ym.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-AU', { month: 'short', year: 'numeric' });
};

/**
 * Which month to advertise, per hotel.
 *
 * Reads cached rates the prewarm job warms overnight, so it is instant and
 * costs no supplier calls. The matrix below this panel still exists for the
 * cases the nightly grid does not cover, but it should not be the default:
 * it fires live queries and freezes the result, and a frozen price looks
 * exactly like a current one a month later.
 *
 * The number to sell on is the SWING — cheapest month against dearest, for the
 * same hotel and the same stay. That is our price against our price, so
 * "save $14,780 by travelling June" is defensible in a way that a supplier's
 * own rack-rate "discount" is not.
 */
function BestMonths({ hotels, selectedIds }: { hotels: Hotel[]; selectedIds: Set<number> }) {
  const [los, setLos] = useState(7);
  const [data, setData] = useState<Record<string, MonthResult> | null>(null);
  const [missing, setMissing] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const selectedCount = hotels.filter((h) => selectedIds.has(h.id)).length;

  const nameOf = useMemo(() => {
    const m = new Map<number, string>();
    for (const h of hotels) m.set(h.id, h.name);
    return m;
  }, [hotels]);

  const load = useCallback(async () => {
    const ids = hotels.filter((h) => selectedIds.has(h.id)).map((h) => h.id);
    if (!ids.length) { setErr('Find and select hotels in New report first.'); return; }
    setBusy(true); setErr(null);
    try {
      const qs = new URLSearchParams({ hotelIds: ids.join(','), los: String(los), months: '14' });
      const res = await fetch(`/api/admin/search/rates-by-month?${qs}`, { cache: 'no-store' });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || `HTTP ${res.status}`);
      setData(json.results || {});
      setMissing(json.missing || []);
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  }, [hotels, selectedIds, los]);

  useEffect(() => { setData(null); setMissing([]); }, [hotels, selectedIds]);

  const rows = useMemo(() => {
    if (!data) return [];
    return Object.entries(data)
      .map(([hid, v]) => {
        const best = v.months.find((m) => m.month === v.bestMonth) || null;
        const dear = v.months.find((m) => m.month === v.dearestMonth) || null;
        return { hid: Number(hid), name: nameOf.get(Number(hid)) || `#${hid}`, v, best, dear };
      })
      .filter((r) => r.best)
      .sort((a, b) => (a.best!.fromNightly ?? a.best!.fromTotal) - (b.best!.fromNightly ?? b.best!.fromTotal));
  }, [data, nameOf]);

  // One "as at" for the whole table, not a date per row: this is a live read of
  // one cache, so its age is a property of the data, not of each row.
  const asAt = useMemo(() => {
    const ts = rows.map((r) => r.best?.fetchedAt).filter(Boolean).map((t) => new Date(t as string).getTime());
    return ts.length ? new Date(Math.max(...ts)) : null;
  }, [rows]);

  return (
    <div className="c-card" style={{ padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700 }}>Best month to advertise</div>
          <div style={{ fontSize: 12, color: 'var(--c-fg-muted)', marginTop: 2 }}>
            {asAt
              ? `Prices as at ${asAt.toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} — refreshed overnight`
              : selectedCount
                ? `${selectedCount} selected hotel${selectedCount === 1 ? '' : 's'} — load cached months when ready.`
                : 'Use the hotel picker above, then load cached months.'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <select className="c-select" value={los} onChange={(e) => { setLos(Number(e.target.value)); setData(null); }}>
            {[3, 4, 5, 7, 10].map((n) => <option key={n} value={n}>{n} nights</option>)}
          </select>
          <button className="c-btn c-btn-primary" onClick={() => void load()} disabled={busy || !selectedCount}>
            {busy ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} Load months
          </button>
        </div>
      </div>

      {err && <div style={{ marginTop: 10, fontSize: 12, color: 'var(--c-danger)' }}>{err}</div>}

      {rows.length > 0 && (
        <div style={{ marginTop: 14, overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
            <thead>
              <tr style={{ textAlign: 'left', textTransform: 'uppercase', fontSize: 10.5, letterSpacing: 0.04, borderBottom: '1px solid var(--c-line)' }}>
                <th style={{ padding: '6px 8px' }}>Hotel</th>
                <th style={{ padding: '6px 8px' }}>Advertise</th>
                <th style={{ padding: '6px 8px', textAlign: 'right' }}>Per night</th>
                <th style={{ padding: '6px 8px', textAlign: 'right' }}>{los} nights</th>
                <th style={{ padding: '6px 8px' }}>Included</th>
                <th style={{ padding: '6px 8px' }}>Offer</th>
                <th style={{ padding: '6px 8px', textAlign: 'right' }}>Client saves</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ hid, name, v, best, dear }) => {
                const cur = best!.currency || '';
                const saves = dear && best ? Math.round(dear.fromTotal - best.fromTotal) : null;
                return (
                  <tr key={hid} style={{ borderTop: '1px solid var(--c-line-soft)' }}>
                    <td style={{ padding: '7px 8px', fontWeight: 600 }}>{name}</td>
                    <td style={{ padding: '7px 8px', whiteSpace: 'nowrap' }}>{monthLabel(best!.month)}</td>
                    <td style={{ padding: '7px 8px', textAlign: 'right', fontWeight: 700, fontFamily: 'var(--c-mono)' }}>
                      {best!.fromNightly != null ? fmtMoney(best!.fromNightly) : fmtMoney(best!.fromTotal / (best!.nights || los))}
                    </td>
                    <td style={{ padding: '7px 8px', textAlign: 'right', fontFamily: 'var(--c-mono)', whiteSpace: 'nowrap' }}>
                      {fmtMoney(best!.fromTotal)} {cur}
                    </td>
                    <td style={{ padding: '7px 8px' }}>
                      {[best!.board, best!.transfer].filter(Boolean).join(' + ') || <span style={{ color: 'var(--c-fg-muted)' }}>—</span>}
                    </td>
                    <td style={{ padding: '7px 8px', color: 'var(--c-fg-soft)' }}>{best!.offerName || '—'}</td>
                    <td style={{ padding: '7px 8px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {saves && saves > 0 && v.swingPct ? (
                        <span title={`vs ${monthLabel(v.dearestMonth!)}, the dearest month priced`}>
                          <strong style={{ color: 'var(--c-success)' }}>{fmtMoney(saves)}</strong>
                          <span style={{ color: 'var(--c-fg-muted)' }}> ({v.swingPct}%)</span>
                        </span>
                      ) : <span style={{ color: 'var(--c-fg-muted)' }}>—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {missing.length > 0 && (
            <div style={{ marginTop: 8, fontSize: 11.5, color: 'var(--c-fg-muted)' }}>
              {missing.length} hotel(s) have no warmed rates for a {los}-night stay — they are not in the nightly grid,
              which is not the same as having no availability.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** One watchlist row as the API returns it. */
type WatchEntry = {
  hotelId: number;
  hotelName?: string | null;
  region?: string | null;
  los: number[];
  probeMonthsAhead: number[];
  isActive: boolean;
  notes?: string | null;
};
type CollectionListRow = {
  id: number;
  slug: string;
  title: string;
  status: string;
  hotelCount: number;
};
type CollectionHotel = { hotelId?: number | string | null; name?: string | null; country?: string | null };
type CollectionDetail = { slug?: string; searchDestination?: string | null; hotels?: CollectionHotel[]; error?: string };

const parseNums = (v: string) =>
  [...new Set(v.split(',').map((n) => Number(n.trim())).filter((n) => Number.isFinite(n) && n > 0))]
    .sort((a, b) => a - b);

/**
 * What gets checked for offers, and how.
 *
 * Discovery itself is deterministic — price some dates, read the supplier's
 * named offers, aggregate — so the only human input is which hotels and when
 * to look. This is that input, and a nightly job runs the rest.
 *
 * Two settings are load-bearing:
 *   Stay lengths  must start low enough for a minimum to be a real
 *                 observation. Probe only 4 and 7 and a 5-night rule is
 *                 indistinguishable from a 7-night one.
 *   Months ahead  offers are seasonal. A single window 45 days out found
 *                 Soneva Fushi's 7-night Gather Together offer and missed its
 *                 May–Sep summer promotion completely.
 */
function OfferWatchlistPanel() {
  const [entries, setEntries] = useState<WatchEntry[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [draft, setDraft] = useState({ hotelId: '', hotelName: '', region: '', los: '3,4,5,7', months: '2,5' });
  const [collections, setCollections] = useState<CollectionListRow[]>([]);
  const [collectionSlug, setCollectionSlug] = useState('');

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/admin/search/offer-watchlist', { cache: 'no-store' });
      const j = await r.json();
      setEntries(j.entries || []);
    } catch { /* panel is additive — a failure must not take the page down */ }
  }, []);
  useEffect(() => { if (open) void load(); }, [open, load]);
  useEffect(() => {
    if (!open) return;
    fetch('/api/admin/collections?status=all', { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => setCollections(j.collections || []))
      .catch(() => setCollections([]));
  }, [open]);

  async function save(entry: Partial<WatchEntry> & { hotelId: number }) {
    setBusy(true); setMsg(null);
    try {
      const r = await fetch('/api/admin/search/offer-watchlist', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(entry),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      await load();
    } catch (e) { setMsg((e as Error).message); }
    finally { setBusy(false); }
  }

  async function remove(hotelId: number) {
    setBusy(true);
    try {
      await fetch(`/api/admin/search/offer-watchlist/${hotelId}`, { method: 'DELETE' });
      await load();
    } finally { setBusy(false); }
  }

  async function runNow() {
    setBusy(true);
    setMsg('Running — each hotel is several live supplier calls, paced to stay inside the rate limit. This takes minutes.');
    try {
      const r = await fetch('/api/admin/search/offer-reports/run', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      setMsg(`Saved report #${j.id} — ${j.offerCount} of ${j.rowCount} rows carry an offer, across ${j.hotels} hotels.`
        + (j.failures?.length ? ` ${j.failures.length} probe(s) failed.` : ''));
    } catch (e) { setMsg((e as Error).message); }
    finally { setBusy(false); }
  }

  async function importCollection() {
    if (!collectionSlug) return;
    const meta = collections.find((c) => c.slug === collectionSlug);
    setBusy(true); setMsg(null);
    try {
      const detailRes = await fetch(`/api/admin/collections/${encodeURIComponent(collectionSlug)}`, { cache: 'no-store' });
      const detail = await detailRes.json() as CollectionDetail;
      if (!detailRes.ok) throw new Error(detail.error || `HTTP ${detailRes.status}`);
      const hotels = (detail.hotels || []).filter((h) => Number.isFinite(Number(h.hotelId)));
      if (!hotels.length) throw new Error('That collection has no saved hotel IDs to monitor.');
      let count = 0;
      for (const h of hotels) {
        const r = await fetch('/api/admin/search/offer-watchlist', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            hotelId: Number(h.hotelId),
            hotelName: h.name || undefined,
            region: detail.searchDestination || h.country || meta?.title || undefined,
            los: parseNums(draft.los),
            probeMonthsAhead: parseNums(draft.months),
            isActive: true,
            notes: `Imported from collection ${detail.slug || collectionSlug}`,
          }),
        });
        if (r.ok) count++;
      }
      await load();
      setMsg(`Imported ${count} hotel${count === 1 ? '' : 's'} from ${meta?.title || collectionSlug}.`);
    } catch (e) { setMsg((e as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <div className="c-card" style={{ padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700 }}>Monitored hotels ({entries.length})</div>
          <div style={{ fontSize: 12, color: 'var(--c-fg-muted)', marginTop: 2 }}>
            Checked nightly for named supplier offers. Hummingbird only — RateHawk&apos;s feed carries no promotions.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="c-btn" onClick={() => setOpen((v) => !v)}>{open ? 'Hide' : 'Configure'}</button>
          <button className="c-btn c-btn-primary" onClick={runNow} disabled={busy}>Run now</button>
        </div>
      </div>

      {msg && <div style={{ marginTop: 10, fontSize: 12, color: 'var(--c-fg-soft)' }}>{msg}</div>}

      {open && (
        <div style={{ marginTop: 14, display: 'grid', gap: 10 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr 130px 130px 140px 70px', gap: 8, alignItems: 'end' }}>
            <label style={{ display: 'grid', gap: 4 }}><span className="c-label">Hotel ID</span>
              <input className="c-input" value={draft.hotelId} onChange={(e) => setDraft({ ...draft, hotelId: e.target.value })} placeholder="999269880" /></label>
            <label style={{ display: 'grid', gap: 4 }}><span className="c-label">Name</span>
              <input className="c-input" value={draft.hotelName} onChange={(e) => setDraft({ ...draft, hotelName: e.target.value })} placeholder="Soneva Fushi" /></label>
            <label style={{ display: 'grid', gap: 4 }}><span className="c-label">Region</span>
              <input className="c-input" value={draft.region} onChange={(e) => setDraft({ ...draft, region: e.target.value })} placeholder="Maldives" /></label>
            <label style={{ display: 'grid', gap: 4 }}><span className="c-label">Stay lengths</span>
              <input className="c-input" value={draft.los} onChange={(e) => setDraft({ ...draft, los: e.target.value })} /></label>
            <label style={{ display: 'grid', gap: 4 }}><span className="c-label">Months ahead</span>
              <input className="c-input" value={draft.months} onChange={(e) => setDraft({ ...draft, months: e.target.value })} /></label>
            <button className="c-btn" disabled={busy || !Number(draft.hotelId)} onClick={() => {
              void save({
                hotelId: Number(draft.hotelId), hotelName: draft.hotelName || undefined,
                region: draft.region || undefined, los: parseNums(draft.los),
                probeMonthsAhead: parseNums(draft.months), isActive: true,
              });
              setDraft({ hotelId: '', hotelName: '', region: '', los: '3,4,5,7', months: '2,5' });
            }}>Add</button>
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'end', flexWrap: 'wrap', paddingTop: 2 }}>
            <label style={{ display: 'grid', gap: 4, minWidth: 260 }}><span className="c-label">Import collection hotels</span>
              <select className="c-input" value={collectionSlug} onChange={(e) => setCollectionSlug(e.target.value)}>
                <option value="">Choose a collection…</option>
                {collections.map((c) => (
                  <option key={c.id} value={c.slug}>{c.title} ({c.hotelCount})</option>
                ))}
              </select>
            </label>
            <button
              className="c-btn"
              disabled={busy || !collectionSlug}
              onClick={() => void importCollection()}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <FolderOpen size={13} /> Add collection to monitor
            </button>
            <span style={{ fontSize: 11.5, color: 'var(--c-fg-muted)' }}>
              Uses the stay lengths and months above for every hotel.
            </span>
          </div>

          {entries.length === 0
            ? <div className="c-empty" style={{ padding: '10px 12px', fontSize: 12 }}>Nothing monitored yet — add a hotel above.</div>
            : (
              <table className="c-table">
                <thead><tr>
                  <th>Hotel</th><th style={{ width: 110 }}>Region</th>
                  <th style={{ width: 120 }}>Stay lengths</th><th style={{ width: 120 }}>Months ahead</th>
                  <th style={{ width: 80 }}>Active</th><th style={{ width: 60 }} />
                </tr></thead>
                <tbody>
                  {entries.map((e) => (
                    <tr key={e.hotelId}>
                      <td>{e.hotelName || '—'} <span className="c-mono" style={{ color: 'var(--c-fg-muted)' }}>#{e.hotelId}</span></td>
                      <td>{e.region || '—'}</td>
                      <td className="c-mono">{e.los.join(', ')}</td>
                      <td className="c-mono">{e.probeMonthsAhead.join(', ')}</td>
                      <td>
                        <input type="checkbox" checked={e.isActive} disabled={busy}
                          onChange={(ev) => void save({ hotelId: e.hotelId, isActive: ev.target.checked })} />
                      </td>
                      <td><button className="c-btn c-btn-danger" disabled={busy} onClick={() => void remove(e.hotelId)}>
                        <Trash2 size={12} /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
        </div>
      )}
    </div>
  );
}
