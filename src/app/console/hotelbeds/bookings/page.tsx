'use client';

/**
 * Hotelbeds booking list (certification: booking list), straight from the
 * Hotelbeds Booking API, so it shows exactly what Hotelbeds holds for us in
 * the TEST environment. Opening a row goes to its detail, where it can be
 * cancelled.
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { HbxTabs, StatusPill, TestEnvBanner } from '../_components';
import { MappedBooking, day, hbx } from '../_lib';

const PAGE = 25;

function isoDay(offset: number) {
  return new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
}

export default function HotelbedsBookingsPage() {
  const [start, setStart] = useState(isoDay(-7));
  const [end, setEnd] = useState(isoDay(0));
  const [filterType, setFilterType] = useState<'CREATION' | 'CHECKIN'>('CREATION');
  const [status, setStatus] = useState<'ALL' | 'CONFIRMED' | 'CANCELLED'>('ALL');
  const [from, setFrom] = useState(1);
  const [data, setData] = useState<{ total: number; bookings: MappedBooking[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (first: number) => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ start, end, filterType, status, from: String(first), to: String(first + PAGE - 1) });
      const r = await hbx<{ total: number; bookings: MappedBooking[] }>(`bookings?${qs}`);
      setData({ total: r.total, bookings: r.bookings || [] });
      setFrom(first);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [start, end, filterType, status]);

  // One list call on arrival; after that only when asked.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(1); }, []);

  const total = data?.total ?? 0;
  return (
    <div>
      <div className="c-page-head">
        <div>
          <h1 className="c-page-title">Hotelbeds bookings</h1>
          <p className="c-page-sub">As Hotelbeds holds them. Test environment.</p>
        </div>
      </div>
      <TestEnvBanner />
      <HbxTabs />

      <form className="c-filter-row" onSubmit={(e) => { e.preventDefault(); load(1); }}>
        <div>
          <label className="c-label" htmlFor="bl-type">Dates are</label>
          <select id="bl-type" className="c-select" value={filterType} onChange={(e) => setFilterType(e.target.value as 'CREATION' | 'CHECKIN')}>
            <option value="CREATION">Booked on</option>
            <option value="CHECKIN">Check-in</option>
          </select>
        </div>
        <div><label className="c-label" htmlFor="bl-start">From</label><input id="bl-start" type="date" className="c-input" value={start} onChange={(e) => setStart(e.target.value)} /></div>
        <div><label className="c-label" htmlFor="bl-end">To</label><input id="bl-end" type="date" className="c-input" value={end} onChange={(e) => setEnd(e.target.value)} /></div>
        <div>
          <label className="c-label" htmlFor="bl-status">Status</label>
          <select id="bl-status" className="c-select" value={status} onChange={(e) => setStatus(e.target.value as 'ALL' | 'CONFIRMED' | 'CANCELLED')}>
            <option value="ALL">All</option>
            <option value="CONFIRMED">Confirmed</option>
            <option value="CANCELLED">Cancelled</option>
          </select>
        </div>
        <div><button type="submit" className="c-btn c-btn-primary" disabled={loading}>{loading ? 'Loading…' : 'Show bookings'}</button></div>
      </form>

      {error && <div className="c-error" style={{ marginBottom: 16 }}>{error}</div>}

      <div className="c-card">
        {!data && loading && <div className="c-loading">Loading Hotelbeds bookings…</div>}
        {data && data.bookings.length === 0 && <div className="c-empty"><div className="c-empty-title">No bookings in this range</div>Try a wider date range.</div>}
        {data && data.bookings.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table className="c-table">
              <thead>
                <tr><th>Hotelbeds ref</th><th>Agency ref</th><th>Status</th><th>Hotel</th><th>Stay</th><th>Holder</th><th>Booked</th></tr>
              </thead>
              <tbody>
                {data.bookings.map((b) => (
                  <tr key={b.reference || b.clientReference || ''}>
                    <td className="c-mono"><Link href={`/console/hotelbeds/bookings/${encodeURIComponent(b.reference || '')}`}>{b.reference}</Link></td>
                    <td className="c-mono">{b.clientReference}</td>
                    <td><StatusPill status={b.status} /></td>
                    <td>{b.hotel?.name}<div style={{ fontSize: 12, color: 'var(--c-fg-muted)' }}>{b.hotel?.destinationName}</div></td>
                    <td style={{ whiteSpace: 'nowrap' }}>{day(b.hotel?.checkIn)} →<br />{day(b.hotel?.checkOut)}</td>
                    <td>{[b.holder?.name, b.holder?.surname].filter(Boolean).join(' ')}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{day(b.creationDate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data && total > PAGE && (
          <div style={{ padding: '10px 16px', display: 'flex', gap: 8, alignItems: 'center', borderTop: '1px solid var(--c-line-soft)', fontSize: 13 }}>
            <button className="c-btn" disabled={from <= 1 || loading} onClick={() => load(Math.max(1, from - PAGE))}>Previous</button>
            <span>{from}–{Math.min(total, from + PAGE - 1)} of {total}</span>
            <button className="c-btn" disabled={from + PAGE > total || loading} onClick={() => load(from + PAGE)}>Next</button>
          </div>
        )}
      </div>
    </div>
  );
}

