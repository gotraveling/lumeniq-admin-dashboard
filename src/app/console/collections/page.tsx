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
import { useEffect, useState, useCallback } from 'react';
import { FolderOpen, Plus, Trash2, ArrowUp, ArrowDown, Search, Save, X } from 'lucide-react';

const HOTEL_API = process.env.NEXT_PUBLIC_HOTEL_API_URL
  || 'https://hotel-api-91901273027.australia-southeast1.run.app';

interface CollectionListRow {
  id: number; slug: string; title: string; subtitle?: string;
  status: 'draft' | 'published'; hotelCount: number; updatedAt?: string;
}
interface CollectionHotel {
  hotelId?: number; name: string; atoll?: string; image?: string;
  offer?: string; bookBy?: string; editorial?: string; customisable?: boolean;
}
interface CollectionFull {
  id: number; slug: string; title: string; subtitle?: string; heroImage?: string;
  intro: string[]; memberBenefit?: string; quoteRef?: string;
  status: 'draft' | 'published'; hotels: CollectionHotel[];
}

const BLANK: CollectionFull = {
  id: 0, slug: '', title: '', subtitle: '', heroImage: '',
  intro: [], memberBenefit: '', quoteRef: '', status: 'draft', hotels: [],
};

export default function CollectionsPage() {
  const [list, setList] = useState<CollectionListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<CollectionFull | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

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
        quoteRef: editing.quoteRef, status: editing.status, updatedBy: 'console',
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
          {loading ? <div className="c-loading">Loading…</div> : (
            list.length === 0 ? <div className="c-empty">No collections yet. Create one to get started.</div> : (
              <table className="c-table">
                <thead><tr><th>Title</th><th>Slug</th><th>Hotels</th><th>Status</th><th></th></tr></thead>
                <tbody>
                  {list.map((c) => (
                    <tr key={c.id}>
                      <td>{c.title}</td>
                      <td className="c-mono">{c.slug}</td>
                      <td>{c.hotelCount}</td>
                      <td><span className={`c-pill ${c.status === 'published' ? 'c-pill-success' : 'c-pill-warn'}`}>{c.status}</span></td>
                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <button className="c-btn" onClick={() => openEditor(c.slug)} disabled={busy}>Edit</button>
                        {' '}
                        <a className="c-btn" href={`https://firstclass.com.au/luxury-hotels/collections/${c.slug}`} target="_blank" rel="noreferrer">View</a>
                        {' '}
                        <a className="c-btn" href={`https://firstclass.com.au/newsletter/preview?collection=${c.slug}`} target="_blank" rel="noreferrer">Newsletter</a>
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
  const set = (patch: Partial<CollectionFull>) => onChange({ ...value, ...patch });
  const setHotel = (i: number, patch: Partial<CollectionHotel>) =>
    set({ hotels: value.hotels.map((h, j) => (j === i ? { ...h, ...patch } : h)) });
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir; if (j < 0 || j >= value.hotels.length) return;
    const next = [...value.hotels]; [next[i], next[j]] = [next[j], next[i]]; set({ hotels: next });
  };
  const removeHotel = (i: number) => set({ hotels: value.hotels.filter((_, j) => j !== i) });
  const addHotel = (h: CollectionHotel) => set({ hotels: [...value.hotels, h] });

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
        <Field label="Intro paragraphs (one per line)">
          <textarea className="c-input" rows={4} value={(value.intro || []).join('\n')}
            onChange={(e) => set({ intro: e.target.value.split('\n').map((s) => s.trim()).filter(Boolean) })} />
        </Field>
        <Field label="Quote / reference"><input className="c-input" value={value.quoteRef || ''} onChange={(e) => set({ quoteRef: e.target.value })} /></Field>
      </div>

      <div>
        <div className="c-label" style={{ marginBottom: 8 }}>Hotels ({value.hotels.length})</div>
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
