'use client';

/**
 * /console/room-mappings — review & override the cross-supplier room mappings
 * that link a Hummingbird room name to a RateHawk room name for each hotel
 * (room_mappings table, hotel_data DB).
 *
 * Reads + writes both go through /api/admin/room-mappings/* so the
 * COLLECTIONS_ADMIN_KEY stays server-side (same convention as collections).
 *
 * The page is a review queue: pick a hotel (most-to-review first), then for
 * each row Confirm / Reject the auto-match, fix a wrong pairing inline (Save →
 * manual), pair an hb_only / rh_only single by typing the counterpart name
 * (Save → manual), or Delete a redundant single row after merging.
 */
import { useEffect, useState, useCallback } from 'react';
import { Link2, Check, X, Save, Trash2, RefreshCw } from 'lucide-react';

interface HotelRow {
  hotel_id: number;
  total: number;
  needs_review: number;
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

// Statuses that still need a human (mirrors the API's NEEDS_REVIEW_STATUSES).
const NEEDS_REVIEW = new Set(['review_low', 'hb_only', 'rh_only']);

const STATUS_LABEL: Record<string, string> = {
  auto_high: 'Auto (high)',
  auto_med: 'Auto (med)',
  review_low: 'Review (low)',
  hb_only: 'HB only',
  rh_only: 'RH only',
  confirmed: 'Confirmed',
  rejected: 'Rejected',
  manual: 'Manual',
};

function statusPillClass(status: string): string {
  if (status === 'confirmed') return 'c-pill c-pill-success';
  if (status === 'rejected') return 'c-pill c-pill-danger';
  if (NEEDS_REVIEW.has(status)) return 'c-pill c-pill-warn';
  return 'c-pill c-pill-muted';
}

// Confidence dot color: green ≥0.8, amber ≥0.6, red <0.6, grey for singles
// (hb_only/rh_only or null confidence — there's nothing to be confident about).
function confidenceColor(conf: number | null, status: string): string {
  if (conf == null || status === 'hb_only' || status === 'rh_only') return 'var(--c-fg-muted)';
  if (conf >= 0.8) return 'var(--c-success)';
  if (conf >= 0.6) return 'var(--c-warn)';
  return 'var(--c-danger)';
}

function toNum(v: number | string | null): number | null {
  if (v == null) return null;
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

export default function RoomMappingsPage() {
  const [hotels, setHotels] = useState<HotelRow[]>([]);
  const [loadingHotels, setLoadingHotels] = useState(true);
  const [selected, setSelected] = useState<number | null>(null);
  const [rows, setRows] = useState<MappingRow[]>([]);
  const [loadingRows, setLoadingRows] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadHotels = useCallback(async () => {
    setLoadingHotels(true); setError(null);
    try {
      const r = await fetch('/api/admin/room-mappings/hotels', { cache: 'no-store' });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      // API already sorts most-to-review first; keep its order.
      setHotels(Array.isArray(d) ? d : []);
    } catch (e) { setError((e as Error).message); }
    finally { setLoadingHotels(false); }
  }, []);

  const loadRows = useCallback(async (hotelId: number) => {
    setLoadingRows(true); setError(null);
    try {
      const r = await fetch(`/api/admin/room-mappings?hotelId=${hotelId}`, { cache: 'no-store' });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      setRows(Array.isArray(d) ? d : []);
    } catch (e) { setError((e as Error).message); }
    finally { setLoadingRows(false); }
  }, []);

  useEffect(() => { loadHotels(); }, [loadHotels]);

  function pickHotel(hotelId: number) {
    setSelected(hotelId);
    setNotice(null);
    loadRows(hotelId);
  }

  // PUT a single row. Patch carries only the changed keys; the API bumps
  // updated_at itself. On success the returned row replaces the local one and
  // we refresh the hotel badges (a status change moves it in/out of review).
  async function saveRow(id: number, patch: Partial<MappingRow>) {
    setError(null); setNotice(null);
    try {
      const r = await fetch(`/api/admin/room-mappings/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...patch, updated_by: 'console' }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      setRows((prev) => prev.map((row) => (row.id === id ? { ...row, ...d } : row)));
      setNotice('Saved.');
      loadHotels();
    } catch (e) { setError((e as Error).message); }
  }

  async function deleteRow(id: number) {
    if (!confirm('Delete this mapping row? This cannot be undone.')) return;
    setError(null); setNotice(null);
    try {
      const r = await fetch(`/api/admin/room-mappings/${id}`, { method: 'DELETE' });
      if (!r.ok) { const d = await r.json(); throw new Error(d.error || `HTTP ${r.status}`); }
      setRows((prev) => prev.filter((row) => row.id !== id));
      setNotice('Row deleted.');
      loadHotels();
    } catch (e) { setError((e as Error).message); }
  }

  const mapped = rows.filter((r) => r.status === 'confirmed' || r.status === 'auto_high' || r.status === 'auto_med').length;
  const needsReview = rows.filter((r) => NEEDS_REVIEW.has(r.status)).length;

  return (
    <>
      <div className="c-page-head">
        <div>
          <h1 className="c-page-title">
            <Link2 size={20} style={{ verticalAlign: '-3px', marginRight: 6 }} />Room Mappings
          </h1>
          <p className="c-page-sub">
            Review &amp; override the cross-supplier room matches (Hummingbird ⇄ RateHawk) per hotel.
          </p>
        </div>
        <button className="c-btn" disabled={loadingHotels} onClick={() => loadHotels()}>
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {error && <div className="c-error">Error: {error}</div>}
      {notice && (
        <div className="c-card" style={{ borderColor: 'var(--c-success)', color: 'var(--c-success)', padding: 12 }}>
          {notice}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 18, alignItems: 'start', marginTop: 8 }}>
        {/* Hotel picker — most-to-review first */}
        <div className="c-card" style={{ padding: 12 }}>
          <div className="c-label" style={{ marginBottom: 8 }}>Hotels ({hotels.length})</div>
          {loadingHotels ? (
            <div className="c-loading">Loading…</div>
          ) : hotels.length === 0 ? (
            <div className="c-empty">No room mappings found.</div>
          ) : (
            <div style={{ display: 'grid', gap: 4 }}>
              {hotels.map((h) => (
                <button
                  key={h.hotel_id}
                  className="c-btn"
                  style={{
                    justifyContent: 'space-between', textAlign: 'left',
                    ...(selected === h.hotel_id
                      ? { background: 'var(--c-accent-soft)', borderColor: 'var(--c-accent)' }
                      : {}),
                  }}
                  onClick={() => pickHotel(h.hotel_id)}
                >
                  <span className="c-mono">#{h.hotel_id}</span>
                  {h.needs_review > 0 ? (
                    <span className="c-pill c-pill-warn">needs review: {h.needs_review}</span>
                  ) : (
                    <span className="c-pill c-pill-success">all done</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Selected hotel's rows */}
        <div>
          {selected == null ? (
            <div className="c-empty">Select a hotel to review its room mappings.</div>
          ) : (
            <>
              <div className="c-page-sub" style={{ marginBottom: 12 }}>
                Hotel <span className="c-mono">#{selected}</span> · {mapped} mapped · {needsReview} to review
              </div>
              {loadingRows ? (
                <div className="c-loading">Loading rows…</div>
              ) : rows.length === 0 ? (
                <div className="c-empty">No mapping rows for this hotel.</div>
              ) : (
                <table className="c-table">
                  <thead>
                    <tr>
                      <th>Hummingbird room</th>
                      <th>RateHawk room</th>
                      <th>Confidence</th>
                      <th>Status</th>
                      <th style={{ textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <MappingRowEditor
                        key={row.id}
                        row={row}
                        onSave={saveRow}
                        onDelete={deleteRow}
                      />
                    ))}
                  </tbody>
                </table>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}

function MappingRowEditor({
  row, onSave, onDelete,
}: {
  row: MappingRow;
  onSave: (id: number, patch: Partial<MappingRow>) => void;
  onDelete: (id: number) => void;
}) {
  const [hb, setHb] = useState(row.hb_room_name || '');
  const [rh, setRh] = useState(row.rh_room_name || '');

  // Keep local inputs in sync when the row is replaced after a save.
  useEffect(() => { setHb(row.hb_room_name || ''); setRh(row.rh_room_name || ''); }, [row.hb_room_name, row.rh_room_name]);

  const conf = toNum(row.confidence);
  const dirty = (hb || '') !== (row.hb_room_name || '') || (rh || '') !== (row.rh_room_name || '');

  return (
    <tr>
      <td>
        <input
          className="c-input"
          value={hb}
          placeholder={row.status === 'rh_only' ? 'type the matching HB room…' : 'Hummingbird room name'}
          onChange={(e) => setHb(e.target.value)}
        />
      </td>
      <td>
        <input
          className="c-input"
          value={rh}
          placeholder={row.status === 'hb_only' ? 'type the matching RateHawk room…' : 'RateHawk room name'}
          onChange={(e) => setRh(e.target.value)}
        />
      </td>
      <td>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span style={{
            width: 8, height: 8, borderRadius: '50%',
            background: confidenceColor(conf, row.status), flexShrink: 0,
          }} />
          <span className="c-mono">{conf != null ? conf.toFixed(2) : '—'}</span>
        </span>
      </td>
      <td>
        <span className={statusPillClass(row.status)}>{STATUS_LABEL[row.status] || row.status}</span>
      </td>
      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
        {/* Save edited names → manual. Enabled only when a name changed. */}
        <button
          className="c-btn"
          disabled={!dirty}
          title="Save edited room names (sets status = manual)"
          onClick={() => onSave(row.id, { hb_room_name: hb || null, rh_room_name: rh || null, status: 'manual' })}
        >
          <Save size={13} /> Save
        </button>{' '}
        <button
          className="c-btn"
          title="Confirm this match"
          onClick={() => onSave(row.id, { status: 'confirmed' })}
        >
          <Check size={13} /> Confirm
        </button>{' '}
        <button
          className="c-btn c-btn-danger"
          title="Reject this match"
          onClick={() => onSave(row.id, { status: 'rejected' })}
        >
          <X size={13} /> Reject
        </button>{' '}
        <button
          className="c-btn c-btn-danger"
          title="Delete this row"
          onClick={() => onDelete(row.id)}
        >
          <Trash2 size={13} />
        </button>
      </td>
    </tr>
  );
}
