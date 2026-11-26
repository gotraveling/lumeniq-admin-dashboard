'use client';

/**
 * Card vs hotel page: every check the prewarm makes, with the reason a card
 * and its hotel page disagreed. One email per run said THAT they differed;
 * this shows WHY and how often, so a supplier moving its price is told apart
 * from a fault in our card (Tina and Murali, 26 Nov 2026).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import PriceMoves from './PriceMoves';

type Cause = 'match' | 'card_supplier_price_up' | 'card_supplier_price_down' | 'card_supplier_no_rooms'
  | 'other_supplier_cheaper' | 'page_no_rooms' | 'unchecked';
type Row = {
  id: number; checked_at: string; source: string; hotel_id: number; hotel_name: string | null;
  check_in: string | null; check_out: string | null; cause: Cause;
  card_aud: number | null; card_supplier: string | null; card_saved_at: string | null;
  page_aud: number | null; page_supplier: string | null; card_supplier_page_aud: number | null; diff_aud: number | null;
};
type HotelRow = { hotel_id: number; hotel_name: string | null; checks: number; mismatches: number; usual_cause: Cause | null; last_checked: string };
type Data = { days: number; byCause: { cause: Cause; n: number }[]; byHotel: HotelRow[]; recent: Row[] };

const SUPPLIER: Record<string, string> = { ratehawk: 'r.h.', hummingbird: 'h.b.', hotelbeds: 'Hotelbeds' };
const sup = (s?: string | null) => (s ? SUPPLIER[s] || s : '?');

// What each cause means, and whether it is ours to fix.
const CAUSE: Record<Cause, { label: string; note: string; ours: boolean }> = {
  match:                    { label: 'Same price', note: 'Card and page agree.', ours: false },
  card_supplier_price_up:   { label: 'Supplier raised its price', note: 'The card’s supplier charges more than when the card was saved. Fixes itself at the next refresh.', ours: false },
  card_supplier_price_down: { label: 'Supplier lowered its price', note: 'The card’s supplier charges less than when the card was saved. Fixes itself at the next refresh.', ours: false },
  card_supplier_no_rooms:   { label: 'Supplier has no rooms now', note: 'The card’s supplier has nothing for those dates any more. Fixes itself at the next refresh.', ours: false },
  other_supplier_cheaper:   { label: 'Card picked the wrong rate', note: 'The card’s supplier still matches the card, but the page has a cheaper rate from another supplier. Check this one.', ours: true },
  page_no_rooms:            { label: 'Page has no rooms', note: 'The page found nothing to sell for those dates.', ours: true },
  unchecked:                { label: 'Page not read', note: 'The page did not answer in time. Not counted.', ours: false },
};

// Same colours as the price lines below: red = dearer for the guest, green = cheaper.
const CAUSE_COLOR: Partial<Record<Cause, string>> = {
  card_supplier_price_up: 'var(--c-danger, #a51919)',
  card_supplier_price_down: 'var(--c-success, #046a4a)',
};
const diffColor = (d: number | null) => (d == null || d === 0 ? undefined : d > 0 ? 'var(--c-danger, #a51919)' : 'var(--c-success, #046a4a)');

const aud = (n: number | null | undefined) => (n == null ? '—' : `A$${Math.round(n).toLocaleString('en-AU')}`);
// Numbers right-aligned on tabular figures so digits stack down a column; headers wrap at the bottom.
const NUM = { textAlign: 'right', fontVariantNumeric: 'tabular-nums' } as const;
const TH = { verticalAlign: 'bottom', whiteSpace: 'normal' } as const;
const day = (d?: string | null) => (d ? new Date(`${d.slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', timeZone: 'UTC' }) : '—');
const when = (d: string) => new Date(d).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
const hoursBetween = (a?: string | null, b?: string | null) => {
  if (!a || !b) return null;
  const h = (new Date(b).getTime() - new Date(a).getTime()) / 3_600_000;
  return h >= 0 ? h : null;
};
const age = (h: number | null) => (h == null ? '' : h < 1 ? 'under an hour old' : h < 48 ? `${Math.round(h)} h old` : `${Math.round(h / 24)} days old`);

export default function CardChecksPage() {
  const [days, setDays] = useState(14);
  const [data, setData] = useState<Data | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const r = await fetch(`/api/admin/card-checks?days=${days}`, { cache: 'no-store' });
      const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j.message || j.error || 'Could not load');
      setData(j.data);
    } catch (e: any) { setErr(e.message); }
    finally { setLoading(false); }
  }, [days]);

  useEffect(() => { void load(); }, [load]);

  const differed = useMemo(() => new Set((data?.byHotel || []).filter(h => h.mismatches > 0).map(h => h.hotel_id)), [data]);
  const counted = (data?.byCause || []).filter(c => c.cause !== 'unchecked');
  const total = counted.reduce((n, c) => n + c.n, 0);
  const matched = counted.find(c => c.cause === 'match')?.n || 0;

  return (
    <div style={{ padding: 24, maxWidth: 1200 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Card vs page checks</h1>
        <label style={{ fontSize: 13 }}>
          Last{' '}
          <select className="c-input" style={{ width: 'auto' }} value={days} onChange={e => setDays(Number(e.target.value))}>
            {[1, 7, 14, 30, 90].map(d => <option key={d} value={d}>{d === 1 ? '24 hours' : `${d} days`}</option>)}
          </select>
        </label>
      </div>
      <div style={{ fontSize: 13, color: 'var(--c-fg-muted)', marginTop: 2, maxWidth: 820 }}>
        Collection cards show a price saved every 6 hours. The hotel page asks the suppliers live. After every
        refresh we open each card’s hotel page for the same dates and compare. When they differ, this says why.
      </div>

      {err && <div className="c-error" style={{ marginTop: 12 }}>{err}</div>}
      {loading && !data && <div style={{ marginTop: 16, fontSize: 13, color: 'var(--c-fg-muted)' }}>Loading…</div>}

      {data && (
        <>
          <section style={{ marginTop: 16, display: 'flex', gap: '12px 36px', flexWrap: 'wrap' }}>
            <Stat label="Checks" value={String(total)} />
            <Stat label="Same price" value={total ? `${Math.round((matched / total) * 100)}%` : '—'} />
            {counted.filter(c => c.cause !== 'match').map(c => (
              <Stat key={c.cause} label={CAUSE[c.cause]?.label || c.cause} value={String(c.n)} warn={CAUSE[c.cause]?.ours} color={CAUSE_COLOR[c.cause]} title={CAUSE[c.cause]?.note} />
            ))}
          </section>
          {total === 0 && (
            <div style={{ marginTop: 16, fontSize: 13, color: 'var(--c-fg-muted)' }}>
              No checks recorded in this period yet. The first ones land after the next price refresh.
            </div>
          )}

          {data.recent.length > 0 && (
            <section style={{ marginTop: 24 }}>
              <h2 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 8px' }}>When they differed</h2>
              <table className="c-table" style={{ tableLayout: 'fixed' }}>
                <colgroup>
                  <col style={{ width: 130 }} /><col /><col style={{ width: 130 }} /><col style={{ width: 140 }} />
                  <col style={{ width: 160 }} /><col style={{ width: 150 }} /><col style={{ width: 200 }} />
                </colgroup>
                <thead>
                  <tr>
                    <th style={TH}>Checked</th><th style={TH}>Hotel</th><th style={TH}>Stay</th>
                    <th style={{ ...TH, ...NUM }}>Card</th><th style={{ ...TH, ...NUM }}>Page now</th>
                    <th style={{ ...TH, ...NUM }}>Card supplier on the page now</th><th style={TH}>Why</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recent.map(r => {
                    const c = CAUSE[r.cause];
                    return (
                      <tr key={r.id}>
                        <td style={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{when(r.checked_at)}</td>
                        <td>{r.hotel_name || `Hotel #${r.hotel_id}`}</td>
                        <td style={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{day(r.check_in)} – {day(r.check_out)}</td>
                        <td style={{ ...NUM, whiteSpace: 'nowrap' }}>
                          {aud(r.card_aud)} {sup(r.card_supplier)}
                          <div style={{ fontSize: 11, color: 'var(--c-fg-muted)' }}>{age(hoursBetween(r.card_saved_at, r.checked_at))}</div>
                        </td>
                        <td style={{ ...NUM, whiteSpace: 'nowrap' }}>
                          {aud(r.page_aud)} {sup(r.page_supplier)}
                          {r.diff_aud != null && (
                            <div style={{ fontSize: 11.5, fontWeight: 600, color: diffColor(r.diff_aud) }}>{r.diff_aud > 0 ? '▲ +' : '▼ −'}{aud(Math.abs(r.diff_aud))} vs card</div>
                          )}
                        </td>
                        <td style={{ ...NUM, whiteSpace: 'nowrap' }}>{r.card_supplier_page_aud != null ? aud(r.card_supplier_page_aud) : 'no rooms'}</td>
                        <td style={{ fontSize: 12.5, color: c?.ours ? 'var(--c-danger, #b4232a)' : CAUSE_COLOR[r.cause], fontWeight: c?.ours || CAUSE_COLOR[r.cause] ? 700 : undefined }} title={c?.note}>
                          {c?.label || r.cause}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </section>
          )}

          <PriceMoves days={days} differed={differed} />

          {data.byHotel.length > 0 && (
            <section style={{ marginTop: 24 }}>
              <h2 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 8px' }}>By hotel</h2>
              <table className="c-table" style={{ tableLayout: 'fixed' }}>
                <colgroup><col /><col style={{ width: 120 }} /><col style={{ width: 120 }} /><col style={{ width: 240 }} /><col style={{ width: 150 }} /></colgroup>
                <thead><tr><th style={TH}>Hotel</th><th style={{ ...TH, ...NUM }}>Checks</th><th style={{ ...TH, ...NUM }}>Differed</th><th style={TH}>Usual reason</th><th style={TH}>Last checked</th></tr></thead>
                <tbody>
                  {data.byHotel.map(h => (
                    <tr key={h.hotel_id}>
                      <td>{h.hotel_name || `Hotel #${h.hotel_id}`}</td>
                      <td style={NUM}>{h.checks}</td>
                      <td style={{ ...NUM, fontWeight: h.mismatches ? 700 : undefined }}>{h.mismatches}</td>
                      <td style={{ color: h.usual_cause ? CAUSE_COLOR[h.usual_cause] : undefined }}>{h.usual_cause ? CAUSE[h.usual_cause]?.label || h.usual_cause : '—'}</td>
                      <td style={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{when(h.last_checked)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          <section style={{ marginTop: 24, fontSize: 12.5, color: 'var(--c-fg-muted)', maxWidth: 820 }}>
            {(Object.keys(CAUSE) as Cause[]).filter(k => k !== 'match').map(k => (
              <div key={k} style={{ marginTop: 4 }}><b style={{ color: 'var(--c-fg)' }}>{CAUSE[k].label}:</b> {CAUSE[k].note}</div>
            ))}
          </section>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, warn, color, title }: { label: string; value: string; warn?: boolean; color?: string; title?: string }) {
  return (
    <div title={title}>
      <div style={{ fontSize: 11.5, color: 'var(--c-fg-muted)' }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, lineHeight: 1.3, fontVariantNumeric: 'tabular-nums', color: warn ? 'var(--c-danger, #b4232a)' : color }}>{value}</div>
    </div>
  );
}
