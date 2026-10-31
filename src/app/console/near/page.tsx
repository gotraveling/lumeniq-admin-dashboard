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

/** id is null for a place found on Google that is not on our list yet. */
type Place = {
  id: number | null; kind: 'airport' | 'venue' | 'landmark' | null; code: string | null; name: string;
  category: string | null; city: string | null; country: string | null;
  latitude: number; longitude: number; coords_verified: boolean;
  google_id?: string | null; address?: string | null;
  /** Airports: region (e.g. Sicily) and country name, and km when listed as "Airports near ...". */
  region_name?: string | null; country_name?: string | null; size?: 'large' | 'medium' | null; km?: number;
};
type GoogleResult = {
  google_id: string; name: string; address: string | null; type: string | null;
  city: string | null; country: string | null; latitude: number; longitude: number; place_id: number | null;
};
type SearchedTerm = { q: string; searches: number; last_at: string; category: string | null; google: { google_id: string; name: string } | null };
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
const TAGS: Array<{ value: string; label: string; meaning: string; colour: string }> = [
  { value: '', label: 'Not tagged yet', meaning: '', colour: 'var(--c-fg-muted)' },
  { value: 'inside', label: 'Inside', meaning: 'in the same building, e.g. a hotel in the terminal', colour: 'var(--c-success)' },
  { value: 'connected', label: 'Connected', meaning: 'linked by a covered walkway or skybridge, no need to go outside', colour: 'var(--c-success)' },
  { value: 'walkable', label: 'Walkable', meaning: 'a comfortable walk outside', colour: 'var(--c-accent)' },
  { value: 'short-ride', label: 'Short ride', meaning: 'a quick taxi or shuttle', colour: 'var(--c-warn)' },
  { value: 'not-close', label: 'Not close', meaning: 'looks near on the map, but getting there takes real travel', colour: 'var(--c-danger)' },
];
const tagColour = (p: string | null | undefined) => (TAGS.find((t) => t.value === (p || '')) || TAGS[0]).colour;

// Plain-English versions of the messages hotel-api sends back.
const SETUP_PLAIN = 'This page is not switched on yet, so search shows nothing and notes can\'t be saved. Ask Murali to finish the setup.';
const REAL_OFF_PLAIN = 'Real Google times are not switched on yet, so only the estimates show for now.';
function plain(m: string | null | undefined): string {
  const t = m || '';
  if (/not set up yet/i.test(t) && /migration|049/i.test(t)) return SETUP_PLAIN;
  if (/routes key|real travel times are not set up/i.test(t)) return REAL_OFF_PLAIN;
  if (/unauthori[sz]ed|HTTP 401|HTTP 403/i.test(t)) return 'You are not allowed to save here. Ask Murali for access.';
  if (/HTTP 5\d\d|failed to fetch|network/i.test(t)) return 'Something went wrong on our side. Please try again in a minute.';
  return t || 'Something went wrong. Please try again.';
}
const ATTR_SUGGESTIONS = [
  'quiet-at-night', 'good-for-families', 'business-friendly', 'great-views', 'rooftop-bar',
  'near-public-transport', 'not-walkable-at-night', 'airport-shuttle', 'day-use-rooms', 'accessible',
];
const RADII = [1, 2, 3, 5, 10, 20];
const STARS: Array<{ value: number; label: string }> = [
  { value: 0, label: 'Any stars' }, { value: 3, label: '3★ and up' }, { value: 4, label: '4★ and up' },
  { value: 4.5, label: '4.5★ and up' }, { value: 5, label: '5★ only' },
];
const muted: React.CSSProperties = { fontSize: 12, color: 'var(--c-fg-muted)' };
const KIND_LABEL: Record<string, string> = { airport: 'Airport', venue: 'Venue', landmark: 'Landmark' };
const CATEGORY_LABEL: Record<string, string> = {
  convention: 'Conference centre', stadium: 'Stadium', arena: 'Arena', circuit: 'Race track', racecourse: 'Racecourse',
  'concert-hall': 'Concert hall', 'opera-house': 'Opera house', theatre: 'Theatre', 'theatre-district': 'Theatre district',
  'festival-ground': 'Festival site', museum: 'Museum', park: 'Park', station: 'Station', beach: 'Beach', landmark: 'Landmark',
};
const placeLabel = (p: Place) =>
  p.kind === 'airport' ? 'Airport' : (p.category && CATEGORY_LABEL[p.category]) || KIND_LABEL[p.kind || ''] || 'Place';

// "Find me hotels near ..." choices. Keys match hotel-api lib/placeCategories.js.
type CatKey = 'airport' | 'conference' | 'sport' | 'festival' | 'theatre' | 'other';
const CATS: Array<{ key: CatKey; label: string; placeholder: string; help: string }> = [
  { key: 'airport', label: 'An airport', placeholder: 'Airport name, city or code like MEL', help: 'Leave it empty to see the busiest airports.' },
  { key: 'conference', label: 'A conference centre', placeholder: 'Venue or city, e.g. ExCeL London', help: 'Leave it empty to see the popular conference centres.' },
  { key: 'sport', label: 'A sporting event', placeholder: 'Event, stadium or city, e.g. Wimbledon', help: 'Leave it empty to see upcoming events and stadiums.' },
  { key: 'festival', label: 'A festival', placeholder: 'Festival or city, e.g. Glastonbury', help: 'Leave it empty to see upcoming festivals.' },
  { key: 'theatre', label: 'A concert or theatre', placeholder: 'Theatre, concert hall or city, e.g. Royal Albert Hall', help: 'Leave it empty to see popular theatres and concert halls.' },
  { key: 'other', label: 'Something else', placeholder: 'Any place, e.g. Tower Bridge or a street name', help: 'If it is not on our list, we look it up on Google Maps. Press Enter to search.' },
];
const CAT_KEYS = CATS.map((c) => c.key);
const sectionHead: React.CSSProperties = { padding: '8px 12px 4px', fontSize: 11, fontWeight: 600, color: 'var(--c-fg-muted)', textTransform: 'uppercase' };

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
  const [cat, setCat] = useState<CatKey>('airport');
  const [q, setQ] = useState('');
  const [places, setPlaces] = useState<Place[]>([]);
  const [events, setEvents] = useState<PlaceEvent[]>([]);
  const [google, setGoogle] = useState<GoogleResult[]>([]);
  const [googleAsked, setGoogleAsked] = useState(false);
  const [googleMsg, setGoogleMsg] = useState<string | null>(null);
  const [placesHeading, setPlacesHeading] = useState<string | null>(null);
  const [searchId, setSearchId] = useState<number | null>(null);
  const [setupMsg, setSetupMsg] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchNow, setSearchNow] = useState(0);
  const ref = useMemo(() => Math.random().toString(36).slice(2, 12) + Date.now().toString(36), []);

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
  const [topKey, setTopKey] = useState(0);

  useEffect(() => {
    call('config').then((j) => { setRealOn(!!j.real_times); setRealMsg(j.real_times_message || null); })
      .catch(() => setRealMsg('Could not check whether real Google times are on. Refresh the page to try again.'));
  }, []);

  // Search after a short pause in typing, or straight away on Enter. Our own
  // list is searched every time; Google is only asked (by hotel-api) for
  // "Something else" or when our list has nothing, and only from 3 letters.
  // An empty box lists the popular places for the chosen category.
  useEffect(() => {
    const term = q.trim();
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const params = new URLSearchParams({ q: term, category: cat });
        if (term.length >= 3) { params.set('log', '1'); params.set('ref', ref); } else params.set('google', '0');
        const j = await call(`search?${params}`);
        setPlaces(j.places || []); setEvents(j.events || []); setPlacesHeading(j.places_heading || null);
        setGoogle(j.google || []); setGoogleAsked(!!j.google_asked); setGoogleMsg(j.google_message || null);
        setSearchId(j.search_id ?? null);
        setSetupMsg(j.setup === false ? plain(j.message) : null);
      } catch (e: any) { setErr(plain(e.message)); }
      finally { setSearching(false); }
    }, searchNow && term ? 0 : 700);
    return () => clearTimeout(t);
  }, [q, cat, ref, searchNow]);

  /** Remember what was picked for this search (feeds "What people searched for"). */
  const noteChoice = (body: { place_id?: number; google_id?: string; name?: string }) => {
    if (searchId) void send(`searches/${searchId}/choice`, 'POST', body).catch(() => {});
  };

  // The address bar always matches what is shown, so a view can be
  // bookmarked, shared or opened in a new tab. `push` adds a history step
  // (picking a place); filter changes just update the current one.
  const load = useCallback(async (p: Place, r = radius, s = minStars, push = false, c: CatKey = cat) => {
    setLoading(true); setErr(null); setRealNote(null);
    const href = p.id ? placeHref(p.id, r, s, c) : pointHref(p, r, s);
    if (window.location.pathname + window.location.search !== href) {
      window.history[push ? 'pushState' : 'replaceState'](null, '', href);
    }
    try {
      const j = p.id
        ? await call(`${p.id}/hotels?radius_km=${r}&min_stars=${s}&limit=60`)
        : await call(`near?${new URLSearchParams({
          lat: String(p.latitude), lng: String(p.longitude), name: p.name, google_id: p.google_id || '',
          radius_km: String(r), min_stars: String(s), limit: '60' })}`);
      const got: Place = j.place ? { ...j.place, address: j.place.address ?? p.address } : p;
      setPlace(got); setPlaceEvents(j.events || []); setHotels(j.hotels || []);
      // A Google result someone has since saved: show it as the saved place.
      if (!p.id && got.id) window.history.replaceState(null, '', placeHref(got.id, r, s, c));
      setBasis(j.estimate_basis || '');
      setRealOn(!!j.real_times); setRealMsg(j.real_times_message || null);
      if (j.setup === false) setSetupMsg(plain(j.message));
    } catch (e: any) { setErr(plain(e.message)); }
    finally { setLoading(false); }
  }, [radius, minStars, cat]);

  const pick = (p: Place) => { setFocus(null); noteChoice({ place_id: p.id ?? undefined, name: p.name }); void load(p, radius, minStars, true); };

  const pickGoogle = (g: GoogleResult) => {
    setFocus(null);
    noteChoice({ google_id: g.google_id, place_id: g.place_id ?? undefined, name: g.name });
    const p: Place = g.place_id
      ? ({ id: g.place_id } as Place)
      : {
        id: null, kind: null, code: g.google_id, name: g.name, category: null, city: g.city, country: g.country,
        latitude: g.latitude, longitude: g.longitude, coords_verified: false, google_id: g.google_id, address: g.address,
      };
    void load(p, radius, minStars, true);
  };

  /**
   * Notes, tags and saved Google times belong to a place on our list. For a
   * place found on Google, save it to our list the first time someone needs
   * that, then carry on as normal. Returns the place id, or null.
   */
  const ensurePlaceId = useCallback(async (): Promise<number | null> => {
    if (!place) return null;
    if (place.id) return place.id;
    if (!place.google_id) { setErr('This spot is not on our list, so notes can\'t be saved here. Search for it again and pick it from the list.'); return null; }
    try {
      const j = await send('google', 'POST', { google_id: place.google_id, category: cat, name: place.name });
      const saved: Place = { ...j.place, address: place.address };
      setPlace(saved);
      window.history.replaceState(null, '', placeHref(saved.id!, radius, minStars, cat));
      setTopKey((k) => k + 1);
      return saved.id;
    } catch (e: any) { setErr(`Could not add ${place.name} to our list: ${plain(e.message)}`); return null; }
  }, [place, cat, radius, minStars]);

  // Open what the address says (?near=…&place=… or a Google spot with
  // lat/lng), on first load and on Back/Forward.
  useEffect(() => {
    const fromUrl = () => {
      const sp = new URLSearchParams(window.location.search);
      const c = CAT_KEYS.includes(sp.get('near') as CatKey) ? (sp.get('near') as CatKey) : 'airport';
      setCat(c);
      const r = RADII.includes(Number(sp.get('km'))) ? Number(sp.get('km')) : 3;
      const s = Number.isFinite(Number(sp.get('stars'))) && sp.get('stars') !== null ? Number(sp.get('stars')) : 4;
      const id = Number(sp.get('place'));
      const lat = Number(sp.get('lat')); const lng = Number(sp.get('lng'));
      setRadius(r); setMinStars(s); setFocus(null);
      if (Number.isInteger(id) && id > 0) { void load({ id } as Place, r, s, false, c); return; }
      if (sp.get('lat') && sp.get('lng') && Number.isFinite(lat) && Number.isFinite(lng)) {
        void load({
          id: null, kind: null, code: sp.get('gid'), name: sp.get('name') || 'This spot', category: null, city: null, country: null,
          latitude: lat, longitude: lng, coords_verified: false, google_id: sp.get('gid'),
        }, r, s, false, c);
        return;
      }
      setPlace(null); setHotels([]);
    };
    fromUrl();
    window.addEventListener('popstate', fromUrl);
    return () => window.removeEventListener('popstate', fromUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const changeCat = (c: CatKey) => {
    setCat(c); setGoogle([]); setGoogleAsked(false); setSearchId(null);
    if (!place) {
      const href = `/console/near?near=${c}`;
      if (window.location.pathname + window.location.search !== href) window.history.replaceState(null, '', href);
    }
  };

  /** A real link, so Ctrl/Cmd-click and "open in new tab" work; a plain click stays on the page. */
  const onPlaceClick = (e: React.MouseEvent, p: Place) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault(); pick(p);
  };
  const onGoogleClick = (e: React.MouseEvent, g: GoogleResult) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault(); pickGoogle(g);
  };

  const getRealTimes = async () => {
    if (!place) return;
    setRealBusy(true); setRealNote(null); setErr(null);
    try {
      const placeId = await ensurePlaceId();
      if (!placeId) return;
      const ids = hotels.slice(0, 20).map((h) => h.hotel_id);
      const j = await send(`${placeId}/travel-times`, 'POST', { hotel_ids: ids });
      if (j.configured === false) { setRealOn(false); setRealMsg(j.error); return; }
      const n = (j.fetched || 0) + (j.cached || 0);
      setRealNote(
        `Real times ready for ${n} hotel${n === 1 ? '' : 's'} (${j.fetched || 0} new from Google, ${j.cached || 0} already saved).` +
        (j.errors?.length ? ` Some could not be fetched: ${j.errors.join('; ')}` : ''));
      await load({ ...place, id: placeId });
    } catch (e: any) {
      const m = plain(e.message);
      if (m === REAL_OFF_PLAIN) { setRealOn(false); setRealMsg(m); } else setErr(m);
    }
    finally { setRealBusy(false); }
  };

  const patchHotel = (id: number, fn: (h: Hotel) => Hotel) =>
    setHotels((hs) => hs.map((h) => (h.hotel_id === id ? fn(h) : h)));

  const term = q.trim();
  const catInfo = CATS.find((c) => c.key === cat)!;
  const nothingOurs = places.length === 0 && events.length === 0;

  return (
    <div className="near-page">
      <style>{NEAR_CSS}</style>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Near a place</h1>
        <span className="c-pill c-pill-warn">Test page</span>
      </div>
      <p style={{ fontSize: 13, color: 'var(--c-fg-soft)', margin: '6px 0 0', maxWidth: '75ch', lineHeight: 1.5 }}>
        Find our hotels close to an airport, venue, event or any other place, and record what you know about each one.
        Nothing here shows on the website yet. Your tags and notes are saved for good and stay put when suppliers update their hotel lists.
      </p>

      {setupMsg && <div className="c-error" role="alert" style={{ marginTop: 12 }}>{setupMsg}</div>}
      {err && <div className="c-error" role="alert" style={{ marginTop: 12 }}>{err}</div>}

      <div className="near-layout">
        {/* ---- search */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
          <div className="c-card">
            <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <label className="c-label" htmlFor="near-cat" style={{ fontSize: 14, fontWeight: 600 }}>Find me hotels near</label>
              <select id="near-cat" className="c-input" value={cat} onChange={(e) => changeCat(e.target.value as CatKey)}>
                {CATS.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
              </select>
              <input id="near-q" className="c-input" placeholder={catInfo.placeholder} aria-label={catInfo.placeholder}
                value={q} onChange={(e) => setQ(e.target.value)} autoFocus aria-describedby="near-q-help"
                onKeyDown={(e) => { if (e.key === 'Enter') setSearchNow((n) => n + 1); }} />
              <div id="near-q-help" style={muted}>{catInfo.help}</div>
            </div>
            <div style={{ maxHeight: 520, overflowY: 'auto', borderTop: '1px solid var(--c-line-soft)' }}>
              {searching && nothingOurs && google.length === 0 && (
                <div style={{ padding: 12, fontSize: 13, color: 'var(--c-fg-muted)' }}>Searching…</div>
              )}
              {!term && places.length > 0 && <div style={sectionHead}>Popular</div>}
              {term && placesHeading && places.length > 0 && <div style={sectionHead}>{placesHeading}</div>}
              {places.map((p) => (
                <a key={`p${p.id}`} href={placeHref(p.id!, radius, minStars, cat)} onClick={(e) => onPlaceClick(e, p)}
                  style={rowBtn(place?.id === p.id)} aria-current={place?.id === p.id ? 'true' : undefined}>
                  <div style={{ fontWeight: 600 }}>
                    {p.kind === 'airport' && <span className="c-mono" style={{ marginRight: 6 }}>{p.code}</span>}
                    {p.name}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--c-fg-muted)' }}>
                    {placeLabel(p)} · {[p.city, p.region_name !== p.city ? p.region_name : null, p.country].filter(Boolean).join(', ')}
                    {p.km != null && ` · ${p.km} km away`}
                  </div>
                </a>
              ))}
              {events.length > 0 && <div style={sectionHead}>{term ? 'Events' : 'Coming up'}</div>}
              {events.map((ev) => ev.place && (
                <a key={`e${ev.id}`} href={placeHref(ev.place.id!, radius, minStars, cat)} onClick={(e) => onPlaceClick(e, ev.place!)}
                  style={rowBtn(place?.id === ev.place.id)} aria-current={place?.id === ev.place.id ? 'true' : undefined}>
                  <div style={{ fontWeight: 600 }}>
                    {ev.name} {ev.is_test && <span className="c-pill c-pill-warn" style={{ marginLeft: 4 }} title="Made-up example event for testing">example</span>}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--c-fg-muted)' }}>
                    at {ev.place?.name} · {fmtDate(ev.starts_on)}{ev.ends_on && ev.ends_on !== ev.starts_on ? ` – ${fmtDate(ev.ends_on)}` : ''}
                  </div>
                </a>
              ))}
              {google.length > 0 && (
                <div style={sectionHead}>{nothingOurs ? 'Not on our list. Found on Google Maps:' : 'Also on Google Maps'}</div>
              )}
              {google.map((g) => (
                <a key={`g${g.google_id}`} href={g.place_id ? placeHref(g.place_id, radius, minStars, cat) : pointHref({ ...g, id: null } as unknown as Place, radius, minStars)}
                  onClick={(e) => onGoogleClick(e, g)} style={rowBtn(!!place && place.google_id === g.google_id)}>
                  <div style={{ fontWeight: 600 }}>{g.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--c-fg-muted)' }}>
                    {[g.type, g.address].filter(Boolean).join(' · ')}
                    {g.place_id && <span className="c-pill c-pill-muted" style={{ marginLeft: 4 }}>on our list</span>}
                  </div>
                </a>
              ))}
              {googleMsg && <div style={{ padding: 12, fontSize: 13, color: 'var(--c-fg-muted)' }}>{googleMsg}</div>}
              {!searching && term && nothingOurs && google.length === 0 && !setupMsg && !googleMsg && (
                <div style={{ padding: 12, fontSize: 13, color: 'var(--c-fg-muted)' }}>
                  {term.length < 3
                    ? 'Nothing on our list yet. Keep typing (3 letters or more) to look further.'
                    : googleAsked
                      ? <>Nothing found for &ldquo;{term}&rdquo;. Try adding the city, e.g. &ldquo;{term} London&rdquo;.</>
                      : <>Nothing on our list matches &ldquo;{term}&rdquo;. Try the city name, or pick &ldquo;Something else&rdquo; above to look wider.</>}
                </div>
              )}
              {!searching && !term && nothingOurs && !setupMsg && (
                <div style={{ padding: 12, fontSize: 13, color: 'var(--c-fg-muted)' }}>
                  {cat === 'other' ? 'Type the name of any place: a building, a street, a school, a park.' : 'Type above to search.'}
                </div>
              )}
            </div>
          </div>
          <SearchedFor key={topKey} onAdded={(p) => { setTopKey((k) => k + 1); void load(p, radius, minStars, true); }} onError={setErr} />
        </div>

        {/* ---- place + hotels */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
          {!place ? (
            <div className="c-card" style={{ padding: 24, fontSize: 13, color: 'var(--c-fg-soft)', lineHeight: 1.6 }}>
              <div className="c-empty-title">How this works</div>
              <ol style={{ margin: '8px 0 0', paddingLeft: 20 }}>
                <li><strong>Pick what you are looking near</strong> on the left: an airport, a conference centre, a sporting event, a festival, a concert or theatre, or something else.</li>
                <li><strong>Type a name or a city</strong>, or leave the box empty to see the popular ones, then pick from the list.</li>
                <li>See <strong>our hotels around it</strong>, nearest first, with a rough walk and drive time for each.</li>
                <li>Click <strong>Get real times</strong> to ask Google for actual walk, drive and public transport times.</li>
                <li><strong>Tag each hotel</strong> (Inside, Connected, Walkable, Short ride, Not close) and add a note. These are saved for good.</li>
              </ol>
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
                      {place.id
                        ? <>{placeLabel(place)} · {[place.city, place.country].filter(Boolean).join(', ')}</>
                        : <>{place.address || 'Found on Google Maps'}</>}
                      {' · '}
                      <a href={`https://www.google.com/maps?q=${place.latitude},${place.longitude}`} target="_blank" rel="noreferrer">open in Google Maps</a>
                      {!place.id ? (
                        <span className="c-pill c-pill-muted" style={{ marginLeft: 6 }} title="Found on Google Maps. It is added to our list the first time you tag a hotel or get real times here.">
                          not on our list yet
                        </span>
                      ) : !place.coords_verified && (
                        <span className="c-pill c-pill-warn" style={{ marginLeft: 6 }} title="The pin for this place has not been checked by hand yet, so distances could be slightly off.">
                          pin not checked yet
                        </span>
                      )}
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
                    <label className="c-label" htmlFor="near-radius" style={{ margin: 0 }}>Within</label>
                    <select id="near-radius" className="c-input" value={radius} onChange={(e) => { const r = Number(e.target.value); setRadius(r); void load(place, r, minStars); }}>
                      {RADII.map((r) => <option key={r} value={r}>{r} km</option>)}
                    </select>
                    <label className="c-label" htmlFor="near-stars" style={{ margin: 0 }}>Stars</label>
                    <select id="near-stars" className="c-input" value={minStars} onChange={(e) => { const s = Number(e.target.value); setMinStars(s); void load(place, radius, s); }}>
                      {STARS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                    </select>
                    <button className="c-btn c-btn-primary" onClick={getRealTimes}
                      disabled={!realOn || realBusy || hotels.length === 0}
                      aria-describedby="near-real-help">
                      {realBusy ? 'Asking Google…' : 'Get real times'}
                    </button>
                  </div>
                </div>
                <div id="near-real-help" style={{ padding: '8px 16px', ...muted }}>
                  {realOn
                    ? 'Get real times asks Google for walk, drive and public transport times for the nearest 20 hotels. Answers are saved, so asking again costs nothing.'
                    : (realMsg ? plain(realMsg) : REAL_OFF_PLAIN)}
                </div>
                {realNote && <div role="status" style={{ padding: '0 16px 8px', fontSize: 12, color: 'var(--c-success)' }}>{realNote}</div>}
                <div className="near-maps">
                  <OsmMap place={place} radiusKm={radius} />
                  <Plot place={place} hotels={hotels} radiusKm={radius} focus={focus} onFocus={setFocus} />
                </div>
                <div style={{ padding: '8px 16px', display: 'flex', gap: 12, flexWrap: 'wrap', ...muted }}>
                  <span><Dot colour="var(--c-fg)" /> the place</span>
                  {TAGS.map((t) => <span key={t.value}><Dot colour={t.colour} /> {t.label}</span>)}
                  <span>· Click a dot to find that hotel in the list.</span>
                </div>
              </div>

              <div className="c-card">
                <div className="c-card-head">
                  <h2 className="c-card-title">
                    {loading ? 'Finding hotels…' : `${hotels.length} hotel${hotels.length === 1 ? '' : 's'} within ${radius} km, nearest first`}
                  </h2>
                </div>
                <div style={{ padding: '10px 16px', fontSize: 12, color: 'var(--c-fg-soft)', lineHeight: 1.6, borderBottom: '1px solid var(--c-line-soft)' }}>
                  <div title={basis}>
                    <strong>Rough estimate</strong> columns are worked out from the distance on the map, so treat them as a guide.{' '}
                    <strong>Google</strong> columns are real times and stay blank until you click Get real times.
                  </div>
                  <div style={{ marginTop: 4 }}>
                    <strong>Your tag:</strong>{' '}
                    {TAGS.filter((t) => t.value).map((t, i) => (
                      <span key={t.value}>{i > 0 && ' · '}<strong>{t.label}</strong> = {t.meaning}</span>
                    ))}.
                  </div>
                  <div style={{ marginTop: 4 }}>
                    Tags and notes are for this hotel and this place. Facts like &ldquo;quiet at night&rdquo; belong to the hotel and show for every place.
                  </div>
                </div>
                {hotels.length === 0 && !loading ? (
                  <div className="c-empty" style={{ padding: 24, fontSize: 13 }}>
                    <div className="c-empty-title">No hotels found</div>
                    <div>Nothing within {radius} km{minStars ? ` at ${STARS.find((s) => s.value === minStars)?.label || `${minStars}★ and up`}` : ''}. Try a bigger distance or fewer stars.</div>
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap', marginTop: 12 }}>
                      {RADII.find((r) => r > radius) && (
                        <button className="c-btn" onClick={() => { const r = RADII.find((x) => x > radius)!; setRadius(r); void load(place, r, minStars); }}>
                          Widen to {RADII.find((r) => r > radius)} km
                        </button>
                      )}
                      {minStars > 0 && (
                        <button className="c-btn" onClick={() => { setMinStars(0); void load(place, radius, 0); }}>Show any stars</button>
                      )}
                    </div>
                  </div>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table className="c-table">
                      <thead>
                        <tr>
                          <th rowSpan={2}>#</th>
                          <th rowSpan={2}>Hotel</th>
                          <th rowSpan={2}>Distance</th>
                          <th colSpan={2} scope="colgroup">Rough estimate</th>
                          <th colSpan={3} scope="colgroup">Google (real)</th>
                          <th rowSpan={2} style={{ minWidth: 340 }}>Your tag, note and hotel facts</th>
                        </tr>
                        <tr>
                          <th>Walk</th>
                          <th>Drive</th>
                          <th>Walk</th>
                          <th>Drive</th>
                          <th>Public transport</th>
                        </tr>
                      </thead>
                      <tbody>
                        {hotels.map((h, i) => (
                          <HotelRow key={h.hotel_id} index={i + 1} hotel={h} place={place} ensurePlaceId={ensurePlaceId}
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

const placeHref = (id: number, km: number, stars: number, near?: string) =>
  `/console/near?${near ? `near=${near}&` : ''}place=${id}&km=${km}&stars=${stars}`;
/** A place found on Google that is not on our list: the address carries its point. */
const pointHref = (p: Pick<Place, 'latitude' | 'longitude' | 'name' | 'google_id'>, km: number, stars: number) =>
  `/console/near?${new URLSearchParams({
    near: 'other', lat: String(p.latitude), lng: String(p.longitude), name: p.name, ...(p.google_id ? { gid: p.google_id } : {}),
    km: String(km), stars: String(stars),
  })}`;

function rowBtn(active: boolean): React.CSSProperties {
  return {
    display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', fontSize: 13, textDecoration: 'none',
    border: 0, borderBottom: '1px solid var(--c-line-soft)', cursor: 'pointer',
    background: active ? 'var(--c-accent-soft)' : 'transparent', color: 'var(--c-fg)',
  };
}

// ------------------------------------------------------------------ hotel row

function HotelRow({ index, hotel: h, place, ensurePlaceId, focused, onFocus, onChange, onError }: {
  index: number; hotel: Hotel; place: Place; ensurePlaceId: () => Promise<number | null>; focused: boolean; onFocus: () => void;
  onChange: (fn: (h: Hotel) => Hotel) => void; onError: (m: string | null) => void;
}) {
  const [note, setNote] = useState(h.note?.note || '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [newAttr, setNewAttr] = useState('');
  const rowRef = useRef<HTMLTableRowElement>(null);
  useEffect(() => { setNote(h.note?.note || ''); }, [h.note?.note]);
  useEffect(() => { if (focused) rowRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }, [focused]);

  const saveNote = async (body: { proximity?: string | null; note?: string | null }) => {
    setSaving(true); onError(null);
    try {
      // A Google spot is added to our list here, the first time it is needed.
      const placeId = await ensurePlaceId();
      if (!placeId) return;
      const j = await send(`${placeId}/hotels/${h.hotel_id}/note`, 'PUT', body);
      onChange((x) => ({ ...x, note: j.note ? { proximity: j.note.proximity, note: j.note.note, updated_by: j.note.updated_by, updated_at: j.note.updated_at } : null }));
      setSaved(true); setTimeout(() => setSaved(false), 3000);
    } catch (e: any) { onError(`Could not save for ${h.name}: ${plain(e.message)}`); }
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
    } catch (e: any) { onError(`Could not add that fact to ${h.name}: ${plain(e.message)}`); }
  };
  const removeAttr = async (attr: string) => {
    onError(null);
    try {
      await send(`hotels/${h.hotel_id}/attributes/${attr}`, 'DELETE');
      onChange((x) => ({ ...x, attributes: x.attributes.filter((a) => a.attr !== attr) }));
    } catch (e: any) { onError(`Could not remove that fact from ${h.name}: ${plain(e.message)}`); }
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
              {' · '}<span title="Our hotel ID">ID <span className="c-mono">{h.hotel_id}</span></span>
              {h.also.length > 0 && <span title={h.also.map((a) => `${a.hotel_id} (${a.source})`).join(', ')}> · also listed by {h.also.length} more supplier{h.also.length === 1 ? '' : 's'}</span>}
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
            {t ? (t.minutes == null ? <span style={{ color: 'var(--c-fg-muted)' }}>no route found</span> : <strong>{fmtMin(t.minutes)}</strong>) : <span style={{ color: 'var(--c-fg-muted)' }} title="Not asked yet">—</span>}
            <div><a href={dir(gm)} target="_blank" rel="noreferrer" style={{ fontSize: 11 }} onClick={(e) => e.stopPropagation()}
              aria-label={`${gm} directions from ${h.name} in Google Maps`}>directions</a></div>
          </td>
        );
      })}
      <td onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <select className="c-input" value={h.note?.proximity || ''} disabled={saving} aria-label={`How close is ${h.name}`}
            title="Saves as soon as you pick"
            onChange={(e) => saveNote({ proximity: e.target.value || null })} style={{ fontSize: 12, width: 130 }}>
            {TAGS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          <input className="c-input" style={{ fontSize: 12, flex: 1, minWidth: 140 }} placeholder="Note, e.g. skybridge to the venue"
            aria-label={`Note about ${h.name} and ${place.name}`}
            value={note} onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && dirty) void saveNote({ note }); }} />
          {dirty && <button className="c-btn c-btn-primary" disabled={saving} onClick={() => saveNote({ note })} style={{ fontSize: 12 }}>{saving ? 'Saving…' : 'Save note'}</button>}
        </div>
        <div role="status" style={{ fontSize: 11, marginTop: 3, minHeight: 14 }}>
          {saved ? <span style={{ color: 'var(--c-success)', fontWeight: 600 }}>Saved. This stays even when suppliers update the hotel.</span>
            : dirty ? <span style={{ color: 'var(--c-warn)' }}>Not saved yet: press Enter or Save note.</span>
            : h.note?.updated_by ? <span style={{ color: 'var(--c-fg-muted)' }}>Last saved by {h.note.updated_by} on {new Date(h.note.updated_at).toLocaleDateString('en-AU')}</span>
            : null}
        </div>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 6, alignItems: 'center' }}>
          {h.attributes.map((a) => (
            <span key={a.attr} className="c-pill c-pill-muted" title={a.note || ''}>
              {a.attr.replace(/-/g, ' ')}
              <button onClick={() => removeAttr(a.attr)} aria-label={`Remove "${a.attr.replace(/-/g, ' ')}" from ${h.name}`} title="Remove"
                style={{ border: 0, background: 'none', cursor: 'pointer', padding: '0 2px', marginLeft: 2, color: 'inherit', fontSize: 13, lineHeight: 1 }}>×</button>
            </span>
          ))}
          <input className="c-input" list="near-attr-suggest" placeholder="Add a hotel fact + Enter"
            title="Facts about the hotel itself, e.g. quiet at night. They show for every place."
            aria-label={`Add a fact about ${h.name}, e.g. quiet at night, then press Enter`} value={newAttr}
            onChange={(e) => setNewAttr(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void addAttr(); }}
            style={{ fontSize: 11, width: 170, padding: '2px 6px' }} />
          <datalist id="near-attr-suggest">
            {ATTR_SUGGESTIONS.map((s) => <option key={s} value={s} />)}
          </datalist>
        </div>
      </td>
    </tr>
  );
}

// ------------------------------------------------------------------ searched for

/**
 * Places people looked for that are not on our list, most searched first.
 * "Add to our list" looks the words up on Google Maps; pick the right match
 * and what kind of place it is, and it joins our list for everyone.
 */
function SearchedFor({ onAdded, onError }: { onAdded: (p: Place) => void; onError: (m: string | null) => void }) {
  const [terms, setTerms] = useState<SearchedTerm[] | null>(null);
  const [off, setOff] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [matches, setMatches] = useState<GoogleResult[]>([]);
  const [looking, setLooking] = useState(false);
  const [kind, setKind] = useState<CatKey>('other');
  const [adding, setAdding] = useState<string | null>(null);

  useEffect(() => {
    call('searches/top?limit=10')
      .then((j) => { setTerms(j.terms || []); setOff(j.setup === false); })
      .catch(() => setTerms([]));
  }, []);

  const expand = async (t: SearchedTerm) => {
    if (open === t.q) { setOpen(null); return; }
    setOpen(t.q); setMatches([]); setLooking(true);
    setKind(CAT_KEYS.includes(t.category as CatKey) ? (t.category as CatKey) : 'other');
    try {
      const j = await call(`search?${new URLSearchParams({ q: t.q, category: 'other' })}`);
      const found: GoogleResult[] = j.google || [];
      // The one they picked last time goes first.
      if (t.google) found.sort((a, b) => Number(b.google_id === t.google!.google_id) - Number(a.google_id === t.google!.google_id));
      setMatches(found);
    } catch (e: any) { onError(plain(e.message)); }
    finally { setLooking(false); }
  };

  const add = async (g: GoogleResult) => {
    setAdding(g.google_id); onError(null);
    try {
      const j = await send('google', 'POST', { google_id: g.google_id, category: kind, recategorise: true });
      onAdded({ ...j.place, address: g.address });
    } catch (e: any) { onError(`Could not add ${g.name}: ${plain(e.message)}`); }
    finally { setAdding(null); }
  };

  if (off || terms === null) return null;
  return (
    <div className="c-card">
      <div className="c-card-head"><h2 className="c-card-title">What people searched for</h2></div>
      <div style={{ padding: '0 12px 8px', ...muted }}>
        Places people looked for in the last 90 days that are not on our list yet, most searched first.
      </div>
      {terms.length === 0 ? (
        <div style={{ padding: '0 12px 12px', fontSize: 13, color: 'var(--c-fg-muted)' }}>Nothing yet. Searches will show here.</div>
      ) : terms.map((t) => (
        <div key={t.q} style={{ borderTop: '1px solid var(--c-line-soft)', padding: '8px 12px', fontSize: 13 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, overflowWrap: 'anywhere' }}>{t.q}</div>
              <div style={muted}>{t.searches} search{t.searches === 1 ? '' : 'es'} · last {new Date(t.last_at).toLocaleDateString('en-AU')}</div>
            </div>
            <button className="c-btn" style={{ fontSize: 12 }} onClick={() => expand(t)} aria-expanded={open === t.q}>
              {open === t.q ? 'Close' : 'Add to our list'}
            </button>
          </div>
          {open === t.q && (
            <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ ...muted, display: 'flex', gap: 6, alignItems: 'center' }}>
                Add it as
                <select className="c-input" value={kind} onChange={(e) => setKind(e.target.value as CatKey)} style={{ fontSize: 12 }}>
                  {CATS.map((c) => <option key={c.key} value={c.key}>{c.key === 'other' ? 'Something else' : c.label.replace(/^An? /, '')}</option>)}
                </select>
              </label>
              {looking && <div style={muted}>Looking it up on Google Maps…</div>}
              {!looking && matches.length === 0 && <div style={muted}>Google Maps found nothing for this.</div>}
              {matches.map((g) => (
                <div key={g.google_id} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div>{g.name}{t.google?.google_id === g.google_id && <span className="c-pill c-pill-muted" style={{ marginLeft: 4 }}>the one they picked</span>}</div>
                    <div style={muted}>{g.address}</div>
                  </div>
                  {g.place_id ? <span style={muted}>on our list</span> : (
                    <button className="c-btn c-btn-primary" style={{ fontSize: 12 }} disabled={adding !== null} onClick={() => add(g)}>
                      {adding === g.google_id ? 'Adding…' : 'Add'}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
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
    <iframe title={`Street map around ${place.name}`} src={src} style={{ width: '100%', height: 320, border: 0 }} loading="lazy" />
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
  const colour = (h: Hotel) => tagColour(h.note?.proximity);
  return (
    <svg viewBox={`0 0 ${size} ${size}`} style={{ width: '100%', height: 320, background: 'var(--c-bg-soft)' }} role="img" aria-label={`${hotels.length} hotels plotted around ${place.name}, coloured by your tag`}>
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
    </svg>
  );
}

function Dot({ colour }: { colour: string }) {
  return <span aria-hidden style={{ display: 'inline-block', width: 9, height: 9, borderRadius: '50%', background: colour, verticalAlign: 'middle', marginRight: 3 }} />;
}

// Page-only layout: two columns on wide screens, stacked on narrow ones.
const NEAR_CSS = `
.near-page { padding: 24px; max-width: 1400px; }
.near-layout { display: grid; grid-template-columns: minmax(260px, 340px) minmax(0, 1fr); gap: 16px; margin-top: 16px; align-items: start; }
.near-maps { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); border-top: 1px solid var(--c-line-soft); }
.near-maps > iframe { border-right: 1px solid var(--c-line-soft) !important; }
.near-page button:focus-visible, .near-page a:focus-visible { outline: 2px solid var(--c-accent); outline-offset: 2px; }
@media (max-width: 900px) {
  .near-page { padding: 16px; }
  .near-layout { grid-template-columns: minmax(0, 1fr); }
}
@media (max-width: 640px) {
  .near-maps { grid-template-columns: minmax(0, 1fr); }
  .near-maps > iframe { border-right: 0 !important; border-bottom: 1px solid var(--c-line-soft); }
}
`;
