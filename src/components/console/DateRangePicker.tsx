'use client';

import { useEffect, useRef, useState } from 'react';
import { DayPicker } from 'react-day-picker';
import 'react-day-picker/style.css';
import { addDays, format, differenceInCalendarDays } from 'date-fns';
import { Calendar as CalIcon } from 'lucide-react';

type Props = {
  checkIn: string;   // YYYY-MM-DD
  checkOut: string;  // YYYY-MM-DD
  onChange: (range: { checkIn: string; checkOut: string }) => void;
};

const NIGHT_SHORTCUTS = [2, 3, 5, 7, 10] as const;

export default function DateRangePicker({ checkIn, checkOut, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const fromDate = checkIn  ? new Date(checkIn + 'T00:00:00')  : undefined;
  const toDate   = checkOut ? new Date(checkOut + 'T00:00:00') : undefined;
  const nights   = fromDate && toDate ? Math.max(1, differenceInCalendarDays(toDate, fromDate)) : 0;

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  function setNights(n: number) {
    const base = fromDate || new Date();
    onChange({
      checkIn:  format(base, 'yyyy-MM-dd'),
      checkOut: format(addDays(base, n), 'yyyy-MM-dd')
    });
  }

  function display() {
    if (!fromDate) return 'Select dates';
    const fromTxt = format(fromDate, 'd MMM');
    const toTxt   = toDate ? format(toDate, 'd MMM yyyy') : '…';
    return `${fromTxt} → ${toTxt}${nights ? ` · ${nights}n` : ''}`;
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
        <CalIcon size={14} style={{ color: 'var(--c-fg-muted)' }} />
        <span>{display()}</span>
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', left: 0,
          background: 'var(--c-bg)', border: '1px solid var(--c-line)',
          borderRadius: 8, boxShadow: '0 12px 28px rgba(0,0,0,0.10)',
          padding: 12, zIndex: 60
        }}>
          <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
            {NIGHT_SHORTCUTS.map(n => (
              <button
                key={n}
                type="button"
                onClick={() => setNights(n)}
                style={{
                  fontSize: 12, padding: '4px 10px',
                  border: '1px solid var(--c-line)', borderRadius: 999,
                  background: nights === n ? 'var(--c-accent-soft)' : 'var(--c-bg)',
                  color: 'var(--c-fg)', cursor: 'pointer'
                }}
              >{n} nights</button>
            ))}
          </div>
          <DayPicker
            mode="range"
            numberOfMonths={2}
            selected={{ from: fromDate, to: toDate }}
            onSelect={(r) => {
              if (!r?.from) return;
              const ci = format(r.from, 'yyyy-MM-dd');
              const co = format(r.to || addDays(r.from, 1), 'yyyy-MM-dd');
              onChange({ checkIn: ci, checkOut: co });
              if (r.from && r.to) setOpen(false);
            }}
            disabled={{ before: new Date() }}
            styles={{
              caption_label: { fontWeight: 600 },
              day:           { fontSize: 13 }
            }}
          />
        </div>
      )}
    </div>
  );
}
