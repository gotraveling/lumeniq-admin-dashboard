'use client';

/** /console/settings — console-native settings.
 *
 *  NOTE: this page used to be a thin re-export of the legacy
 *  /admin/tenant-settings stub (which had no backend persistence). It is
 *  now a real console page that owns the Currency / Exchange-rate card.
 *  The legacy tenant fields are intentionally left out for now — they were
 *  a non-persisting stub and aren't wired to any backend. Re-add them here
 *  as additional cards when there's a real endpoint behind them. */

import { useCallback, useEffect, useState } from 'react';
import { Loader2, RefreshCw, CheckCircle2, AlertTriangle } from 'lucide-react';

type FxRate = { quote: string; rate: number; updatedAt?: string | null };

export default function ConsoleSettingsPage() {
  const [fx, setFx] = useState<FxRate | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  const [rateInput, setRateInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const loadFx = useCallback(async () => {
    setLoading(true);
    setLoadErr(null);
    try {
      const res = await fetch('/api/admin/fx-rate', { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `Failed to load FX rate (${res.status})`);
      const rate = Number(data?.rate);
      setFx({ quote: data?.quote || 'AUD', rate, updatedAt: data?.updatedAt ?? null });
      if (Number.isFinite(rate)) setRateInput(String(rate));
    } catch (e: any) {
      setLoadErr(e?.message || 'Failed to load FX rate');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadFx(); }, [loadFx]);

  async function saveRate(e: React.FormEvent) {
    e.preventDefault();
    setSaveMsg(null);
    const rate = Number(rateInput);
    if (!Number.isFinite(rate) || rate <= 0) {
      setSaveMsg({ kind: 'err', text: 'Enter a positive number for the exchange rate.' });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/admin/fx-rate', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rate })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `Update failed (${res.status})`);
      const newRate = Number(data?.rate ?? rate);
      setFx({ quote: data?.quote || fx?.quote || 'AUD', rate: newRate, updatedAt: data?.updatedAt ?? new Date().toISOString() });
      setRateInput(String(newRate));
      setSaveMsg({ kind: 'ok', text: 'Exchange rate updated.' });
    } catch (e: any) {
      setSaveMsg({ kind: 'err', text: e?.message || 'Update failed' });
    } finally {
      setSaving(false);
    }
  }

  const fmtUpdated = (iso?: string | null) => {
    if (!iso) return '—';
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
  };

  return (
    <div style={{ minWidth: 0 }}>
      <div className="c-page-head">
        <div>
          <h1 className="c-page-title">Settings</h1>
          <p className="c-page-sub">Platform configuration. Currency / exchange rate used across search and booking display.</p>
        </div>
      </div>

      <div className="c-card" style={{ maxWidth: 560 }}>
        <div className="c-card-head">
          <h2 className="c-card-title">Currency / Exchange rate</h2>
          <button
            type="button"
            className="c-btn"
            onClick={() => void loadFx()}
            disabled={loading}
            title="Refresh"
          >
            {loading ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
            Refresh
          </button>
        </div>

        <div style={{ padding: 16 }}>
          {loadErr && (
            <div className="c-error" style={{ marginBottom: 14 }}>
              <AlertTriangle size={13} style={{ verticalAlign: 'middle', marginRight: 6 }} />
              {loadErr}
            </div>
          )}

          {/* Current rate */}
          <div style={{ marginBottom: 18 }}>
            <span className="c-label">Current rate (USD → AUD)</span>
            {loading ? (
              <div style={{ color: 'var(--c-fg-muted)', fontSize: 13 }}>
                <Loader2 size={13} className="animate-spin" style={{ verticalAlign: 'middle', marginRight: 6 }} />
                Loading…
              </div>
            ) : fx && Number.isFinite(fx.rate) ? (
              <div>
                <div style={{ fontFamily: 'var(--c-mono)', fontSize: 22, fontWeight: 700, color: 'var(--c-fg)' }}>
                  1 USD = {fx.rate} {fx.quote || 'AUD'}
                </div>
                <div style={{ fontSize: 12, color: 'var(--c-fg-muted)', marginTop: 2 }}>
                  Last updated {fmtUpdated(fx.updatedAt)}
                </div>
              </div>
            ) : (
              <div style={{ color: 'var(--c-fg-muted)', fontSize: 13 }}>No rate available.</div>
            )}
          </div>

          {/* Update form */}
          <form onSubmit={saveRate}>
            <label className="c-label" htmlFor="fx-rate-input">New rate (1 USD in AUD)</label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                id="fx-rate-input"
                className="c-input"
                type="number"
                step="0.0001"
                min="0"
                inputMode="decimal"
                value={rateInput}
                onChange={(e) => setRateInput(e.target.value)}
                placeholder="e.g. 1.52"
                style={{ maxWidth: 200 }}
                disabled={saving}
              />
              <button type="submit" className="c-btn c-btn-primary" disabled={saving || loading}>
                {saving ? <Loader2 size={13} className="animate-spin" /> : null}
                {saving ? 'Saving…' : 'Update rate'}
              </button>
            </div>

            {saveMsg && (
              <div
                style={{
                  marginTop: 12, fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 6,
                  color: saveMsg.kind === 'ok' ? 'var(--c-success)' : 'var(--c-danger)'
                }}
              >
                {saveMsg.kind === 'ok' ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
                {saveMsg.text}
              </div>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}
