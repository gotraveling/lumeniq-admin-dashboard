'use client';

/**
 * Every booking the watcher has found a cheaper rate for.
 *
 * The savings here are what we found when we looked; opening one re-checks with
 * the supplier before offering to do anything. Dismissed and rebooked rows stay
 * visible on purpose — after a few weeks they are the evidence for whether the
 * alerts were worth acting on.
 */

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

type Candidate = {
  id: number;
  internal_booking_id: string;
  supplier_booking_id?: string | null;
  status: string;
  old_net: string | number;
  new_net: string | number;
  saving: string | number;
  saving_pct: string | number | null;
  currency: string;
  room_type_name: string | null;
  action_token: string;
  expires_at: string | null;
  created_at: string;
  new_booking_id?: string | null;
  guest_info?: any;
  booking_details?: any;
};

const money = (n: any, ccy?: string) =>
  // Never a bare number: without the code there is no way to tell a net in
  // AUD from one in USD.
  n == null || !ccy ? '—' : `${Number(n).toFixed(2)} ${ccy}`;

export default function RebookListPage() {
  const router = useRouter();
  const [rows, setRows] = useState<Candidate[]>([]);
  const [status, setStatus] = useState('open');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [scanNote, setScanNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const r = await fetch(`/api/admin/rebook/candidates?status=${status}`, { cache: 'no-store' });
      const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j.message || j.error || 'Could not load');
      setRows(j.data.candidates || []);
    } catch (e: any) { setErr(e.message); }
  }, [status]);

  useEffect(() => { void load(); }, [load]);

  const scan = async () => {
    setBusy(true); setScanNote(null); setErr(null);
    try {
      const r = await fetch('/api/admin/rebook/scan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j.message || j.error || 'Scan failed');
      const d = j.data;
      setScanNote(
        `${d.watched} booking${d.watched === 1 ? '' : 's'} checked · ` +
        `${d.found.length} cheaper · ${d.expired} expired` +
        (d.skipped?.length ? ` · ${d.skipped.length} had nothing` : '')
      );
      await load();
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  };

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Rebook watch</h1>
          <div style={{ fontSize: 13, color: 'var(--c-fg-muted)', marginTop: 2 }}>
            Refundable bookings that are cheaper today than when we booked them.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <select className="c-input" value={status} onChange={e => setStatus(e.target.value)} style={{ fontSize: 13 }}>
            <option value="open">Open</option>
            <option value="rebooked">Rebooked</option>
            <option value="dismissed">Dismissed</option>
            <option value="expired">Expired</option>
            <option value="all">All</option>
          </select>
          <button className="c-btn" onClick={scan} disabled={busy}>{busy ? 'Checking…' : 'Check now'}</button>
        </div>
      </div>

      {scanNote && <div style={{ marginTop: 12, fontSize: 13, color: 'var(--c-fg-soft)' }}>{scanNote}</div>}
      {err && <div className="c-error" style={{ marginTop: 12 }}>{err}</div>}

      {rows.length === 0 ? (
        <div style={{ marginTop: 20, fontSize: 13, color: 'var(--c-fg-muted)' }}>
          Nothing here. That means no watched booking is meaningfully cheaper today, which is the
          normal answer most days.
        </div>
      ) : (
        <table className="c-table" style={{ marginTop: 16 }}>
          <thead>
            <tr>
              <th>Booking</th>
              <th>Guest</th>
              <th>Room offered</th>
              <th>We pay</th>
              <th>Would pay</th>
              <th>Saving</th>
              <th>Act by</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map(c => (
              <tr key={c.id}>
                <td className="c-mono" style={{ whiteSpace: 'nowrap' }}>{c.internal_booking_id}</td>
                <td>{`${c.guest_info?.firstName || ''} ${c.guest_info?.lastName || ''}`.trim() || '—'}</td>
                <td style={{ fontSize: 12 }}>{c.room_type_name || '—'}</td>
                <td className="c-mono" style={{ whiteSpace: 'nowrap' }}>{money(c.old_net, c.currency)}</td>
                <td className="c-mono" style={{ whiteSpace: 'nowrap' }}>{money(c.new_net, c.currency)}</td>
                <td className="c-mono" style={{ whiteSpace: 'nowrap', fontWeight: 700, color: 'var(--c-accent)' }}>
                  {money(c.saving, c.currency)}
                  {c.saving_pct != null && <span style={{ color: 'var(--c-fg-muted)', fontWeight: 500 }}> ({Number(c.saving_pct).toFixed(1)}%)</span>}
                </td>
                <td style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
                  {c.expires_at ? new Date(c.expires_at).toLocaleDateString('en-AU') : '—'}
                </td>
                <td style={{ fontSize: 12 }}>{c.status}{c.new_booking_id ? ` → ${c.new_booking_id}` : ''}</td>
                <td>
                  <button className="c-btn" onClick={() => router.push(`/console/rebook/${c.action_token}`)}>
                    {c.status === 'open' ? 'Review' : 'Open'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
