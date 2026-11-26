'use client';

/**
 * Hotel interests (Tina, Nov 2026): diving, wellness, food, underwater,
 * family, honeymoon, surfing. Ticked here per hotel; the collection page's
 * Interests filter shows only interests at least one of its hotels has.
 *
 * "Suggest" pre-ticks from the hotel's own text (description, amenities,
 * restaurants, rooms, our editorial). A suggested tick is marked in amber
 * until someone saves the row — nothing is stored until then.
 *
 * Interests belong to the property: ticking a hotel's RateHawk record also
 * covers its Hummingbird record.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth } from '@/lib/firebase';

const INTERESTS: Array<{ key: string; short: string; label: string }> = [
  { key: 'diving', short: 'Diving', label: 'Diving & snorkelling' },
  { key: 'wellness', short: 'Wellness', label: 'Wellness & spa' },
  { key: 'food', short: 'Food', label: 'Food & dining' },
  { key: 'underwater', short: 'Underwater', label: 'Underwater experiences' },
  { key: 'family', short: 'Family', label: 'Family friendly' },
  { key: 'honeymoon', short: 'Honeymoon', label: 'Honeymoon & romance' },
  { key: 'surfing', short: 'Surfing', label: 'Surfing' },
];
const PAGE = 25;

type Collection = { slug: string; title: string; status: string; moreRule?: unknown };
type Hotel = { hotelId: number; name: string; hidden?: boolean };
type RowState = {
  loaded: boolean;
  saved: string[];                    // what is stored
  ticked: string[];                   // what the boxes show now
  suggestedBy: Record<string, string>; // interest -> words found in the hotel text
  fromSuggestion: string[];           // ticks that came from Suggest and are not saved yet
  saving?: boolean;
  error?: string | null;
  savedAt?: number;
};

const same = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));

export default function InterestsPage() {
  const [user] = useAuthState(auth);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [slug, setSlug] = useState('');
  const [list, setList] = useState<'page' | 'more'>('page');
  const [hotels, setHotels] = useState<Hotel[]>([]);
  const [shown, setShown] = useState(PAGE);
  const [rows, setRows] = useState<Record<number, RowState>>({});
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [addId, setAddId] = useState('');

  useEffect(() => {
    fetch('/api/admin/collections?status=all', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        const cs: Collection[] = (d.collections || []).filter((c: Collection) => c.slug);
        cs.sort((a, b) => a.title.localeCompare(b.title));
        setCollections(cs);
        const first = cs.find((c) => /maldives-finest/.test(c.slug)) || cs[0];
        if (first) setSlug(first.slug);
      })
      .catch(() => setErr('Could not load collections'));
  }, []);

  const current = collections.find((c) => c.slug === slug);
  const hasMore = !!current?.moreRule;

  useEffect(() => {
    if (!slug) return;
    setLoading(true); setErr(null); setShown(PAGE);
    fetch(`/api/admin/interests?collection=${encodeURIComponent(slug)}&list=${list}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => setHotels(d.hotels || []))
      .catch(() => setErr('Could not load the hotels'))
      .finally(() => setLoading(false));
  }, [slug, list]);

  const loadRow = useCallback(async (id: number) => {
    const r = await fetch(`/api/admin/interests?hotelId=${id}`, { cache: 'no-store' });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || 'Could not load');
    setRows((prev) => ({
      ...prev,
      [id]: { loaded: true, saved: d.saved || [], ticked: d.saved || [], suggestedBy: d.suggested || {}, fromSuggestion: [] },
    }));
  }, []);

  const visible = useMemo(() => hotels.slice(0, shown), [hotels, shown]);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const todo = visible.map((h) => h.hotelId).filter((id) => !rows[id]);
      for (let i = 0; i < todo.length && !cancelled; i += 6) {
        await Promise.all(todo.slice(i, i + 6).map((id) => loadRow(id).catch(() => {
          setRows((prev) => ({ ...prev, [id]: { loaded: true, saved: [], ticked: [], suggestedBy: {}, fromSuggestion: [], error: 'Could not load' } }));
        })));
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, loadRow]);

  const toggle = (id: number, key: string) => setRows((prev) => {
    const r = prev[id]; if (!r) return prev;
    const on = r.ticked.includes(key);
    return { ...prev, [id]: { ...r, ticked: on ? r.ticked.filter((k) => k !== key) : [...r.ticked, key], fromSuggestion: r.fromSuggestion.filter((k) => k !== key) } };
  });

  const suggest = (id: number) => setRows((prev) => {
    const r = prev[id]; if (!r) return prev;
    const add = Object.keys(r.suggestedBy).filter((k) => !r.ticked.includes(k));
    return { ...prev, [id]: { ...r, ticked: [...r.ticked, ...add], fromSuggestion: [...r.fromSuggestion, ...add] } };
  });

  const save = async (id: number) => {
    const r = rows[id]; if (!r) return;
    setRows((prev) => ({ ...prev, [id]: { ...prev[id], saving: true, error: null } }));
    try {
      const res = await fetch(`/api/admin/interests?hotelId=${id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ interests: r.ticked, updatedBy: user?.email || 'console' }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Save failed');
      setRows((prev) => ({ ...prev, [id]: { ...prev[id], saving: false, saved: d.interests, ticked: d.interests, fromSuggestion: [], savedAt: Date.now() } }));
    } catch (e) {
      setRows((prev) => ({ ...prev, [id]: { ...prev[id], saving: false, error: (e as Error).message } }));
    }
  };

  const changed = visible.filter((h) => rows[h.hotelId] && !same(rows[h.hotelId].ticked, rows[h.hotelId].saved));
  const saveAll = async () => { for (const h of changed) await save(h.hotelId); };
  const suggestAll = () => visible.forEach((h) => suggest(h.hotelId));

  const addHotel = (e: React.FormEvent) => {
    e.preventDefault();
    const id = Number(addId.trim());
    if (!Number.isFinite(id) || id <= 0) return;
    if (!hotels.some((h) => h.hotelId === id)) setHotels((prev) => [{ hotelId: id, name: `Hotel #${id}` }, ...prev]);
    setAddId('');
  };

  return (
    <div style={{ padding: 24, maxWidth: 1200 }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Hotel interests</h1>
      <div style={{ fontSize: 13, color: 'var(--c-fg-muted)', marginTop: 2, maxWidth: 860 }}>
        Tick what each hotel is good for. The collection page shows an Interests filter with every interest
        at least one of its hotels has. <b>Suggest</b> ticks what the hotel’s own description mentions; those ticks
        are marked <span style={SUGGESTED_CHIP}>suggested</span> until you save the row.
      </div>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginTop: 16 }}>
        <label style={{ fontSize: 13 }}>
          Collection{' '}
          <select className="c-input" value={slug} onChange={(e) => { setSlug(e.target.value); setList('page'); }}>
            {collections.map((c) => <option key={c.slug} value={c.slug}>{c.title}{c.status !== 'published' ? ' (draft)' : ''}</option>)}
          </select>
        </label>
        <label style={{ fontSize: 13 }}>
          Hotels{' '}
          <select className="c-input" value={list} onChange={(e) => setList(e.target.value as 'page' | 'more')}>
            <option value="page">On the page</option>
            {hasMore && <option value="more">Under Load More</option>}
          </select>
        </label>
        <form onSubmit={addHotel} style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}>
          Add hotel ID <input className="c-input" style={{ width: 120 }} value={addId} onChange={(e) => setAddId(e.target.value)} placeholder="e.g. 999188934" />
          <button className="c-btn" type="submit">Add</button>
        </form>
        <div style={{ flex: 1 }} />
        <button className="c-btn" type="button" onClick={suggestAll} disabled={!visible.length}>Suggest for all shown</button>
        <button className="c-btn c-btn-primary" type="button" onClick={saveAll} disabled={!changed.length}>
          Save all changes{changed.length ? ` (${changed.length})` : ''}
        </button>
      </div>

      {err && <div className="c-error" style={{ marginTop: 12 }}>{err}</div>}
      {loading && <div style={{ marginTop: 16, fontSize: 13, color: 'var(--c-fg-muted)' }}>Loading…</div>}

      {!loading && (
        <table className="c-table" style={{ marginTop: 16 }}>
          <thead>
            <tr>
              <th>Hotel</th>
              {INTERESTS.map((i) => <th key={i.key} title={i.label} style={{ textAlign: 'center' }}>{i.short}</th>)}
              <th />
            </tr>
          </thead>
          <tbody>
            {visible.map((h) => {
              const r = rows[h.hotelId];
              const dirty = r && !same(r.ticked, r.saved);
              return (
                <tr key={h.hotelId}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{h.name}{h.hidden ? ' (hidden)' : ''}</div>
                    <div style={{ fontSize: 12, color: 'var(--c-fg-muted)' }}>#{h.hotelId}</div>
                  </td>
                  {INTERESTS.map((i) => {
                    const ticked = !!r?.ticked.includes(i.key);
                    const sug = !!r?.fromSuggestion.includes(i.key);
                    const words = r?.suggestedBy[i.key];
                    return (
                      <td key={i.key} style={{ textAlign: 'center' }}>
                        <label title={words ? `Found in the hotel text: “${words}”` : i.label}
                          style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 2, cursor: r ? 'pointer' : 'default', ...(sug ? SUGGESTED_BOX : {}) }}>
                          <input type="checkbox" disabled={!r || r.saving} checked={ticked} onChange={() => toggle(h.hotelId, i.key)} />
                          {sug && <span style={{ fontSize: 10, color: '#92400e' }}>suggested</span>}
                        </label>
                      </td>
                    );
                  })}
                  <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                    {!r && <span style={{ fontSize: 12, color: 'var(--c-fg-muted)' }}>Loading…</span>}
                    {r && (
                      <>
                        <button className="c-btn" type="button" onClick={() => suggest(h.hotelId)}
                          disabled={!Object.keys(r.suggestedBy).some((k) => !r.ticked.includes(k))}
                          title={Object.keys(r.suggestedBy).length ? `Text mentions: ${Object.values(r.suggestedBy).join(', ')}` : 'Nothing found in the hotel text'}>
                          Suggest
                        </button>{' '}
                        <button className="c-btn c-btn-primary" type="button" onClick={() => save(h.hotelId)} disabled={!dirty || r.saving}>
                          {r.saving ? 'Saving…' : 'Save'}
                        </button>
                        {r.error && <div style={{ fontSize: 12, color: '#b91c1c' }}>{r.error}</div>}
                        {!dirty && r.savedAt && Date.now() - r.savedAt < 8000 && <div style={{ fontSize: 12, color: '#047857' }}>Saved</div>}
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
            {!visible.length && (
              <tr><td colSpan={INTERESTS.length + 2} style={{ color: 'var(--c-fg-muted)' }}>No hotels in this list.</td></tr>
            )}
          </tbody>
        </table>
      )}
      {!loading && hotels.length > shown && (
        <div style={{ marginTop: 12 }}>
          <button className="c-btn" type="button" onClick={() => setShown((n) => n + PAGE)}>
            Show {Math.min(PAGE, hotels.length - shown)} more of {hotels.length - shown}
          </button>
        </div>
      )}
    </div>
  );
}

const SUGGESTED_CHIP: React.CSSProperties = {
  background: '#fef3c7', border: '1px dashed #d97706', borderRadius: 4, padding: '0 4px', color: '#92400e', fontSize: 12,
};
const SUGGESTED_BOX: React.CSSProperties = {
  background: '#fef3c7', outline: '1px dashed #d97706', borderRadius: 4, padding: '2px 4px',
};
