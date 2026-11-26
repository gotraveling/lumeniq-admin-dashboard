'use client';

/**
 * How each hotel's price moved, day by day, like a share price: a small line
 * per hotel, the change in colour, and how often it moves (Murali, 26 Nov
 * 2026: "it is hard to comprehend how rates change"). The numbers come from
 * the booking engine's daily price history (GET /api/admin/card-checks/trends),
 * which compares the same stays day to day so a stay dropping off the list is
 * never read as a price move.
 *
 * Colours are from the guest's side: red = dearer, green = cheaper.
 */

import { Fragment, useEffect, useMemo, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

type Point = {
  day: string | null; aud: number | null; idx: number; pct?: number | null;
  stays?: number; staysMoved?: number; staysSwitched?: number; switchedFrom?: string | null; switchedTo?: string | null;
};
type Hotel = {
  hotelId: number; name: string | null; city: string | null; stars: number | null; supplier: string | null;
  nightlyAud: number | null; changePct: number | null; change7Pct: number | null;
  daysTracked: number; moveDays: number; typicalMovePct: number | null;
  biggestDayPct: number | null; biggestDropPct: number | null; series: Point[]; lastChange: Point | null;
};
type Data = { days: number; movePct: number; up: number; down: number; steady: number; hotels: Hotel[] };
type Sort = 'change' | 'often' | 'week' | 'name';

const UP = 'var(--c-danger, #a51919)';
const DOWN = 'var(--c-success, #046a4a)';
const FLAT = 'var(--c-fg-muted, #5a5a5a)';

const tone = (pct: number | null | undefined, flat = 1) => (pct == null || Math.abs(pct) <= flat ? FLAT : pct > 0 ? UP : DOWN);
const pctText = (pct: number | null | undefined) =>
  pct == null ? '—' : Math.abs(pct) < 0.05 ? '0%' : `${pct > 0 ? '▲ +' : '▼ −'}${Math.abs(pct).toFixed(1)}%`;
const aud = (n: number | null | undefined) => (n == null ? '—' : `A$${Math.round(n).toLocaleString('en-AU')}`);
const day = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
const SUP: Record<string, string> = { ratehawk: 'r.h.', hummingbird: 'h.b.', hotelbeds: 'Hotelbeds' };
const sup = (s?: string | null) => (s ? SUP[s] || s : '?');

/** What we can see about one day's change. Suppliers never say why. */
function whatMoved(p: Point) {
  const of = p.stays || 0;
  const moved = p.staysMoved || 0;
  const share = of ? moved / of : 0;
  const reach = share >= 0.6 ? 'most dates' : share >= 0.25 ? 'some dates' : 'a few dates';
  const parts = [`${reach} (${moved} of ${of} stays)`];
  if (of && (p.staysSwitched || 0) / of >= 0.3) parts.push(`cheapest supplier switched ${sup(p.switchedFrom)} → ${sup(p.switchedTo)}`);
  return parts.join(', ');
}
const starText = (s: number | null) => (s == null ? '' : s > 5 ? '5+★' : `${s}★`);

function Spark({ series, color }: { series: Point[]; color: string }) {
  const w = 150, h = 34, pad = 3;
  const v = series.map(p => p.idx);
  if (v.length < 2) return <span style={{ color: FLAT, fontSize: 12 }}>not enough days</span>;
  const min = Math.min(...v), max = Math.max(...v);
  const span = max - min || 1;
  const pts = v.map((y, i) => `${(pad + (i / (v.length - 1)) * (w - 2 * pad)).toFixed(1)},${(h - pad - ((y - min) / span) * (h - 2 * pad)).toFixed(1)}`);
  const [lx, ly] = pts[pts.length - 1].split(',');
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden style={{ display: 'block' }}>
      <polyline points={pts.join(' ')} fill="none" stroke={color} strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={lx} cy={ly} r={2.4} fill={color} />
    </svg>
  );
}

function OftenBar({ moved, of }: { moved: number; of: number }) {
  const share = of ? moved / of : 0;
  return (
    <div title={`Price moved on ${moved} of ${of} days`}>
      <div style={{ fontSize: 11.5, color: FLAT }}>moved on {moved} of {of} days</div>
      <div style={{ width: 90, height: 5, borderRadius: 3, background: 'var(--c-border, #e5e5e5)', marginTop: 3 }}>
        <div style={{ width: `${Math.round(share * 100)}%`, height: '100%', borderRadius: 3, background: share > 0.5 ? '#c27c0e' : FLAT }} />
      </div>
    </div>
  );
}

function ChartTip({ active, payload }: any) {
  const p: Point | undefined = active && payload && payload[0] && payload[0].payload.p;
  if (!p || !p.day) return null;
  return (
    <div style={{ background: '#fff', border: '1px solid var(--c-border, #ddd)', borderRadius: 6, padding: '6px 10px', fontSize: 12.5 }}>
      <div style={{ fontWeight: 700 }}>{day(p.day)}</div>
      <div>{aud(p.aud)} a night for the same stays</div>
      {p.pct != null && <div style={{ color: tone(p.pct), fontWeight: 600 }}>{pctText(p.pct)} on the day before</div>}
      {p.stays ? <div style={{ color: FLAT }}>{whatMoved(p)}</div> : null}
    </div>
  );
}

function BigChart({ h }: { h: Hotel }) {
  const pts = h.series.filter(p => p.day && p.aud != null);
  const rows = pts.map(p => ({ day: day(p.day as string), aud: p.aud, p }));
  const color = tone(h.changePct);
  const changes = pts.filter(p => Math.abs(p.pct || 0) > 1).reverse();
  return (
    <div style={{ padding: '8px 4px 4px' }}>
      <div style={{ height: 240 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top: 8, right: 16, bottom: 0, left: 8 }}>
            <CartesianGrid stroke="var(--c-border, #eee)" vertical={false} />
            <XAxis dataKey="day" tick={{ fontSize: 11 }} interval="preserveStartEnd" minTickGap={16} />
            <YAxis tick={{ fontSize: 11 }} width={70} domain={['auto', 'auto']} tickFormatter={(n: number) => aud(n)} />
            <Tooltip content={<ChartTip />} />
            <Line type="linear" dataKey="aud" stroke={color} strokeWidth={2} dot={{ r: 2.5, fill: color }} activeDot={{ r: 5 }} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div style={{ fontSize: 12, color: 'var(--c-fg-muted)', marginTop: 4 }}>
        One price a day: the refresh runs every 6 hours and the day keeps its last one. Each point is the same stays compared with the day before.
        Prices in A$ at today&apos;s exchange rate, so the line is the supplier&apos;s price, never the exchange rate. Hover a point for that day.
      </div>
      {changes.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700 }}>Changes, newest first</div>
          <table style={{ fontSize: 12.5, marginTop: 4, borderCollapse: 'collapse' }}>
            <tbody>
              {changes.map(p => (
                <tr key={p.day as string}>
                  <td style={{ padding: '2px 14px 2px 0', whiteSpace: 'nowrap' }}>{day(p.day as string)}</td>
                  <td style={{ padding: '2px 14px 2px 0', whiteSpace: 'nowrap', color: tone(p.pct), fontWeight: 600 }}>{pctText(p.pct)}</td>
                  <td style={{ padding: '2px 14px 2px 0', whiteSpace: 'nowrap' }}>{aud(p.aud)} a night</td>
                  <td style={{ padding: '2px 0', color: 'var(--c-fg-muted)' }}>{whatMoved(p)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ fontSize: 11.5, color: 'var(--c-fg-muted)', marginTop: 4 }}>
            Suppliers don&apos;t say why a price moves. Most dates moving together usually means the hotel changed its prices.
            A few dates moving usually means those dates are filling up or an offer started or ended.
          </div>
        </div>
      )}
    </div>
  );
}

export default function PriceMoves({ days, differed }: { days: number; differed: Set<number> }) {
  const span = Math.max(days, 7);
  const [data, setData] = useState<Data | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [sort, setSort] = useState<Sort>('change');
  const [q, setQ] = useState('');
  const [all, setAll] = useState(false);
  const [open, setOpen] = useState<number | null>(null);

  useEffect(() => {
    let live = true;
    setData(null); setErr(null);
    fetch(`/api/admin/card-checks/trends?days=${span}`, { cache: 'no-store' })
      .then(r => r.json().then(j => ({ ok: r.ok, j })))
      .then(({ ok, j }) => {
        if (!live) return;
        if (!ok || !j.success) throw new Error(j.message || j.error || 'Could not load');
        setData(j.data);
      })
      .catch(e => live && setErr(e.message));
    return () => { live = false; };
  }, [span]);

  const rows = useMemo(() => {
    if (!data) return [];
    const needle = q.trim().toLowerCase();
    const list = data.hotels.filter(h => !needle || `${h.name || ''} ${h.city || ''}`.toLowerCase().includes(needle));
    const by: Record<Sort, (a: Hotel, b: Hotel) => number> = {
      change: (a, b) => Math.abs(b.changePct || 0) - Math.abs(a.changePct || 0),
      week: (a, b) => Math.abs(b.change7Pct || 0) - Math.abs(a.change7Pct || 0),
      often: (a, b) => b.moveDays / (b.daysTracked || 1) - a.moveDays / (a.daysTracked || 1) || (b.typicalMovePct || 0) - (a.typicalMovePct || 0),
      name: (a, b) => (a.name || '').localeCompare(b.name || ''),
    };
    return [...list].sort(by[sort]);
  }, [data, q, sort]);
  const shown = all || q ? rows : rows.slice(0, 25);

  return (
    <section style={{ marginTop: 28 }}>
      <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>How prices moved, last {span} days</h2>
      <div style={{ fontSize: 13, color: 'var(--c-fg-muted)', marginTop: 2, maxWidth: 820 }}>
        Each line follows the same stays day by day, so a stay dropping off the list never counts as a move.
        <b style={{ color: UP }}> Red</b> = dearer for the guest, <b style={{ color: DOWN }}>green</b> = cheaper.
        Hotels that move often are the ones whose cards go out of date between refreshes. Click a hotel for its chart and the date of each change.
      </div>

      {err && <div className="c-error" style={{ marginTop: 10 }}>{err}</div>}
      {!data && !err && <div style={{ marginTop: 12, fontSize: 13, color: 'var(--c-fg-muted)' }}>Working out the price lines… (takes about 15 seconds)</div>}

      {data && (
        <>
          <div style={{ marginTop: 12, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <Tile label="Got dearer" value={data.up} color={UP} />
            <Tile label="Got cheaper" value={data.down} color={DOWN} />
            <Tile label={`Steady (within ${data.movePct}%)`} value={data.steady} color={FLAT} />
          </div>

          <div style={{ marginTop: 14, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <input className="c-input" placeholder="Find a hotel or city" value={q} onChange={e => setQ(e.target.value)} style={{ width: 220 }} />
            <label style={{ fontSize: 13 }}>
              Sort by{' '}
              <select className="c-input" value={sort} onChange={e => setSort(e.target.value as Sort)}>
                <option value="change">Biggest change over {span} days</option>
                <option value="week">Biggest change this week</option>
                <option value="often">Moves most often</option>
                <option value="name">Name</option>
              </select>
            </label>
          </div>

          <table className="c-table" style={{ marginTop: 10 }}>
            <thead>
              <tr><th>Hotel</th><th>Price line</th><th>{span} days</th><th>Last 7 days</th><th>Last change</th><th>Now, a night</th></tr>
            </thead>
            <tbody>
              {shown.map(h => {
                const color = tone(h.changePct);
                const isOpen = open === h.hotelId;
                return (
                  <Fragment key={h.hotelId}>
                    <tr onClick={() => setOpen(isOpen ? null : h.hotelId)} style={{ cursor: 'pointer' }}>
                      <td>
                        <div style={{ fontWeight: 600 }}>{h.name || `Hotel #${h.hotelId}`}</div>
                        <div style={{ fontSize: 11.5, color: 'var(--c-fg-muted)' }}>
                          {[h.city, starText(h.stars)].filter(Boolean).join(' · ')}
                          {differed.has(h.hotelId) && <span style={{ marginLeft: 6, color: UP, fontWeight: 600 }}>card differed</span>}
                        </div>
                      </td>
                      <td><Spark series={h.series} color={color} /></td>
                      <td style={{ color, fontWeight: 700, whiteSpace: 'nowrap' }}>{pctText(h.changePct)}</td>
                      <td style={{ color: tone(h.change7Pct), whiteSpace: 'nowrap' }}>{pctText(h.change7Pct)}</td>
                      <td>
                        {h.lastChange?.day ? (
                          <div style={{ fontSize: 12.5, whiteSpace: 'nowrap' }}>
                            {day(h.lastChange.day)} <span style={{ color: tone(h.lastChange.pct), fontWeight: 600 }}>{pctText(h.lastChange.pct)}</span>
                          </div>
                        ) : <div style={{ fontSize: 12.5, color: FLAT }}>no change</div>}
                        <OftenBar moved={h.moveDays} of={h.daysTracked} />
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>{aud(h.nightlyAud)}</td>
                    </tr>
                    {isOpen && (
                      <tr><td colSpan={6} style={{ background: 'var(--c-bg-hover, #fafafa)' }}><BigChart h={h} /></td></tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
          {!all && !q && rows.length > 25 && (
            <button className="c-btn" style={{ marginTop: 10 }} onClick={() => setAll(true)}>Show all {rows.length} hotels</button>
          )}
        </>
      )}
    </section>
  );
}

function Tile({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ border: '1px solid var(--c-border)', borderRadius: 8, padding: '8px 12px', minWidth: 120 }}>
      <div style={{ fontSize: 11.5, color: 'var(--c-fg-muted)' }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color }}>{value}</div>
    </div>
  );
}
