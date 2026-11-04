'use client';

/**
 * /console/room-mappings — match the same room across Hummingbird and RateHawk
 * for each hotel both sell (room_mappings table, hotel_data DB).
 *
 * Reads + writes both go through /api/admin/room-mappings/* so the
 * COLLECTIONS_ADMIN_KEY stays server-side (same convention as collections).
 *
 * A matched pair (auto_high, auto_med, confirmed, manual) makes B2B Search
 * show the two rates as one room. The page is the queue for the rest: pick a
 * hotel (most to check first), then say whether each suggested pair is the
 * same room, and pick the partner for rooms with none from the supplier's own
 * room list. hotel-api re-runs the matching weekly for new hotels and rooms.
 */
import { useEffect, useMemo, useState, useCallback } from 'react';
import Link from 'next/link';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth } from '@/lib/firebase';
import { Link2, Check, X, Save, RefreshCw, Search, ExternalLink } from 'lucide-react';

interface HotelRow {
  hotel_id: number;
  name: string | null;
  city: string | null;
  country: string | null;
  suppliers: string[];
  total: number;
  needs_review: number;
  to_check: number;
  no_match: number;
  matched: number;
}
interface MappingRow {
  id: number;
  canonical_id: number | null;
  hotel_id: number;
  room_key: string | null;
  hb_room_name: string | null;
  rh_room_name: string | null;
  confidence: number | string | null;
  status: string;
  updated_at?: string;
  updated_by?: string | null;
}
type Rooms = { hummingbird?: string[]; ratehawk?: string[] };

const MATCHED = new Set(['auto_high', 'auto_med', 'confirmed', 'manual']);
const SUPPLIER_LABEL: Record<string, string> = { hummingbird: 'Hummingbird', ratehawk: 'RateHawk' };

// Who matched a pair, in words.
function matchedBy(row: MappingRow): string {
  if (row.status === 'auto_high' || row.status === 'auto_med') return 'Same name';
  const who = row.updated_by && !['console', 'seed', 'match_rooms'].includes(row.updated_by)
    ? row.updated_by.split('@')[0] : null;
  return row.status === 'confirmed' ? `Confirmed${who ? ` by ${who}` : ''}` : `Picked${who ? ` by ${who}` : ''}`;
}

export default function RoomMappingsPage() {
  const [user] = useAuthState(auth);
  const [hotels, setHotels] = useState<HotelRow[]>([]);
  const [loadingHotels, setLoadingHotels] = useState(true);
  const [filter, setFilter] = useState('');
  const [onlyWork, setOnlyWork] = useState(true);
  const [selected, setSelected] = useState<number | null>(null);
  const [rows, setRows] = useState<MappingRow[]>([]);
  const [rooms, setRooms] = useState<Rooms>({});
  const [loadingRows, setLoadingRows] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadHotels = useCallback(async () => {
    setLoadingHotels(true); setError(null);
    try {
      const r = await fetch('/api/admin/room-mappings/hotels', { cache: 'no-store' });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      // API already sorts most to check first; keep its order.
      setHotels(Array.isArray(d) ? d : []);
    } catch (e) { setError((e as Error).message); }
    finally { setLoadingHotels(false); }
  }, []);

  const loadRows = useCallback(async (hotelId: number) => {
    setLoadingRows(true); setError(null);
    try {
      const [r, rr] = await Promise.all([
        fetch(`/api/admin/room-mappings?hotelId=${hotelId}`, { cache: 'no-store' }),
        fetch(`/api/admin/room-mappings/rooms?hotelId=${hotelId}`, { cache: 'no-store' }),
      ]);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      setRows(Array.isArray(d) ? d : []);
      setRooms(rr.ok ? await rr.json() : {});
    } catch (e) { setError((e as Error).message); }
    finally { setLoadingRows(false); }
  }, []);

  useEffect(() => { loadHotels(); }, [loadHotels]);

  function pickHotel(hotelId: number) {
    setSelected(hotelId);
    loadRows(hotelId);
  }

  // PUT a single row. Patch carries only the changed keys; the API bumps
  // updated_at itself. The returned row replaces the local one and the hotel
  // counts refresh, since a change moves rooms between sections.
  async function saveRow(id: number, patch: Partial<MappingRow>) {
    setError(null);
    try {
      const r = await fetch(`/api/admin/room-mappings/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...patch, updated_by: user?.email || 'console' }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      setRows((prev) => prev.map((row) => (row.id === id ? { ...row, ...d } : row)));
      loadHotels();
    } catch (e) { setError((e as Error).message); }
  }

  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return hotels.filter((h) =>
      (!onlyWork || h.to_check + h.no_match > 0)
      && (!q || [h.name, h.city, h.country].some((v) => v?.toLowerCase().includes(q))));
  }, [hotels, filter, onlyWork]);

  const hotel = hotels.find((h) => h.hotel_id === selected);
  const toCheck = rows.filter((r) => r.status === 'review_low');
  const noMatch = rows.filter((r) => r.status === 'hb_only' || r.status === 'rh_only');
  const matched = rows.filter((r) => MATCHED.has(r.status));
  const notSame = rows.filter((r) => r.status === 'rejected');
  // RateHawk rooms nobody has paired yet go first in the pick list.
  const usedRh = new Set(rows.filter((r) => MATCHED.has(r.status) || r.status === 'review_low').map((r) => r.rh_room_name));
  const rhOptions = [...(rooms.ratehawk || [])].sort((a, b) => Number(usedRh.has(a)) - Number(usedRh.has(b)));
  const totals = hotels.reduce((t, h) => ({ check: t.check + h.to_check, none: t.none + h.no_match }), { check: 0, none: 0 });

  return (
    <>
      <div className="c-page-head">
        <div>
          <h1 className="c-page-title">
            <Link2 size={20} style={{ verticalAlign: '-3px', marginRight: 6 }} />Room matching
          </h1>
          <p className="c-page-sub" style={{ maxWidth: 720 }}>
            Hummingbird and RateHawk both sell these hotels but name the same room differently.
            Once two rooms are matched, B2B Search shows them as one room with both prices.
            New hotels and rooms are matched every Monday; anything unsure lands here.
          </p>
        </div>
        <button className="c-btn" disabled={loadingHotels} onClick={() => loadHotels()}>
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {error && <div className="c-error">Error: {error}</div>}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 18, alignItems: 'flex-start', marginTop: 8 }}>
        {/* Hotel list, most to check first */}
        <div className="c-card" style={{ padding: 12, flex: '1 1 300px', maxWidth: 380 }}>
          <div className="c-label" style={{ marginBottom: 4 }}>
            {hotels.length} hotels · {totals.check} to check · {totals.none} with no match
          </div>
          <div style={{ position: 'relative', margin: '8px 0' }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: 10, color: 'var(--c-fg-muted)' }} />
            <input
              className="c-input"
              style={{ paddingLeft: 30, width: '100%' }}
              placeholder="Hotel, city or country"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
          </div>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12.5, marginBottom: 8 }}>
            <input type="checkbox" checked={onlyWork} onChange={(e) => setOnlyWork(e.target.checked)} />
            Only hotels with rooms to sort out
          </label>
          {loadingHotels ? (
            <div className="c-loading">Loading…</div>
          ) : shown.length === 0 ? (
            <div className="c-empty">No hotels here.</div>
          ) : (
            <div style={{ display: 'grid', gap: 4, maxHeight: '70vh', overflowY: 'auto' }}>
              {shown.map((h) => (
                <button
                  key={h.hotel_id}
                  className="c-btn"
                  style={{
                    display: 'block', textAlign: 'left', height: 'auto', padding: '8px 10px',
                    ...(selected === h.hotel_id
                      ? { background: 'var(--c-accent-soft)', borderColor: 'var(--c-accent)' }
                      : {}),
                  }}
                  onClick={() => pickHotel(h.hotel_id)}
                >
                  <div style={{ fontWeight: 600 }}>{h.name || `Hotel #${h.hotel_id}`}</div>
                  <div style={{ fontSize: 12, color: 'var(--c-fg-soft)' }}>
                    {[h.city, h.country].filter(Boolean).join(', ')}
                  </div>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
                    {h.to_check > 0 && <span className="c-pill c-pill-warn">{h.to_check} to check</span>}
                    {h.no_match > 0 && <span className="c-pill c-pill-muted">{h.no_match} no match</span>}
                    {h.to_check + h.no_match === 0 && <span className="c-pill c-pill-success">done</span>}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Selected hotel */}
        <div style={{ flex: '3 1 480px', minWidth: 0 }}>
          {selected == null ? (
            <div className="c-empty">Pick a hotel to see its rooms.</div>
          ) : (
            <>
              <div className="c-card" style={{ padding: 14, marginBottom: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontSize: 17, fontWeight: 600 }}>{hotel?.name || `Hotel #${selected}`}</div>
                    <div className="c-page-sub">
                      {[hotel?.city, hotel?.country].filter(Boolean).join(', ')}
                      {hotel?.suppliers?.length ? ` · sold by ${hotel.suppliers.map((s) => SUPPLIER_LABEL[s] || s).join(' and ')}` : ''}
                    </div>
                  </div>
                  <Link className="c-btn" href={`/console/search?hotelId=${selected}`}>
                    <ExternalLink size={13} /> Open in B2B Search
                  </Link>
                </div>
              </div>

              {loadingRows ? (
                <div className="c-loading">Loading rooms…</div>
              ) : rows.length === 0 ? (
                <div className="c-empty">No rooms for this hotel.</div>
              ) : (
                <>
                  <Section
                    title={`To check (${toCheck.length})`}
                    hint="The system thinks these are the same room. Is it right?"
                    rows={toCheck}
                    render={(row) => (
                      <PairRow key={row.id} row={row}>
                        <button className="c-btn c-btn-primary" onClick={() => saveRow(row.id, { status: 'confirmed' })}>
                          <Check size={13} /> Same room
                        </button>
                        <button className="c-btn" onClick={() => saveRow(row.id, { status: 'rejected' })}>
                          <X size={13} /> Not the same
                        </button>
                      </PairRow>
                    )}
                  />
                  <Section
                    title={`No match yet (${noMatch.length})`}
                    hint="Pick the other supplier's room, or leave it if they don't sell it."
                    rows={noMatch}
                    render={(row) => (
                      <PickRow key={row.id} row={row} rhOptions={rhOptions} hbOptions={rooms.hummingbird || []}
                               used={usedRh} onSave={saveRow} />
                    )}
                  />
                  <Section
                    title={`Matched (${matched.length})`}
                    hint="Shown as one room in search."
                    rows={matched}
                    render={(row) => (
                      <PairRow key={row.id} row={row} note={matchedBy(row)}>
                        <button className="c-btn" onClick={() => saveRow(row.id, { status: 'rejected' })}>
                          <X size={13} /> Not the same
                        </button>
                      </PairRow>
                    )}
                  />
                  <Section
                    title={`Not the same (${notSame.length})`}
                    hint="Kept apart in search. Pick a different room if there is one."
                    rows={notSame}
                    render={(row) => (
                      <PickRow key={row.id} row={row} rhOptions={rhOptions} hbOptions={rooms.hummingbird || []}
                               used={usedRh} onSave={saveRow} />
                    )}
                  />
                </>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}

function Section({ title, hint, rows, render }: {
  title: string; hint: string; rows: MappingRow[]; render: (row: MappingRow) => React.ReactNode;
}) {
  if (!rows.length) return null;
  return (
    <div className="c-card" style={{ padding: 14, marginBottom: 14 }}>
      <div style={{ fontWeight: 600 }}>{title}</div>
      <div className="c-page-sub" style={{ marginBottom: 10 }}>{hint}</div>
      <div style={{ display: 'grid', gap: 8 }}>{rows.map(render)}</div>
    </div>
  );
}

function RoomName({ supplier, name }: { supplier: string; name: string | null }) {
  return (
    <div style={{ flex: '1 1 220px', minWidth: 0 }}>
      <div style={{ fontSize: 11, color: 'var(--c-fg-muted)', textTransform: 'uppercase', letterSpacing: 0.4 }}>{supplier}</div>
      <div style={{ fontSize: 13.5 }}>{name || '—'}</div>
    </div>
  );
}

function PairRow({ row, note, children }: { row: MappingRow; note?: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', borderTop: '1px solid var(--c-line)', paddingTop: 8 }}>
      <RoomName supplier="Hummingbird" name={row.hb_room_name} />
      <RoomName supplier="RateHawk" name={row.rh_room_name} />
      {note && <span className="c-pill c-pill-muted">{note}</span>}
      <div style={{ display: 'flex', gap: 6 }}>{children}</div>
    </div>
  );
}

// A room without a partner: choose one from the other supplier's list. Saving
// stores the pair as picked by hand (manual), which search trusts.
function PickRow({ row, rhOptions, hbOptions, used, onSave }: {
  row: MappingRow; rhOptions: string[]; hbOptions: string[]; used: Set<string | null>;
  onSave: (id: number, patch: Partial<MappingRow>) => void;
}) {
  const pickRh = !!row.hb_room_name;            // usual case: HB room needs a RateHawk partner
  const options = pickRh ? rhOptions : hbOptions;
  const [choice, setChoice] = useState('');
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', borderTop: '1px solid var(--c-line)', paddingTop: 8 }}>
      {pickRh ? <RoomName supplier="Hummingbird" name={row.hb_room_name} /> : null}
      <div style={{ flex: '1 1 220px', minWidth: 0 }}>
        <div style={{ fontSize: 11, color: 'var(--c-fg-muted)', textTransform: 'uppercase', letterSpacing: 0.4 }}>
          {pickRh ? 'RateHawk' : 'Hummingbird'}
        </div>
        <select className="c-select" style={{ width: '100%' }} value={choice} onChange={(e) => setChoice(e.target.value)}>
          <option value="">
            {row.status === 'rejected' && row.rh_room_name ? `Not: ${row.rh_room_name}` : 'Pick the matching room…'}
          </option>
          {options.map((n) => (
            <option key={n} value={n}>{n}{pickRh && used.has(n) ? ' (already matched)' : ''}</option>
          ))}
        </select>
      </div>
      {!pickRh ? <RoomName supplier="RateHawk" name={row.rh_room_name} /> : null}
      <button
        className="c-btn c-btn-primary"
        disabled={!choice}
        onClick={() => onSave(row.id, pickRh
          ? { rh_room_name: choice, status: 'manual' }
          : { hb_room_name: choice, status: 'manual' })}
      >
        <Save size={13} /> Match
      </button>
    </div>
  );
}
