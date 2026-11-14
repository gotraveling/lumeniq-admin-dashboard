/**
 * Shapes and helpers shared by the Hotelbeds certification screens.
 * Shapes mirror booking-engine-api src/suppliers/hotelbeds/mapping.js.
 */

export type Money = { amount: number; currency: string };

export type Penalty = { from: string; fromLocal: string | null; amount: number; currency: string | null; percent?: number };

export type HbxRate = {
  supplier: 'hotelbeds';
  roomTypeCode: string | null;
  roomTypeName: string;
  boardCode: string | null;
  boardName: string | null;
  ratePlan: string;
  rateKey: string;
  rateType: 'BOOKABLE' | 'RECHECK';
  requiresCheckRate: boolean;
  rateClass: string | null;
  paymentType: string | null;
  packaging: boolean;
  nightlyRate: Money;
  totalRate: Money;
  taxes?: {
    included: Array<{ name: string; amount: number; currency: string | null }>;
    excluded: Array<{ name: string; amount: number; currency: string | null }>;
  };
  refundable: boolean | null;
  nonRefundable: boolean | null;
  cancellationPolicy: string | null;
  cancellationPenalties: Penalty[];
  supplierCancellationDeadlineLocal: string | null;
  cancellationWindowClosed: boolean | null;
  rateCommentsId: string | null;
  rateComments: string | null;
  rateCommentsPending: boolean;
  promotions?: Array<{ code: string | null; name: string | null; remark: string | null }>;
  offers?: Array<{ code: string | null; name: string | null; amount: number }>;
  discountAmount?: number;
  grossTotal?: number;
  hotelMandatory: boolean;
  supplierSellingRate?: Money;
  sellingRateFloorApplied?: { from: number; to: number; currency: string };
  roomsLeft: number | null;
  roomCount: number;
  // Admin only — the proxy removes these for a certifier.
  _admin?: { net?: { totalAmount: number; currency: string }; markup?: { type: string; value: number; amount: number; ruleName?: string | null; sellingRateFloor?: boolean } };
};

export type HbxHotel = {
  code: number;
  name: string;
  categoryCode: string | null;
  categoryName: string | null;
  destinationCode: string | null;
  destinationName: string | null;
  zoneName: string | null;
  currency: string | null;
  available: boolean;
  rateCount: number;
  rates: HbxRate[];
};

export type RoomQuery = { adults: number; children: Array<number | null> };

export type SearchQuery = {
  mode: 'destination' | 'hotels';
  destinationCode: string;
  hotelCodes: string;
  checkIn: string;
  checkOut: string;
  rooms: RoomQuery[];
  sourceMarket: string;
  maxHotels: number;
};

export type AvailabilityResponse = {
  success: boolean;
  env: string;
  sourceMarket: string | null;
  hotels: HbxHotel[];
  request?: unknown;
  error?: string;
  message?: string;
  details?: string;
};

export type MappedBooking = {
  reference: string | null;
  clientReference: string | null;
  cancellationReference: string | null;
  status: string | null;
  creationDate: string | null;
  holder: { name?: string; surname?: string } | null;
  hotel: { code: number | null; name: string | null; categoryName: string | null; destinationName: string | null; zoneName: string | null; checkIn: string | null; checkOut: string | null };
  rooms: Array<{
    roomTypeName: string | null; boardName: string | null; status: string | null; rateClass: string | null;
    rateComments: string | null;
    paxes: Array<{ roomId: number; type: string; name: string | null; surname: string | null; age: number | null }>;
  }>;
  currency: string | null;
  totalSellingRate?: number | null;
  rateComments: string | null;
  cancellationPolicy: string | null;
  cancellationPenalties: Penalty[];
  refundable: boolean | null;
};

export type Voucher = {
  title: string;
  agency: string;
  hotel: { name: string | null; address: string | null; category: string | null; destination: string | null; phone: string | null };
  passengers: { holder: string | null; rooms: Array<{ room: number; names: string[]; childrenAges: number[] }> };
  booking: { reference: string | null; agencyReference: string | null; checkIn: string | null; checkOut: string | null; rooms: Array<{ roomType: string | null; board: string | null }>; rateComments: string | null };
  payableThrough: string;
};

/** Call our own proxy. Throws with the engine's message on a non-2xx. */
export async function hbx<T = any>(path: string, init?: { method?: 'GET' | 'POST' | 'DELETE'; body?: unknown }): Promise<T> {
  const res = await fetch(`/api/admin/hotelbeds/${path}`, {
    method: init?.method || 'GET',
    headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
    body: init?.body ? JSON.stringify(init.body) : undefined,
    cache: 'no-store',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.message || data?.details || data?.error || `HTTP ${res.status}`;
    throw new Error(String(msg));
  }
  return data as T;
}

export function money(m: Money | null | undefined): string {
  if (!m || m.amount == null) return '—';
  return `${m.currency} ${Number(m.amount).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function amount(n: number | null | undefined, currency: string | null | undefined): string {
  if (n == null) return '—';
  return money({ amount: n, currency: currency || '' });
}

export function nights(checkIn: string, checkOut: string): number {
  const ms = Date.parse(checkOut) - Date.parse(checkIn);
  return Math.max(1, Math.round(ms / 86400000));
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2027-02-15" → "Mon 15 Feb 2027". Date only, no timezone shift. */
export function day(iso: string | null | undefined): string {
  if (!iso) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  const wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getUTCDay()];
  return `${wd} ${+m[3]} ${MONTHS[+m[2] - 1]} ${m[1]}`;
}

/**
 * Hotelbeds states cancellation times in the DESTINATION's local time with
 * its offset ("2027-02-12T23:59:00+01:00"). Show that wall-clock time as
 * given — never converted to the viewer's zone — and say whose time it is.
 */
export function destinationLocal(s: string | null | undefined): string {
  if (!s) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/.exec(s);
  if (!m) return s;
  const off = !m[6] ? '' : m[6] === 'Z' ? 'UTC' : `UTC${m[6]}`;
  return `${+m[3]} ${MONTHS[+m[2] - 1]} ${m[1]}, ${m[4]}:${m[5]}${off ? ` (${off})` : ''}`;
}

/** Stars from a Hotelbeds category code: "4EST" → 4, "5LUX" → 5, "APTH4" → 4. */
export function starsOf(code: string | null | undefined, name?: string | null): number | null {
  const src = `${code || ''} ${name || ''}`;
  const m = /([1-5])/.exec(src);
  return m ? Number(m[1]) : null;
}

export function childAgesValid(rooms: RoomQuery[]): boolean {
  return rooms.every((r) => r.children.every((a) => a != null && a >= 0 && a <= 17));
}
