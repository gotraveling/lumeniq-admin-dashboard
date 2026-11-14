'use client';

/**
 * One Hotelbeds booking: detail from the Booking API, link to the voucher,
 * and cancellation the way certification asks for it:
 *   1. SIMULATION first, and show what cancelling would cost;
 *   2. the user confirms;
 *   3. CANCELLATION, refused by the engine if it would cost more than the
 *      simulation said (maxFee).
 */

import { use, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { HbxTabs, Penalties, RateComments, RefundPill, StatusPill, TestEnvBanner } from '../../_components';
import { MappedBooking, amount, day, hbx } from '../../_lib';

type Sim = { amount: number | null; currency: string | null };

export default function HotelbedsBookingDetail({ params }: { params: Promise<{ reference: string }> }) {
  const { reference } = use(params);
  const ref = decodeURIComponent(reference);
  const [booking, setBooking] = useState<MappedBooking | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sim, setSim] = useState<Sim | null>(null);
  const [busy, setBusy] = useState<'sim' | 'cancel' | null>(null);
  const [cancelled, setCancelled] = useState<{ fee: number | null; currency: string | null; number: string | null } | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const r = await hbx<{ booking: MappedBooking }>(`bookings/${encodeURIComponent(ref)}`);
      setBooking(r.booking);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [ref]);

  useEffect(() => { load(); }, [load]);

  async function simulate() {
    setBusy('sim');
    setError(null);
    try {
      const r = await hbx<{ cancellationCost: Sim | null }>(`bookings/${encodeURIComponent(ref)}/cancel-simulation`, { method: 'POST' });
      setSim(r.cancellationCost || { amount: 0, currency: booking?.currency || null });
    } catch (e) {
      setError(`Cancellation simulation failed: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  }

  async function cancel() {
    if (!sim) return;
    setBusy('cancel');
    setError(null);
    try {
      const maxFee = sim.amount != null ? `?maxFee=${encodeURIComponent(String(sim.amount))}` : '';
      const r = await hbx<{ status: string; cancellationFee: number | null; cancellationCurrency: string | null; cancellationNumber: string | null }>(
        `bookings/${encodeURIComponent(ref)}${maxFee}`, { method: 'DELETE' });
      setCancelled({ fee: r.cancellationFee, currency: r.cancellationCurrency, number: r.cancellationNumber });
      setSim(null);
      await load();
    } catch (e) {
      setError(`Cancellation failed: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  }

  const isCancelled = String(booking?.status || '').toLowerCase() === 'cancelled';

  return (
    <div>
      <div className="c-page-head">
        <div>
          <h1 className="c-page-title">Booking <span className="c-mono" style={{ fontSize: 20 }}>{ref}</span></h1>
          <p className="c-page-sub">Hotelbeds booking detail. Test environment.</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link className="c-btn" href="/console/hotelbeds/bookings">All bookings</Link>
          <Link className="c-btn c-btn-primary" href={`/console/hotelbeds/voucher/${encodeURIComponent(ref)}`}>Voucher</Link>
        </div>
      </div>
      <TestEnvBanner />
      <HbxTabs />

      {error && <div className="c-error" style={{ marginBottom: 16 }}>{error}</div>}
      {cancelled && (
        <div style={{ padding: '12px 14px', border: '1px solid #a7f3d0', background: '#ecfdf5', borderRadius: 8, marginBottom: 16, fontSize: 13.5 }}>
          Cancelled. Cancellation reference <span className="c-mono">{cancelled.number}</span>. Fee charged: <strong>{amount(cancelled.fee ?? 0, cancelled.currency)}</strong>.
        </div>
      )}
      {!booking && !error && <div className="c-loading">Loading booking…</div>}

      {booking && (
        <div style={{ display: 'grid', gap: 16 }}>
          <div className="c-card">
            <div className="c-card-head">
              <h2 className="c-card-title">{booking.hotel.name}</h2>
              <StatusPill status={booking.status} />
            </div>
            <table className="c-table">
              <tbody>
                <tr><td style={{ width: 200, fontWeight: 600 }}>Hotelbeds reference</td><td className="c-mono">{booking.reference}</td></tr>
                <tr><td style={{ fontWeight: 600 }}>Agency reference</td><td className="c-mono">{booking.clientReference}</td></tr>
                <tr><td style={{ fontWeight: 600 }}>Hotel</td><td>{booking.hotel.name} · {booking.hotel.categoryName} · {[booking.hotel.zoneName, booking.hotel.destinationName].filter(Boolean).join(', ')}</td></tr>
                <tr><td style={{ fontWeight: 600 }}>Stay</td><td>{day(booking.hotel.checkIn)} → {day(booking.hotel.checkOut)}</td></tr>
                <tr><td style={{ fontWeight: 600 }}>Holder</td><td>{[booking.holder?.name, booking.holder?.surname].filter(Boolean).join(' ')}</td></tr>
                <tr><td style={{ fontWeight: 600 }}>Booked</td><td>{day(booking.creationDate)}</td></tr>
                {booking.cancellationReference && <tr><td style={{ fontWeight: 600 }}>Cancellation reference</td><td className="c-mono">{booking.cancellationReference}</td></tr>}
              </tbody>
            </table>
          </div>

          <div className="c-card">
            <div className="c-card-head"><h2 className="c-card-title">Rooms</h2></div>
            <table className="c-table">
              <thead><tr><th>Room</th><th>Room type</th><th>Board</th><th>Passengers</th><th>Children ages</th></tr></thead>
              <tbody>
                {booking.rooms.map((r, i) => (
                  <tr key={i}>
                    <td>Room {i + 1}</td>
                    <td>{r.roomTypeName}</td>
                    <td>{r.boardName}</td>
                    <td>{r.paxes.map((p, k) => <div key={k}>{p.type === 'CH' ? 'Child' : 'Adult'}{p.name || p.surname ? `: ${[p.name, p.surname].filter(Boolean).join(' ')}` : ''}</div>)}</td>
                    <td>{r.paxes.filter((p) => p.type === 'CH').map((p) => p.age).join(', ') || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="c-card">
            <div className="c-card-head"><h2 className="c-card-title">Cancellation</h2><RefundPill refundable={booking.refundable} nonRefundable={null} /></div>
            <div style={{ padding: 16, display: 'grid', gap: 12 }}>
              <Penalties penalties={booking.cancellationPenalties} />
              {isCancelled ? (
                <div style={{ fontSize: 13.5 }}>This booking is cancelled.</div>
              ) : !sim ? (
                <div>
                  <button className="c-btn c-btn-danger" disabled={busy !== null} onClick={simulate}>
                    {busy === 'sim' ? 'Checking the cost…' : 'Cancel booking…'}
                  </button>
                  <div style={{ fontSize: 12, color: 'var(--c-fg-muted)', marginTop: 6 }}>First we ask Hotelbeds what cancelling would cost. Nothing is cancelled yet.</div>
                </div>
              ) : (
                <div style={{ border: '1px solid #fca5a5', background: '#fef2f2', borderRadius: 8, padding: '12px 14px', display: 'grid', gap: 10 }}>
                  <div style={{ fontSize: 14 }}>
                    Cancelling now costs <strong>{amount(sim.amount ?? 0, sim.currency || booking.currency)}</strong> (Hotelbeds simulation).
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="c-btn c-btn-primary" style={{ background: 'var(--c-danger)', borderColor: 'var(--c-danger)' }} disabled={busy !== null} onClick={cancel}>
                      {busy === 'cancel' ? 'Cancelling…' : 'Confirm cancellation'}
                    </button>
                    <button className="c-btn" disabled={busy !== null} onClick={() => setSim(null)}>Keep booking</button>
                  </div>
                </div>
              )}
            </div>
          </div>

          <RateComments text={booking.rateComments} />
        </div>
      )}
    </div>
  );
}
