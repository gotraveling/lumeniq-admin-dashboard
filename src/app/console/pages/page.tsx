'use client';

/**
 * /console/pages — compose a page out of ordered blocks.
 *
 * v1 ships ONE page (the luxury-hotels homepage) and ONE block type (a
 * collection row). Before this existed, a collection appeared on the homepage
 * only if someone hand-wrote a `homepage_position` in a SQL migration — nothing
 * in the console could show or change it.
 *
 * A block points at a collection and may override, FOR THIS PAGE ONLY, the
 * headline, subtitle, layout and advertised nights. Blank = inherit. That
 * separation is the point: reframing a row here never touches the collection's
 * own landing page or its rate prefetch.
 *
 * Reads + writes both go through /api/admin/pages so COLLECTIONS_ADMIN_KEY stays
 * server-side. Collection list reads hit hotel-api directly (public).
 */
import { useEffect, useState, useCallback } from 'react';
import { LayoutList, Plus, Trash2, ArrowUp, ArrowDown, Save, X, Eye, EyeOff } from 'lucide-react';

const HOTEL_API = process.env.NEXT_PUBLIC_HOTEL_API_URL
  || 'https://hotel-api-91901273027.australia-southeast1.run.app';

// The one page v1 manages. Adding pages means adding rows here + in `pages`.
const PAGES = [
  { slug: 'luxury-hotels-home', title: 'Luxury hotels homepage', viewHref: 'https://firstclass.com.au/luxury-hotels' },
];

// Advertised nights is restricted to the lengths the rate prewarm actually warms
// (booking-engine-api PREWARM_LOS). An unwarmed length returns no price and the
// site silently shows a DIFFERENT stay length behind the label. Keep in step
// with the CHECK in migration 033 and PREWARM_LOS in routes/pages.js.
const PREWARM_LOS = [1, 3, 7];

interface BlockCollection {
  slug: string; title: string; subtitle?: string; type: string;
  status: string; layout: string; los: number | null; hotelCount: number;
}
interface Block {
  id?: number;
  blockType: string;
  collectionId: number | null;
  enabled: boolean;
  titleOverride?: string | null;
  subtitleOverride?: string | null;
  layoutOverride?: string | null;
  losOverride?: number | null;
  collection: BlockCollection | null;
}
interface CollectionListRow {
  id: number; slug: string; title: string; status: string; hotelCount: number;
}

export default function PagesPage() {
  const [editingSlug, setEditingSlug] = useState<string | null>(null);

  if (editingSlug) {
    return <PageEditor slug={editingSlug} onClose={() => setEditingSlug(null)} />;
  }

  return (
    <div>
      <div className="c-page-head">
        <div>
          <h1 className="c-page-title"><LayoutList size={18} style={{ verticalAlign: '-3px' }} /> Pages</h1>
          <p className="c-page-sub">
            Compose a page from collections — choose which rows appear, in what order, and how each one is framed.
          </p>
        </div>
      </div>

      <table className="c-table">
        <thead><tr><th>Page</th><th>Slug</th><th></th></tr></thead>
        <tbody>
          {PAGES.map((p) => (
            <tr key={p.slug}>
              <td>{p.title}</td>
              <td className="c-mono">{p.slug}</td>
              <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                <button className="c-btn" onClick={() => setEditingSlug(p.slug)}>Edit</button>{' '}
                <a className="c-btn" href={p.viewHref} target="_blank" rel="noreferrer">View</a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PageEditor({ slug, onClose }: { slug: string; onClose: () => void }) {
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [title, setTitle] = useState('');
  const [collections, setCollections] = useState<CollectionListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const r = await fetch(`/api/admin/pages/${slug}`, { cache: 'no-store' });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      setTitle(d.page?.title || slug);
      setBlocks(d.blocks || []);
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }, [slug]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(`${HOTEL_API}/api/collections?status=published`, { cache: 'no-store' });
        const d = await r.json();
        setCollections(d.collections || []);
      } catch { /* the picker just stays empty; not worth blocking the editor */ }
    })();
  }, []);

  const setBlock = (i: number, patch: Partial<Block>) =>
    setBlocks((prev) => prev.map((b, j) => (j === i ? { ...b, ...patch } : b)));

  // Positional ordering, same as the collection's pinned hotels — the array
  // order IS the saved order (the API rewrites `position` from the index).
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= blocks.length) return;
    const next = [...blocks];
    [next[i], next[j]] = [next[j], next[i]];
    setBlocks(next);
  };

  const addBlock = (c: CollectionListRow) => setBlocks((prev) => [...prev, {
    blockType: 'collection', collectionId: c.id, enabled: true,
    collection: { slug: c.slug, title: c.title, type: '', status: c.status, layout: 'rail', los: null, hotelCount: c.hotelCount },
  }]);

  const save = async () => {
    setBusy(true); setError(null); setNotice(null);
    try {
      const r = await fetch(`/api/admin/pages/${slug}/blocks`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blocks }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      setNotice('Saved. The live page updates within about 5 minutes.');
      await load();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };

  if (loading) return <div className="c-loading">Loading page…</div>;

  const used = new Set(blocks.map((b) => b.collectionId));

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div className="c-page-head">
        <div>
          <h1 className="c-page-title">{title}</h1>
          <p className="c-page-sub">
            {blocks.length} block{blocks.length === 1 ? '' : 's'} — top of this list is the top of the page.
            Leave an override blank to inherit from the collection.
          </p>
        </div>
        <div style={{ whiteSpace: 'nowrap' }}>
          <button className="c-btn" onClick={onClose}><X size={13} /> Cancel</button>{' '}
          <button className="c-btn c-btn-primary" onClick={save} disabled={busy}>
            <Save size={13} /> {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      {error && <div className="c-error">{error}</div>}
      {notice && <div className="c-card" style={{ borderColor: 'var(--c-success)', padding: 12 }}>{notice}</div>}

      <div style={{ display: 'grid', gap: 10 }}>
        {blocks.map((b, i) => {
          const inherited = b.collection;
          return (
            <div key={b.id ?? `new-${i}`} className="c-card"
              style={{ padding: 12, display: 'grid', gap: 8, opacity: b.enabled ? 1 : 0.55 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <strong>
                  <span className="c-mono" style={{ color: 'var(--c-fg-muted)' }}>{i + 1}.</span>{' '}
                  {b.titleOverride || inherited?.title || '(missing collection)'}{' '}
                  {b.titleOverride && <span className="c-pill c-pill-muted">retitled</span>}{' '}
                  {!b.enabled && <span className="c-pill c-pill-warn">hidden</span>}
                </strong>
                <div style={{ whiteSpace: 'nowrap' }}>
                  <button className="c-btn" onClick={() => move(i, -1)} disabled={i === 0}><ArrowUp size={13} /></button>{' '}
                  <button className="c-btn" onClick={() => move(i, 1)} disabled={i === blocks.length - 1}><ArrowDown size={13} /></button>{' '}
                  <button className="c-btn" onClick={() => setBlock(i, { enabled: !b.enabled })}>
                    {b.enabled ? <><EyeOff size={13} /> Hide</> : <><Eye size={13} /> Show</>}
                  </button>{' '}
                  <button className="c-btn c-btn-danger"
                    onClick={() => setBlocks((prev) => prev.filter((_, j) => j !== i))}><Trash2 size={13} /></button>
                </div>
              </div>

              <div style={{ fontSize: 12, color: 'var(--c-fg-muted)' }}>
                <span className="c-mono">{inherited?.slug}</span>
                {inherited ? ` · ${inherited.type || 'collection'} · ${inherited.hotelCount} pinned hotel${inherited.hotelCount === 1 ? '' : 's'}` : ''}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <Field label="Headline on this page">
                  <input className="c-input" value={b.titleOverride || ''}
                    placeholder={inherited?.title || ''}
                    onChange={(e) => setBlock(i, { titleOverride: e.target.value })} />
                </Field>
                <Field label="Subtitle on this page">
                  <input className="c-input" value={b.subtitleOverride || ''}
                    placeholder={inherited?.subtitle || ''}
                    onChange={(e) => setBlock(i, { subtitleOverride: e.target.value })} />
                </Field>
                <Field label="Layout">
                  <select className="c-select" value={b.layoutOverride || ''}
                    onChange={(e) => setBlock(i, { layoutOverride: e.target.value || null })}>
                    <option value="">Inherit ({inherited?.layout || 'rail'})</option>
                    <option value="rail">Rail</option>
                    <option value="feature">Feature</option>
                  </select>
                </Field>
                <Field label="Advertised nights">
                  <select className="c-select" value={b.losOverride == null ? '' : String(b.losOverride)}
                    onChange={(e) => setBlock(i, { losOverride: e.target.value ? Number(e.target.value) : null })}>
                    <option value="">
                      Inherit{inherited?.los ? ` (${inherited.los} nights)` : ' (cheapest available)'}
                    </option>
                    {PREWARM_LOS.map((n) => (
                      <option key={n} value={n}>{n} night{n === 1 ? '' : 's'}</option>
                    ))}
                  </select>
                </Field>
              </div>
            </div>
          );
        })}
        {blocks.length === 0 && (
          <div className="c-empty">
            <div className="c-empty-title">No blocks</div>
            The live page is falling back to its previous ordering. Add collections below.
          </div>
        )}
      </div>

      <div>
        <div className="c-label" style={{ marginBottom: 8 }}>Add a collection block</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {collections.map((c) => (
            <button key={c.id} className="c-btn" onClick={() => addBlock(c)}>
              <Plus size={12} /> {c.title}{used.has(c.id) ? ' (again)' : ''}
            </button>
          ))}
          {collections.length === 0 && <div className="c-empty">No published collections found.</div>}
        </div>
        <p style={{ fontSize: 11.5, color: 'var(--c-fg-muted)', margin: '8px 0 0' }}>
          The same collection can appear more than once — give each block its own headline and advertised nights.
          Advertised nights is limited to {PREWARM_LOS.join(', ')} because those are the stay lengths we pre-price;
          anything else would show a price for a different number of nights.
        </p>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label style={{ display: 'grid', gap: 4 }}><span className="c-label">{label}</span>{children}</label>;
}
