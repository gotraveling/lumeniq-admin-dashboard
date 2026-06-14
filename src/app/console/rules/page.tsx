'use client';

import { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, Pencil, AlertTriangle, ArrowRight, Layers } from 'lucide-react';
import { HotelAutocomplete } from '@/components/ui/HotelAutocomplete';
import { ConsoleRule, RuleConditions, Tier, tierOf, matchesHotel, TIER_PRIORITY } from '@/lib/pricingRulesMap';

// Same-origin proxy -> authoritative booking-engine pricing_rules (the table
// pricingService.js actually applies). Server route injects the API key.
const API = '/api/pricing/rules';

const TIERS: { key: Tier; label: string; blurb: string }[] = [
  { key: 'global', label: 'Global', blurb: 'Every hotel — the base rate' },
  { key: 'segment', label: 'Segment', blurb: 'By star rating / supplier' },
  { key: 'destination', label: 'Destination', blurb: 'By country / city' },
  { key: 'hotel', label: 'Hotel', blurb: 'One specific property' },
];

const markupLabel = (r: ConsoleRule) =>
  r.markup_type === 'percentage' ? `+${r.markup_value}%` : `+$${r.markup_value}`;

function conditionSummary(c: RuleConditions): string {
  const parts: string[] = [];
  if (c.hotel_name || c.hotel_id) parts.push(`Hotel: ${c.hotel_name || c.hotel_id}`);
  if (c.country) parts.push(`Country ${c.country}`);
  if (c.city) parts.push(`City ${c.city}`);
  if (c.star_rating) parts.push(`${c.star_rating}★+`);
  if (c.supplier) parts.push(c.supplier);
  return parts.join(' · ') || 'All hotels';
}

export default function ConsoleRulesPage() {
  const [rules, setRules] = useState<ConsoleRule[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<ConsoleRule | 'new' | null>(null);

  const refresh = async () => {
    try {
      setBusy(true); setError(null);
      const r = await fetch(API, { cache: 'no-store' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      setRules(Array.isArray(data) ? data : data?.rules || []);
    } catch (e: any) {
      setError(e?.message || 'Failed to load rules');
    } finally { setBusy(false); }
  };
  useEffect(() => { refresh(); }, []);

  const save = async (rule: Partial<ConsoleRule> & { id?: number }) => {
    const r = await fetch(rule.id ? `${API}/${rule.id}` : API, {
      method: rule.id ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(rule),
    });
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      throw new Error(j.message || `HTTP ${r.status}`);
    }
    setEditing(null);
    await refresh();
  };

  const remove = async (id: number) => {
    if (!confirm(`Delete rule #${id}?`)) return;
    try {
      const r = await fetch(`${API}/${id}`, { method: 'DELETE' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setRules((prev) => prev.filter((x) => x.id !== id));
    } catch (e: any) { alert(`Delete failed: ${e?.message || 'unknown'}`); }
  };

  const grouped = useMemo(() => {
    const b: Record<Tier, ConsoleRule[]> = { hotel: [], destination: [], segment: [], global: [] };
    rules.forEach((r) => b[tierOf(r.conditions)].push(r));
    (Object.keys(b) as Tier[]).forEach((k) => b[k].sort((a, c) => c.priority - a.priority));
    return b;
  }, [rules]);

  return (
    <>
      <div className="c-page-head">
        <div>
          <h1 className="c-page-title">Pricing rules</h1>
          <p className="c-page-sub">
            Markup added on top of supplier net rates. For each hotel the engine applies the
            <strong> single most-specific matching rule</strong> — it does not stack.
          </p>
        </div>
        <button className="c-btn c-btn-primary" onClick={() => setEditing('new')}>
          <Plus size={14} /> New rule
        </button>
      </div>

      {error && (
        <div className="c-error" style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
          <AlertTriangle size={14} /> {error}
        </div>
      )}

      {/* Cascade / waterfall overview */}
      <div className="c-card" style={{ marginBottom: 22, padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, fontSize: 13, fontWeight: 600 }}>
          <Layers size={14} /> How rules cascade
          <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--c-fg-muted)' }}>most specific wins →</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'stretch', gap: 8, flexWrap: 'wrap' }}>
          {TIERS.map((t, i) => (
            <div key={t.key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{
                border: '1px solid var(--c-border)', borderRadius: 8, padding: '8px 12px', minWidth: 150,
                background: grouped[t.key].length ? 'var(--c-bg-subtle, #f7f7f8)' : 'transparent',
              }}>
                <div style={{ fontSize: 12, fontWeight: 600, textTransform: 'capitalize' }}>{t.label}</div>
                <div style={{ fontSize: 11, color: 'var(--c-fg-muted)' }}>{t.blurb}</div>
                <div style={{ fontSize: 11, marginTop: 4 }}>
                  <span className={`c-pill ${grouped[t.key].length ? 'c-pill-success' : 'c-pill-muted'}`}>
                    {grouped[t.key].length} rule{grouped[t.key].length === 1 ? '' : 's'}
                  </span>
                </div>
              </div>
              {i < TIERS.length - 1 && <ArrowRight size={16} style={{ color: 'var(--c-fg-muted)' }} />}
            </div>
          ))}
        </div>
      </div>

      {/* Live resolver — which rule wins for a given hotel */}
      <RuleResolver rules={rules} />

      {/* Compose / edit */}
      {editing && (
        <RuleForm
          initial={editing === 'new' ? null : editing}
          onCancel={() => setEditing(null)}
          onSave={save}
        />
      )}

      {/* Rules by tier (most specific first) */}
      {[...TIERS].reverse().map((t) => (
        <section key={t.key} style={{ marginBottom: 18 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
            <h2 style={{ fontSize: 13, fontWeight: 600, margin: 0, textTransform: 'capitalize' }}>{t.label}</h2>
            <span style={{ fontSize: 11, color: 'var(--c-fg-muted)' }}>{t.blurb}</span>
          </div>
          <div className="c-card">
            {busy && rules.length === 0 ? (
              <div className="c-loading">Loading…</div>
            ) : grouped[t.key].length === 0 ? (
              <div className="c-empty" style={{ padding: '20px 16px', fontSize: 13 }}>No {t.label.toLowerCase()} rules.</div>
            ) : (
              <table className="c-table">
                <thead>
                  <tr>
                    <th style={{ width: 50 }}>ID</th>
                    <th>Applies to</th>
                    <th style={{ width: 90 }}>Markup</th>
                    <th style={{ width: 80 }}>Priority</th>
                    <th style={{ width: 80 }}>Status</th>
                    <th style={{ width: 90 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {grouped[t.key].map((r) => (
                    <tr key={r.id}>
                      <td className="c-mono">{r.id}</td>
                      <td>
                        <div style={{ fontWeight: 500 }}>{r.name || '—'}</div>
                        <div style={{ fontSize: 12, color: 'var(--c-fg-muted)' }}>{conditionSummary(r.conditions)}</div>
                      </td>
                      <td className="c-mono">{markupLabel(r)}</td>
                      <td className="c-mono">{r.priority}</td>
                      <td>
                        <span className={`c-pill ${r.is_active ? 'c-pill-success' : 'c-pill-muted'}`}>
                          {r.is_active ? 'Active' : 'Off'}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                          <button className="c-btn" style={{ padding: '4px 8px' }} title="Edit" onClick={() => setEditing(r)}>
                            <Pencil size={12} />
                          </button>
                          <button className="c-btn c-btn-danger" style={{ padding: '4px 8px' }} title="Delete" onClick={() => remove(r.id)}>
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>
      ))}
    </>
  );
}

/* ------- Live resolver: pick a hotel, see which rule wins ------- */
function RuleResolver({ rules }: { rules: ConsoleRule[] }) {
  const [hotel, setHotel] = useState<{ hotel_id?: number; name?: string; country?: string; city?: string } | null>(null);
  const [star, setStar] = useState('');
  const [hotelInput, setHotelInput] = useState('');

  const probe = hotel
    ? { hotel_id: hotel.hotel_id, country: hotel.country, city: hotel.city, star_rating: star ? Number(star) : undefined }
    : null;

  const winner = useMemo(() => {
    if (!probe) return null;
    const matches = rules.filter((r) => r.is_active && matchesHotel(r.conditions, probe));
    matches.sort((a, b) => b.priority - a.priority);
    return matches[0] || null;
  }, [probe, rules]);

  return (
    <div className="c-card" style={{ marginBottom: 22, padding: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Which rule applies?</div>
      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', alignItems: 'end' }}>
        <div>
          <label className="c-label">Hotel</label>
          <HotelAutocomplete
            value={hotelInput}
            onChange={(v) => { setHotelInput(v); if (!v) setHotel(null); }}
            placeholder="Search a hotel…"
            onSelectHotel={(h) => { setHotel({ hotel_id: h.hotel_id, name: h.name, country: h.country, city: h.city }); setHotelInput(h.name); }}
          />
        </div>
        <div>
          <label className="c-label">Star rating (optional)</label>
          <select className="c-select" value={star} onChange={(e) => setStar(e.target.value)}>
            <option value="">unknown</option>
            <option value="5">5★</option><option value="4">4★</option><option value="3">3★</option>
          </select>
        </div>
      </div>
      {probe && (
        <div style={{ marginTop: 12, fontSize: 13 }}>
          {winner ? (
            <span>
              → <strong>{markupLabel(winner)}</strong> applies via rule <span className="c-mono">#{winner.id}</span>{' '}
              <span style={{ color: 'var(--c-fg-muted)' }}>({winner.name || conditionSummary(winner.conditions)}, priority {winner.priority})</span>
            </span>
          ) : (
            <span style={{ color: 'var(--c-fg-muted)' }}>→ No rule matches — net rate passes through with no markup.</span>
          )}
        </div>
      )}
    </div>
  );
}

/* ------- Create / edit form (rich conditions) ------- */
function RuleForm({
  initial, onCancel, onSave,
}: {
  initial: ConsoleRule | null;
  onCancel: () => void;
  onSave: (r: Partial<ConsoleRule> & { id?: number }) => Promise<void>;
}) {
  const [name, setName] = useState(initial?.name || '');
  const [markupType, setMarkupType] = useState<'percentage' | 'fixed_amount'>(initial?.markup_type || 'percentage');
  const [markupValue, setMarkupValue] = useState(String(initial?.markup_value ?? 12));
  const [c, setC] = useState<RuleConditions>(initial?.conditions || {});
  const [priority, setPriority] = useState<string>(initial ? String(initial.priority) : '');
  const [hotelInput, setHotelInput] = useState(initial?.conditions?.hotel_name || '');
  const [saving, setSaving] = useState(false);

  const tier = tierOf(c);
  const setCond = (patch: Partial<RuleConditions>) => setC((p) => ({ ...p, ...patch }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave({
        id: initial?.id,
        name: name.trim(),
        markup_type: markupType,
        markup_value: Number(markupValue) || 0,
        priority: priority === '' ? TIER_PRIORITY[tier] : Number(priority),
        is_active: initial?.is_active ?? true,
        conditions: c,
      });
    } catch (err: any) {
      alert(`Save failed: ${err?.message || 'unknown'}`);
    } finally { setSaving(false); }
  };

  return (
    <div className="c-card" style={{ marginBottom: 22 }}>
      <div className="c-card-head">
        <h3 className="c-card-title">{initial ? `Edit rule #${initial.id}` : 'New pricing rule'}</h3>
        <span style={{ fontSize: 11, color: 'var(--c-fg-muted)', textTransform: 'capitalize' }}>tier: {tier}</span>
      </div>
      <form onSubmit={submit} style={{ padding: 16, display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
        <div style={{ gridColumn: '1 / -1' }}>
          <label className="c-label">Name (optional)</label>
          <input className="c-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Dubai 5★ premium" />
        </div>

        <div>
          <label className="c-label">Markup type</label>
          <select className="c-select" value={markupType} onChange={(e) => setMarkupType(e.target.value as any)}>
            <option value="percentage">Percentage</option>
            <option value="fixed_amount">Fixed amount</option>
          </select>
        </div>
        <div>
          <label className="c-label">Markup value {markupType === 'percentage' ? '(%)' : '($)'}</label>
          <input className="c-input" type="number" step="0.01" value={markupValue} onChange={(e) => setMarkupValue(e.target.value)} />
        </div>
        <div>
          <label className="c-label">Priority <span style={{ fontSize: 11, color: 'var(--c-fg-muted)' }}>(higher wins)</span></label>
          <input className="c-input" type="number" value={priority} onChange={(e) => setPriority(e.target.value)} placeholder={`auto (${TIER_PRIORITY[tier]})`} />
        </div>

        <div style={{ gridColumn: '1 / -1', borderTop: '1px solid var(--c-border)', paddingTop: 12, marginTop: 4 }}>
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>
            Applies to <span style={{ fontWeight: 400, color: 'var(--c-fg-muted)' }}>— leave all blank for a global rule; combine to narrow</span>
          </div>
          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
            <div style={{ gridColumn: '1 / -1' }}>
              <label className="c-label">Specific hotel</label>
              <HotelAutocomplete
                value={hotelInput}
                onChange={(v) => { setHotelInput(v); if (!v) setCond({ hotel_id: undefined, hotel_code: undefined, hotel_name: undefined }); }}
                placeholder="Search a hotel by name…"
                onSelectHotel={(h) => { setCond({ hotel_id: h.hotel_id, hotel_code: h.hotel_code, hotel_name: h.name }); setHotelInput(h.name); }}
              />
            </div>
            <div>
              <label className="c-label">Country (ISO-2)</label>
              <input className="c-input" value={c.country || ''} onChange={(e) => setCond({ country: e.target.value || undefined })} placeholder="e.g. US, AE, MV" />
            </div>
            <div>
              <label className="c-label">City</label>
              <input className="c-input" value={c.city || ''} onChange={(e) => setCond({ city: e.target.value || undefined })} placeholder="e.g. Los Angeles" />
            </div>
            <div>
              <label className="c-label">Min star rating</label>
              <select className="c-select" value={c.star_rating || ''} onChange={(e) => setCond({ star_rating: e.target.value ? Number(e.target.value) : undefined })}>
                <option value="">any</option><option value="5">5★+</option><option value="4">4★+</option><option value="3">3★+</option>
              </select>
            </div>
            <div>
              <label className="c-label">Supplier</label>
              <select className="c-select" value={c.supplier || ''} onChange={(e) => setCond({ supplier: e.target.value || undefined })}>
                <option value="">any</option><option value="ratehawk">ratehawk</option><option value="hummingbird">hummingbird</option><option value="demo">demo</option>
              </select>
            </div>
          </div>
        </div>

        <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" className="c-btn" onClick={onCancel}>Cancel</button>
          <button type="submit" className="c-btn c-btn-primary" disabled={saving}>
            {saving ? 'Saving…' : initial ? 'Save changes' : 'Create rule'}
          </button>
        </div>
      </form>
    </div>
  );
}
