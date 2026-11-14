'use client';

/**
 * Printable Hotelbeds voucher (certification 4.1–4.5). No price anywhere.
 * Everything on it comes from the engine's buildVoucher, which the detail
 * route enriches with the hotel address and phone from the Content API.
 * Print / Save as PDF uses the browser's print dialog; the console's sidebar,
 * top bar and buttons are hidden in print.
 */

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { Printer } from 'lucide-react';
import { MappedBooking, Voucher, day, hbx } from '../../_lib';

export default function HotelbedsVoucherPage({ params }: { params: Promise<{ reference: string }> }) {
  const { reference } = use(params);
  const ref = decodeURIComponent(reference);
  const [v, setV] = useState<Voucher | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    hbx<{ booking: MappedBooking; voucher: Voucher }>(`bookings/${encodeURIComponent(ref)}`)
      .then((r) => { setV(r.voucher); setStatus(r.booking?.status || null); })
      .catch((e) => setError((e as Error).message));
  }, [ref]);

  return (
    <div>
      <style>{`
        @media print {
          .c-sidebar, .c-topbar, .hbx-noprint { display: none !important; }
          .console-shell { display: block !important; }
          .c-content { padding: 0 !important; max-width: none !important; }
          .hbx-voucher { border: 0 !important; box-shadow: none !important; }
          @page { margin: 14mm; }
        }
        .hbx-voucher th { text-align: left; font-weight: 600; width: 34%; padding: 6px 10px; border: 1px solid #ccc; background: #f7f7f7; vertical-align: top; }
        .hbx-voucher td { padding: 6px 10px; border: 1px solid #ccc; vertical-align: top; }
        .hbx-voucher table { border-collapse: collapse; width: 100%; font-size: 13.5px; }
        .hbx-voucher h3 { font-size: 14px; margin: 18px 0 8px; }
      `}</style>

      <div className="hbx-noprint" style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <button className="c-btn c-btn-primary" onClick={() => window.print()} disabled={!v}><Printer size={14} /> Print / Save as PDF</button>
        <Link className="c-btn" href={`/console/hotelbeds/bookings/${encodeURIComponent(ref)}`}>Booking detail</Link>
        <Link className="c-btn" href="/console/hotelbeds">New search</Link>
      </div>

      {error && <div className="c-error">{error}</div>}
      {!v && !error && <div className="c-loading">Loading voucher…</div>}

      {v && (
        <article className="hbx-voucher" style={{ maxWidth: 780, border: '1px solid var(--c-line)', borderRadius: 8, padding: '22px 26px', background: '#fff', color: '#111' }}>
          <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#555' }}>{v.title}</div>
              <h2 style={{ fontSize: 22, margin: '4px 0 2px' }}>{v.hotel.name}</h2>
              <div style={{ fontSize: 13.5 }}>{v.hotel.category}{v.hotel.destination ? ` · ${v.hotel.destination}` : ''}</div>
            </div>
            <div style={{ textAlign: 'right', fontSize: 13 }}>
              <div style={{ fontWeight: 700 }}>{v.agency}</div>
              {String(status).toLowerCase() === 'cancelled' && <div style={{ color: '#a51919', fontWeight: 700, marginTop: 4 }}>CANCELLED</div>}
            </div>
          </header>

          <table>
            <tbody>
              <tr><th>Hotel address</th><td>{v.hotel.address || '—'}</td></tr>
              <tr><th>Hotel phone</th><td>{v.hotel.phone || '—'}</td></tr>
              <tr><th>Hotelbeds reference</th><td style={{ fontFamily: 'var(--c-mono)' }}>{v.booking.reference}</td></tr>
              <tr><th>Agency reference</th><td style={{ fontFamily: 'var(--c-mono)' }}>{v.booking.agencyReference}</td></tr>
              <tr><th>Check-in</th><td>{day(v.booking.checkIn)}</td></tr>
              <tr><th>Check-out</th><td>{day(v.booking.checkOut)}</td></tr>
              <tr><th>Holder (lead passenger)</th><td>{v.passengers.holder}</td></tr>
            </tbody>
          </table>

          <h3>Rooms</h3>
          <table>
            <thead><tr><th style={{ width: '12%' }}>Room</th><th>Room type</th><th>Board</th><th>Passengers</th><th style={{ width: '16%' }}>Children ages</th></tr></thead>
            <tbody>
              {v.passengers.rooms.map((r, i) => (
                <tr key={r.room}>
                  <td>Room {r.room}</td>
                  <td>{v.booking.rooms[i]?.roomType || '—'}</td>
                  <td>{v.booking.rooms[i]?.board || '—'}</td>
                  <td>{r.names.join(', ') || '—'}</td>
                  <td>{r.childrenAges.length ? r.childrenAges.join(', ') : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <h3>Rate comments</h3>
          <div style={{ whiteSpace: 'pre-wrap', fontSize: 13.5, border: '1px solid #ccc', padding: '8px 10px' }}>{v.booking.rateComments || 'None.'}</div>

          <p style={{ marginTop: 18, border: '1px solid #999', padding: '10px 12px', fontSize: 13 }}>{v.payableThrough}</p>
        </article>
      )}
    </div>
  );
}
