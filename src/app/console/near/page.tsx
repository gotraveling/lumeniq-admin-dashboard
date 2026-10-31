'use client';

/**
 * Near a place: our hotels around an airport, venue, landmark or event.
 *
 * Test page for Tina's "walk to the hotel" idea. Distance and the walk/drive
 * figures are free estimates; "Get real times" asks Google for the nearest 20
 * and caches the answer. The tag and note per hotel + place, and the general
 * per-hotel attributes, are our own data and survive supplier syncs.
 *
 * Everything goes through /api/admin/places/* (login checked, admin key added
 * server-side) to hotel-api /api/places.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

type Place = {
  id: number; kind: 'airport' | 'venue' | 'landmark'; code: string; name: string;
  category: string | null; city: string | null; country: string | null;
  latitude: number; longitude: number; coords_verified: boolean;
};
type PlaceEvent = {
  id: number; name: string; category: string | null; starts_on: string | null; ends_on: string | null;
  source: string; is_test: boolean; place?: Place;
};
type Time = { minutes: number | null; meters: number | null; fetched_at: string };
type Attr = { attr: string; note: string | null; updated_by?: string | null; updated_at?: string };
type Note = { proximity: string | null; note: string | null; updated_by: string | null; updated_at: string } | null;
type Hotel = {
  hotel_id: number; canonical_id: number | null; name: string; city: string | null; country: string | null;
  source: string | null; star_rating: number | null; latitude: number; longitude: number; image: string | null;
  km: number; est_walk_min: number; est_drive_min: number; also: Array<{ hotel_id: number; source: string }>;
  note: Note; attributes: Attr[]; times: Partial<Record<'WALK' | 'DRIVE' | 'TRANSIT', Time>>;
};

const API = '/api/admin/places';
const TAGS: Array<{ value: string; label: string }> = [
  { value: '', label: '—' },
  { value: 'inside', label: 'Inside' },
  { value: 'connected', label: 'Connected' },
  { value: 'walkable', label: 'Walkable' },
  { value: 'short-ride', label: 'Short ride' },
  { value: 'not-close', label: 'Not close' },
];
const ATTR_SUGGESTIONS = [
  'quiet-at-night', 'good-for-families', 'business-friendly', 'great-views', 'rooftop-bar',
  'near-public-transport', 'not-walkable-at-night', 'airport-shuttle', 'day-use-rooms', 'accessible',
];
const RADII = [1, 2, 3, 5, 10, 20];
const KIND_LABEL: Record<string, string> = { airport: 'Airport', venue: 'Venue', landmark: 'Landmark' };

const fmtMin = (m: number | null | undefined) =>
  m == null ? '—' : m < 60 ? `${Math.round(m)} min` : `${Math.floor(m / 60)} h ${Math.round(m % 60)} min`;
const fmtKm = (km: number) => (km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`);
const fmtDate = (d: string | null) => (d ? new Date(d).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) : '');

async function call(path: string, init?: RequestInit) {
  const r = await fetch(`${API}/${path}`, { cache: 'no-store', ...init });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.success === false) throw new Error(j.error || j.message || `HTTP ${r.status}`);
  return j;
}
const send = (path: string, method: string, body?: unknown) =>
  call(path, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });

export default function NearPlacePage() {
  const [q, setQ] = useState('');
  const [kind, setKind] = useState('');
  const [places, setPlaces] = useState<Place[]>([]);
  const [events, setEvents] = useState<PlaceEvent[]>([]);
  const [setupMsg, setSetupMsg] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);

  const [place, setPlace] = useState<Place | null>(null);
  const [placeEvents, setPlaceEvents] = useState<PlaceEvent[]>([]);
  const [hotels, setHotels] = useState<Hotel[]>([]);
  const [radius, setRadius] = useState(3);
  const [minStars, setMinStars] = useState(4);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [basis, setBasis] = useState('');

  const [realOn, setRealOn] = useState(false);
  const [realMsg, setRealMsg] = useState<string | null>(null);
  const [realBusy, setRealBusy] = useState(false);
  const [realNote, setRealNote] = useState<string | null>(null);
  const [focus, setFocus] = useState<number | null>(null);

  useEffect(() => {
    call('config').then((j) => { setRealOn(!!j.real_times); setRealMsg(j.real_times_message || null); })
      .catch(() => setRealMsg('Could not reach hotel-api.'));
  }, []);

  // Search as you type (debounced). Empty box lists the events.
  useEffect(() => {
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const params = new URLSearchParams({ q: q.trim(), limit: '20' });
        if (kind) params.set('kind', kind);
        const j = await call(`search?${params}`);
        setPlaces(j.places || []); setEvents(j.events || []);
        setSetupMsg(j.setup === false ? j.message : null);
      } catch (e: any) { setErr(e.message); }
      finally { setSearching(false); }
    }, 250);
    return () => clearTimeout(t);
  }, [q, kind]);

  const load = useCallback(async (p: Place, r = radius, s = minStars) => {
    setLoading(true); setErr(null); setRealNote(null);
    try {
      const j = await call(`${p.id}/hotels?radius_km=${r}&min_stars=${s}&limit=60`);
      setPlace(j.place || p); setPlaceEvents(j.events || []); setHotels(j.hotels || []);
      setBasis(j.estimate_basis || '');
      setRealOn(!!j.real_times); setRealMsg(j.real_times_message || null);
    } catch (e: any) { setErr(e.message); }
    finally { setLoading(false); }
  }, [radius, minStars]);

  const pick = (p: Place) => { setFocus(null); void load(p); };

  const getRealTimes = async () => {
    if (!place) return;
    setRealBusy(true); setRealNote(null); setErr(null);
    try {
      const ids = hotels.slice(0, 20).map((h) => h.hotel_id);
      const j = await send(`${place.id}/travel-times`, 'POST', { hotel_ids: ids });
      if (j.configured === false) { setRealOn(false); setRealMsg(j.error); return; }
      setRealNote(
        `${j.fetched} asked from Google, ${j.cached} already saved` +
        (j.errors?.length ? ` · ${j.errors.join('; ')}` : ''));
      await load(place);
    } catch (e: any) { setErr(e.message); }
    finally { setRealBusy(false); }
  };

  const patchHotel = (id: number, fn: (h: Hotel) => Hotel) =>
    setHotels((hs) => hs.map((h) => (h.hotel_id === id ? fn(h) : h)));

  return (
    <div style={{ padding: 24, maxWidth: 1400 }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Near a place</h1>
      <div style={{ fontSize: 13, color: 'var(--c-fg-muted)', marginTop: 4 }}>
        Test page for the &ldquo;near a place&rdquo; idea (walk to the hotel). Preview only, nothing here shows on the website yet.
      </div>

      {setupMsg && <div className="c-error" style={{ marginTop: 12 }}>{setupMsg}</div>}
      {err && <div className="c-error" style={{ marginTop: 12 }}>{err}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(260px, 340px) 1fr', gap: 16, marginTop: 16, alignItems: 'start' }}>
        {/* ---- search */}
        <div className="c-card">
          <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <label className="c-label" htmlFor="near-q">Airport, venue, landmark or event</label>
            <input id="near-q" className="c-input" placeholder="e.g. SYD, Melbourne Park, Wimbledon, Paris"
              value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
            <select className="c-input" value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="">Everything</option>
              <option value="airport">Airports</option>
              <option value="venue">Venues</option>
              <option value="landmark">Landmarks</option>
              <option value="event">Events</option>
            </select>
          </div>
          <div style={{ maxHeight: 520, overflowY: 'auto', borderTop: '1px solid var(--c-line-soft)' }}>
            {searching && places.length === 0 && events.length === 0 && (
              <div style={{ padding: 12, fontSize: 13, color: 'var(--c-fg-muted)' }}>Searching…</div>
            )}
            {places.map((p) => (
              <button key={`p${p.id}`} onClick={() => pick(p)} style={rowBtn(place?.id === p.id)}>
                <div style={{ fontWeight: 600 }}>
                  {p.kind === 'airport' && <span className="c-mono" style={{ marginRight: 6 }}>{p.code}</span>}
                  {p.name}
                </div>
                <div style={{ fontSize: 12, color: 'var(--c-fg-muted)' }}>
                  {KIND_LABEL[p.kind]}{p.category && p.kind !== 'airport' ? ` · ${p.category}` : ''} · {[p.city, p.country].filter(Boolean).join(', ')}
                </div>
              </button>
            ))}
            {events.length > 0 && (
              <div style={{ padding: '8px 12px 4px', fontSize: 11, fontWeight: 600, color: 'var(--c-fg-muted)', textTransform: 'uppercase' }}>Events</div>
            )}
            {events.map((ev) => (
              <button key={`e${ev.id}`} onClick={() => ev.place && pick(ev.place)} style={rowBtn(place?.id === ev.place?.id)}>
                <div style={{ fontWeight: 600 }}>
                  {ev.name} {ev.is_test && <span className="c-pill c-pill-warn" style={{ marginLeft: 4 }}>test</span>}
                </div>
                <div style={{ fontSize: 12, color: 'var(--c-fg-muted)' }}>
                  @ {ev.place?.name} · {fmtDate(ev.starts_on)}{ev.ends_on && ev.ends_on !== ev.starts_on ? ` – ${fmtDate(ev.ends_on)}` : ''}
                </div>
              </button>
            ))}
            {!searching && q.trim() && places.length === 0 && events.length === 0 && !setupMsg && (
              <div style={{ padding: 12, fontSize: 13, color: 'var(--c-fg-muted)' }}>Nothing matches. Try the city name or the IATA code.</div>
            )}
          </div>
        </div>

        {/* ---- place + hotels */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
          {!place ? (
            <div className="c-card" style={{ padding: 24, fontSize: 13, color: 'var(--c-fg-muted)' }}>
              Pick a place on the left to see our hotels around it.
            </div>
          ) : (
            <>
              <div className="c-card">
                <div className="c-card-head" style={{ flexWrap: 'wrap', gap: 12 }}>
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 700 }}>
                      {place.kind === 'airport' && <span className="c-mono" style={{ marginRight: 6 }}>{place.code}</span>}
                      {place.name}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--c-fg-muted)', marginTop: 2 }}>
                      {KIND_LABEL[place.kind]}{place.category && place.kind !== 'airport' ? ` · ${place.category}` : ''} · {[place.city, place.country].filter(Boolean).join(', ')}
                      {' · '}
                      <a href={`https://www.google.com/maps?q=${place.latitude},${place.longitude}`} target="_blank" rel="noreferrer">map</a>
                      {!place.coords_verified && <span className="c-pill c-pill-warn" style={{ marginLeft: 6 }}>location to check</span>}
                    </div>
                    {placeEvents.length > 0 && (
                      <div style={{ fontSize: 12, marginTop: 6, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {placeEvents.map((ev) => (
                          <span key={ev.id} className="c-pill c-pill-muted">
                            {ev.name} · {fmtDate(ev.starts_on)}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <label className="c-label" style={{ margin: 0 }}>Within</label>
                    <select className="c-input" value={radius} onChange={(e) => { const r = Number(e.target.value); setRadius(r); void load(place, r, minStars); }}>
                      {RADII.map((r) => <option key={r} value={r}>{r} km</option>)}
                    </select>
                    <select className="c-input" value={minStars} onChange={(e) => { const s = Number(e.target.value); setMinStars(s); void load(place, radius, s); }}>
                      <option value={0}>Any stars</option>
                      <option value={3}>3★ and up</option>
                      <option value={4}>4★ and up</option>
                      <option value={4.5}>4.5★ and up</option>
                      <option value={5}>5★</option>
                    </select>
                    <button className="c-btn c-btn-primary" onClick={getRealTimes}
                      disabled={!realOn || realBusy || hotels.length === 0}
                      title={realOn ? 'Ask Google for walk, drive and public transport times for the nearest 20. Saved, so asking again is free.' : (realMsg || '')}>
                      {realBusy ? 'Asking Google…' : 'Get real times'}
                    </button>
                  </div>
                </div>
                {(!realOn && realMsg) && <div style={{ padding: '8px 16px', fontSize: 12, color: 'var(--c-fg-muted)' }}>{realMsg}</div>}
                {realNote && <div style={{ padding: '8px 16px', fontSize: 12, color: 'var(--c-fg-soft)' }}>{realNote}</div>}
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 0, borderTop: '1px solid var(--c-line-soft)' }}>
                  <OsmMap place={place} radiusKm={radius} />
                  <Plot place={place} hotels={hotels} radiusKm={radius} focus={focus} onFocus={setFocus} />
                </div>
              </div>

              <div className="c-card">
                <div className="c-card-head">
                  <h2 className="c-card-title">
                    {loading ? 'Loading…' : `${hotels.length} hotel${hotels.length === 1 ? '' : 's'} within ${radius} km`}
                  </h2>
                  <span style={{ fontSize: 11, color: 'var(--c-fg-muted)' }} title={basis}>
                    Est. = straight line × 1.3, walking 5 km/h. Real = Google.
                  </span>
                </div>
                {hotels.length === 0 && !loading ? (
                  <div className="c-empty" style={{ padding: 24, fontSize: 13 }}>
                    No hotels in range. Try a bigger radius or fewer stars.
                  </div>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table className="c-table">
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>Hotel</th>
                          <th>Distance</th>
                          <th>Est. walk</th>
                          <th>Est. drive</th>
                          <th>Walk</th>
                          <th>Drive</th>
                          <th>Transit</th>
                          <th style={{ minWidth: 340 }}>What we know</th>
                        </tr>
                      </thead>
                      <tbody>
                        {hotels.map((h, i) => (
                          <HotelRow key={h.hotel_id} index={i + 1} hotel={h} place={place}
                            focused={focus === h.hotel_id} onFocus={() => setFocus(h.hotel_id)}
                            onChange={(fn) => patchHotel(h.hotel_id, fn)} onError={setErr} />
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function rowBtn(active: boolean): React.CSSProperties {
  return {
    display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', fontSize: 13,
    border: 0, borderBottom: '1px solid var(--c-line-soft)', cursor: 'pointer',
    background: active ? 'var(--c-accent-soft)' : 'transparent', color: 'var(--c-fg)',
  };
}

// ------------------------------------------------------------------ hotel row

function HotelRow({ index, hotel: h, place, focused, onFocus, onChange, onError }: {
  index: number; hotel: Hotel; place: Place; focused: boolean; onFocus: () => void;
  onChange: (fn: (h: Hotel) => Hotel) => void; onError: (m: string | null) => void;
}) {
  const [note, setNote] = useState(h.note?.note || '');
  const [saving, setSaving] = useState(false);
  const [newAttr, setNewAttr] = useState('');
  const rowRef = useRef<HTMLTableRowElement>(null);
  useEffect(() => { setNote(h.note?.note || ''); }, [h.note?.note]);
  useEffect(() => { if (focused) rowRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }, [focused]);

  const saveNote = async (body: { proximity?: string | null; note?: string | null }) => {
    setSaving(true); onError(null);
    try {
      const j = await send(`${place.id}/hotels/${h.hotel_id}/note`, 'PUT', body);
      onChange((x) => ({ ...x, note: j.note ? { proximity: j.note.proximity, note: j.note.note, updated_by: j.note.updated_by, updated_at: j.note.updated_at } : null }));
    } catch (e: any) { onError(e.message); }
    finally { setSaving(false); }
  };

  const addAttr = async () => {
    const attr = newAttr.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
    if (!attr) return;
    onError(null);
    try {
      const j = await send(`hotels/${h.hotel_id}/attributes/${attr}`, 'PUT', {});
      onChange((x) => ({ ...x, attributes: [...x.attributes.filter((a) => a.attr !== attr), { attr: j.attribute.attr, note: j.attribute.note }] }));
      setNewAttr('');
    } catch (e: any) { onError(e.message); }
  };
  const removeAttr = async (attr: string) => {
    onError(null);
    try {
      await send(`hotels/${h.hotel_id}/attributes/${attr}`, 'DELETE');
      onChange((x) => ({ ...x, attributes: x.attributes.filter((a) => a.attr !== attr) }));
    } catch (e: any) { onError(e.message); }
  };

  const dir = (mode: string) =>
    `https://www.google.com/maps/dir/?api=1&origin=${h.latitude},${h.longitude}&destination=${place.latitude},${place.longitude}&travelmode=${mode}`;
  const dirty = (note || '') !== (h.note?.note || '');

  return (
    <tr ref={rowRef} onClick={onFocus} style={{ background: focused ? 'var(--c-accent-soft)' : undefined, verticalAlign: 'top' }}>
      <td className="c-mono" style={{ color: 'var(--c-fg-muted)' }}>{index}</td>
      <td style={{ minWidth: 220 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          {h.image && <img src={h.image} alt="" width={44} height={44} style={{ objectFit: 'cover', borderRadius: 4, flexShrink: 0 }} />}
          <div>
            <div style={{ fontWeight: 600 }}>{h.name}</div>
            <div style={{ fontSize: 12, color: 'var(--c-fg-muted)' }}>
              {h.star_rating != null ? `${h.star_rating}★ · ` : ''}{h.city || ''}
              {' · '}<span className="c-mono">{h.hotel_id}</span>
              {h.also.length > 0 && <span title={h.also.map((a) => `${a.hotel_id} (${a.source})`).join(', ')}> · +{h.also.length} supplier copy</span>}
            </div>
          </div>
        </div>
      </td>
      <td className="c-mono" style={{ whiteSpace: 'nowrap' }}>{fmtKm(h.km)}</td>
      <td style={{ whiteSpace: 'nowrap', color: 'var(--c-fg-soft)' }}>~{fmtMin(h.est_walk_min)}</td>
      <td style={{ whiteSpace: 'nowrap', color: 'var(--c-fg-soft)' }}>~{fmtMin(h.est_drive_min)}</td>
      {(['WALK', 'DRIVE', 'TRANSIT'] as const).map((m) => {
        const t = h.times?.[m];
        const gm = m === 'WALK' ? 'walking' : m === 'DRIVE' ? 'driving' : 'transit';
        return (
          <td key={m} style={{ whiteSpace: 'nowrap' }}>
            {t ? (t.minutes == null ? <span style={{ color: 'var(--c-fg-muted)' }}>no route</span> : <strong>{fmtMin(t.minutes)}</strong>) : <span style={{ color: 'var(--c-fg-muted)' }}>—</span>}
            <div><a href={dir(gm)} target="_blank" rel="noreferrer" style={{ fontSize: 11 }} onClick={(e) => e.stopPropagation()}>route</a></div>
          </td>
        );
      })}
      <td onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <select className="c-input" value={h.note?.proximity || ''} disabled={saving}
            onChange={(e) => saveNote({ proximity: e.target.value || null })} style={{ fontSize: 12, width: 120 }}>
            {TAGS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          <input className="c-input" style={{ fontSize: 12, flex: 1, minWidth: 140 }} placeholder="Note, e.g. skybridge to the venue"
            value={note} onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && dirty) void saveNote({ note }); }} />
          {dirty && <button className="c-btn" disabled={saving} onClick={() => saveNote({ note })} style={{ fontSize: 12 }}>Save</button>}
        </div>
        {h.note?.updated_by && (
          <div style={{ fontSize: 11, color: 'var(--c-fg-muted)', marginTop: 2 }}>
            {h.note.updated_by} · {new Date(h.note.updated_at).toLocaleDateString('en-AU')}
          </div>
        )}
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 6, alignItems: 'center' }}>
          {h.attributes.map((a) => (
            <span key={a.attr} className="c-pill c-pill-muted" title={a.note || ''}>
              {a.attr.replace(/-/g, ' ')}
              <button onClick={() => removeAttr(a.attr)} aria-label={`Remove ${a.attr}`}
                style={{ border: 0, background: 'none', cursor: 'pointer', padding: 0, marginLeft: 2, color: 'inherit' }}>×</button>
            </span>
          ))}
          <input className="c-input" list="near-attr-suggest" placeholder="+ about this hotel" value={newAttr}
            onChange={(e) => setNewAttr(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void addAttr(); }}
            style={{ fontSize: 11, width: 150, padding: '2px 6px' }} />
          <datalist id="near-attr-suggest">
            {ATTR_SUGGESTIONS.map((s) => <option key={s} value={s} />)}
          </datalist>
        </div>
      </td>
    </tr>
  );
}

// ------------------------------------------------------------------ maps

// Street map from OpenStreetMap (no key), framed to the search radius.
function OsmMap({ place, radiusKm }: { place: Place; radiusKm: number }) {
  const dLat = radiusKm / 111.32;
  const dLng = radiusKm / (111.32 * Math.max(0.05, Math.cos((place.latitude * Math.PI) / 180)));
  const bbox = [place.longitude - dLng, place.latitude - dLat, place.longitude + dLng, place.latitude + dLat].map((n) => n.toFixed(5)).join(',');
  const src = `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${place.latitude},${place.longitude}`;
  return (
    <iframe title="Map" src={src} style={{ width: '100%', height: 320, border: 0, borderRight: '1px solid var(--c-line-soft)' }} loading="lazy" />
  );
}

// Where each hotel sits relative to the place, to scale. Click a dot to find
// the hotel in the table.
function Plot({ place, hotels, radiusKm, focus, onFocus }: {
  place: Place; hotels: Hotel[]; radiusKm: number; focus: number | null; onFocus: (id: number) => void;
}) {
  const size = 320; const c = size / 2; const scale = (c - 14) / radiusKm;
  const kmPerLng = 111.32 * Math.cos((place.latitude * Math.PI) / 180);
  const rings = useMemo(() => {
    const steps = radiusKm <= 2 ? [0.5, 1, 2] : radiusKm <= 5 ? [1, 2, 3, 5] : [2, 5, 10, 20];
    return steps.filter((r) => r <= radiusKm);
  }, [radiusKm]);
  const colour = (h: Hotel) => {
    const p = h.note?.proximity;
    if (p === 'inside' || p === 'connected') return 'var(--c-success)';
    if (p === 'walkable') return 'var(--c-accent)';
    if (p === 'short-ride') return 'var(--c-warn)';
    if (p === 'not-close') return 'var(--c-danger)';
    return 'var(--c-fg-muted)';
  };
  return (
    <svg viewBox={`0 0 ${size} ${size}`} style={{ width: '100%', height: 320, background: 'var(--c-bg-soft)' }} role="img" aria-label="Hotels around the place">
      {rings.map((r) => (
        <g key={r}>
          <circle cx={c} cy={c} r={r * scale} fill="none" stroke="var(--c-line)" strokeDasharray="3 3" />
          <text x={c + 3} y={c - r * scale + 11} fontSize={9} fill="var(--c-fg-muted)">{r} km</text>
        </g>
      ))}
      {hotels.map((h) => {
        const x = c + (h.longitude - place.longitude) * kmPerLng * scale;
        const y = c - (h.latitude - place.latitude) * 111.32 * scale;
        const f = focus === h.hotel_id;
        return (
          <circle key={h.hotel_id} cx={x} cy={y} r={f ? 7 : 4.5} fill={colour(h)} stroke={f ? 'var(--c-fg)' : 'var(--c-bg)'} strokeWidth={f ? 2 : 1}
            style={{ cursor: 'pointer' }} onClick={() => onFocus(h.hotel_id)}>
            <title>{`${h.name} · ${fmtKm(h.km)}`}</title>
          </circle>
        );
      })}
      <circle cx={c} cy={c} r={6} fill="var(--c-fg)" />
      <text x={8} y={size - 8} fontSize={9} fill="var(--c-fg-muted)">● place · dot colour = your tag (green inside/connected, blue walkable, amber short ride, red not close)</text>
    </svg>
  );
}
