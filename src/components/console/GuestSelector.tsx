'use client';

import { useEffect, useRef, useState } from 'react';
import { Users, Plus, Minus, ChevronDown } from 'lucide-react';

export type RoomGuests = { adults: number; childrenAges: number[] };

type Props = {
  rooms: RoomGuests[];
  onChange: (rooms: RoomGuests[]) => void;
};

const MAX_ROOMS = 9;
const MAX_ADULTS_PER_ROOM = 6;
const MAX_CHILDREN_PER_ROOM = 4;

export default function GuestSelector({ rooms, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const totalAdults    = rooms.reduce((s, r) => s + r.adults, 0);
  const totalChildren  = rooms.reduce((s, r) => s + r.childrenAges.length, 0);
  const summary        = `${totalAdults} adult${totalAdults !== 1 ? 's' : ''}` +
                         (totalChildren ? ` · ${totalChildren} child${totalChildren !== 1 ? 'ren' : ''}` : '') +
                         ` · ${rooms.length} room${rooms.length !== 1 ? 's' : ''}`;

  function patchRoom(idx: number, patch: Partial<RoomGuests>) {
    const next = rooms.map((r, i) => i === idx ? { ...r, ...patch } : r);
    onChange(next);
  }

  return (
    <div ref={rootRef} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', textAlign: 'left',
          padding: '8px 10px', fontSize: 14,
          border: '1px solid var(--c-line)', borderRadius: 6,
          background: 'var(--c-bg)', color: 'var(--c-fg)',
          cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8
        }}
      >
        <Users size={14} style={{ color: 'var(--c-fg-muted)' }} />
        <span style={{ flex: 1 }}>{summary}</span>
        <ChevronDown size={14} style={{ color: 'var(--c-fg-muted)' }} />
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', right: 0, left: 0,
          background: 'var(--c-bg)', border: '1px solid var(--c-line)',
          borderRadius: 8, boxShadow: '0 12px 28px rgba(0,0,0,0.10)',
          padding: 14, zIndex: 60, minWidth: 320
        }}>
          {rooms.map((r, idx) => (
            <div key={idx} style={{ marginBottom: idx === rooms.length - 1 ? 0 : 14, paddingBottom: idx === rooms.length - 1 ? 0 : 12, borderBottom: idx === rooms.length - 1 ? 0 : '1px solid var(--c-line-soft)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.05, textTransform: 'uppercase', color: 'var(--c-fg-soft)' }}>
                  Room {idx + 1}
                </span>
                {rooms.length > 1 && (
                  <button
                    type="button"
                    onClick={() => onChange(rooms.filter((_, i) => i !== idx))}
                    style={{ fontSize: 11, color: 'var(--c-danger)', background: 'none', border: 0, cursor: 'pointer' }}
                  >Remove</button>
                )}
              </div>

              <Stepper
                label="Adults"
                value={r.adults}
                min={1}
                max={MAX_ADULTS_PER_ROOM}
                onChange={(v) => patchRoom(idx, { adults: v })}
              />
              <Stepper
                label="Children (0–17)"
                value={r.childrenAges.length}
                min={0}
                max={MAX_CHILDREN_PER_ROOM}
                onChange={(v) => {
                  const ages = r.childrenAges.slice(0, v);
                  while (ages.length < v) ages.push(7); // default age 7
                  patchRoom(idx, { childrenAges: ages });
                }}
              />
              {r.childrenAges.length > 0 && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                  {r.childrenAges.map((age, ci) => (
                    <div key={ci} style={{ fontSize: 11 }}>
                      <label style={{ display: 'block', color: 'var(--c-fg-muted)', marginBottom: 2 }}>Child {ci + 1}</label>
                      <select
                        value={age}
                        onChange={(e) => {
                          const ages = r.childrenAges.slice();
                          ages[ci] = parseInt(e.target.value, 10);
                          patchRoom(idx, { childrenAges: ages });
                        }}
                        style={{
                          fontSize: 12, padding: '3px 6px',
                          border: '1px solid var(--c-line)', borderRadius: 4,
                          background: 'var(--c-bg)', color: 'var(--c-fg)'
                        }}
                      >
                        {Array.from({ length: 18 }, (_, i) => i).map(n => <option key={n} value={n}>{n}y</option>)}
                      </select>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}

          {rooms.length < MAX_ROOMS && (
            <button
              type="button"
              onClick={() => onChange([...rooms, { adults: 2, childrenAges: [] }])}
              style={{
                marginTop: 12, width: '100%', fontSize: 12, fontWeight: 600,
                padding: '7px 10px', border: '1px dashed var(--c-line)', borderRadius: 6,
                background: 'var(--c-bg)', color: 'var(--c-fg-soft)', cursor: 'pointer'
              }}
            >+ Add room</button>
          )}
        </div>
      )}
    </div>
  );
}

function Stepper({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
      <span style={{ fontSize: 13 }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button type="button" onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min}
          style={btnIcon(value <= min)}><Minus size={12} /></button>
        <span style={{ fontSize: 13, fontWeight: 600, minWidth: 18, textAlign: 'center' }}>{value}</span>
        <button type="button" onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max}
          style={btnIcon(value >= max)}><Plus size={12} /></button>
      </div>
    </div>
  );
}
function btnIcon(disabled: boolean): React.CSSProperties {
  return {
    width: 24, height: 24, borderRadius: 4,
    border: '1px solid var(--c-line)', background: 'var(--c-bg)',
    color: 'var(--c-fg)', cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.4 : 1,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center'
  };
}
