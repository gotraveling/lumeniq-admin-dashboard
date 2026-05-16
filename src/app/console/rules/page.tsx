'use client';

import { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, AlertTriangle } from 'lucide-react';
import { HotelAutocomplete } from '@/components/ui/HotelAutocomplete';

interface PricingRule {
  id: number;
  rule_type: 'global' | 'destination' | 'hotel';
  target_value: string | null;
  markup_type: 'percentage' | 'fixed_amount';
  markup_value: number;
  priority: number;
  description: string;
  is_active: boolean;
}

const API_URL = process.env.NEXT_PUBLIC_HOTEL_API_URL || '';

export default function ConsoleRulesPage() {
  const [rules, setRules] = useState<PricingRule[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);

  const refresh = async () => {
    try {
      setBusy(true);
      setError(null);
      const r = await fetch(`${API_URL}/api/pricing/rules`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      setRules(Array.isArray(data) ? data : data?.rules || []);
    } catch (e: any) {
      setError(e?.message || 'Failed to load rules');
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => { refresh(); }, []);

  const onDelete = async (id: number) => {
    if (!confirm(`Delete rule #${id}? This is irreversible.`)) return;
    try {
      const r = await fetch(`${API_URL}/api/pricing/rules/${id}`, { method: 'DELETE' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setRules((prev) => prev.filter((x) => x.id !== id));
    } catch (e: any) {
      alert(`Delete failed: ${e?.message || 'unknown error'}`);
    }
  };

  const onCreate = async (rule: Omit<PricingRule, 'id' | 'is_active'>) => {
    try {
      const r = await fetch(`${API_URL}/api/pricing/rules`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rule),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j.message || `HTTP ${r.status}`);
      }
      const saved = await r.json();
      setRules((prev) => [saved, ...prev]);
      setComposing(false);
    } catch (e: any) {
      alert(`Create failed: ${e?.message || 'unknown error'}`);
    }
  };

  const grouped = useMemo(() => {
    const buckets: Record<PricingRule['rule_type'], PricingRule[]> = {
      global: [],
      destination: [],
      hotel: [],
    };
    rules.forEach((r) => buckets[r.rule_type]?.push(r));
    return buckets;
  }, [rules]);

  return (
    <>
      <div className="c-page-head">
        <div>
          <h1 className="c-page-title">Pricing rules</h1>
          <p className="c-page-sub">
            Markup applied on top of supplier net rates. Rules cascade: hotel-specific overrides destination overrides global.
          </p>
        </div>
        <button className="c-btn c-btn-primary" onClick={() => setComposing(true)}>
          <Plus size={14} /> New rule
        </button>
      </div>

      {error && (
        <div className="c-error" style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
          <AlertTriangle size={14} /> {error}
        </div>
      )}

      {composing && <ComposeRule onSubmit={onCreate} onCancel={() => setComposing(false)} />}

      {(['global', 'destination', 'hotel'] as const).map((kind) => (
        <section key={kind} style={{ marginBottom: 22 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
            <h2 style={{ fontSize: 13, fontWeight: 600, margin: 0, textTransform: 'capitalize' }}>{kind}</h2>
            <span style={{ fontSize: 11, color: 'var(--c-fg-muted)' }}>
              {grouped[kind].length} {grouped[kind].length === 1 ? 'rule' : 'rules'}
            </span>
          </div>
          <div className="c-card">
            {busy && grouped[kind].length === 0 ? (
              <div className="c-loading">Loading…</div>
            ) : grouped[kind].length === 0 ? (
              <div className="c-empty" style={{ padding: '28px 16px' }}>
                <div style={{ fontSize: 13 }}>No {kind} rules.</div>
              </div>
            ) : (
              <table className="c-table">
                <thead>
                  <tr>
                    <th style={{ width: 60 }}>ID</th>
                    {kind !== 'global' && <th>Target</th>}
                    <th>Markup</th>
                    <th>Description</th>
                    <th style={{ width: 90 }}>Active</th>
                    <th style={{ width: 56 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {grouped[kind].map((r) => (
                    <tr key={r.id}>
                      <td className="c-mono">{r.id}</td>
                      {kind !== 'global' && (
                        <td className="c-mono" style={{ fontSize: 12 }}>
                          {r.target_value || '—'}
                        </td>
                      )}
                      <td className="c-mono">
                        {r.markup_type === 'percentage'
                          ? `${r.markup_value}%`
                          : `${r.markup_value}`}
                        <span style={{ fontSize: 11, color: 'var(--c-fg-muted)', marginLeft: 6 }}>
                          {r.markup_type === 'percentage' ? 'percent' : 'flat'}
                        </span>
                      </td>
                      <td style={{ color: 'var(--c-fg-soft)' }}>{r.description || '—'}</td>
                      <td>
                        <span className={`c-pill ${r.is_active ? 'c-pill-success' : 'c-pill-muted'}`}>
                          {r.is_active ? 'Active' : 'Off'}
                        </span>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="c-btn c-btn-danger"
                          onClick={() => onDelete(r.id)}
                          style={{ padding: '4px 8px' }}
                          title="Delete rule"
                        >
                          <Trash2 size={12} />
                        </button>
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

/**
 * Inline rule composer. Three rule types — global, destination, hotel.
 * Target value field morphs to match (hidden for global, country code
 * for destination, hotel id for hotel). Markup is either percentage or
 * a flat amount in the rate currency.
 */
function ComposeRule({
  onSubmit,
  onCancel,
}: {
  onSubmit: (rule: Omit<PricingRule, 'id' | 'is_active'>) => void;
  onCancel: () => void;
}) {
  const [ruleType, setRuleType] = useState<'global' | 'destination' | 'hotel'>('global');
  const [targetValue, setTargetValue] = useState('');
  const [markupType, setMarkupType] = useState<'percentage' | 'fixed_amount'>('percentage');
  const [markupValue, setMarkupValue] = useState('10');
  const [description, setDescription] = useState('');

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (ruleType !== 'global' && !targetValue.trim()) {
      alert(`Please specify the ${ruleType === 'destination' ? 'destination code (e.g. AU, MV)' : 'hotel id'}.`);
      return;
    }
    onSubmit({
      rule_type: ruleType,
      target_value: ruleType === 'global' ? null : targetValue.trim(),
      markup_type: markupType,
      markup_value: Number(markupValue) || 0,
      description: description.trim(),
    });
  };

  return (
    <div className="c-card" style={{ marginBottom: 22 }}>
      <div className="c-card-head">
        <h3 className="c-card-title">New pricing rule</h3>
        <button type="button" className="c-btn" onClick={onCancel} style={{ padding: '4px 10px', fontSize: 12 }}>
          Cancel
        </button>
      </div>
      <form onSubmit={submit} style={{ padding: 16, display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
        <div>
          <label className="c-label">Rule type</label>
          <select className="c-select" value={ruleType} onChange={(e) => setRuleType(e.target.value as any)}>
            <option value="global">Global (all hotels)</option>
            <option value="destination">Destination (country)</option>
            <option value="hotel">Specific hotel</option>
          </select>
        </div>
        {ruleType !== 'global' && (
          <div>
            <label className="c-label">{ruleType === 'destination' ? 'Country code' : 'Hotel id'}</label>
            <input
              className="c-input"
              value={targetValue}
              onChange={(e) => setTargetValue(e.target.value)}
              placeholder={ruleType === 'destination' ? 'e.g. AU, MV, AE' : 'e.g. 999154183'}
            />
          </div>
        )}
        <div>
          <label className="c-label">Markup type</label>
          <select className="c-select" value={markupType} onChange={(e) => setMarkupType(e.target.value as any)}>
            <option value="percentage">Percentage</option>
            <option value="fixed_amount">Fixed amount</option>
          </select>
        </div>
        <div>
          <label className="c-label">Markup value</label>
          <input
            className="c-input"
            type="number"
            step="0.01"
            value={markupValue}
            onChange={(e) => setMarkupValue(e.target.value)}
          />
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <label className="c-label">Description (optional)</label>
          <input
            className="c-input"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. Honeymoon Maldives premium markup"
          />
        </div>
        <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" className="c-btn" onClick={onCancel}>Cancel</button>
          <button type="submit" className="c-btn c-btn-primary">Create rule</button>
        </div>
      </form>
    </div>
  );
}
