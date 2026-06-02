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
const iso = (d: Date) => format(d, 'yyyy-MM-dd');

export default function DateRangePicker({ checkIn, checkOut, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const fromDate = checkIn  ? new Date(checkIn + 'T00:00:00')  : undefined;
  const toDate   = checkOut ? new Date(checkOut + 'T00:00:00') : undefined;
  const nights   = fromDate && toDate ? Math.max(1, differenceInCalendarDays(toDate, fromDate)) : 0;

  // Two-step draft so a single click sets check-in (picker stays open) and
  // the next click sets check-out (then closes). The committed checkIn/
  // checkOut only change once a full range is picked — no surprise giant
  // range or one-click close.
  const [draftFrom, setDraftFrom] = useState<Date | undefined>(fromDate);
  const [draftTo, setDraftTo]     = useState<Date | undefined>(toDate);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  // Re-sync the draft to the committed range each time the popover opens.
  useEffect(() => {
    if (open) { setDraftFrom(fromDate); setDraftTo(toDate); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function pickDay(day: Date) {
    // Fresh start: no check-in yet, OR a complete range already exists →
    // begin a new range at the clicked day and wait for the check-out click.
    if (!draftFrom || (draftFrom && draftTo)) {
      setDraftFrom(day);
      setDraftTo(undefined);
      return; // keep the popover open
    }
    // Second click → complete the range (swap if they picked an earlier day).
    let from = draftFrom;
    let to = day;
    if (to.getTime() < from.getTime()) { const t = from; from = to; to = t; }
    if (to.getTime() === from.getTime()) { to = addDays(from, 1); } // min 1 night
    setDraftFrom(from);
    setDraftTo(to);
    onChange({ checkIn: iso(from), checkOut: iso(to) });
    setOpen(false);
  }

  function setNights(n: number) {
    const base = draftFrom || fromDate || new Date();
    const co = addDays(base, n);
    setDraftFrom(base); setDraftTo(co);
    onChange({ checkIn: iso(base), checkOut: iso(co) });
    setOpen(false);
  }

  function display() {
    if (!fromDate) return 'Select dates';
    const fromTxt = format(fromDate, 'd MMM');
    const toTxt   = toDate ? format(toDate, 'd MMM yyyy') : '…';
    return `${fromTxt} → ${toTxt}${nights ? ` · ${nights}n` : ''}`;
  }

  const pickingTo = !!draftFrom && !draftTo;

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
          <div style={{ fontSize: 12, color: 'var(--c-fg-muted)', marginBottom: 8, fontWeight: 600 }}>
            {pickingTo ? 'Now pick the check-out date →' : 'Pick the check-in date'}
          </div>
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
            defaultMonth={fromDate || new Date()}
            selected={draftFrom ? { from: draftFrom, to: draftTo } : undefined}
            onDayClick={pickDay}
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
