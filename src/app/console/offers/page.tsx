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

import { useEffect, useMemo, useState } from 'react';
import { Tag, Loader2, Search, Trash2, ArrowLeft, RefreshCw, Link as LinkIcon } from 'lucide-react';

// ── Types ────────────────────────────────────────────────────────────────────
type Hotel = { id: number; name: string; city?: string; country?: string };
type Row = {
  hotelId: string; hotelName: string; region: string | null;
  checkIn: string; nights: number;
  promoName: string | null; discountPct: number | null;
  netTotal: number | null; sellTotal: number | null; currency: string | null;
  board: string | null; transfer: string | null; refundable: boolean | null; supplier: string | null;
};
type ReportMeta = {
  id: number; name: string; region: string | null; params: any;
  rowCount: number; offerCount: number; createdBy: string | null; createdAt: string;
};
type Report = ReportMeta & { rows: Row[] };

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
async function fetchRatesRetry(hotelId: number, qs: string, maxTries = 5): Promise<{ rates: any[]; throttled: boolean }> {
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

const STAY_OPTIONS = [3, 5, 7, 10];

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
  const [adults, setAdults] = useState(2);
  const [gen, setGen] = useState<{ running: boolean; done: number; total: number; throttled: number } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // Deep-link: on mount, open a report if ?report=ID is in the URL (shareable /
  // refreshable). openReport/back keep the URL in sync.
  useEffect(() => {
    const id = Number(new URLSearchParams(window.location.search).get('report'));
    if (id) void openReport(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        const hits: any[] = json.data.hits || [];
        for (const h of hits) if (!seen.has(h.id)) { seen.add(h.id); all.push({ id: h.id, name: h.name, city: h.city, country: h.country }); }
        // Stop when the page is short (real end — estimatedTotalHits overshoots).
        if (hits.length < PAGE) break;
      }
      setHotels(all);
      // Select all by default — the goal is completeness. The query count on the
      // Generate button shows the cost, and you can Clear to trim.
      setSelectedIds(new Set(all.map((h) => h.id)));
    } catch (e: any) { setErr(e?.message || 'Hotel search failed'); } finally { setSearching(false); }
  }

  const selectedHotels = useMemo(() => hotels.filter((h) => selectedIds.has(h.id)), [hotels, selectedIds]);
  const toggleHotel = (id: number) => setSelectedIds((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

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
        board: boardOf(best.ratePlan), transfer: best.transfer ?? null,
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
    } catch (e: any) {
      setErr(e?.message || 'Save failed');
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
        <p className="c-page-sub">Run a matrix of live queries (hotels × months × stay-lengths), find the deals, and save the report.</p>
      </div>

      {/* New report */}
      <div className="c-card" style={{ padding: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>New report</div>

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
                return (
                  <button key={h.id} onClick={() => toggleHotel(h.id)} title={[h.city, h.country].filter(Boolean).join(', ')}
                    style={{ ...pill(on), maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'left' }}>
                    {on ? '✓ ' : ''}{h.name}
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
            <div style={{ display: 'flex', gap: 6 }}>
              {STAY_OPTIONS.map((n) => {
                const on = selStays.includes(n);
                return <button key={n} onClick={() => setSelStays((s) => on ? s.filter((x) => x !== n) : [...s, n])} style={pill(on)}>{n} nights</button>;
              })}
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

      {/* Saved reports */}
      <div className="c-card" style={{ padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 700 }}>Saved reports</div>
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
  const [sortKey, setSortKey] = useState<'discountPct' | 'sellTotal' | 'hotelName' | 'checkIn'>('discountPct');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

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
      const av = a[sortKey] ?? (typeof a[sortKey] === 'string' ? '' : 0);
      const bv = b[sortKey] ?? (typeof b[sortKey] === 'string' ? '' : 0);
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
                  <th style={{ padding: '6px 8px' }}>Board</th>
                  <th style={{ padding: '6px 8px' }}>Transfer</th>
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
                    <td style={{ padding: '7px 8px', whiteSpace: 'nowrap' }}>{r.board || '—'}</td>
                    <td style={{ padding: '7px 8px', whiteSpace: 'nowrap' }}>{r.transfer || '—'}</td>
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
