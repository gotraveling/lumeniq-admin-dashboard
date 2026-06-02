'use client';

/**
 * Country picker with flag emoji + search.
 *
 * Closest analogue to Booking.com / Expedia / Airbnb's nationality
 * dropdown — typeahead filter, flag glyph, full country name +
 * ISO-2 code displayed, click to select. Returns the ISO-2 code
 * via onChange (which is what the booking-engine / supplier
 * expects).
 *
 * List is intentionally a static literal — these are the markets
 * RateHawk + Hummingbird cover for FirstClass. Adding a country
 * is a one-line change here; no API dependency.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Search } from 'lucide-react';

type Country = { code: string; name: string; flag: string };

// Codepoint-based flag emoji — works across modern OSes without
// shipping a separate flag-image bundle. Each letter is offset
// from regional-indicator codepoint base 0x1F1E6.
function flagOf(code: string): string {
  const cc = code.toUpperCase();
  if (cc.length !== 2) return '';
  return String.fromCodePoint(0x1F1E6 + cc.charCodeAt(0) - 65, 0x1F1E6 + cc.charCodeAt(1) - 65);
}

const RAW: Array<[string, string]> = [
  ['AU', 'Australia'], ['NZ', 'New Zealand'], ['US', 'United States'], ['GB', 'United Kingdom'],
  ['CA', 'Canada'], ['IE', 'Ireland'], ['SG', 'Singapore'], ['HK', 'Hong Kong'],
  ['JP', 'Japan'], ['KR', 'South Korea'], ['CN', 'China'], ['TW', 'Taiwan'],
  ['MY', 'Malaysia'], ['TH', 'Thailand'], ['VN', 'Vietnam'], ['ID', 'Indonesia'],
  ['PH', 'Philippines'], ['IN', 'India'], ['LK', 'Sri Lanka'], ['MV', 'Maldives'],
  ['NP', 'Nepal'], ['KH', 'Cambodia'], ['LA', 'Laos'], ['BD', 'Bangladesh'],
  ['PK', 'Pakistan'], ['AE', 'United Arab Emirates'], ['SA', 'Saudi Arabia'],
  ['QA', 'Qatar'], ['BH', 'Bahrain'], ['KW', 'Kuwait'], ['OM', 'Oman'],
  ['JO', 'Jordan'], ['LB', 'Lebanon'], ['IL', 'Israel'], ['TR', 'Turkey'],
  ['EG', 'Egypt'], ['MA', 'Morocco'], ['TN', 'Tunisia'], ['ZA', 'South Africa'],
  ['KE', 'Kenya'], ['TZ', 'Tanzania'], ['MU', 'Mauritius'], ['SC', 'Seychelles'],
  ['FR', 'France'], ['DE', 'Germany'], ['IT', 'Italy'], ['ES', 'Spain'],
  ['PT', 'Portugal'], ['NL', 'Netherlands'], ['BE', 'Belgium'], ['CH', 'Switzerland'],
  ['AT', 'Austria'], ['SE', 'Sweden'], ['NO', 'Norway'], ['DK', 'Denmark'],
  ['FI', 'Finland'], ['IS', 'Iceland'], ['PL', 'Poland'], ['CZ', 'Czech Republic'],
  ['HU', 'Hungary'], ['GR', 'Greece'], ['HR', 'Croatia'], ['RO', 'Romania'],
  ['RU', 'Russia'], ['UA', 'Ukraine'], ['BR', 'Brazil'], ['AR', 'Argentina'],
  ['MX', 'Mexico'], ['CL', 'Chile'], ['PE', 'Peru'], ['CO', 'Colombia'],
  ['UY', 'Uruguay'], ['CR', 'Costa Rica'], ['PA', 'Panama'], ['CU', 'Cuba'],
  ['DO', 'Dominican Republic'], ['JM', 'Jamaica'], ['BB', 'Barbados'],
  ['FJ', 'Fiji'], ['PF', 'French Polynesia']
];

const COUNTRIES: Country[] = RAW
  .map(([code, name]) => ({ code, name, flag: flagOf(code) }))
  .sort((a, b) => a.name.localeCompare(b.name));

const CODE_TO_NAME: Record<string, string> = Object.fromEntries(
  COUNTRIES.map(c => [c.code, c.name])
);

export default function CountryPicker({
  value,
  onChange,
  label = 'Citizenship',
  required = false
}: {
  value: string;
  onChange: (code: string) => void;
  label?: string;
  required?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Click-outside to close
  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  // Auto-focus the search input on open
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return COUNTRIES;
    return COUNTRIES.filter(c =>
      c.name.toLowerCase().includes(q) || c.code.toLowerCase().startsWith(q)
    );
  }, [query]);

  const selectedName = value ? (CODE_TO_NAME[value.toUpperCase()] || value) : '';
  const selectedFlag = value ? flagOf(value) : '';

  return (
    <div ref={rootRef} style={{ position: 'relative' }}>
      <label style={{ display: 'block', fontSize: 12.5, color: '#475569', fontWeight: 600, marginBottom: 4 }}>
        {label}{required && <span style={{ color: '#dc2626' }}> *</span>}
      </label>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', padding: '10px 36px 10px 12px',
          borderRadius: 8, border: '1px solid #cbd5e1',
          background: 'white', textAlign: 'left',
          fontSize: 14, color: value ? '#0f172a' : '#94a3b8',
          cursor: 'pointer', position: 'relative',
          display: 'flex', alignItems: 'center', gap: 8
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {selectedFlag && <span style={{ fontSize: 18, lineHeight: 1 }}>{selectedFlag}</span>}
        <span style={{ flex: 1 }}>
          {selectedName || 'Select country…'}
        </span>
        <ChevronDown size={16} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
      </button>

      {open && (
        <div
          role="listbox"
          style={{
            position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
            background: 'white', border: '1px solid #cbd5e1', borderRadius: 8,
            boxShadow: '0 12px 28px rgba(0,0,0,0.12)',
            maxHeight: 320, overflow: 'hidden', zIndex: 50,
            display: 'flex', flexDirection: 'column'
          }}
        >
          <div style={{ padding: 8, borderBottom: '1px solid #e2e8f0', position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: 18, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search countries…"
              style={{
                width: '100%', padding: '8px 8px 8px 30px', borderRadius: 6,
                border: '1px solid #e2e8f0', fontSize: 13.5,
                outline: 'none', color: '#0f172a'
              }}
            />
          </div>
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {filtered.length === 0 ? (
              <div style={{ padding: '12px 14px', fontSize: 13, color: '#94a3b8' }}>
                No matches
              </div>
            ) : (
              filtered.map(c => {
                const selected = c.code === value?.toUpperCase();
                return (
                  <button
                    key={c.code}
                    type="button"
                    onClick={() => { onChange(c.code); setOpen(false); setQuery(''); }}
                    role="option"
                    aria-selected={selected}
                    style={{
                      width: '100%', textAlign: 'left',
                      padding: '8px 12px', border: 0, cursor: 'pointer',
                      background: selected ? '#f1f5f9' : 'transparent',
                      display: 'flex', alignItems: 'center', gap: 10,
                      fontSize: 13.5, color: '#0f172a'
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = selected ? '#f1f5f9' : '#f8fafc')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = selected ? '#f1f5f9' : 'transparent')}
                  >
                    <span style={{ fontSize: 18, lineHeight: 1 }}>{c.flag}</span>
                    <span style={{ flex: 1 }}>{c.name}</span>
                    <span style={{ fontSize: 11, color: '#94a3b8', fontFamily: 'monospace' }}>{c.code}</span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
