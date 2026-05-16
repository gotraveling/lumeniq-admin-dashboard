'use client';

import { useEffect, useRef, useState } from 'react';
import { MapPin, Hotel, Globe2, Loader2 } from 'lucide-react';

type Hit = { id?: number; hotel_id?: number; name?: string; city?: string; country?: string; main_image?: string | null };

type Props = {
  value: string;
  onChange: (s: string) => void;
  onSelectHotel?: (h: Hit) => void;
  onSelectCity?: (city: string, country?: string) => void;
  onSelectCountry?: (country: string) => void;
  placeholder?: string;
};

export default function DestinationAutocomplete({ value, onChange, onSelectHotel, onSelectCity, onSelectCountry, placeholder }: Props) {
  const [hotels, setHotels]     = useState<Hit[]>([]);
  const [cities, setCities]     = useState<Hit[]>([]);
  const [countries, setCountries] = useState<Hit[]>([]);
  const [open, setOpen]         = useState(false);
  const [busy, setBusy]         = useState(false);
  const rootRef                 = useRef<HTMLDivElement>(null);
  const debounceRef             = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = value?.trim() || '';
    if (q.length < 2) { setHotels([]); setCities([]); setCountries([]); return; }
    debounceRef.current = setTimeout(async () => {
      setBusy(true);
      try {
        const r = await fetch('/api/search/multi', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ q, limit: 6 })
        });
        const data = await r.json();
        setHotels(data.hotels || []);
        setCities(data.cities || []);
        setCountries(data.countries || []);
        setOpen(true);
      } catch { /* ignore */ } finally {
        setBusy(false);
      }
    }, 220);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [value]);

  const hasResults = hotels.length || cities.length || countries.length;

  return (
    <div ref={rootRef} style={{ position: 'relative' }}>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => { if (hasResults) setOpen(true); }}
        placeholder={placeholder || 'Destination, city or hotel'}
        style={{
          width: '100%', padding: '8px 10px', fontSize: 14,
          border: '1px solid var(--c-line)', borderRadius: 6,
          background: 'var(--c-bg)', color: 'var(--c-fg)'
        }}
      />
      {busy && <Loader2 size={13} className="animate-spin" style={{ position: 'absolute', right: 10, top: 11, color: 'var(--c-fg-muted)' }} />}
      {open && hasResults && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
          background: 'var(--c-bg)', border: '1px solid var(--c-line)',
          borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.08)',
          maxHeight: 360, overflow: 'auto', zIndex: 60
        }}>
          {hotels.length > 0 && (
            <Group label="Hotels" icon={<Hotel size={11} />}>
              {hotels.map((h: any) => (
                <Row key={`h-${h.id}`} onClick={() => { onChange(h.name); onSelectHotel?.(h); setOpen(false); }}>
                  <strong style={{ fontWeight: 600 }}>{h.name}</strong>
                  <span style={{ color: 'var(--c-fg-muted)', marginLeft: 6, fontSize: 12 }}>
                    {[h.city, h.country].filter(Boolean).join(', ')}
                  </span>
                </Row>
              ))}
            </Group>
          )}
          {cities.length > 0 && (
            <Group label="Cities" icon={<MapPin size={11} />}>
              {cities.map((c: any) => (
                <Row key={`c-${c.id}`} onClick={() => { onChange(c.name); onSelectCity?.(c.name, c.country); setOpen(false); }}>
                  <strong style={{ fontWeight: 600 }}>{c.name}</strong>
                  {c.country && <span style={{ color: 'var(--c-fg-muted)', marginLeft: 6, fontSize: 12 }}>{c.country}</span>}
                </Row>
              ))}
            </Group>
          )}
          {countries.length > 0 && (
            <Group label="Countries" icon={<Globe2 size={11} />}>
              {countries.map((c: any) => (
                <Row key={`co-${c.id}`} onClick={() => { onChange(c.name); onSelectCountry?.(c.name); setOpen(false); }}>
                  <strong style={{ fontWeight: 600 }}>{c.name}</strong>
                </Row>
              ))}
            </Group>
          )}
        </div>
      )}
    </div>
  );
}

function Group({ label, icon, children }: { label: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <div style={{
        padding: '8px 12px 4px', fontSize: 10.5, fontWeight: 700,
        letterSpacing: 0.06, textTransform: 'uppercase', color: 'var(--c-fg-muted)',
        display: 'flex', alignItems: 'center', gap: 6
      }}>
        {icon} {label}
      </div>
      {children}
    </div>
  );
}
function Row({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'block', width: '100%', textAlign: 'left',
        padding: '7px 12px', fontSize: 13.5, color: 'var(--c-fg)',
        background: 'var(--c-bg)', border: 0, cursor: 'pointer'
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--c-bg-hover)')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--c-bg)')}
    >
      {children}
    </button>
  );
}
