'use client';

/**
 * /console/profiles — create & curate "Search Profiles": saved sets of search
 * filters that scope a brand/curation surface (e.g. firstclass = 5★ only,
 * honeymoon, transit-hotel microsite).
 *
 * A profile's `filters` JSONB compiles server-side into a Meili filter string.
 * Reads come through /api/admin/profiles (proxied); writes go through the same
 * proxy so the COLLECTIONS_ADMIN_KEY stays server-side. After a save we GET
 * /api/admin/profiles/filter?slug=… so the user can see the compiled filter.
 */
import { useEffect, useState, useCallback } from 'react';
import { SlidersHorizontal, Plus, Trash2, Save, X } from 'lucide-react';

const PROXIMITY_TIERS = ['in-terminal', 'connected', 'walkable', 'short-shuttle', 'off-airport'];
const SUPPLIERS = ['ratehawk', 'hummingbird'];

// The filters JSONB shape persisted on a profile.
interface ProfileFilters {
  min_star: number | null;
  luxury_tier: '5plus' | '5plusplus' | null;
  countries: string[];
  proximity_tier: string[];
  airside: boolean | null;
  day_use: boolean | null;
  blocked_suppliers: string[];
  collection_slugs: string[];
}

interface ProfileListRow {
  id: number; slug: string; name: string; description?: string;
  active: boolean; updated_at?: string;
}
interface ProfileFull {
  id: number; slug: string; name: string; description: string;
  filters: ProfileFilters; active: boolean;
}

const BLANK_FILTERS: ProfileFilters = {
  min_star: null, luxury_tier: null, countries: [], proximity_tier: [],
  airside: null, day_use: null, blocked_suppliers: [], collection_slugs: [],
};

const BLANK: ProfileFull = {
  id: 0, slug: '', name: '', description: '', filters: { ...BLANK_FILTERS }, active: true,
};

// Normalize whatever the API returns into a complete ProfileFilters object so
// the editor never reads from undefined keys.
function normFilters(f: Partial<ProfileFilters> | null | undefined): ProfileFilters {
  const src = f || {};
  return {
    min_star: src.min_star ?? null,
    luxury_tier: src.luxury_tier ?? null,
    countries: Array.isArray(src.countries) ? src.countries : [],
    proximity_tier: Array.isArray(src.proximity_tier) ? src.proximity_tier : [],
    airside: src.airside ?? null,
    day_use: src.day_use ?? null,
    blocked_suppliers: Array.isArray(src.blocked_suppliers) ? src.blocked_suppliers : [],
    collection_slugs: Array.isArray(src.collection_slugs) ? src.collection_slugs : [],
  };
}

// Coerce the editor state into the wire shape (empty arrays stay [], "Any"
// selects stay null) before POST/PUT.
function filtersForWire(f: ProfileFilters): ProfileFilters {
  return {
    min_star: f.min_star ?? null,
    luxury_tier: f.luxury_tier ?? null,
    countries: f.countries.map((s) => s.trim()).filter(Boolean),
    proximity_tier: f.proximity_tier.filter(Boolean),
    airside: f.airside ?? null,
    day_use: f.day_use ?? null,
    blocked_suppliers: f.blocked_suppliers.filter(Boolean),
    collection_slugs: f.collection_slugs.map((s) => s.trim()).filter(Boolean),
  };
}

export default function ProfilesPage() {
  const [list, setList] = useState<ProfileListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<ProfileFull | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const loadList = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const r = await fetch('/api/admin/profiles?status=all', { cache: 'no-store' });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      setList(d.profiles || []);
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadList(); }, [loadList]);

  async function openEditor(slug: string) {
    setBusy(true); setError(null);
    try {
      // Profile detail reads are public on the hotel-api and keyed by slug
      // (the proxy [id] route is for writes/deletes by numeric id). Same
      // public-read convention the collections editor uses.
      const base = process.env.NEXT_PUBLIC_HOTEL_API_URL
        || 'https://hotel-api-91901273027.australia-southeast1.run.app';
      const r = await fetch(`${base}/api/profiles/${encodeURIComponent(slug)}`, { cache: 'no-store' });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      setEditing({
        ...BLANK, ...d, description: d.description || '',
        filters: normFilters(d.filters), active: d.active ?? true,
      });
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }

  async function save() {
    if (!editing) return;
    if (!editing.slug || !editing.name) { setError('Slug and name are required.'); return; }
    setBusy(true); setError(null); setNotice(null);
    const filters = filtersForWire(editing.filters);
    try {
      let id = editing.id;
      if (id) {
        const r = await fetch(`/api/admin/profiles/${id}`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: editing.name, description: editing.description,
            filters, active: editing.active, updated_by: 'console',
          }),
        });
        const d = await r.json(); if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      } else {
        const r = await fetch('/api/admin/profiles', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            slug: editing.slug, name: editing.name, description: editing.description,
            filters, active: editing.active,
          }),
        });
        const d = await r.json(); if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
        id = d.id;
      }
      setNotice(`Saved "${editing.name}".`);
      // Keep the editor open so the compiled-filter preview can fetch now that
      // the profile exists/has a slug.
      setEditing({ ...editing, id });
      await loadList();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }

  async function remove(row: ProfileListRow) {
    if (!confirm(`Delete profile "${row.name}"? This cannot be undone.`)) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/admin/profiles/${row.id}`, { method: 'DELETE' });
      if (!r.ok) { const d = await r.json(); throw new Error(d.error || `HTTP ${r.status}`); }
      await loadList();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <>
      <div className="c-page-head">
        <div>
          <h1 className="c-page-title"><SlidersHorizontal size={20} style={{ verticalAlign: '-3px', marginRight: 6 }} />Search Profiles</h1>
          <p className="c-page-sub">Saved filter sets that scope a brand or microsite (e.g. 5★-only, honeymoon, transit hotels). Filters compile to a Meili query.</p>
        </div>
        {!editing && (
          <button className="c-btn c-btn-primary" disabled={busy}
            onClick={() => { setEditing({ ...BLANK, filters: { ...BLANK_FILTERS } }); setNotice(null); setError(null); }}>
            <Plus size={15} /> New profile
          </button>
        )}
      </div>

      {error && <div className="c-error">Error: {error}</div>}
      {notice && <div className="c-card" style={{ borderColor: 'var(--c-success)', color: 'var(--c-success)', padding: 12 }}>{notice}</div>}

      {!editing && (
        <>
          {loading ? <div className="c-loading">Loading…</div> : (
            list.length === 0 ? <div className="c-empty">No profiles yet. Create one to get started.</div> : (
              <table className="c-table">
                <thead><tr><th>Name</th><th>Slug</th><th>Active</th><th></th></tr></thead>
                <tbody>
                  {list.map((p) => (
                    <tr key={p.id}>
                      <td>{p.name}</td>
                      <td className="c-mono">{p.slug}</td>
                      <td><span className={`c-pill ${p.active ? 'c-pill-success' : 'c-pill-muted'}`}>{p.active ? 'active' : 'inactive'}</span></td>
                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <button className="c-btn" onClick={() => openEditor(p.slug)} disabled={busy}>Edit</button>
                        {' '}
                        <button className="c-btn c-btn-danger" onClick={() => remove(p)} disabled={busy}><Trash2 size={14} /></button>
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
        <ProfileEditor
          value={editing} onChange={setEditing} onSave={save} onCancel={() => setEditing(null)} busy={busy}
        />
      )}
    </>
  );
}

function ProfileEditor({ value, onChange, onSave, onCancel, busy }: {
  value: ProfileFull;
  onChange: (v: ProfileFull) => void;
  onSave: () => void;
  onCancel: () => void;
  busy: boolean;
}) {
  const set = (patch: Partial<ProfileFull>) => onChange({ ...value, ...patch });
  const setF = (patch: Partial<ProfileFilters>) => onChange({ ...value, filters: { ...value.filters, ...patch } });
  const f = value.filters;

  const toggleArr = (key: 'proximity_tier' | 'blocked_suppliers', item: string) => {
    const cur = f[key];
    setF({ [key]: cur.includes(item) ? cur.filter((x) => x !== item) : [...cur, item] } as Partial<ProfileFilters>);
  };

  return (
    <div className="c-card" style={{ padding: 18, display: 'grid', gap: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <strong>{value.id ? `Edit: ${value.name || value.slug}` : 'New profile'}</strong>
        <div>
          <button className="c-btn" onClick={onCancel} disabled={busy}><X size={14} /> Cancel</button>{' '}
          <button className="c-btn c-btn-primary" onClick={onSave} disabled={busy}><Save size={14} /> {busy ? 'Saving…' : 'Save'}</button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Field label="Slug (URL key)"><input className="c-input" value={value.slug}
          onChange={(e) => set({ slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') })}
          placeholder="firstclass-5-star" disabled={!!value.id} /></Field>
        <Field label="Active">
          <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input type="checkbox" checked={value.active} onChange={(e) => set({ active: e.target.checked })} /> profile is enabled
          </label>
        </Field>
        <Field label="Name"><input className="c-input" value={value.name} onChange={(e) => set({ name: e.target.value })} placeholder="FirstClass — 5★ only" /></Field>
        <div />
        <Field label="Description">
          <textarea className="c-input" rows={2} value={value.description} onChange={(e) => set({ description: e.target.value })} />
        </Field>
      </div>

      <div>
        <div className="c-label" style={{ marginBottom: 8 }}>Filters</div>
        <div className="c-card" style={{ padding: 14, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="Minimum star">
            <select className="c-select" value={f.min_star == null ? '' : String(f.min_star)}
              onChange={(e) => setF({ min_star: e.target.value === '' ? null : Number(e.target.value) })}>
              <option value="">Any</option>
              <option value="4">4+</option>
              <option value="5">5</option>
            </select>
          </Field>
          <Field label="Luxury tier">
            <select className="c-select" value={f.luxury_tier ?? ''}
              onChange={(e) => setF({ luxury_tier: (e.target.value || null) as ProfileFilters['luxury_tier'] })}>
              <option value="">Any</option>
              <option value="5plus">5★+</option>
              <option value="5plusplus">5★++</option>
            </select>
          </Field>

          <Field label="Airside">
            <TriState value={f.airside} onChange={(v) => setF({ airside: v })} />
          </Field>
          <Field label="Day use">
            <TriState value={f.day_use} onChange={(v) => setF({ day_use: v })} />
          </Field>

          <Field label="Countries (one per line or comma-separated)">
            <textarea className="c-input" rows={3} value={f.countries.join('\n')}
              onChange={(e) => setF({ countries: e.target.value.split(/[\n,]/).map((s) => s.trim()).filter(Boolean) })}
              placeholder="Maldives&#10;Mauritius" />
          </Field>
          <Field label="Proximity tier (airport)">
            <div style={{ display: 'grid', gap: 4 }}>
              {PROXIMITY_TIERS.map((t) => (
                <label key={t} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input type="checkbox" checked={f.proximity_tier.includes(t)} onChange={() => toggleArr('proximity_tier', t)} /> {t}
                </label>
              ))}
            </div>
          </Field>

          <Field label="Blocked suppliers">
            <div style={{ display: 'grid', gap: 4 }}>
              {SUPPLIERS.map((s) => (
                <label key={s} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input type="checkbox" checked={f.blocked_suppliers.includes(s)} onChange={() => toggleArr('blocked_suppliers', s)} /> {s}
                </label>
              ))}
            </div>
          </Field>
          <Field label="Collection slugs (one per line or comma-separated)">
            <textarea className="c-input" rows={3} value={f.collection_slugs.join('\n')}
              onChange={(e) => setF({ collection_slugs: e.target.value.split(/[\n,]/).map((s) => s.trim()).filter(Boolean) })}
              placeholder="maldives-finest-luxury-resorts" />
            <span className="c-page-sub" style={{ marginTop: 4 }}>informational; not yet a search filter</span>
          </Field>
        </div>
      </div>

      <CompiledFilter slug={value.slug} saved={!!value.id} />
    </div>
  );
}

// Tri-state Any / Yes / No → null | true | false
function TriState({ value, onChange }: { value: boolean | null; onChange: (v: boolean | null) => void }) {
  const cur = value == null ? 'any' : value ? 'yes' : 'no';
  return (
    <select className="c-select" value={cur}
      onChange={(e) => onChange(e.target.value === 'any' ? null : e.target.value === 'yes')}>
      <option value="any">Any</option>
      <option value="yes">Yes</option>
      <option value="no">No</option>
    </select>
  );
}

// Read-only preview of the server-compiled Meili filter. Only fetches once the
// profile has been saved (has a slug that exists server-side).
function CompiledFilter({ slug, saved }: { slug: string; saved: boolean }) {
  const [filter, setFilter] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!saved || !slug) return;
    setLoading(true); setErr(null);
    try {
      const r = await fetch(`/api/admin/profiles/filter?slug=${encodeURIComponent(slug)}`, { cache: 'no-store' });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      setFilter(d.filter ?? '');
    } catch (e) { setErr((e as Error).message); }
    finally { setLoading(false); }
  }, [slug, saved]);

  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <div className="c-label" style={{ marginBottom: 8 }}>Compiled Meili filter</div>
      {!saved ? (
        <div className="c-empty">Save the profile to see its compiled filter string.</div>
      ) : loading ? (
        <div className="c-loading">Compiling…</div>
      ) : err ? (
        <div className="c-error">Error: {err}</div>
      ) : (
        <pre className="c-card c-mono" style={{ padding: 12, whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0 }}>
          {filter || '(empty — no constraints)'}
        </pre>
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
