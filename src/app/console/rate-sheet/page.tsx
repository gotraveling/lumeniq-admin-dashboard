'use client';

/**
 * Rate sheet — what we can sell, right now, and on a schedule.
 *
 * Two jobs on one screen:
 *   1. Ask once. Pick a collection or any hotels, press Run, get live rates —
 *      net and sell, every option the supplier gives, cheapest week first.
 *   2. Ask every week. Save the same thing as a schedule and it arrives by
 *      email, by default only when a price has dropped, because a sheet that
 *      says "nothing changed" stops being read by the third week.
 *
 * Both run on the server. The point of the screen is that nobody has to ask an
 * engineer to set one up.
 */
import { useCallback, useEffect, useState } from 'react';
import { Activity, Mail, Plus, Save, Trash2, X, Clock } from 'lucide-react';

const HOTEL_API = process.env.NEXT_PUBLIC_HOTEL_API_URL
  || 'https://hotel-api-91901273027.australia-southeast1.run.app';

interface Rate {
  from_total: number; currency?: string; supplier?: string; board?: string | null;
  transfer_type?: string | null; check_in: string; check_out: string;
  free_cancellation?: boolean | null; from_total_was?: number | null;
}
interface Row {
  id: number; name: string; markup: number | null; blocked: string[];
  byNights: Record<string, { best: Rate | null; cheapestAny: Rate | null }>;
  advertised?: { amount?: number | null; text?: string | null; nights?: number | null } | null;
  drift?: { live: number; diff: number; pct: number } | null;
}
interface Sheet {
  slug: string; title: string; nights: number[]; generatedAt: string; warmed?: boolean;
  drops?: Array<{ hotel: string; nights: number; was: number; now: number; pct: number }>;
  sheet: Row[];
}
interface Schedule {
  id: number; label: string; slug: string | null; hotel_ids: number[]; nights: number[];
  recipients: string; frequency: string; day_of_week: number; day_of_month: number;
  hour: number; only_on_drop: boolean; active: boolean;
  last_run_at: string | null; last_result: string | null; next_run_at: string | null;
}
interface HotelHit { hotelId: number; name: string; city?: string; country?: string }

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const money = (n?: number | null) =>
  n == null || !isFinite(Number(n)) ? '—' : `US$${Math.round(Number(n)).toLocaleString('en-AU')}`;
const day = (d?: string) => {
  if (!d) return '';
  const t = new Date(`${String(d).slice(0, 10)}T00:00:00Z`);
  return isNaN(t.getTime()) ? '' : t.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', timeZone: 'UTC' });
};
const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('en-AU', { timeZone: 'Australia/Sydney', dateStyle: 'medium', timeStyle: 'short' }) : '—';

export default function RateSheetPage() {
  const [collections, setCollections] = useState<Array<{ slug: string; title: string }>>([]);
  const [slug, setSlug] = useState('');
  const [hotels, setHotels] = useState<HotelHit[]>([]);
  const [nights, setNights] = useState('4,5,7');
  // Empty = the next 60 days, which answers "how is this collection doing".
  // A season ("what can we sell Megève this winter") has to name its dates, or
  // the sheet prices the wrong months and reports a closed hotel as having
  // nothing.
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [mailTo, setMailTo] = useState('');

  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [draft, setDraft] = useState<Partial<Schedule> | null>(null);

  useEffect(() => {
    fetch('/api/admin/collections?status=all', { cache: 'no-store' })
      .then(r => r.json())
      .then(d => setCollections((d.collections || []).map((c: { slug: string; title: string }) => ({ slug: c.slug, title: c.title }))))
      .catch(() => {});
  }, []);

  const loadSchedules = useCallback(async () => {
    try {
      const r = await fetch('/api/admin/rate-sheet/schedules', { cache: 'no-store' });
      const d = await r.json();
      setSchedules(d.schedules || []);
    } catch { /* the list is a convenience; the run above still works */ }
  }, []);
  useEffect(() => { loadSchedules(); }, [loadSchedules]);

  const run = async () => {
    setBusy(true); setError(''); setNotice(''); setSheet(null);
    try {
      const qs = new URLSearchParams({ nights, warm: '1' });
      if (from) qs.set('from', from);
      if (to) qs.set('to', to);
      if (hotels.length) qs.set('hotelIds', hotels.map(h => h.hotelId).join(','));
      else if (slug) qs.set('slug', slug);
      else throw new Error('Pick a collection or add at least one hotel');
      const r = await fetch(`/api/admin/rate-sheet?${qs}`, { cache: 'no-store' });
      const d = await r.json();
      if (!r.ok) throw new Error(d?.message || d?.error || `HTTP ${r.status}`);
      setSheet(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not build it');
    } finally { setBusy(false); }
  };

  const mail = async () => {
    setBusy(true); setError('');
    try {
      const body: Record<string, unknown> = { nights: nights.split(',').map(Number).filter(Boolean) };
      if (from) body.from = from;
      if (to) body.to = to;
      if (hotels.length) body.hotelIds = hotels.map(h => h.hotelId);
      else body.slug = slug;
      if (mailTo.trim()) body.to = mailTo.trim();
      const r = await fetch('/api/admin/rate-sheet', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d?.message || d?.error || `HTTP ${r.status}`);
      const sent = d?.results?.[0]?.sent;
      setNotice(Array.isArray(sent) && sent.length ? `Emailed to ${sent.join(', ')}` : 'Sent');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send it');
    } finally { setBusy(false); }
  };

  const saveSchedule = async () => {
    if (!draft) return;
    setBusy(true); setError('');
    try {
      const r = await fetch('/api/admin/rate-sheet/schedules', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...draft,
          hotelIds: draft.hotel_ids || [],
          nights: (typeof draft.nights === 'string' ? String(draft.nights).split(',') : draft.nights || [])
            .map(Number).filter(Boolean),
          dayOfWeek: draft.day_of_week, dayOfMonth: draft.day_of_month,
          onlyOnDrop: draft.only_on_drop,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d?.message || d?.error || `HTTP ${r.status}`);
      setDraft(null); setNotice('Schedule saved'); await loadSchedules();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save it');
    } finally { setBusy(false); }
  };

  const removeSchedule = async (id: number) => {
    if (!confirm('Delete this schedule?')) return;
    await fetch(`/api/admin/rate-sheet/schedules/${id}`, { method: 'DELETE' });
    await loadSchedules();
  };

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <div>
        <h1 style={{ margin: 0, fontSize: 20 }}>Rate sheet</h1>
        <div style={{ color: 'var(--c-fg-muted)', fontSize: 13, marginTop: 4 }}>
          What we can sell today, per property and stay length, with net and what the card advertises.
          Rates are fetched live, so a run takes a minute or two. Leave the dates empty for the next
          60 days, or set them for a season — a winter question priced against autumn reports a hotel
          as having nothing when it is simply not open yet.
        </div>
      </div>

      {error && <div className="c-error">{error}</div>}
      {notice && <div className="c-card" style={{ padding: 10, color: 'var(--c-success)', borderColor: 'var(--c-success)' }}>{notice}</div>}

      {/* ---------- ask once ---------- */}
      <div className="c-card" style={{ padding: 14, display: 'grid', gap: 10 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <label style={{ display: 'grid', gap: 4 }}>
            <span className="c-label">Collection</span>
            <select className="c-select" value={slug} onChange={e => { setSlug(e.target.value); setHotels([]); }} style={{ minWidth: 260 }}>
              <option value="">— or pick hotels below —</option>
              {collections.map(c => <option key={c.slug} value={c.slug}>{c.title}</option>)}
            </select>
          </label>
          <label style={{ display: 'grid', gap: 4 }}>
            <span className="c-label">Stay lengths</span>
            <input className="c-input" value={nights} onChange={e => setNights(e.target.value)} style={{ width: 120 }} />
          </label>
          <label style={{ display: 'grid', gap: 4 }}>
            <span className="c-label">Arriving from</span>
            <input className="c-input" type="date" value={from} onChange={e => setFrom(e.target.value)} style={{ width: 150 }} />
          </label>
          <label style={{ display: 'grid', gap: 4 }}>
            <span className="c-label">to</span>
            <input className="c-input" type="date" value={to} onChange={e => setTo(e.target.value)} style={{ width: 150 }} />
          </label>
          <button className="c-btn c-btn-primary" onClick={run} disabled={busy}>
            <Activity size={14} /> {busy ? 'Fetching live rates…' : 'Run now'}
          </button>
          <label style={{ display: 'grid', gap: 4 }}>
            <span className="c-label">Email it to</span>
            <input className="c-input" value={mailTo} onChange={e => setMailTo(e.target.value)}
              placeholder="tina@firstclass.com.au" style={{ width: 240 }} />
          </label>
          <button className="c-btn" onClick={mail} disabled={busy || (!slug && !hotels.length)}>
            <Mail size={14} /> Email this
          </button>
        </div>

        <HotelPicker hotels={hotels} onChange={(h) => { setHotels(h); if (h.length) setSlug(''); }} />
      </div>

      {sheet && <SheetTable data={sheet} />}

      {/* ---------- ask every week ---------- */}
      <div className="c-card" style={{ padding: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div>
            <strong><Clock size={14} /> Schedules</strong>
            <div style={{ color: 'var(--c-fg-muted)', fontSize: 12, marginTop: 2 }}>
              Sent automatically. By default only when a price has dropped since the last run.
            </div>
          </div>
          <button className="c-btn" onClick={() => setDraft({
            label: '', slug: slug || null, hotel_ids: hotels.map(h => h.hotelId),
            nights: nights.split(',').map(Number).filter(Boolean),
            recipients: mailTo || '', frequency: 'weekly', day_of_week: 1, day_of_month: 1,
            hour: 8, only_on_drop: true, active: true,
          } as Partial<Schedule>)}>
            <Plus size={13} /> New schedule
          </button>
        </div>

        {draft && (
          <div style={{ display: 'grid', gap: 8, padding: 12, border: '1px solid var(--c-line)', borderRadius: 6, marginBottom: 12 }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <input className="c-input" placeholder="Name, e.g. Maldives weekly" value={draft.label || ''}
                onChange={e => setDraft({ ...draft, label: e.target.value })} style={{ flex: 1, minWidth: 200 }} />
              <select className="c-select" value={draft.slug || ''} onChange={e => setDraft({ ...draft, slug: e.target.value || null })}>
                <option value="">Hotels below</option>
                {collections.map(c => <option key={c.slug} value={c.slug}>{c.title}</option>)}
              </select>
              <input className="c-input" placeholder="Stay lengths" value={(draft.nights || []).join(',')}
                onChange={e => setDraft({ ...draft, nights: e.target.value.split(',').map(Number).filter(Boolean) })}
                style={{ width: 110 }} />
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <input className="c-input" placeholder="Recipients, semicolon separated" value={draft.recipients || ''}
                onChange={e => setDraft({ ...draft, recipients: e.target.value })} style={{ flex: 1, minWidth: 240 }} />
              <select className="c-select" value={draft.frequency} onChange={e => setDraft({ ...draft, frequency: e.target.value })}>
                <option value="daily">Every day</option>
                <option value="weekly">Every week</option>
                <option value="monthly">Every month</option>
              </select>
              {draft.frequency === 'weekly' && (
                <select className="c-select" value={draft.day_of_week} onChange={e => setDraft({ ...draft, day_of_week: Number(e.target.value) })}>
                  {DAYS.map((d, i) => <option key={d} value={i + 1}>{d}</option>)}
                </select>
              )}
              {draft.frequency === 'monthly' && (
                <input className="c-input" type="number" min={1} max={28} value={draft.day_of_month}
                  onChange={e => setDraft({ ...draft, day_of_month: Number(e.target.value) })} style={{ width: 80 }} />
              )}
              <select className="c-select" value={draft.hour} onChange={e => setDraft({ ...draft, hour: Number(e.target.value) })}>
                {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, '0')}:00 Sydney</option>)}
              </select>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                <input type="checkbox" checked={!!draft.only_on_drop}
                  onChange={e => setDraft({ ...draft, only_on_drop: e.target.checked })} />
                Only when a price drops
              </label>
              <button className="c-btn c-btn-primary" onClick={saveSchedule} disabled={busy}><Save size={13} /> Save</button>
              <button className="c-btn" onClick={() => setDraft(null)}><X size={13} /></button>
            </div>
          </div>
        )}

        {!schedules.length && !draft && (
          <div style={{ color: 'var(--c-fg-muted)', fontSize: 13 }}>Nothing scheduled yet.</div>
        )}
        {!!schedules.length && (
          <table className="c-table" style={{ width: '100%' }}>
            <thead>
              <tr><th align="left">Name</th><th align="left">What</th><th align="left">When</th>
                <th align="left">To</th><th align="left">Last run</th><th /></tr>
            </thead>
            <tbody>
              {schedules.map(s => (
                <tr key={s.id} style={{ opacity: s.active ? 1 : 0.5 }}>
                  <td>{s.label}</td>
                  <td style={{ fontSize: 12 }}>
                    {s.slug || `${(s.hotel_ids || []).length} hotels`} · {(s.nights || []).join('/')} nights
                    {s.only_on_drop ? ' · on a drop' : ' · always'}
                  </td>
                  <td style={{ fontSize: 12 }}>
                    {s.frequency === 'weekly' ? `${DAYS[(s.day_of_week || 1) - 1]} ${String(s.hour).padStart(2, '0')}:00`
                      : s.frequency === 'monthly' ? `Day ${s.day_of_month} ${String(s.hour).padStart(2, '0')}:00`
                      : `Daily ${String(s.hour).padStart(2, '0')}:00`}
                    <div style={{ color: 'var(--c-fg-muted)' }}>next {when(s.next_run_at)}</div>
                  </td>
                  <td style={{ fontSize: 12 }}>{s.recipients}</td>
                  <td style={{ fontSize: 12 }}>
                    {when(s.last_run_at)}
                    {s.last_result && <div style={{ color: 'var(--c-fg-muted)' }}>{s.last_result}</div>}
                  </td>
                  <td align="right">
                    <button className="c-btn" onClick={() => setDraft({ ...s })}>Edit</button>{' '}
                    <button className="c-btn c-btn-danger" onClick={() => removeSchedule(s.id)}><Trash2 size={13} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

/** Type a name, pick the hotel. Same search the collections editor uses. */
function HotelPicker({ hotels, onChange }: { hotels: HotelHit[]; onChange: (h: HotelHit[]) => void }) {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<HotelHit[]>([]);
  const [searching, setSearching] = useState(false);

  const search = async () => {
    if (q.trim().length < 2) return;
    setSearching(true);
    try {
      const r = await fetch('/api/search/multi', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ q: q.trim(), limit: 10 }),
      });
      const d = await r.json();
      setHits((d.hotels || d.results || []).map((h: { hotel_id?: number; hotelId?: number; id?: number; name: string; city?: string; country?: string }) => ({
        hotelId: Number(h.hotel_id ?? h.hotelId ?? h.id), name: h.name, city: h.city, country: h.country,
      })).filter((h: HotelHit) => Number.isFinite(h.hotelId)));
    } finally { setSearching(false); }
  };

  return (
    <div style={{ display: 'grid', gap: 6 }}>
      <div style={{ display: 'flex', gap: 8 }}>
        <input className="c-input" placeholder="Add a hotel by name" value={q}
          onChange={e => setQ(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') search(); }}
          style={{ maxWidth: 320 }} />
        <button className="c-btn" onClick={search} disabled={searching}>{searching ? 'Searching…' : 'Search'}</button>
      </div>
      {!!hits.length && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {hits.map(h => (
            <button key={h.hotelId} className="c-btn" onClick={() => { onChange([...hotels, h]); setHits([]); setQ(''); }}>
              + {h.name}{h.city ? ` · ${h.city}` : ''}
            </button>
          ))}
        </div>
      )}
      {!!hotels.length && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {hotels.map(h => (
            <span key={h.hotelId} className="c-pill" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              {h.name}
              <button className="c-btn" style={{ padding: '0 4px' }}
                onClick={() => onChange(hotels.filter(x => x.hotelId !== h.hotelId))}><X size={11} /></button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/** The sheet itself: one row per property, one column per stay length. */
function SheetTable({ data }: { data: Sheet }) {
  return (
    <div className="c-card" style={{ padding: 0, overflowX: 'auto' }}>
      <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--c-line)' }}>
        <strong>{data.title}</strong>
        <span style={{ color: 'var(--c-fg-muted)', fontSize: 12, marginLeft: 8 }}>
          {data.warmed ? 'rates fetched now' : 'from cache'} · {when(data.generatedAt)}
        </span>
        {!!data.drops?.length && (
          <div style={{ color: 'var(--c-success)', fontSize: 13, marginTop: 4 }}>
            Dropped since last run: {data.drops.map(d => `${d.hotel} ${d.nights}n ${money(d.was)} → ${money(d.now)}`).join(' · ')}
          </div>
        )}
      </div>
      <table className="c-table" style={{ width: '100%' }}>
        <thead>
          <tr>
            <th align="left">Property</th>
            {data.nights.map(n => <th key={n} align="left">{n} nights</th>)}
            <th align="left">On the page now</th>
          </tr>
        </thead>
        <tbody>
          {data.sheet.map(h => (
            <tr key={h.id}>
              <td>
                <strong>{h.name}</strong>
                <div style={{ fontSize: 11.5, color: 'var(--c-fg-muted)' }}>
                  markup {h.markup == null ? '—' : `${h.markup}%`}
                  {h.blocked?.length ? ` · ${h.blocked.join(', ')} blocked` : ''}
                </div>
              </td>
              {data.nights.map(n => {
                const b = h.byNights?.[String(n)];
                const r = b?.best || b?.cheapestAny;
                if (!r) return <td key={n} style={{ color: 'var(--c-fg-muted)' }}>no rate</td>;
                const noTransfer = b?.best && b?.cheapestAny
                  && Number(b.cheapestAny.from_total) < Number(b.best.from_total) ? b.cheapestAny : null;
                return (
                  <td key={n}>
                    <span className="c-mono"><strong>{money(r.from_total)}</strong></span>
                    <div style={{ fontSize: 11.5, color: 'var(--c-fg-muted)' }}>
                      {day(r.check_in)}–{day(r.check_out)} · {r.supplier}
                      {r.transfer_type ? ` · ${r.transfer_type}` : ' · no transfer'}
                      {r.board ? ` · ${r.board}` : ''}
                      {r.free_cancellation === true ? ' · refundable' : r.free_cancellation === false ? ' · non-refundable' : ''}
                    </div>
                    {noTransfer && (
                      <div style={{ fontSize: 11.5, color: 'var(--c-fg-muted)' }}>
                        without transfer {money(noTransfer.from_total)}
                      </div>
                    )}
                  </td>
                );
              })}
              <td style={{ fontSize: 12 }}>
                {!h.advertised?.amount && !h.advertised?.text ? (
                  <span style={{ color: 'var(--c-fg-muted)' }}>no manual price</span>
                ) : (
                  <>
                    <span className="c-mono">{h.advertised.text || money(h.advertised.amount)}</span>
                    <div style={{ color: h.drift && h.drift.diff > 0 ? 'var(--c-danger)' : 'var(--c-fg-muted)' }}>
                      {!h.drift ? 'no live price for that length'
                        : Math.abs(h.drift.pct) < 3 ? 'still right'
                        : h.drift.diff > 0 ? `cheapest is ${money(h.drift.live)}`
                        : `above our cheapest (${money(h.drift.live)})`}
                    </div>
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
