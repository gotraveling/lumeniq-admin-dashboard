/**
 * The FirstClass hotel voucher: the document a client takes to check-in.
 *
 * Replaces the supplier's own PDF for clients. RateHawk stamps every voucher
 * "PAID", meaning WE paid THEM, and their API cannot leave it off (confirmed by
 * their API team 2026-11-03). Tina sends vouchers before the client has paid
 * us, so that stamp told the client the wrong thing.
 *
 * Rules this document keeps, whoever ends up calling it:
 *   - No prices and no payment state. A voucher is proof of a room, not a bill.
 *   - The supplier is never named. The client booked with FirstClass.
 *   - The cancellation date is the supplier's (supplierCancellationDeadlineUtc),
 *     which is what the guest actually gets. Our own cancellationDeadlineUtc is
 *     earlier on purpose and is a consultant's cut-off, not the client's.
 *   - Taxes the supplier excluded are paid by the guest at the hotel, in the
 *     hotel's currency. They are listed as such and never converted.
 *
 * Pure: booking + hotel content in, a complete HTML document out. No fetching,
 * no React, no server-only imports, so the same function can render the email
 * version later.
 */
import { viaResizer } from './imageUrl';

/** The booking as GET /api/bookings/:id?include=references returns it. */
export type VoucherBooking = {
  internalBookingId: string;
  bookingId?: string | null;
  status?: string | null;
  confirmationNumber?: string | null;
  supplierReference?: string | null;
  hotelConfirmation?: string | null;
  guestInfo?: VoucherGuest | null;
  bookingDetails?: any;
  specialRequests?: string | null;
  createdAt?: string | null;
};

type VoucherGuest = { firstName?: string; lastName?: string; email?: string; phone?: string };

/** The fields of hotel-api /api/hotels/:id the voucher reads. */
export type VoucherHotel = {
  hotel_name?: string | null;
  address?: { text?: string | null } | string | null;
  city?: string | null;
  country?: string | null;
  star_rating?: number | null;
  check_in_time?: string | null;
  check_out_time?: string | null;
  phone?: string | null;
  images?: Array<string | { url?: string | null }> | null;
  main_image?: string | { url?: string | null } | null;
};

export type VoucherOptions = {
  /** On-screen "Print or save as PDF" bar. Leave off for email. */
  printBar?: boolean;
};

// Our details as the existing FirstClass booking confirmation prints them.
const FC = {
  logo: 'https://s3.ap-southeast-2.amazonaws.com/firstclass.com.au/wp-content/uploads/2022/07/19002926/fc.com_.au2_.png',
  tagline: 'Luxury First & Business Class Travel Specialists',
  phoneLocal: '1300 308 081',
  phoneIntl: '+61 2 9299 0088',
  email: 'travel@firstclass.com.au',
  web: 'firstclass.com.au',
  address: 'Level 20, 135 King Street, Sydney NSW 2000, Australia',
};

const TZ = 'Australia/Sydney';

const esc = (v: unknown): string =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

/**
 * Stay dates are calendar dates stored as midnight UTC. Format them in UTC, or
 * a Sydney reader would see the evening before.
 */
function fmtStayDate(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return String(iso).slice(0, 10);
  return new Intl.DateTimeFormat('en-AU', {
    timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
  }).format(d);
}

/** "15:00:00" → "15:00". Anything unexpected is shown as given. */
function fmtClock(t?: string | null): string {
  if (!t) return '';
  const m = /^(\d{1,2}):(\d{2})/.exec(String(t));
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : String(t);
}

function nightsBetween(a?: string | null, b?: string | null): number | null {
  if (!a || !b) return null;
  const n = Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * The supplier deadline is stored as UTC without a zone marker
 * ("2027-04-20T16:00:00"). Read it as UTC, and show Sydney time beside it
 * because that is where most of our clients read it.
 */
function fmtDeadline(raw: string): { utc: string; sydney: string } | null {
  const iso = /[zZ]|[+-]\d{2}:?\d{2}$/.test(raw) ? raw : `${raw}Z`;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  const opts: Intl.DateTimeFormatOptions = {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
  };
  return {
    utc: new Intl.DateTimeFormat('en-AU', { ...opts, timeZone: 'UTC' }).format(d) + ' UTC',
    sydney: new Intl.DateTimeFormat('en-AU', { ...opts, timeZone: TZ }).format(d) + ' Sydney time',
  };
}

function fmtIssued(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('en-AU', { timeZone: TZ, day: 'numeric', month: 'long', year: 'numeric' }).format(d);
}

/** Money paid at the desk, in the hotel's currency. Never converted. */
function fmtLocal(amount: number, currency: string): string {
  const n = new Intl.NumberFormat('en-AU', {
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2, maximumFractionDigits: 2,
  }).format(amount);
  return `${n} ${currency}`.trim();
}

/** Supplier tax codes ("city_tax") as words ("City tax"). */
function taxLabel(name?: string | null): string {
  const s = String(name || '').replace(/[_-]+/g, ' ').trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : 'Local tax';
}

/** Meal plan in words. Unknown codes fall back to the breakfast flag. */
function mealLabel(plan?: string | null, breakfast?: boolean | null): string {
  const key = String(plan || '').toLowerCase().replace(/[^a-z]/g, '');
  if (key.includes('allinclusive')) return 'All inclusive';
  if (key.includes('fullboard')) return 'Full board (breakfast, lunch and dinner)';
  if (key.includes('halfboard')) return 'Half board (breakfast and dinner)';
  if (key.includes('breakfast') || breakfast) return 'Breakfast included';
  if (key === 'nomeal' || key === 'roomonly' || breakfast === false) return 'Room only, no meals included';
  return plan ? String(plan) : '';
}

function fullName(g?: VoucherGuest | null): string {
  return [g?.firstName, g?.lastName].map(s => String(s || '').trim()).filter(Boolean).join(' ');
}

function occupancyLabel(adults: number, childAges: number[]): string {
  const parts: string[] = [];
  if (adults) parts.push(`${adults} adult${adults === 1 ? '' : 's'}`);
  const infants = childAges.filter(a => Number(a) < 2).length;
  const kids = childAges.filter(a => Number(a) >= 2);
  if (kids.length) parts.push(`${kids.length} child${kids.length === 1 ? '' : 'ren'} (age ${kids.join(', ')})`);
  if (infants) parts.push(`${infants} infant${infants === 1 ? '' : 's'}`);
  return parts.join(', ');
}

function hotelImage(h: VoucherHotel): string | null {
  // Images arrive as a string (RateHawk) or as { url } (our own uploads).
  const pick = (x: unknown): string | null =>
    typeof x === 'string' ? x : (x && typeof (x as any).url === 'string' ? (x as any).url : null);
  return pick(h.main_image) || pick(h.images?.[0]) || null;
}

/** The consultant who placed it, as the console stamps it on the booking. */
function consultantOf(b: VoucherBooking): string | null {
  return /\[Booked on behalf by ([^\]]+)\]/.exec(b.specialRequests || '')?.[1]?.trim() || null;
}

type RoomLine = { names: string[]; occupancy: string };

/**
 * One line per room: who is in it and how many. Names come from the room's own
 * guest record, then the search's roomGuests, then the lead guest for room 1.
 */
function roomLines(b: VoucherBooking): RoomLine[] {
  const d = b.bookingDetails || {};
  const sp = d.searchParams || {};
  const occ: any[] = Array.isArray(sp.guests) && sp.guests.length
    ? sp.guests
    : [{ adults: sp.adults, children: sp.childrenAges || sp.children || [] }];
  const count = Math.max(Number(sp.rooms) || 0, occ.length, Array.isArray(d.rooms) ? d.rooms.length : 0, 1);
  const out: RoomLine[] = [];
  for (let i = 0; i < count; i++) {
    const room = Array.isArray(d.rooms) ? d.rooms[i] : null;
    const names = new Set<string>();
    for (const g of Array.isArray(room?.guests) ? room.guests : []) {
      const n = fullName(g); if (n) names.add(n);
    }
    const own = fullName(room?.guestInfo); if (own) names.add(own);
    const fromSearch = fullName(Array.isArray(sp.roomGuests) ? sp.roomGuests[i] : null);
    if (fromSearch) names.add(fromSearch);
    if (!names.size && i === 0) { const lead = fullName(b.guestInfo); if (lead) names.add(lead); }
    const o = occ[i] || {};
    const ages: number[] = (Array.isArray(o.children) ? o.children : []).map(Number).filter((n: number) => Number.isFinite(n));
    out.push({ names: [...names], occupancy: occupancyLabel(Number(o.adults) || 0, ages) });
  }
  return out;
}

/** What the guest settles at the property, per tax, in its own currency. */
function payableAtHotel(terms: any): Array<{ label: string; amount: string }> {
  const taxes = terms?.taxes || {};
  const named = (Array.isArray(taxes.excluded) ? taxes.excluded : [])
    .filter((t: any) => Number(t?.amount) > 0)
    .map((t: any) => ({ label: taxLabel(t.name || t.type), amount: fmtLocal(Number(t.amount), String(t.currency || '').toUpperCase()) }));
  if (named.length) return named;
  // Older snapshots kept only the per-currency sums.
  return (Array.isArray(taxes.excludedAtHotel) ? taxes.excludedAtHotel : [])
    .filter((t: any) => Number(t?.amount) > 0)
    .map((t: any) => ({ label: 'Local taxes', amount: fmtLocal(Number(t.amount), String(t.currency || '').toUpperCase()) }));
}

function cancellationText(terms: any): { title: string; detail?: string } {
  const raw = terms?.supplierCancellationDeadlineUtc;
  if (terms?.refundable === false) return { title: 'Non-refundable', detail: 'This booking cannot be cancelled or changed without charge.' };
  if (raw) {
    const d = fmtDeadline(String(raw));
    if (d) {
      const past = Date.parse(/[zZ]$/.test(raw) ? raw : `${raw}Z`) < Date.now();
      return past
        ? { title: 'Free cancellation has ended', detail: `It ended on ${d.utc} (${d.sydney}).` }
        : { title: `Free cancellation until ${d.utc}`, detail: `That is ${d.sydney}. After this the booking cannot be cancelled without charge.` };
    }
  }
  return { title: 'Cancellation terms', detail: 'Please ask your FirstClass consultant before making any change.' };
}

export function renderClientVoucher(
  booking: VoucherBooking,
  hotel: VoucherHotel,
  opts: VoucherOptions = {},
): string {
  const d = booking.bookingDetails || {};
  const sp = d.searchParams || {};
  const terms = d.rateTerms || d.rateSnapshot || {};

  const hotelName = hotel.hotel_name || 'Your hotel';
  const address = typeof hotel.address === 'string' ? hotel.address : hotel.address?.text || '';
  const place = [hotel.city, hotel.country].filter(Boolean).join(', ');
  // Stars only when the hotel has a real rating; never a flattering default.
  const stars = Number(hotel.star_rating);
  const starRow = Number.isFinite(stars) && stars > 0
    ? `<div class="stars" aria-label="${esc(Math.round(stars))} star hotel">${'★'.repeat(Math.min(5, Math.round(stars)))}</div>`
    : '';
  // Through our own image host: smaller, and the supplier's CDN address never
  // appears in a document the client keeps. No fallback to the original for
  // the same reason; a missing photo leaves a plain gold panel.
  const img = hotelImage(hotel);
  const imgSrc = img ? viaResizer(img, 800) || img : null;

  const nights = nightsBetween(sp.checkIn, sp.checkOut);
  const checkInTime = fmtClock(hotel.check_in_time);
  const checkOutTime = fmtClock(hotel.check_out_time);

  // What the guest quotes at the desk: the hotel's own number when it has
  // sent one, otherwise the reservation number the hotel can find it by.
  // Not confirmationNumber: for RateHawk that is their internal room number,
  // which the hotel has never seen.
  const hcn = booking.hotelConfirmation || null;
  const reservation = booking.supplierReference || null;

  const rooms = roomLines(booking);
  const meal = mealLabel(terms.ratePlan, terms.breakfastIncluded);
  const atHotel = payableAtHotel(terms);
  const cancel = cancellationText(terms);
  const consultant = consultantOf(booking);
  const confirmed = String(booking.status || '').toLowerCase() === 'confirmed';
  const issued = fmtIssued(booking.createdAt);

  const roomRows = rooms.map((r, i) => `
          <div class="kv">
            <div class="k">${rooms.length > 1 ? `Room ${i + 1}` : 'Guests'}</div>
            <div class="v">${r.names.length ? esc(r.names.join(', ')) : '<span class="muted">Name to be advised</span>'}${r.occupancy ? `<div class="sub">${esc(r.occupancy)}</div>` : ''}</div>
          </div>`).join('');

  // A row in the room card rather than a section of its own: it is part of
  // what the guest needs to know about this stay, and it keeps the page to
  // one A4 sheet.
  const atHotelRow = atHotel.length ? `
          <div class="kv">
            <div class="k">Payable at the hotel</div>
            <div class="v">
              ${atHotel.map(t => `<div class="fee"><span>${esc(t.label)}</span><span class="amt">${esc(t.amount)}</span></div>`).join('')}
              <div class="sub">Not included in your booking. The hotel collects this from you directly, in local currency.</div>
            </div>
          </div>` : '';

  const pendingBanner = confirmed ? '' : `
    <div class="banner keep">Awaiting confirmation. This voucher is not valid for check-in until your booking is confirmed.</div>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>Hotel voucher ${esc(booking.internalBookingId)} · FirstClass</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Libre+Caslon+Text:wght@400;700&display=swap" rel="stylesheet">
<style>
  :root {
    --gold: #9c8a62;        /* FirstClass primary gold (firstclass-next brand-500) */
    --gold-deep: #7a5a1e;   /* text-weight gold, readable on white */
    --gold-soft: #f3efdc;
    --paper: #ffffff;
    --canvas: #faf8f2;
    --ink: #1c1a16;
    --ink-soft: #4a463e;
    --muted: #77716a;
    --line: #e7e0c1;
    --serif: 'Libre Caslon Text', Georgia, 'Times New Roman', serif;
    --sans: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    background: var(--canvas); color: var(--ink);
    font-family: var(--sans); font-size: 14px; line-height: 1.55;
    -webkit-font-smoothing: antialiased;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  .printbar {
    max-width: 210mm; margin: 0 auto; padding: 16px 16px 0;
    display: flex; justify-content: flex-end;
  }
  .printbar button {
    font: 500 13px var(--sans); color: #fff; background: var(--gold-deep);
    border: 0; border-radius: 6px; padding: 9px 16px; cursor: pointer;
  }
  .printbar button:hover { background: #5f4615; }
  .page {
    max-width: 210mm; margin: 16px auto 40px; background: var(--paper);
    padding: 14mm 15mm 12mm; box-shadow: 0 1px 2px rgba(0,0,0,.04), 0 8px 28px rgba(60,45,10,.08);
    border-top: 4px solid var(--gold);
  }

  /* Masthead */
  .mast { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; }
  .brand img { height: 40px; width: auto; display: block; }
  .brand .tag { margin-top: 6px; font-size: 11px; letter-spacing: .04em; color: var(--muted); }
  .doc { text-align: right; }
  .eyebrow { font-size: 10.5px; font-weight: 600; letter-spacing: .16em; text-transform: uppercase; color: var(--gold-deep); }
  .doc .title { font-family: var(--serif); font-size: 26px; line-height: 1.15; margin: 4px 0 6px; }
  .doc .meta { font-size: 12px; color: var(--muted); }
  .doc .meta b { color: var(--ink); font-weight: 600; font-variant-numeric: tabular-nums; }
  .rule { height: 1px; background: linear-gradient(90deg, var(--gold), var(--line) 60%, transparent); margin: 18px 0 22px; border: 0; }

  .banner {
    background: #fff4e5; border: 1px solid #f0c98a; color: #7a4500;
    padding: 10px 14px; border-radius: 6px; font-weight: 600; font-size: 13px; margin-bottom: 18px;
  }

  /* Hotel */
  .hotel { display: grid; grid-template-columns: 210px 1fr; gap: 22px; align-items: start; }
  .hotel .photo { width: 210px; height: 150px; border-radius: 4px; overflow: hidden; background: var(--gold-soft); }
  .hotel .photo img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .hotel h2 { font-family: var(--serif); font-weight: 700; font-size: 24px; line-height: 1.2; margin: 2px 0 6px; }
  .stars { color: var(--gold); letter-spacing: 2px; font-size: 13px; margin-bottom: 6px; }
  .hotel .addr { color: var(--ink-soft); }
  .hotel .phone { color: var(--ink-soft); margin-top: 2px; }

  /* Stay */
  .stay {
    display: grid; grid-template-columns: 1fr 1fr auto; margin-top: 22px;
    border: 1px solid var(--line); border-radius: 6px; overflow: hidden;
  }
  .stay > div { padding: 14px 18px; }
  .stay > div + div { border-left: 1px solid var(--line); }
  .stay .k { font-size: 10.5px; font-weight: 600; letter-spacing: .14em; text-transform: uppercase; color: var(--gold-deep); }
  .stay .date { font-family: var(--serif); font-size: 19px; margin-top: 4px; }
  .stay .time { font-size: 12.5px; color: var(--muted); }
  .stay .nights { background: var(--gold-soft); text-align: center; min-width: 110px; }
  .stay .nights .n { font-family: var(--serif); font-size: 30px; line-height: 1.1; margin-top: 2px; }

  /* References */
  .refs { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 12px; margin-top: 14px; }
  .ref { border: 1px solid var(--line); border-radius: 6px; padding: 10px 14px; }
  .ref.primary { border-color: var(--gold); background: #fffdf7; }
  .ref .k { font-size: 11px; color: var(--muted); }
  .ref .v { font-size: 16px; font-weight: 600; font-variant-numeric: tabular-nums; letter-spacing: .02em; margin-top: 2px; word-break: break-all; }
  .ref .hint { font-size: 11px; color: var(--muted); margin-top: 2px; }

  /* Sections */
  .card { margin-top: 26px; }
  h3 {
    font-family: var(--serif); font-weight: 400; font-size: 17px; margin: 0 0 10px;
    padding-bottom: 6px; border-bottom: 1px solid var(--line);
  }
  .room-name { font-weight: 600; font-size: 15px; margin-bottom: 10px; }
  .kv { display: grid; grid-template-columns: 160px 1fr; gap: 16px; padding: 7px 0; }
  .kv + .kv { border-top: 1px dashed #eee7d2; }
  .kv .k { color: var(--muted); font-size: 13px; }
  .kv .v { font-weight: 500; }
  .kv .sub { font-weight: 400; color: var(--muted); font-size: 12.5px; }
  .muted { color: var(--muted); font-weight: 400; }
  .fee { display: flex; gap: 12px; max-width: 360px; justify-content: space-between; }
  .fee .amt { font-weight: 600; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .two { display: grid; grid-template-columns: 1fr 1fr; gap: 28px; }
  ul.notes { margin: 0; padding-left: 18px; color: var(--ink-soft); font-size: 12.5px; }
  ul.notes li + li { margin-top: 6px; }

  /* Contact */
  .contact {
    margin-top: 28px; padding: 16px 18px; background: var(--canvas);
    border: 1px solid var(--line); border-radius: 6px;
    display: grid; grid-template-columns: 1.2fr 1fr; gap: 18px; font-size: 12.5px;
  }
  .contact .k { font-size: 10.5px; font-weight: 600; letter-spacing: .14em; text-transform: uppercase; color: var(--gold-deep); margin-bottom: 4px; }
  .contact a { color: var(--ink); text-decoration: none; }
  .foot { margin-top: 18px; text-align: center; font-size: 11px; color: var(--muted); }

  .keep { break-inside: avoid; page-break-inside: avoid; }

  @media (max-width: 640px) {
    .page { margin: 0; padding: 22px 16px 28px; box-shadow: none; }
    .mast { flex-direction: column; gap: 14px; }
    .doc { text-align: left; }
    .hotel { grid-template-columns: 1fr; gap: 14px; }
    .hotel .photo { width: 100%; height: 190px; }
    .stay { grid-template-columns: 1fr 1fr; }
    .stay .nights { grid-column: 1 / -1; border-left: 0 !important; border-top: 1px solid var(--line); display: flex; gap: 10px; align-items: baseline; justify-content: center; }
    .refs { grid-template-columns: 1fr; }
    .kv { grid-template-columns: 1fr; gap: 2px; }
    .two, .contact { grid-template-columns: 1fr; }
  }

  @page { size: A4; margin: 12mm; }
  @media print {
    body { background: #fff; font-size: 12.5px; }
    .printbar { display: none; }
    .page { max-width: none; margin: 0; padding: 0; box-shadow: none; border-top: 0; }
    /* Sized so a typical one-room stay fits one A4 sheet. */
    .rule { margin: 12px 0 16px; }
    .hotel .photo { width: 160px; height: 112px; }
    .hotel { grid-template-columns: 160px 1fr; gap: 18px; }
    .hotel h2 { font-size: 21px; }
    .stay { margin-top: 16px; }
    .stay > div { padding: 10px 16px; }
    .refs { margin-top: 10px; }
    .card { margin-top: 16px; }
    h3 { margin-bottom: 6px; }
    .kv { padding: 5px 0; }
    ul.notes { font-size: 11.5px; }
    ul.notes li + li { margin-top: 3px; }
    .brand img { height: 34px; }
    .doc .title { font-size: 22px; }
    .stay .date { font-size: 17px; margin-top: 2px; }
    .stay .nights .n { font-size: 26px; }
    .ref { padding: 7px 12px; }
    .ref .v { font-size: 15px; }
    .room-name { margin-bottom: 6px; }
    .contact { margin-top: 16px; padding: 10px 14px; }
    /* The masthead already carries the tagline; on paper it is one line too many. */
    .foot { display: none; }
    a { color: inherit; }
  }
</style>
</head>
<body>
${opts.printBar ? `<div class="printbar"><button type="button" onclick="window.print()">Print or save as PDF</button></div>` : ''}
<main class="page">
  <header class="mast keep">
    <div class="brand">
      <img src="${FC.logo}" alt="FirstClass.com.au" width="243" height="40">
      <div class="tag">${esc(FC.tagline)}</div>
    </div>
    <div class="doc">
      <div class="eyebrow">Hotel voucher</div>
      <div class="title">${esc(booking.internalBookingId)}</div>
      ${issued ? `<div class="meta">Booked <b>${esc(issued)}</b></div>` : ''}
    </div>
  </header>
  <hr class="rule">
  ${pendingBanner}

  <section class="hotel keep">
    <div class="photo">${imgSrc ? `<img src="${esc(imgSrc)}" alt="${esc(hotelName)}" onerror="this.remove()">` : ''}</div>
    <div>
      ${starRow}
      <h2>${esc(hotelName)}</h2>
      ${address ? `<div class="addr">${esc(address)}</div>` : ''}
      ${place && !address.includes(String(hotel.country || '~')) ? `<div class="addr">${esc(place)}</div>` : ''}
      ${hotel.phone ? `<div class="phone">${esc(hotel.phone)}</div>` : ''}
    </div>
  </section>

  <section class="stay keep">
    <div>
      <div class="k">Check-in</div>
      <div class="date">${esc(fmtStayDate(sp.checkIn))}</div>
      ${checkInTime ? `<div class="time">from ${esc(checkInTime)}</div>` : ''}
    </div>
    <div>
      <div class="k">Check-out</div>
      <div class="date">${esc(fmtStayDate(sp.checkOut))}</div>
      ${checkOutTime ? `<div class="time">until ${esc(checkOutTime)}</div>` : ''}
    </div>
    ${nights ? `<div class="nights"><div class="k">${nights === 1 ? 'Night' : 'Nights'}</div><div class="n">${nights}</div></div>` : ''}
  </section>

  <section class="refs keep">
    ${hcn ? `<div class="ref primary"><div class="k">Hotel confirmation</div><div class="v">${esc(hcn)}</div><div class="hint">Quote this at check-in</div></div>` : ''}
    ${reservation ? `<div class="ref${hcn ? '' : ' primary'}"><div class="k">Reservation number</div><div class="v">${esc(reservation)}</div>${hcn ? '' : '<div class="hint">Quote this at check-in</div>'}</div>` : ''}
    <div class="ref"><div class="k">FirstClass reference</div><div class="v">${esc(booking.internalBookingId)}</div></div>
  </section>

  <section class="card keep">
    <h3>Your room</h3>
    ${terms.roomTypeName ? `<div class="room-name">${esc(terms.roomTypeName)}</div>` : ''}
    ${roomRows}
    ${meal ? `<div class="kv"><div class="k">Meals</div><div class="v">${esc(meal)}</div></div>` : ''}
    ${terms.transfer ? `<div class="kv"><div class="k">Also included</div><div class="v">${esc(terms.transfer)}</div></div>` : ''}
    ${atHotelRow}
    <div class="kv"><div class="k">Cancellation</div><div class="v">${esc(cancel.title)}${cancel.detail ? `<div class="sub">${esc(cancel.detail)}</div>` : ''}</div></div>
  </section>

  <section class="card keep">
    <h3>Please note</h3>
    <ul class="notes">
      <li>Please present this voucher and photo ID for every guest at check-in. The name on the booking must match the lead guest's ID.</li>
      <li>Hotels may charge mandatory fees payable by the guest directly at the property, including but not limited to resort fees, facility fees, city or tourist taxes, and fees for foreign visitors.</li>
      <li>The hotel may ask for a credit card or cash deposit at check-in as a guarantee for extras such as the mini-bar, room service or telephone calls.</li>
      <li>Bed type and special requests are subject to availability at check-in and are not guaranteed.</li>
    </ul>
  </section>

  <section class="contact keep">
    <div>
      <div class="k">Need help? Contact FirstClass</div>
      <div>Australia <a href="tel:1300308081">${esc(FC.phoneLocal)}</a> &nbsp;·&nbsp; International <a href="tel:+61292990088">${esc(FC.phoneIntl)}</a></div>
      <div><a href="mailto:${FC.email}">${esc(FC.email)}</a> &nbsp;·&nbsp; ${esc(FC.web)}</div>
      <div class="muted">${esc(FC.address)}</div>
    </div>
    ${consultant ? `<div>
      <div class="k">Your consultant</div>
      <div><a href="mailto:${esc(consultant)}">${esc(consultant)}</a></div>
    </div>` : ''}
  </section>

  <div class="foot">FirstClass.com.au · ${esc(FC.tagline)}</div>
</main>
</body>
</html>`;
}
