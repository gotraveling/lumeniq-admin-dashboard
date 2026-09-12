'use client';

/**
 * /console/collections — create & curate the editorial hotel collections that
 * render at firstclass.com.au/luxury-hotels/collections/[slug].
 *
 * Reads hit the public hotel-api directly (collections reads are unauthenticated,
 * same convention as the editorial editor). Writes go through /api/admin/collections
 * so the COLLECTIONS_ADMIN_KEY stays server-side.
 *
 * Hotels are pinned by the stable internal hotel_id (survives supplier re-sync),
 * with optional per-hotel editorial/offer overrides layered on top.
 */
import { useEffect, useState, useCallback, useMemo } from 'react';
import { FolderOpen, Plus, Trash2, ArrowUp, ArrowDown, Search, Save, X, RefreshCw } from 'lucide-react';

const HOTEL_API = process.env.NEXT_PUBLIC_HOTEL_API_URL
  || 'https://hotel-api-91901273027.australia-southeast1.run.app';

interface CollectionListRow {
  id: number; slug: string; title: string; subtitle?: string;
  status: 'draft' | 'published'; hotelCount: number; updatedAt?: string;
}
/** One priced package on a hotel card. Every field is rendered by
 *  CollectionView's PackageBlock — nothing stored that the page ignores. */
interface CollectionPackage {
  summary?: string;        // "Stay 7 nights, pay for 5"
  inclusions?: string;
  ourOffer?: string;       // the headline price, e.g. "US$8,210"
  audApprox?: string;      // "approx AU$11,980"
  hotelRate?: string;      // struck through above ours
  competitorsNote?: string;
  saving?: string;         // rendered as "Save …"
  basis?: string;          // "based on Sep 2026 stay"
}
interface CollectionMarketing {
  recommend_rank?: number | null;
}
interface CollectionHotel {
  hotelId?: number; name: string; atoll?: string; image?: string; images?: string[];
  offer?: string; bookBy?: string; editorial?: string; customisable?: boolean;
  /** Already round-tripped through this editor untyped — the load assigns the
   *  API's hotels wholesale and the save sends them back whole, and hotel-api
   *  persists it to collection_hotels.package. There was simply no UI, which is
   *  why Soneva Fushi still reads "[Price — TBC]" on the live collection. */
  packages?: CollectionPackage[];
  marketing?: CollectionMarketing | null;
}
interface CollectionFull {
  id: number; slug: string; title: string; subtitle?: string; heroImage?: string;
  intro: string[]; memberBenefit?: string; quoteRef?: string; searchDestination?: string;
  campaignMinStay?: number | null; campaignPackageNights?: number | null;
  campaignAdvertiseFrom?: string | null; campaignAdvertiseTo?: string | null;
  travelGuideLabel?: string; travelGuideUrl?: string;
  status: 'draft' | 'published'; hotels: CollectionHotel[];
}
interface OfferReportMeta {
  id: number; name: string; region: string | null; rowCount: number; offerCount: number; createdAt: string;
}
interface OfferReportRow {
  hotelId: string; hotelName: string;
  checkIn: string; nights: number;
  promoName: string | null; discountPct: number | null;
  netTotal: number | null; sellTotal: number | null; currency: string | null;
  board: string | null; transfer: string | null; refundable: boolean | null; supplier: string | null;
  packageSummary?: string | null; packageInclusions?: string | null;
}
interface OfferReport extends OfferReportMeta {
  rows: OfferReportRow[];
}

const BLANK: CollectionFull = {
  id: 0, slug: '', title: '', subtitle: '', heroImage: '',
  intro: [], memberBenefit: '', quoteRef: '', status: 'draft', hotels: [],
};

function money(n?: number | null) {
  if (n == null || !Number.isFinite(Number(n))) return '';
  return Number(n).toLocaleString('en-AU', { maximumFractionDigits: 0 });
}

function monthLabel(iso?: string | null) {
  if (!iso) return '';
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 7);
  return d.toLocaleDateString('en-AU', { month: 'short', year: 'numeric' });
}

function marginOf(row?: OfferReportRow) {
  if (!row || row.netTotal == null || row.sellTotal == null) return Number.NEGATIVE_INFINITY;
  return Number(row.sellTotal) - Number(row.netTotal);
}

function promoteRankOf(hotel: CollectionHotel) {
  return Number(hotel.marketing?.recommend_rank || 0);
}

function betterOfferRow(a?: OfferReportRow, b?: OfferReportRow) {
  if (!a) return b;
  if (!b) return a;
  const marginDiff = marginOf(b) - marginOf(a);
  if (marginDiff !== 0) return marginDiff > 0 ? b : a;
  const discountDiff = Number(b.discountPct || 0) - Number(a.discountPct || 0);
  if (discountDiff !== 0) return discountDiff > 0 ? b : a;
  const aSell = Number(a.sellTotal ?? Infinity);
  const bSell = Number(b.sellTotal ?? Infinity);
  return bSell < aSell ? b : a;
}

function packageFromOfferRow(row: OfferReportRow): CollectionPackage {
  const bits = [
    row.promoName || null,
    row.board || null,
    row.transfer || null,
    row.refundable == null ? null : row.refundable ? 'Refundable' : 'Non-refundable',
  ].filter(Boolean);
  const price = row.sellTotal == null ? '' : `${money(row.sellTotal)} ${row.currency || 'AUD'}`.trim();
  return {
    summary: row.packageSummary || `${row.nights} nights · ${monthLabel(row.checkIn)}`,
    inclusions: row.packageInclusions || bits.join(' · '),
    ourOffer: price,
    basis: [monthLabel(row.checkIn), row.supplier].filter(Boolean).join(' · '),
  };
}

export default function CollectionsPage() {
  const [list, setList] = useState<CollectionListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<CollectionFull | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [q, setQ] = useState('');

  const loadList = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const r = await fetch('/api/admin/collections?status=all', { cache: 'no-store' });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      setList(d.collections || []);
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadList(); }, [loadList]);

  async function openEditor(slug: string) {
    setBusy(true); setError(null);
    try {
      const r = await fetch(`${HOTEL_API}/api/collections/${encodeURIComponent(slug)}`, { cache: 'no-store' });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      setEditing({ ...BLANK, ...d, intro: d.intro || [], hotels: d.hotels || [] });
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }

  async function saveAll() {
    if (!editing) return;
    if (!editing.slug || !editing.title) { setError('Slug and title are required.'); return; }
    setBusy(true); setError(null); setNotice(null);
    try {
      const meta = {
        slug: editing.slug, title: editing.title, subtitle: editing.subtitle,
        heroImage: editing.heroImage, intro: editing.intro, memberBenefit: editing.memberBenefit,
        quoteRef: editing.quoteRef, status: editing.status,
        searchDestination: editing.searchDestination, updatedBy: 'console',
        campaignMinStay: editing.campaignMinStay ?? null,
        campaignPackageNights: editing.campaignPackageNights ?? null,
        campaignAdvertiseFrom: editing.campaignAdvertiseFrom || null,
        campaignAdvertiseTo: editing.campaignAdvertiseTo || null,
        travelGuideLabel: editing.travelGuideLabel || null,
        travelGuideUrl: editing.travelGuideUrl || null,
      };
      let id = editing.id;
      if (id) {
        const r = await fetch(`/api/admin/collections/${id}`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(meta),
        });
        const d = await r.json(); if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      } else {
        const r = await fetch('/api/admin/collections', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(meta),
        });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
        id = d.id;
      }
      const hr = await fetch(`/api/admin/collections/${id}/hotels`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hotels: editing.hotels }),
      });
      const hd = await hr.json(); if (!hr.ok) throw new Error(hd.error || `HTTP ${hr.status}`);
      setNotice(`Saved "${editing.title}" (${editing.hotels.length} hotels).`);
      setEditing(null);
      await loadList();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }

  async function remove(row: CollectionListRow) {
    if (!confirm(`Delete collection "${row.title}"? This cannot be undone.`)) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/admin/collections/${row.id}`, { method: 'DELETE' });
      if (!r.ok) { const d = await r.json(); throw new Error(d.error || `HTTP ${r.status}`); }
      await loadList();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return list;
    return list.filter(c =>
      c.title.toLowerCase().includes(needle) || c.slug.toLowerCase().includes(needle)
    );
  }, [list, q]);

  return (
    <>
      <div className="c-page-head">
        <div>
          <h1 className="c-page-title"><FolderOpen size={20} style={{ verticalAlign: '-3px', marginRight: 6 }} />Collections</h1>
          <p className="c-page-sub">Curated editorial landing pages (e.g. Maldives Finest). Pinned hotels survive supplier re-sync.</p>
        </div>
        {!editing && (
          <button className="c-btn c-btn-primary" disabled={busy}
            onClick={() => { setEditing({ ...BLANK }); setNotice(null); setError(null); }}>
            <Plus size={15} /> New collection
          </button>
        )}
      </div>

      {error && <div className="c-error">Error: {error}</div>}
      {notice && <div className="c-card" style={{ borderColor: 'var(--c-success)', color: 'var(--c-success)', padding: 12 }}>{notice}</div>}

      {!editing && (
        <>
          {/* Name filter. The list is past 20 collections and growing, and the
              titles are editorial ("Australia's non-stop Maldives hotel
              ideas"), so scanning for one by eye is the slow part. */}
          {!loading && list.length > 0 && (
            <div className="c-filter-row" style={{ marginBottom: 12 }}>
              <input
                className="c-input"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Filter collections by name or slug…"
                style={{ maxWidth: 340 }}
              />
              <span style={{ fontSize: 12, color: 'var(--c-fg-soft)' }}>
                {q.trim() ? `${filtered.length} of ${list.length}` : `${list.length} collection${list.length === 1 ? '' : 's'}`}
              </span>
              {q.trim() && (
                <button className="c-btn" onClick={() => setQ('')}><X size={13} /> Clear</button>
              )}
            </div>
          )}
          {loading ? <div className="c-loading">Loading…</div> : (
            list.length === 0 ? <div className="c-empty">No collections yet. Create one to get started.</div> :
            filtered.length === 0 ? <div className="c-empty">No collection matches “{q}”.</div> : (
              <table className="c-table">
                <thead><tr><th>Title</th><th>Slug</th><th>Hotels</th><th>Status</th><th></th></tr></thead>
                <tbody>
                  {filtered.map((c) => (
                    <tr key={c.id}>
                      <td>{c.title}</td>
                      <td className="c-mono">{c.slug}</td>
                      <td>{c.hotelCount}</td>
                      <td><span className={`c-pill ${c.status === 'published' ? 'c-pill-success' : 'c-pill-warn'}`}>{c.status}</span></td>
                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <button className="c-btn" onClick={() => openEditor(c.slug)} disabled={busy}>Edit</button>
                        {' '}
                        <a className="c-btn" href={`https://www.firstclass.com.au/luxury-hotels/collections/${c.slug}?access=firstclass2025`} target="_blank" rel="noreferrer">View</a>
                        {' '}
                        <button className="c-btn c-btn-danger" onClick={() => remove(c)} disabled={busy}><Trash2 size={14} /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          )}
        </>
      )}

      {editing && (
        <CollectionEditor
          value={editing} onChange={setEditing} onSave={saveAll} onCancel={() => setEditing(null)} busy={busy}
        />
      )}
    </>
  );
}

function CollectionEditor({ value, onChange, onSave, onCancel, busy }: {
  value: CollectionFull;
  onChange: (v: CollectionFull) => void;
  onSave: () => void;
  onCancel: () => void;
  busy: boolean;
}) {
  const [reports, setReports] = useState<OfferReportMeta[]>([]);
  const [reportId, setReportId] = useState('');
  const [applyingReport, setApplyingReport] = useState(false);
  const [reportNotice, setReportNotice] = useState<string | null>(null);
  const [reportError, setReportError] = useState<string | null>(null);
  const set = (patch: Partial<CollectionFull>) => onChange({ ...value, ...patch });
  const setHotel = (i: number, patch: Partial<CollectionHotel>) =>
    set({ hotels: value.hotels.map((h, j) => (j === i ? { ...h, ...patch } : h)) });
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir; if (j < 0 || j >= value.hotels.length) return;
    const next = [...value.hotels]; [next[i], next[j]] = [next[j], next[i]]; set({ hotels: next });
  };
  const removeHotel = (i: number) => set({ hotels: value.hotels.filter((_, j) => j !== i) });
  const setPkg = (hi: number, pi: number, patch: Partial<CollectionPackage>) =>
    setHotel(hi, { packages: (value.hotels[hi].packages || []).map((p, j) => (j === pi ? { ...p, ...patch } : p)) });
  const addPkg = (hi: number) => setHotel(hi, { packages: [...(value.hotels[hi].packages || []), {}] });
  const removePkg = (hi: number, pi: number) =>
    setHotel(hi, { packages: (value.hotels[hi].packages || []).filter((_, j) => j !== pi) });
  const addHotel = (h: CollectionHotel) => set({ hotels: [...value.hotels, h] });
  const applyReport = async () => {
    if (!reportId) return;
    setApplyingReport(true); setReportNotice(null); setReportError(null);
    try {
      const res = await fetch(`/api/admin/search/offer-reports/${reportId}`, { cache: 'no-store' });
      const report = await res.json() as OfferReport;
      if (!res.ok) throw new Error((report as { error?: string }).error || `HTTP ${res.status}`);
      const byHotel = new Map<string, OfferReportRow>();
      for (const row of report.rows || []) {
        if (!row.hotelId || row.sellTotal == null) continue;
        byHotel.set(String(row.hotelId), betterOfferRow(byHotel.get(String(row.hotelId)), row)!);
      }
      let matched = 0;
      const nextHotels = value.hotels.map((hotel, originalIndex) => {
        const row = hotel.hotelId == null ? undefined : byHotel.get(String(hotel.hotelId));
        if (!row) return { hotel, originalIndex, row };
        matched += 1;
        return {
          originalIndex,
          row,
          hotel: {
            ...hotel,
            offer: row.promoName || hotel.offer,
            packages: [packageFromOfferRow(row), ...(hotel.packages || []).slice(1)],
          },
        };
      }).sort((a, b) => {
        const promote = promoteRankOf(b.hotel) - promoteRankOf(a.hotel);
        if (promote !== 0) return promote;
        const matchedDiff = Number(Boolean(b.row)) - Number(Boolean(a.row));
        if (matchedDiff !== 0) return matchedDiff;
        const marginDiff = marginOf(b.row) - marginOf(a.row);
        if (marginDiff !== 0) return marginDiff;
        return a.originalIndex - b.originalIndex;
      }).map((x) => x.hotel);

      set({ hotels: nextHotels });
      setReportNotice(`Applied ${matched} hotel${matched === 1 ? '' : 's'} from "${report.name}". Save the collection to publish this order.`);
    } catch (e) {
      setReportError(e instanceof Error ? e.message : 'Could not apply offer report.');
    } finally {
      setApplyingReport(false);
    }
  };

  useEffect(() => {
    let alive = true;
    fetch('/api/admin/search/offer-reports', { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => { if (alive) setReports(j.reports || []); })
      .catch(() => { if (alive) setReports([]); });
    return () => { alive = false; };
  }, []);

  return (
    <div className="c-card" style={{ padding: 18, display: 'grid', gap: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <strong>{value.id ? `Edit: ${value.title || value.slug}` : 'New collection'}</strong>
        <div>
          <button className="c-btn" onClick={onCancel} disabled={busy}><X size={14} /> Cancel</button>{' '}
          <button className="c-btn c-btn-primary" onClick={onSave} disabled={busy}><Save size={14} /> {busy ? 'Saving…' : 'Save'}</button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Field label="Slug (URL)"><input className="c-input" value={value.slug}
          onChange={(e) => set({ slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') })}
          placeholder="maldives-finest-luxury-resorts" disabled={!!value.id} /></Field>
        <Field label="Status">
          <select className="c-select" value={value.status} onChange={(e) => set({ status: e.target.value as 'draft' | 'published' })}>
            <option value="draft">Draft (hidden)</option>
            <option value="published">Published (live)</option>
          </select>
        </Field>
        <Field label="Title"><input className="c-input" value={value.title} onChange={(e) => set({ title: e.target.value })} placeholder="The Maldives, Reimagined" /></Field>
        <Field label="Subtitle"><input className="c-input" value={value.subtitle || ''} onChange={(e) => set({ subtitle: e.target.value })} /></Field>
        <Field label="Hero image URL"><input className="c-input" value={value.heroImage || ''} onChange={(e) => set({ heroImage: e.target.value })} /></Field>
        <Field label="Member benefit line"><input className="c-input" value={value.memberBenefit || ''} onChange={(e) => set({ memberBenefit: e.target.value })} /></Field>
        <Field label="Search destination — fills the “Discover {this} like never before” heading and scopes the hero search box (e.g. Maldives, Cairo). Clear the intro below to hide the heading entirely.">
          <input className="c-input" value={value.searchDestination || ''} onChange={(e) => set({ searchDestination: e.target.value })} placeholder="Maldives" />
        </Field>
        {/* Advertised-package campaign — drives the collection cards' "from $X ·
            N nights · stays till <date>". Leave blank for no campaign. Enter the
            advertise cutoff (e.g. 30 Sep) even if the offer terms run later. */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
          <Field label="Campaign · min stay (nights)">
            <input className="c-input" type="number" min={1} value={value.campaignMinStay ?? ''}
              onChange={(e) => set({ campaignMinStay: e.target.value === '' ? null : Number(e.target.value) })} placeholder="4" />
          </Field>
          <Field label="Campaign · package nights (from-rate is for this stay length)">
            <input className="c-input" type="number" min={1} value={value.campaignPackageNights ?? ''}
              onChange={(e) => set({ campaignPackageNights: e.target.value === '' ? null : Number(e.target.value) })} placeholder="7" />
          </Field>
          <Field label="Campaign · advertise stays from">
            <input className="c-input" type="date" value={(value.campaignAdvertiseFrom || '').slice(0, 10)}
              onChange={(e) => set({ campaignAdvertiseFrom: e.target.value || null })} />
          </Field>
          <Field label="Campaign · advertise stays until (advertise cutoff)">
            <input className="c-input" type="date" value={(value.campaignAdvertiseTo || '').slice(0, 10)}
              onChange={(e) => set({ campaignAdvertiseTo: e.target.value || null })} />
          </Field>
        </div>
        <Field label="Intro paragraphs (leave a blank line between paragraphs)">
          {/* Blank line = new paragraph, so paragraphs round-trip with spacing
              (split on blank lines, join with a blank line). A single newline
              inside a paragraph is kept as a soft break. */}
          <textarea className="c-input" rows={6} value={(value.intro || []).join('\n\n')}
            onChange={(e) => set({ intro: e.target.value.split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean) })} />
        </Field>
        <Field label="Travel guide button — label"><input className="c-input" value={value.travelGuideLabel || ''} onChange={(e) => set({ travelGuideLabel: e.target.value })} placeholder="Best of Maldives Travel Guide" /></Field>
        <Field label="Travel guide button — URL (opens in a new tab)"><input className="c-input" value={value.travelGuideUrl || ''} onChange={(e) => set({ travelGuideUrl: e.target.value })} placeholder="https://firstclass.com.au/destination/…" /></Field>
        <Field label="Quote / reference"><input className="c-input" value={value.quoteRef || ''} onChange={(e) => set({ quoteRef: e.target.value })} /></Field>
      </div>

      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <div>
            <div className="c-label">Hotels ({value.hotels.length})</div>
            <div style={{ color: 'var(--c-fg-muted)', fontSize: 12, marginTop: 2 }}>
              Apply an Offers report to rank by manual promote rank, then report margin. Matching hotels get public sell-price package text.
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <select className="c-select" value={reportId} onChange={(e) => setReportId(e.target.value)} style={{ minWidth: 280 }}>
              <option value="">Choose offer report…</option>
              {reports.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} · {r.offerCount} offers · {new Date(r.createdAt).toLocaleDateString('en-AU')}
                </option>
              ))}
            </select>
            <button className="c-btn" onClick={applyReport} disabled={!reportId || applyingReport || value.hotels.length === 0}>
              <RefreshCw size={13} /> {applyingReport ? 'Applying…' : 'Apply report'}
            </button>
          </div>
        </div>
        {reportNotice && <div style={{ color: 'var(--c-success)', fontSize: 12, marginBottom: 8 }}>{reportNotice}</div>}
        {reportError && <div style={{ color: 'var(--c-danger)', fontSize: 12, marginBottom: 8 }}>Report error: {reportError}</div>}
        <HotelSearch onAdd={addHotel} />
        <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
          {value.hotels.map((h, i) => (
            <div key={i} className="c-card" style={{ padding: 12, display: 'grid', gap: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <strong>{h.name || '(unnamed)'} {h.hotelId ? <span className="c-mono" style={{ color: 'var(--c-fg-muted)' }}>#{h.hotelId}</span> : <span className="c-pill c-pill-warn">enquiry-only</span>}</strong>
                <div style={{ whiteSpace: 'nowrap' }}>
                  <button className="c-btn" onClick={() => move(i, -1)} disabled={i === 0}><ArrowUp size={13} /></button>{' '}
                  <button className="c-btn" onClick={() => move(i, 1)} disabled={i === value.hotels.length - 1}><ArrowDown size={13} /></button>{' '}
                  <button className="c-btn c-btn-danger" onClick={() => removeHotel(i)}><Trash2 size={13} /></button>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <Field label="Display name"><input className="c-input" value={h.name} onChange={(e) => setHotel(i, { name: e.target.value })} /></Field>
                <Field label="Atoll / location"><input className="c-input" value={h.atoll || ''} onChange={(e) => setHotel(i, { atoll: e.target.value })} /></Field>
                <Field label="Image URL"><input className="c-input" value={h.image || ''} onChange={(e) => setHotel(i, { image: e.target.value })} /></Field>
                <Field label="Offer text"><input className="c-input" value={h.offer || ''} onChange={(e) => setHotel(i, { offer: e.target.value })} /></Field>
                <Field label="Book by"><input className="c-input" value={h.bookBy || ''} onChange={(e) => setHotel(i, { bookBy: e.target.value })} /></Field>
                <Field label="Customisable">
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <input type="checkbox" checked={!!h.customisable} onChange={(e) => setHotel(i, { customisable: e.target.checked })} /> packages can be tailored
                  </label>
                </Field>
                <Field label="Editorial blurb"><textarea className="c-input" rows={2} value={h.editorial || ''} onChange={(e) => setHotel(i, { editorial: e.target.value })} /></Field>
                <Field label="Extra photos — one URL per line (2+ → card shows a carousel; first is the primary)">
                  <textarea className="c-input" rows={2} value={(h.images || []).join('\n')}
                    onChange={(e) => setHotel(i, { images: e.target.value.split('\n').map((s) => s.trim()).filter(Boolean) })} />
                </Field>
              </div>

              {/* Packages — the priced offers the card renders. Free text on
                  purpose: these are marketing lines ("Stay 7 nights, pay for 5",
                  "from US$7,390"), not amounts the engine computes, and the page
                  prints them verbatim. A blank field is simply omitted. */}
              <div style={{ borderTop: '1px solid var(--c-line)', paddingTop: 10, display: 'grid', gap: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span className="c-label">Packages &amp; pricing ({(h.packages || []).length})</span>
                  <button className="c-btn" onClick={() => addPkg(i)}>+ Add package</button>
                </div>
                {(h.packages || []).map((p, pi) => (
                  <div key={pi} className="c-card" style={{ padding: 10, display: 'grid', gap: 8, background: 'var(--c-bg-soft)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span className="c-label">Package {pi + 1}</span>
                      <button className="c-btn c-btn-danger" onClick={() => removePkg(i, pi)}><Trash2 size={12} /></button>
                    </div>
                    <Field label="Summary — the headline line">
                      <input className="c-input" value={p.summary || ''} placeholder="Stay 7 nights, pay for 5"
                        onChange={(e) => setPkg(i, pi, { summary: e.target.value })} />
                    </Field>
                    <Field label="Inclusions">
                      <textarea className="c-input" rows={2} value={p.inclusions || ''}
                        onChange={(e) => setPkg(i, pi, { inclusions: e.target.value })} />
                    </Field>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      <Field label="Our offer — the headline price">
                        <input className="c-input" value={p.ourOffer || ''} placeholder="US$8,210"
                          onChange={(e) => setPkg(i, pi, { ourOffer: e.target.value })} />
                      </Field>
                      <Field label="Approx local currency">
                        <input className="c-input" value={p.audApprox || ''} placeholder="approx AU$11,980"
                          onChange={(e) => setPkg(i, pi, { audApprox: e.target.value })} />
                      </Field>
                      <Field label="Hotel / competitor rate — struck through">
                        <input className="c-input" value={p.hotelRate || ''} placeholder="AU$9,832"
                          onChange={(e) => setPkg(i, pi, { hotelRate: e.target.value })} />
                      </Field>
                      <Field label="Where that rate is from">
                        <input className="c-input" value={p.competitorsNote || ''} placeholder="Luxury Escapes & Expedia both higher"
                          onChange={(e) => setPkg(i, pi, { competitorsNote: e.target.value })} />
                      </Field>
                      <Field label="Saving — shown as “Save …”">
                        <input className="c-input" value={p.saving || ''} placeholder="$1,500"
                          onChange={(e) => setPkg(i, pi, { saving: e.target.value })} />
                      </Field>
                      <Field label="Basis — small print">
                        <input className="c-input" value={p.basis || ''} placeholder="based on Sep 2026 stay"
                          onChange={(e) => setPkg(i, pi, { basis: e.target.value })} />
                      </Field>
                    </div>
                  </div>
                ))}
                {(h.packages || []).length === 0 && (
                  <div className="c-empty" style={{ padding: '10px 12px', fontSize: 12 }}>
                    No packages — this card shows no price.
                  </div>
                )}
              </div>
            </div>
          ))}
          {value.hotels.length === 0 && <div className="c-empty">No hotels yet — search above to add.</div>}
        </div>
      </div>
    </div>
  );
}

function HotelSearch({ onAdd }: { onAdd: (h: CollectionHotel) => void }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Array<{ hotel_id: number; name: string; city?: string; country?: string }>>([]);
  const [searching, setSearching] = useState(false);

  async function run() {
    if (q.trim().length < 2) return;
    setSearching(true);
    try {
      const r = await fetch(`${HOTEL_API}/api/hotels/search?query=${encodeURIComponent(q)}&limit=10`);
      const d = await r.json();
      const rows = (d.hotels || d.results || d || []) as Array<Record<string, unknown>>;
      setResults(rows.map((h) => ({
        hotel_id: Number(h.hotel_id ?? h.id),
        name: String(h.name ?? h.hotel_name ?? ''),
        city: h.city as string, country: h.country as string,
      })).filter((h) => h.hotel_id));
    } catch { setResults([]); }
    finally { setSearching(false); }
  }

  return (
    <div className="c-card" style={{ padding: 12 }}>
      <div className="c-filter-row">
        <input className="c-input" placeholder="Search hotels to add (name)…" value={q}
          onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && run()} style={{ flex: 1 }} />
        <button className="c-btn c-btn-primary" onClick={run} disabled={searching}><Search size={14} /> {searching ? '…' : 'Search'}</button>
        <button className="c-btn" onClick={() => onAdd({ name: '', customisable: false })} title="Add an enquiry-only entry with no linked hotel">+ Manual</button>
      </div>
      {results.length > 0 && (
        <div style={{ display: 'grid', gap: 4, marginTop: 8 }}>
          {results.map((h) => (
            <button key={h.hotel_id} className="c-btn" style={{ justifyContent: 'space-between', textAlign: 'left' }}
              onClick={() => { onAdd({ hotelId: h.hotel_id, name: h.name, atoll: h.city, customisable: false }); setResults([]); setQ(''); }}>
              <span>{h.name}</span>
              <span className="c-mono" style={{ color: 'var(--c-fg-muted)' }}>#{h.hotel_id} · {h.city || ''} {h.country || ''}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'grid', gap: 4 }}>
      <span className="c-label">{label}</span>
      {children}
    </label>
  );
}
