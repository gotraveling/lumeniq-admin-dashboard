'use client';

/**
 * Builds a promotion link for a collection: the same page, each hotel showing
 * its best stay inside the chosen dates (NYE, Christmas, Easter, an event,
 * last minute). The website reads the link (firstclass-next
 * lib/collections/stayRange.ts); this just writes it, so nobody has to type
 * URL parameters (Murali, Nov 2026: "it is hard to add").
 */
import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Copy, ExternalLink, X } from 'lucide-react';

const SITE = 'https://www.firstclass.com.au';
const PREVIEW_ACCESS = 'access=firstclass2025';

type Mode = 'range' | 'leaving';

export function PromoLinkBuilder({ slug }: { slug: string }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>('range');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [leaving, setLeaving] = useState('14');
  const [minNights, setMinNights] = useState('');
  const [maxNights, setMaxNights] = useState('');
  const [include, setInclude] = useState<string[]>([]);
  const [includeDraft, setIncludeDraft] = useState('');
  const [copied, setCopied] = useState(false);

  const { link, problem } = useMemo(() => {
    const parts: string[] = [];
    if (mode === 'range') {
      if (!from || !to) return { link: null, problem: 'Pick the first and last date.' };
      if (to < from) return { link: null, problem: 'The last date is before the first.' };
      parts.push(`stay=${from}..${to}`);
    } else {
      parts.push(`leaving=${leaving}`);
    }
    const lo = Number(minNights), hi = Number(maxNights);
    if (minNights || maxNights) {
      const a = minNights ? lo : hi, b = maxNights ? hi : lo;
      if (!(a >= 1 && b >= a && b <= 30)) return { link: null, problem: 'Nights: minimum 1, maximum 30, minimum not above maximum.' };
      parts.push(`nights=${a === b ? a : `${a}-${b}`}`);
    }
    if (include.length) {
      if (mode === 'range' && include.some((d) => d < from || d >= to)) {
        return { link: null, problem: 'A must-include night is outside the dates.' };
      }
      parts.push(`include=${include.join(',')}`);
    }
    return { link: `${SITE}/luxury-hotels/collections/${slug}?${parts.join('&')}`, problem: null };
  }, [mode, from, to, leaving, minNights, maxNights, include, slug]);

  const addInclude = () => {
    if (includeDraft && !include.includes(includeDraft)) setInclude([...include, includeDraft].sort());
    setIncludeDraft('');
  };

  const copy = async () => {
    if (!link) return;
    try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* clipboard blocked */ }
  };

  const label: React.CSSProperties = { fontSize: 12, color: 'var(--c-fg-soft)', display: 'grid', gap: 4 };

  return (
    <div style={{ border: '1px solid var(--c-line)', borderRadius: 6 }}>
      <div
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen((o) => !o); } }}
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', cursor: 'pointer', background: 'var(--c-bg-soft, #f6f4ef)', borderRadius: 6 }}
      >
        <span>
          <strong style={{ fontSize: 13 }}>Promotion link</strong>
          <span style={{ fontSize: 12, color: 'var(--c-fg-soft)', marginLeft: 10 }}>
            best stay per hotel in your dates: NYE, Easter, events, last minute
          </span>
        </span>
        {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </div>

      {open && (
        <div style={{ padding: 12, display: 'grid', gap: 12 }}>
          <div style={{ display: 'flex', gap: 16, fontSize: 13 }}>
            <label><input type="radio" checked={mode === 'range'} onChange={() => setMode('range')} /> Between two dates</label>
            <label><input type="radio" checked={mode === 'leaving'} onChange={() => setMode('leaving')} /> Last minute</label>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
            {mode === 'range' ? (
              <>
                <label style={label}>First night
                  <input className="c-input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
                </label>
                <label style={label}>Check-out by
                  <input className="c-input" type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
                </label>
              </>
            ) : (
              <label style={label}>Leaving within
                <select className="c-select" value={leaving} onChange={(e) => setLeaving(e.target.value)}>
                  <option value="7">1 week</option>
                  <option value="14">2 weeks</option>
                  <option value="30">30 days</option>
                </select>
              </label>
            )}
            <label style={label}>Nights, minimum
              <input className="c-input" type="number" min={1} max={30} value={minNights} onChange={(e) => setMinNights(e.target.value)} placeholder="any" />
            </label>
            <label style={label}>Nights, maximum
              <input className="c-input" type="number" min={1} max={30} value={maxNights} onChange={(e) => setMaxNights(e.target.value)} placeholder="any" />
            </label>
          </div>

          <div style={label}>
            Nights the stay must include (e.g. 31 Dec for NYE)
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <input className="c-input" type="date" value={includeDraft} onChange={(e) => setIncludeDraft(e.target.value)} style={{ maxWidth: 180 }} />
              <button type="button" className="c-btn" onClick={addInclude} disabled={!includeDraft}>Add</button>
              {include.map((d) => (
                <span key={d} className="c-btn" style={{ cursor: 'default' }}>
                  {d}
                  <X size={12} style={{ cursor: 'pointer', marginLeft: 4 }} onClick={() => setInclude(include.filter((x) => x !== d))} />
                </span>
              ))}
            </div>
          </div>

          {problem ? (
            <div style={{ fontSize: 12.5, color: 'var(--c-warn)' }}>{problem}</div>
          ) : link && (
            <div style={{ display: 'grid', gap: 8 }}>
              <input className="c-input" readOnly value={link} onFocus={(e) => e.target.select()} />
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" className="c-btn c-btn-primary" onClick={copy}><Copy size={14} /> {copied ? 'Copied' : 'Copy link'}</button>
                <a className="c-btn" href={`${link}&${PREVIEW_ACCESS}`} target="_blank" rel="noreferrer"><ExternalLink size={14} /> Open</a>
              </div>
              <span style={{ fontSize: 11.5, color: 'var(--c-fg-soft)' }}>
                Uses stays already priced: each week for about 4 months, 7-night stays to a year. A 1 or 2 night stay
                around one exact date may show no price for some hotels.
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
