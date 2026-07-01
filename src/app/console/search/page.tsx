'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth } from '@/lib/firebase';
import { Search, Star, MapPin, Loader2, ArrowLeft, Sparkles, Filter, Pencil, CheckCircle2, AlertTriangle, X, Plus, Maximize2, Minimize2, Image as ImageIcon, StickyNote } from 'lucide-react';
import DestinationAutocomplete, { type DestinationAutocompleteHandle } from '@/components/console/DestinationAutocomplete';
import CountryPicker from '@/components/console/CountryPicker';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import DateRangePicker from '@/components/console/DateRangePicker';
import GuestSelector, { type RoomGuests } from '@/components/console/GuestSelector';

// Pre-fill pills — the agent panel handles open-ended discovery; these
// pills are for the consultant who already knows the brief.
const PROMPT_PILLS: Array<{ label: string; q: string; nights: number; rooms: RoomGuests[] }> = [
  { label: 'Dubai · 3n · 2 adults',         q: 'Dubai',       nights: 3, rooms: [{ adults: 2, childrenAges: [] }] },
  { label: 'LA · 2n · 2 adults',            q: 'Los Angeles', nights: 2, rooms: [{ adults: 2, childrenAges: [] }] },
  { label: 'Maldives · 5n · 2 adults',      q: 'Maldives',    nights: 5, rooms: [{ adults: 2, childrenAges: [] }] },
  { label: 'Bali · 6n · 2 adults + 2 kids', q: 'Bali',        nights: 6, rooms: [{ adults: 2, childrenAges: [7, 9] }] }
];

type HotelHit = {
  id: number;
  name: string;
  city?: string;
  country?: string;
  starRating?: number;
  image?: string | null;
  sources: string[];
  // Canonical-merge metadata (server-side dedupe): when the same
  // physical property has records under multiple suppliers, the
  // backend collapses them into one hit. linkedHotelIds names every
  // supplier id mapped to the canonical so the rates fan-out can
  // call each supplier.
  canonicalId?: number | null;
  linkedHotelIds?: number[];
  // Enriched after the compare call:
  priced?: {
    available: boolean;
    // Why a hotel came back unavailable, straight from the compare API
    // (`supplier_error` | `no_rates` | `no_data` | `hotel_excluded_from_search`).
    // `supplier_error`/`no_data` are TRANSIENT (supplier timeout / rate-limit /
    // cold start) — distinct from a genuine `no_rates` sold-out. We keep this so
    // a slow-but-working search isn't rendered as "0 bookable".
    reason?: string;
    // Set when `reason` is transient AND we have a retry pending for this hotel.
    // Retryable hotels render as still-resolving (skeleton), never as
    // "unavailable", so an in-flight retry can't make the page look empty.
    retryable?: boolean;
    supplier?: string;          // cheapest-supplier surfaced on the card (= cheapestSupplier from compare)
    sellNightly?: number;
    sellTotal?: number;
    // Derived AUD display layer (from pricing.aud) — primary figure on the
    // card. USD (sellNightly/sellTotal) shown small beneath. Never recomputed
    // here; rendered straight from the API.
    sellNightlyAud?: number;
    sellTotalAud?: number;
    fxRate?: number;
    netNightly?: number;
    netTotal?: number;
    markupPct?: number;
    currency?: string;
    roomTypeName?: string;
    ratePlan?: string;
    refundable?: boolean;
    breakfastIncluded?: boolean | null;
    cancellationDeadlineUtc?: string | null;
    // Transfer-bundled label on the cheapest rate (Hummingbird, e.g. "Seaplane");
    // null = room-only. Feeds the subtle "incl." note on the card.
    transferLabel?: string | null;
    ratesCount?: number;
    onRequest?: boolean;
    // Multi-supplier quotes (one per linked supplier). When length > 1
    // we render stacked quote rows on the card so consultant can
    // compare and pick. The recommended-by-score gets a gold border.
    quotes?: Quote[];
  };
};

type Quote = {
  supplier: string | null;
  available: boolean;
  reason?: string;
  sellNightly?: number;
  sellTotal?: number;
  // Derived AUD (from cheapestRate.pricing.aud) — display only.
  sellNightlyAud?: number;
  sellTotalAud?: number;
  fxRate?: number;
  netNightly?: number;
  markupPct?: number;
  markupAmount?: number;
  currency?: string;
  ratePlan?: string;
  refundable?: boolean | null;
  breakfastIncluded?: boolean | null;
  cancellationDeadlineUtc?: string | null;
  ratesCount?: number;
  // Promo offer on the cheapest rate (the one the card price reflects), so the
  // search card can badge "offer applied". [{name, code}], Hummingbird only.
  offers?: Array<{ name: string | null; code: string | null }>;
  // Transfer-bundled label on the cheapest rate (Hummingbird, e.g. "Seaplane").
  // Present means the card price already includes that transfer; null = room-only.
  transferLabel?: string | null;
};

type AdminRate = {
  supplier: string;
  // RateHawk channel that produced this rate: 'cug' (member) or 'b2c'.
  // Drives the per-rate badge + which credentials prebook/booking use.
  _channel?: 'cug' | 'b2c';
  rateKey: string;
  roomTypeName: string;
  // Precise sub-variant from static content (room_groups[].name on
  // RateHawk, room_types[].name on Hummingbird). RateHawk often
  // refines "Ocean Villa" → "Ocean Villa, 1 king bed, ocean view".
  // Frontend groups by this so view/bedding/floor variations become
  // separate cards instead of getting flattened.
  roomGroupName?: string | null;
  ratePlan: string;
  refundable: boolean;
  breakfastIncluded: boolean;
  roomImage?: string | null;
  // Tier of rg_ext / name match that resolved roomImage + roomGroupName.
  // 'strict' = ETG §2.4 (all 12 rg_ext fields). Degraded tiers
  // (class_bedding / class) cover sandbox rg_ext drift on luxury cert
  // hotels — Valentin, ETG 2026-05-27. Surfaced behind ?debug=rgmatch.
  matchTier?: 'strict' | 'class_bedding' | 'class' | 'name' | 'none' | null;
  cancellationPolicy?: string | null;
  cancellationDeadlineUtc?: string | null;
  // ETG cert §6 — included/excluded split from supplier. Sidebar
  // itemises excluded taxes on top of the rate; included taxes are
  // already in pricing.sell.totalAmount and must never be re-summed.
  taxes?: {
    included?: Array<{ name?: string; type?: string; amount: number; currency?: string }>;
    excluded?: Array<{ name?: string; type?: string; amount: number; currency?: string }>;
    excludedTotal?: number;
  } | null;
  pricing: {
    currency: string;
    net?: { totalAmount: number; nightlyAmount: number; aud?: AudBlock | null };
    sell?: { totalAmount: number; nightlyAmount: number };
    // Derived AUD display layer for the sell price (additive — USD sell above
    // is the booking basis and is unchanged). Render-only, never recomputed.
    aud?: AudBlock | null;
    markup?: { type: string; value: number; amount: number; ruleName?: string };
  };
  // Promotional OFFER metadata (Hummingbird deal.offers[]). Structured as
  // { name, code } so admins see which promo produced the price AND its supplier
  // reference code. `discountAmount`/`grossTotal` are in the rate's own currency
  // (pricing.currency). Present only when the supplier attached a promo.
  offers?: Array<{ name: string | null; code: string | null }>;
  discountAmount?: number;
  grossTotal?: number;
  // Transfer-bundled label (Hummingbird, e.g. "Seaplane"/"Speedboat"). Present
  // means the rate PRICE already includes that transfer. Absent = room-only
  // (RateHawk sells transfers separately). DISTINCT from the HotelControl
  // `transfer_type` field — this is the supplier rate's bundled-transfer label.
  transfer?: string | null;
};

// Derived AUD display block emitted by the backend (pricing.aud / net.aud).
type AudBlock = {
  nightlyAmount: number | null;
  totalAmount: number | null;
  currency: string;
  fxRate: number;
};

// Per-hotel control row (hotel-api /api/control). Numeric fields come back
// as STRINGS from postgres numeric/int columns — Number() them at the edge.
type NetworkStatus = 'active' | 'paused' | 'hidden' | 'deleted';
type LuxuryTier = '5plus' | '5plusplus';
type ProximityTier = 'in-terminal' | 'connected' | 'walkable' | 'short-shuttle' | 'off-airport';
type HotelControl = {
  hotel_id?: number;
  network_status?: NetworkStatus | null;
  // Luxury curation tier: null (standard 5★) | '5plus' (5★+) | '5plusplus' (5★++).
  // Reflected to Meili by the backend so curated tier chips can filter on it.
  luxury_tier?: LuxuryTier | null;
  use_ratehawk?: boolean | null;
  // Generalized per-hotel supplier block list (text[] on hotel_control).
  // Supersedes use_ratehawk; use_ratehawk is kept written for back-compat.
  blocked_suppliers?: string[] | null;
  markup_override_pct?: string | number | null;
  // admin-controlled "Recommended" sort override (migration 021)
  recommend_rank?: string | number | null;
  transfer_type?: string | null;
  transfer_included_override?: boolean | null;
  transfer_cost_adult?: string | number | null;
  transfer_cost_child?: string | number | null;
  transfer_currency?: string | null;
  transfer_duration?: string | null;
  transfer_notes?: string | null;
  airport_code?: string | null;
  airport_terminal?: string | null;
  proximity_tier?: ProximityTier | null;
  airside?: boolean | null;
  walk_minutes?: string | number | null;
  day_use?: boolean | null;
  internal_notes?: string | null;
  // Marketing / Offer (featured-product copy + advertised pricing window)
  promotion_name?: string | null;
  offers?: string[] | null;
  stay_from?: string | null;
  stay_until?: string | null;
  advertise_stay_until?: string | null;
  book_by?: string | null;
  min_nights?: string | number | null;
  package_nights?: string | number | null;
  terms_conditions?: string | null;
  competitor_comparison?: CompetitorRow[] | null;
  attributes?: Record<string, any> | null;
  updated_by?: string | null;
};

// A single competitor rate row for the featured-product comparison table.
type CompetitorRow = { name: string; rate: number | null; currency: string };

// Suppliers an admin can block per-hotel. Scales: add a supplier here and it
// shows up in the Manage panel + badges with no other code changes.
const BLOCKABLE_SUPPLIERS: Array<{ key: string; label: string; color: string }> = [
  { key: 'ratehawk',    label: 'RateHawk',    color: '#7c3aed' },
  { key: 'hummingbird', label: 'Hummingbird', color: '#1f6feb' },
];

// RateHawk image URLs embed a literal `{size}` token (e.g.
// https://cdn.worldota.net/t/{size}/ostrovok/...) that must be substituted with
// a real ETG size before use, or the <img>/background URL is invalid and renders
// blank. Hummingbird URLs are already resolved, so this is a no-op for them.
// Common sizes: 240x240 (thumb), 1024x768 (large), x500, original.
// Tolerant of runtime shapes: a bare URL string, an {url}/{src} object, or null —
// anything non-stringy returns undefined (blank box) instead of throwing, since
// a thrown .replace would take down the whole results render.
function resolveImg(url: unknown, size = '240x240'): string | undefined {
  let s: unknown = url;
  if (s && typeof s === 'object') {
    s = (s as { url?: string; src?: string }).url ?? (s as { src?: string }).src ?? null;
  }
  if (typeof s !== 'string' || !s) return undefined;
  return s.replace('{size}', size);
}

// Normalize a control row's blocked suppliers into a lowercase string[] that
// also folds the legacy use_ratehawk===false flag into 'ratehawk', so existing
// data renders correctly during the transition.
function blockedSuppliersOf(c?: HotelControl | null): string[] {
  const set = new Set<string>();
  if (Array.isArray(c?.blocked_suppliers)) {
    for (const s of c!.blocked_suppliers!) {
      if (s != null && String(s).trim()) set.add(String(s).trim().toLowerCase());
    }
  }
  if (c?.use_ratehawk === false) set.add('ratehawk');
  return Array.from(set);
}

// Name-relevance score of a hotel name against the search query, so a
// hotel-NAME search ("Fairmont Quasar Istanbul") pins the property the
// consultant actually typed to the top instead of letting the cheapest
// unrelated "Fairmont …" win on price. Returns 0 for destination-style
// queries (a single word like "Dubai") so those keep cheapest-first order.
function nameMatchScore(name: string | null | undefined, query: string): number {
  const n = String(name || '').toLowerCase();
  const qn = String(query || '').toLowerCase().trim();
  const tokens = qn.split(/\s+/).filter((t) => t.length >= 3);
  // Single-token query → treat as a destination search; don't reorder by name.
  if (tokens.length < 2) return 0;
  let hits = 0;
  for (const t of tokens) if (n.includes(t)) hits++;
  // Whole-name exact match gets a decisive boost over partial token matches.
  const exact = n === qn ? 10 : 0;
  return hits + exact;
}

// True when the hotel is in a state Tina should notice at a glance.
function controlFlagged(c?: HotelControl | null): boolean {
  if (!c) return false;
  const s = c.network_status;
  return (s === 'paused' || s === 'hidden' || s === 'deleted') || blockedSuppliersOf(c).length > 0;
}

function todayPlus(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

// Local-time today as YYYY-MM-DD. We compare check-in against this to reject
// past dates. Uses local date parts (not toISOString, which is UTC and can be
// a day off near midnight).
function todayIso() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

function isValidIsoDate(s: string | null | undefined): s is string {
  return !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

// Snap an arbitrary checkIn/checkOut pair to a valid, present-or-future range.
// Rules: checkIn must be >= today; checkOut must be > checkIn (min 1 night).
// When checkIn is in the past we slide the WHOLE range forward by the same
// number of nights so the consultant keeps their requested length of stay.
// Returns the (possibly unchanged) range plus whether anything was snapped.
function normalizeRange(ci: string, co: string): { checkIn: string; checkOut: string; snapped: boolean } {
  const today = todayIso();
  let inDate = isValidIsoDate(ci) ? ci : todayPlus(30);
  let outDate = isValidIsoDate(co) ? co : '';
  let snapped = false;

  const nightsBetween = (a: string, b: string) => {
    const d1 = new Date(a + 'T00:00:00');
    const d2 = new Date(b + 'T00:00:00');
    return Math.round((d2.getTime() - d1.getTime()) / 86400000);
  };

  // Derive the desired length of stay before we move anything.
  let nights = isValidIsoDate(outDate) ? nightsBetween(inDate, outDate) : 0;
  if (nights < 1) nights = 3;

  // Reject past check-in: slide forward to today, preserving nights.
  if (inDate < today) {
    inDate = today;
    snapped = true;
  }

  const addDaysIso = (d: string, n: number) => {
    const dt = new Date(d + 'T00:00:00');
    dt.setDate(dt.getDate() + n);
    const m = String(dt.getMonth() + 1).padStart(2, '0');
    const day = String(dt.getDate()).padStart(2, '0');
    return `${dt.getFullYear()}-${m}-${day}`;
  };

  // Ensure checkOut is strictly after checkIn (min 1 night).
  if (!isValidIsoDate(outDate) || outDate <= inDate) {
    outDate = addDaysIso(inDate, nights);
    snapped = true;
  }

  return { checkIn: inDate, checkOut: outDate, snapped };
}

export default function ConsoleSearchPage() {
  const [user] = useAuthState(auth);
  const sp = useSearchParams();
  const router = useRouter();

  // Push current search/detail context into the URL so refresh, share,
  // and back-button preserve state. Uses router.replace (not push) so
  // a long search session doesn't pollute browser history with every
  // edit. Mirrors only durable state — pending price enrichment and
  // transient UI flags stay in React.
  const syncUrl = (patch: Record<string, string | number | null | undefined>) => {
    const next = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === undefined || v === '') next.delete(k);
      else next.set(k, String(v));
    }
    // scroll:false — router.replace defaults to scrolling the window to the
    // top. Opening the detail drawer calls syncUrl({ hotelId }), which would
    // otherwise jump the left results list back to the top. Keep the scroll
    // position so the consultant can bounce between hotels.
    router.replace(next.toString() ? `/console/search?${next}` : '/console/search', { scroll: false });
  };

  // ─── Form state ─────────────────────────────────────────────
  const [q, setQ]               = useState('');
  const destRef                 = useRef<DestinationAutocompleteHandle>(null);
  const [checkIn, setCheckIn]   = useState(todayPlus(30));
  const [checkOut, setCheckOut] = useState(todayPlus(33));
  const [rooms, setRooms]       = useState<RoomGuests[]>([{ adults: 2, childrenAges: [] }]);
  // Citizenship of the GUEST — drives RateHawk's residency-based pricing.
  // ETG cert spec §3.8 requires this, and FirstClass's main market is AU
  // so default there.
  const [citizenship, setCitizenship] = useState('AU');

  // ─── Results state ──────────────────────────────────────────
  const [hits, setHits]                 = useState<HotelHit[]>([]);
  const [searching, setSearching]       = useState(false);
  const [enrichingPrices, setEnriching] = useState(false);
  const [searchErr, setSearchErr]       = useState<string | null>(null);
  // ─── "Load more" paging ─────────────────────────────────────
  // `total` is the backend's estimated total result count (Meili
  // estimatedTotalHits). `loadingMore` gates the button + spinner.
  // `lastSearchRef` snapshots the exact query/filter/dates the current
  // result set was fetched with so loadMore() pages the SAME search even
  // if the query box / chips / date picker have since changed.
  const [total, setTotal]             = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const lastSearchRef = useRef<{ q: string; filter?: string; checkIn: string; checkOut: string } | null>(null);

  // ─── Result filters ─────────────────────────────────────────
  const [filterSupplier,    setFilterSupplier]    = useState<'all' | 'ratehawk' | 'hummingbird'>('all');
  const [filterRefundable,  setFilterRefundable]  = useState(false);
  const [showUnavailable,   setShowUnavailable]   = useState(false);

  // ─── B2B profile picker + 5★ tier chips (compose into the Meili filter
  //     that the hotel search posts). The picker loads saved profiles and
  //     resolves a profile to its compiled Meili filter string; the tier
  //     chips add luxury_tier clauses. All AND-combined. ─────────────────
  type ProfileLite = { slug: string; name?: string; title?: string; status?: string };
  const [profiles, setProfiles]           = useState<ProfileLite[]>([]);
  const [activeProfile, setActiveProfile] = useState<ProfileLite | null>(null);
  const [profileFilter, setProfileFilter] = useState<string>('');  // compiled Meili filter for the active profile
  const [tierChip, setTierChip]           = useState<LuxuryTier | null>(null);

  // Load the profile list once on mount (cheap, read-only).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/admin/profiles?status=all', { cache: 'no-store' });
        const json = await res.json().catch(() => null);
        const list: ProfileLite[] = Array.isArray(json?.profiles) ? json.profiles
          : Array.isArray(json?.data) ? json.data
          : Array.isArray(json) ? json : [];
        if (!cancelled) setProfiles(list);
      } catch { /* picker just stays empty */ }
    })();
    return () => { cancelled = true; };
  }, []);

  // Resolve a profile slug to its compiled Meili filter and activate it.
  // Returns the resolved filter string so callers can re-run the search with
  // the value directly (state set here is async and not yet flushed).
  async function selectProfile(slug: string): Promise<string> {
    if (!slug) { setActiveProfile(null); setProfileFilter(''); return ''; }
    const p = profiles.find(x => x.slug === slug) || { slug };
    setActiveProfile(p);
    try {
      const res = await fetch(`/api/admin/profiles/filter?slug=${encodeURIComponent(slug)}`, { cache: 'no-store' });
      const json = await res.json().catch(() => null);
      const filter = typeof json?.filter === 'string' ? json.filter : '';
      setProfileFilter(filter);
      return filter;
    } catch {
      setProfileFilter('');
      return '';
    }
  }

  // Combine a profile filter + tier chip into one Meili filter string
  // (AND-joined). Args default to current state, but callers can pass the
  // freshly-resolved values when their state-setters haven't flushed yet.
  // Returns undefined when neither is set so the search body omits `filter`.
  function composedFilter(pf: string = profileFilter, tc: LuxuryTier | null = tierChip): string | undefined {
    const clauses: string[] = [];
    if (pf.trim()) clauses.push(`(${pf.trim()})`);
    if (tc) clauses.push(`luxury_tier = "${tc}"`);
    return clauses.length ? clauses.join(' AND ') : undefined;
  }

  // ─── Per-hotel "Manage" control state ───────────────────────
  // Bulk-loaded control rows keyed by hotel id, so each result card can
  // show a state badge (paused/hidden/deleted/no-ratehawk) at a glance.
  // Re-fetched whenever the visible hit set changes; also refreshed for a
  // single hotel after the Manage panel saves it.
  const [controlMap, setControlMap] = useState<Record<number, HotelControl>>({});
  const refreshControl = (id: number, row: HotelControl | null) => {
    setControlMap(curr => {
      const next = { ...curr };
      if (row) next[id] = row; else delete next[id];
      return next;
    });
  };

  // ─── Detail view: right slide-over drawer over the (dimmed) results
  // list, so the consultant keeps the search results + scroll position
  // and can bounce between hotels. `detailExpanded` widens the drawer to
  // near-full-width for the form-heavy booking step. ─────────────────
  const [detailHotel, setDetailHotel]   = useState<HotelHit | null>(null);
  const [detailExpanded, setDetailExpanded] = useState(false);
  const [rates, setRates]               = useState<AdminRate[]>([]);
  const [ratesBusy, setRatesBusy]       = useState(false);
  const [ratesErr, setRatesErr]         = useState<string | null>(null);
  // Cross-supplier room map for the open hotel: lookup keyed by
  // `${supplier}|${normName(roomName)}` → { canonical group key, display label }.
  // Built from /api/admin/room-mappings TRUSTED rows (both hb + rh sides) so a
  // Hummingbird rate and a RateHawk rate for the same physical room collapse
  // into ONE card ("one room, both rates"). Soft-fails to empty (drawer must
  // never break on a mapping fetch error). Reset/refetch on hotel change.
  const [roomMap, setRoomMap] = useState<Map<string, { key: string; label: string }>>(new Map());
  // Lazy B2C compare: false until the consultant clicks "Compare B2C" on the
  // open hotel (so we don't pay 2x ETG calls on every search). Base channel
  // is always Member (cug); B2C rates are merged in on demand, tagged.
  const [b2cLoaded, setB2cLoaded]       = useState(false);
  const [b2cBusy,   setB2cBusy]         = useState(false);
  const [chosenRate, setChosenRate]     = useState<AdminRate | null>(null);
  // rate_decisions audit-trail identifiers. Set once when rates land,
  // re-used on /choose POST and forwarded into /api/bookings so the
  // backend can stamp the row with the booking id later.
  const [searchId, setSearchId]                       = useState<string | null>(null);
  const [recommendedRateKey, setRecommendedRateKey]   = useState<string | null>(null);
  // API consolidation block (services/presentRates) — source of truth for the
  // per-room meal/transfer matrix; falls back to the local builder when absent.
  const [presentation, setPresentation] = useState<any>(null);
  // Prebook state — set when the consultant picks a rate. We verify
  // availability + price BEFORE they fill the form. Per ETG cert §1.1
  // ("Moving prebook to the separate step is also highly recommended").
  type PrebookInfo = {
    prebookHash: string;
    // Truthful: did the supplier-locked sell price differ from the
    // search-time quote? Used for informational rendering and as the
    // LLM-readable signal in MCP responses.
    priceChanged: boolean;
    // Strict: did the supplier flip changes.price_changed=true? Per
    // ETG cert, this is the ONLY signal that gates the "Accept new
    // total" banner — silent shifts inside RH's own tolerance band
    // must not interrupt the consultant.
    supplierFlaggedChange: boolean;
    originalPrice?: number | null;
    newPrice?: number | null;
    currency?: string | null;
    isFreeCancellation?: boolean | null;
    partnerOrderId?: string;
    supplier?: string;
    skipped?: string;
  };
  const [prebook, setPrebook]               = useState<PrebookInfo | null>(null);
  const [prebookBusy, setPrebookBusy]       = useState(false);
  const [prebookErr, setPrebookErr]         = useState<string | null>(null);
  const [acceptedNewPrice, setAcceptedNewPrice] = useState(false);
  // Inline edit-search on the detail header.
  const [editingSearch, setEditingSearch] = useState(false);

  // ─── Book-on-behalf form ────────────────────────────────────
  const [custFirst, setCustFirst] = useState('');
  const [custLast,  setCustLast]  = useState('');
  const [custEmail, setCustEmail] = useState('');
  const [custPhone, setCustPhone] = useState('');
  // ETG cert §5 — per-room lead-guest names for multi-room bookings.
  // Indexes 0…N-2 hold names for rooms 2…N. Room 1 uses custFirst /
  // custLast (the main customer block).
  const [extraRoomGuests, setExtraRoomGuests] = useState<Array<{ firstName: string; lastName: string }>>([]);
  useEffect(() => {
    const extras = Math.max(0, rooms.length - 1);
    setExtraRoomGuests(prev => {
      if (prev.length === extras) return prev;
      return Array.from({ length: extras }, (_, i) => prev[i] || { firstName: '', lastName: '' });
    });
  }, [rooms.length]);
  const [bookingBusy,   setBookingBusy]   = useState(false);
  const [bookingErr,    setBookingErr]    = useState<string | null>(null);
  const [bookingResult, setBookingResult] = useState<any>(null);

  // ───────────────────────────────────────────────────────────
  // runSearch takes optional date overrides so the URL-restore path can
  // pass the dates it just parsed from the query string DIRECTLY, instead
  // of reading checkIn/checkOut from the React closure. The old code set
  // state then called runSearch() in the same tick — but setState is async,
  // so runSearch saw the STALE default dates (todayPlus(30/33)) and both
  // searched and re-wrote the URL with the wrong dates. That was the
  // observed drift between the URL, the picker, and what got searched.
  // filterOverride: pass the literal string 'AUTO' (default) to compute the
  // filter from current profile/tier state; pass a string|undefined to use an
  // explicit freshly-resolved filter (when the chip/profile state hasn't
  // flushed yet).
  async function runSearch(qOverride?: string, datesOverride?: { checkIn: string; checkOut: string }, filterOverride: string | undefined | 'AUTO' = 'AUTO') {
    const query = (qOverride !== undefined ? qOverride : q).trim();
    if (!query) return;

    // Always run through the past-date guard. Snap a past/invalid range
    // forward to a valid future range rather than silently searching the
    // past. Sync the (possibly snapped) range back to state + URL so the
    // picker, the URL, and the actual search never drift.
    const raw = datesOverride || { checkIn, checkOut };
    const norm = normalizeRange(raw.checkIn, raw.checkOut);
    if (norm.checkIn !== checkIn) setCheckIn(norm.checkIn);
    if (norm.checkOut !== checkOut) setCheckOut(norm.checkOut);
    if (norm.snapped) {
      setSearchErr(`Check-in cannot be in the past — dates adjusted to ${norm.checkIn} → ${norm.checkOut}.`);
    }
    const useCheckIn = norm.checkIn;
    const useCheckOut = norm.checkOut;

    // Encode the full per-room composition (adults + children ages
    // per room). URL form: r=2|3&r=4|5,8  → room 1 has 2 adults + 1
    // child age 3, room 2 has 4 adults + 2 children (ages 5 and 8).
    // Round-trips losslessly via paramsToRooms() on read. We keep
    // the legacy adults/rooms shorthand so AI-agent deep-links (which
    // only carry totals) still work.
    const r = rooms.map(rm =>
      `${rm.adults}${(rm.childrenAges && rm.childrenAges.length) ? '|' + rm.childrenAges.join(',') : ''}`
    );
    const next = new URLSearchParams(sp.toString());
    next.delete('r');
    r.forEach(v => next.append('r', v));
    next.delete('adults');
    next.delete('rooms');
    next.set('q', query);
    next.set('checkIn', useCheckIn);
    next.set('checkOut', useCheckOut);
    next.set('citizenship', citizenship);
    next.delete('hotelId');
    router.replace(`/console/search?${next.toString()}`);
    setSearching(true);
    if (!norm.snapped) setSearchErr(null);
    setHits([]);
    setDetailHotel(null);
    try {
      // Compose the active B2B profile filter + 5★ tier chip into the
      // search request. The booking-engine /api/admin/search/hotels handler
      // AND-s this `filter` string into its Meili query (see return summary
      // for the backend field it must accept).
      const extraFilter = filterOverride === 'AUTO' ? composedFilter() : filterOverride;
      const res = await fetch('/api/admin/search/hotels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ q: query, limit: 50, offset: 0, ...(extraFilter ? { filter: extraFilter } : {}) })
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'search failed');
      const initial: HotelHit[] = (json.data.hits || []).map((h: any) => ({ ...h }));
      setHits(initial);
      // Capture the total + the exact search inputs so loadMore() can page
      // the SAME query/filter/dates regardless of later UI state changes.
      setTotal(json.data.total ?? initial.length);
      lastSearchRef.current = { q: query, filter: extraFilter || undefined, checkIn: useCheckIn, checkOut: useCheckOut };
      // fire-and-forget price enrichment so the page paints fast.
      // Pass the normalized dates explicitly — enrichPrices otherwise
      // reads checkIn/checkOut from the closure, which has the same
      // stale-state problem on the URL-restore path.
      void enrichPrices(initial.map(h => h.id), { checkIn: useCheckIn, checkOut: useCheckOut });
    } catch (e: any) {
      setSearchErr(e.message || 'search failed');
    } finally {
      setSearching(false);
    }
  }

  // Retry budget for transient compare failures. The compare fan-out makes ONE
  // bulk supplier call per page; a single supplier timeout / 429 / cold start
  // marks the WHOLE page unavailable even though the hotels are bookable (the
  // backend correctly never caches that, so a manual re-search "just works").
  // We make that retry automatic and invisible: on a whole-page failure or on
  // hotels that came back with a transient `reason`, we re-probe ONCE before
  // letting anything render as genuinely unavailable. `attempt` caps recursion.
  async function enrichPrices(
    ids: number[],
    datesOverride?: { checkIn: string; checkOut: string },
    attempt = 0
  ) {
    if (ids.length === 0) return;
    const useCheckIn = datesOverride?.checkIn ?? checkIn;
    const useCheckOut = datesOverride?.checkOut ?? checkOut;
    const canRetry = attempt < 1;
    // When we schedule a retry we keep the global "enriching" flag ON so the UI
    // shows the spinner (not the "N unavailable hidden" line) across the gap.
    let retryScheduled = false;
    const scheduleRetry = (retryIds: number[]) => {
      if (!canRetry || retryIds.length === 0) return;
      retryScheduled = true;
      setTimeout(() => { void enrichPrices(retryIds, datesOverride, attempt + 1); }, 1500);
    };
    setEnriching(true);
    try {
      const body = {
        hotelIds: ids,
        checkIn: useCheckIn,
        checkOut: useCheckOut,
        guests: rooms.map(r => ({ adults: r.adults, children: r.childrenAges })),
        nationalityCode: citizenship
      };
      const res = await fetch('/api/admin/search/rates/compare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        // Whole-page failure (proxy timeout / 5xx / supplier rate-limit on the
        // bulk call). Re-probe the SAME ids once before giving up; leave the
        // cards in their pending (skeleton) state so the page never collapses
        // to "0 bookable" on a transient blip.
        scheduleRetry(ids);
        return;
      }
      const results: any[] = json.data.results || [];
      const byId = new Map<number, any>();
      for (const r of results) byId.set(Number(r.hotelId), r);
      // Hotels whose unavailability is transient → re-probe just those.
      const transientReasons = new Set(['supplier_error', 'no_data']);
      const retryIds = canRetry
        ? results.filter(r => !r.available && transientReasons.has(r.reason)).map(r => Number(r.hotelId))
        : [];
      const retrySet = new Set(retryIds);
      setHits(curr => curr.map(h => {
        const r = byId.get(h.id);
        if (!r || !r.available) {
          // Distinguish "still resolving (will retry)" from genuinely sold out
          // so the count line + filter treat them differently (see
          // pendingCount / unavailableCount).
          return { ...h, priced: { available: false, reason: r?.reason, retryable: retrySet.has(h.id) } };
        }
        // ETG cert §10 — hotel may be available without a quotable
        // headline price (all rates on-request, supplier echoed
        // null amounts). Card surfaces "Price on request" so it
        // stays visible instead of getting bucketed as sold out.
        // Multi-supplier compare returns quotes[]. When absent, the
        // single-supplier path still populates the legacy fields, so
        // downstream readers fall back cleanly.
        const apiQuotes: any[] = Array.isArray(r.quotes) ? r.quotes : [];
        const quotes: Quote[] = apiQuotes.map(q => {
          const sell = q.cheapestRate?.pricing?.sell;
          const net  = q.cheapestRate?.pricing?.net;
          const aud  = q.cheapestRate?.pricing?.aud;   // derived AUD (display)
          return {
            supplier:                q.supplier,
            available:               !!q.available,
            reason:                  q.reason,
            sellNightly:             sell?.nightlyAmount,
            sellTotal:               sell?.totalAmount,
            sellNightlyAud:          aud?.nightlyAmount ?? undefined,
            sellTotalAud:            aud?.totalAmount ?? undefined,
            fxRate:                  aud?.fxRate ?? undefined,
            netNightly:              net?.nightlyAmount,
            markupPct:               q.cheapestRate?.pricing?.markup?.value,
            markupAmount:            q.cheapestRate?.pricing?.markup?.amount,
            currency:                sell?.currency,
            ratePlan:                q.cheapestRate?.ratePlan,
            refundable:              q.cheapestRate?.refundable,
            breakfastIncluded:       q.cheapestRate?.breakfastIncluded,
            cancellationDeadlineUtc: q.cheapestRate?.cancellationDeadlineUtc,
            ratesCount:              q.ratesCount,
            offers:                  q.cheapestRate?.offers,
            transferLabel:           q.cheapestRate?.transfer ?? null
          };
        });
        if (!r.cheapestRate) {
          return {
            ...h,
            priced: {
              available: true, supplier: r.cheapestSupplier || r.supplier, onRequest: true,
              ratesCount: r.ratesCount,
              quotes: quotes.length ? quotes : undefined
            }
          };
        }
        const sell = r.cheapestRate?.pricing?.sell;
        const net  = r.cheapestRate?.pricing?.net;
        const aud  = r.cheapestRate?.pricing?.aud;   // derived AUD (display)
        return {
          ...h,
          priced: {
            available: true,
            supplier:                r.cheapestSupplier || r.supplier,
            sellNightly:             sell?.nightlyAmount,
            sellTotal:               sell?.totalAmount,
            sellNightlyAud:          aud?.nightlyAmount ?? undefined,
            sellTotalAud:            aud?.totalAmount ?? undefined,
            fxRate:                  aud?.fxRate ?? undefined,
            netNightly:              net?.nightlyAmount,
            netTotal:                net?.totalAmount,
            markupPct:               r.cheapestRate?.pricing?.markup?.value,
            currency:                sell?.currency,
            roomTypeName:            r.cheapestRate?.roomTypeName,
            ratePlan:                r.cheapestRate?.ratePlan,
            refundable:              r.cheapestRate?.refundable,
            breakfastIncluded:       r.cheapestRate?.breakfastIncluded,
            cancellationDeadlineUtc: r.cheapestRate?.cancellationDeadlineUtc,
            transferLabel:           r.cheapestRate?.transfer ?? null,
            ratesCount:              r.ratesCount,
            quotes:                  quotes.length ? quotes : undefined
          }
        };
      }).sort((a, b) => {
        // Hotel-NAME search: the property the consultant typed pins to the top,
        // regardless of price (a name match is what they asked for). Falls back
        // to cheapest-first for destination searches (nameMatchScore === 0).
        const nq = lastSearchRef.current?.q || '';
        const an = nameMatchScore(a.name, nq);
        const bn = nameMatchScore(b.name, nq);
        if (an !== bn) return bn - an;
        // available first, cheapest first
        const aa = a.priced?.available ? (a.priced.sellNightly ?? Infinity) : Infinity;
        const bb = b.priced?.available ? (b.priced.sellNightly ?? Infinity) : Infinity;
        return aa - bb;
      }));
      // Re-probe the transient-failure subset once (supplier timeout / 429).
      scheduleRetry(retryIds);
    } catch {
      // Network error talking to the compare endpoint — retry the same ids once
      // rather than leaving the page looking empty.
      scheduleRetry(ids);
    } finally {
      // Keep the spinner up across a pending retry so the UI reads "still
      // checking", not "0 bookable".
      if (!retryScheduled) setEnriching(false);
    }
  }

  // Fetch the next page of the CURRENT search (same query/filter/dates as
  // captured in lastSearchRef) and APPEND to the existing hits. Pages are
  // 50-wide (server caps limit at 50); offset = current hit count. Only the
  // new page's ids are sent to enrichPrices so existing cards never re-price.
  async function loadMore() {
    const last = lastSearchRef.current;
    if (loadingMore || !last || hits.length >= total) return;
    setLoadingMore(true);
    try {
      const res = await fetch('/api/admin/search/hotels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ q: last.q, limit: 50, offset: hits.length, ...(last.filter ? { filter: last.filter } : {}) })
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'search failed');
      const newInitial: HotelHit[] = (json.data.hits || []).map((h: any) => ({ ...h }));
      if (newInitial.length === 0) {
        // Meili estimatedTotalHits is an estimate that can overshoot the real
        // result count — a page with 0 new hits means we've hit the real end,
        // so pin total to what we have and hide the button.
        setTotal(hits.length);
        return;
      }
      setHits(curr => [...curr, ...newInitial]);
      setTotal(json.data.total ?? (hits.length + newInitial.length));
      void enrichPrices(newInitial.map(h => h.id), { checkIn: last.checkIn, checkOut: last.checkOut });
    } catch {
      /* swallow — leaves the existing list intact */
    } finally {
      setLoadingMore(false);
    }
  }

  // Detail-view hotel content (description / amenities / metapolicy)
  // surfaced by the admin rates endpoint alongside the rate list.
  const [detailContent, setDetailContent] = useState<any>(null);

  // Detail view supports an optional supplier filter so clicking a
  // specific supplier row on the list opens the rate table pre-filtered
  // to that supplier's quotes. Null filter = show both. The filter
  // lives in URL state via `&supplier=…` so refresh/share round-trip
  // correctly.
  const [supplierFocus, setSupplierFocus] = useState<string | null>(null);
  async function openHotel(h: HotelHit, supplier?: string | null, datesOverride?: { checkIn: string; checkOut: string }) {
    setDetailHotel(h);
    setDetailContent(null);
    setChosenRate(null);
    setPrebook(null);
    setPrebookErr(null);
    setAcceptedNewPrice(false);
    setBookingResult(null);
    setBookingErr(null);
    setSupplierFocus(supplier || null);
    syncUrl({ hotelId: h.id, supplier: supplier || null });
    void loadRatesFor(h, 'cug', datesOverride);
  }

  async function loadRatesFor(h: HotelHit, channel: 'cug' | 'b2c' = 'cug', datesOverride?: { checkIn: string; checkOut: string }) {
    const useCheckIn = datesOverride?.checkIn ?? checkIn;
    const useCheckOut = datesOverride?.checkOut ?? checkOut;
    setRatesBusy(true);
    setRatesErr(null);
    setRates([]);
    setB2cLoaded(false);
    try {
      // ETG cert §4: send per-room guests so the backend doesn't have
      // to floor-distribute adults or shove all children into room 1.
      // Equivalent fix to the B2C HotelSearchForm.
      const qs = new URLSearchParams({ checkIn: useCheckIn, checkOut: useCheckOut, nationalityCode: citizenship, accountType: channel });
      qs.set('guests', JSON.stringify(rooms.map(r => ({
        adults: r.adults,
        children: r.childrenAges || []
      }))));
      const res = await fetch(`/api/admin/search/rates/${h.id}?${qs.toString()}`);
      const json = await res.json();
      if (res.status === 429) {
        throw new Error(json.message || 'Supplier rate limit — wait ~30 seconds and try again.');
      }
      if (!json.success) throw new Error(json.details ? `${json.error}: ${json.details}` : (json.error || 'rates failed'));
      setRates((json.data.rates || []).map((r: AdminRate) => ({ ...r, _channel: channel })));
      setPresentation(json.data.presentation || null);
      setDetailContent(json.data.hotel || null);
      // Persist the rate_decisions audit trail id so /choose and
      // /api/bookings can stamp the same row when the consultant
      // progresses through the funnel. Backend recommendedRateKey is
      // already reflected in each rate's `score` field for the UI
      // border, but we keep it here for the future override-rate dashboard.
      setSearchId(json.data.searchId || null);
      setRecommendedRateKey(json.data.recommendedRateKey || null);
    } catch (e: any) {
      setRatesErr(e.message || 'rates failed');
    } finally {
      setRatesBusy(false);
    }
  }

  // Lazy compare: fetch the B2C channel's rates for the OPEN hotel on demand
  // and merge them (tagged) into the Member list so the consultant sees both
  // — without paying the 2x ETG cost on every search.
  async function addB2CRates(h: HotelHit) {
    if (b2cLoaded || b2cBusy) return;
    setB2cBusy(true);
    try {
      const qs = new URLSearchParams({ checkIn, checkOut, nationalityCode: citizenship, accountType: 'b2c' });
      qs.set('guests', JSON.stringify(rooms.map(r => ({ adults: r.adults, children: r.childrenAges || [] }))));
      const res = await fetch(`/api/admin/search/rates/${h.id}?${qs.toString()}`);
      const json = await res.json();
      if (res.status === 429) throw new Error(json.message || 'Supplier rate limit — wait ~30 seconds and try again.');
      if (!json.success) throw new Error(json.error || 'b2c rates failed');
      // Non-Member rates are a DIFFERENT channel from the Member rates
      // already in `prev` — never dedupe one against the other (a Member and
      // its Non-Member twin can even share a book_hash). Only collapse exact
      // dupes WITHIN the incoming Non-Member set.
      const b2cSeen = new Set<string>();
      const b2c: AdminRate[] = (json.data.rates || [])
        .map((r: AdminRate) => ({ ...r, _channel: 'b2c' as const }))
        .filter((r: AdminRate) => {
          if (b2cSeen.has(r.rateKey)) return false;
          b2cSeen.add(r.rateKey);
          return true;
        });
      setRates(prev => [...prev.filter(r => r._channel !== 'b2c'), ...b2c]);
      setB2cLoaded(true);
      if (b2c.length === 0) setRatesErr('No public non-member rates returned for this hotel.');
    } catch (e: any) {
      setRatesErr(e.message || 'b2c rates failed');
    } finally {
      setB2cBusy(false);
    }
  }

  // Fetch the cross-supplier room map whenever a hotel detail opens (keyed by
  // detailHotel.id). A TRUSTED row (has BOTH hb + rh names, status in
  // auto_high|auto_med|confirmed|manual) seeds two lookup entries — one for
  // each supplier side — pointing at the same canonical group key. Anything
  // else (review_low/rejected/hb_only/rh_only) is ignored so those rates stay
  // as separate cards. Soft-fails to an empty map.
  useEffect(() => {
    const id = detailHotel?.id;
    if (!id) { setRoomMap(new Map()); return; }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/admin/room-mappings?hotelId=${id}`);
        if (!res.ok) throw new Error(String(res.status));
        const json = await res.json();
        const rows: Array<{ id: number; hb_room_name?: string; rh_room_name?: string; status?: string }> =
          Array.isArray(json) ? json : (json?.data ?? json?.rows ?? []);
        const TRUSTED = new Set(['auto_high', 'auto_med', 'confirmed', 'manual']);
        const m = new Map<string, { key: string; label: string }>();
        for (const row of rows) {
          if (!row?.hb_room_name || !row?.rh_room_name) continue;       // both sides required
          if (!TRUSTED.has(row.status || '')) continue;                 // trusted statuses only
          const key = `canon:${row.id}`;
          const label = row.hb_room_name || row.rh_room_name;           // prefer HB name
          m.set(`hummingbird|${normName(row.hb_room_name)}`, { key, label });
          m.set(`ratehawk|${normName(row.rh_room_name)}`,   { key, label });
        }
        if (!cancelled) setRoomMap(m);
      } catch {
        if (!cancelled) setRoomMap(new Map());                          // never break the drawer
      }
    })();
    return () => { cancelled = true; };
  }, [detailHotel?.id]);

  // When the consultant picks a rate, immediately fire a prebook
  // so we verify availability + price BEFORE they fill the form.
  // Skipped if there's already a prebook for this rateKey (consultant
  // re-opening the same sidebar). The supplier holds the rate for a
  // short window after prebook — consultant has minutes, not hours,
  // to complete the form. That's fine for a B2B console.
  useEffect(() => {
    if (!chosenRate || !detailHotel) return;
    if (prebook?.prebookHash && (prebook as any)._forKey === chosenRate.rateKey) return;
    setPrebookBusy(true);
    setPrebookErr(null);
    setPrebook(null);
    setAcceptedNewPrice(false);
    (async () => {
      try {
        const totalAdults = rooms.reduce((s, r) => s + r.adults, 0);
        const allChildAges = rooms.flatMap(r => r.childrenAges);
        const r = await fetch('/api/admin/prebook', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            hotelId: detailHotel.id,
            // Route prebook to the chosen rate's supplier (multi-supplier
            // fan-out) — not the hotel's default supplier.
            supplier: chosenRate.supplier,
            rateKey: chosenRate.rateKey,
            searchParams: {
              checkIn, checkOut,
              adults: totalAdults,
              childrenAges: allChildAges,
              rooms: rooms.length,
              guests: rooms.map(r => ({ adults: r.adults, children: r.childrenAges })),
              nationalityCode: citizenship
            },
            expectedTotalAmount: chosenRate.pricing.sell?.totalAmount,
            expectedCurrency:    chosenRate.pricing.currency,
            // Use the CHOSEN rate's own channel so prebook hits the same
            // credentials/pool the rate was quoted under (member vs b2c).
            accountType: chosenRate._channel || 'cug'
          })
        });
        const json = await r.json();
        if (!r.ok || !json.success) throw new Error(json.error || 'Prebook failed');
        // Default supplierFlaggedChange to priceChanged on older API
        // responses that don't carry the strict flag yet.
        const info: PrebookInfo & { _forKey?: string } = {
          ...json.data,
          supplierFlaggedChange: json.data.supplierFlaggedChange ?? json.data.priceChanged,
          _forKey: chosenRate.rateKey
        };
        setPrebook(info);
        // Auto-accept when the SUPPLIER didn't flag a change (cert-
        // compliant banner gate). Silent shifts within RateHawk's
        // own tolerance still let the consultant submit without an
        // explicit confirm — the rate panel pill shows the new total
        // unconditionally so they can see what they're locking in.
        if (!info.supplierFlaggedChange) setAcceptedNewPrice(true);
      } catch (e: any) {
        setPrebookErr(e?.message || 'Could not verify rate');
      } finally {
        setPrebookBusy(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chosenRate?.rateKey, detailHotel?.id]);

  async function confirmBooking() {
    if (!detailHotel || !chosenRate) return;
    const missingExtra = extraRoomGuests.findIndex(g => !g.firstName.trim() || !g.lastName.trim());
    if (missingExtra !== -1) {
      setBookingErr(`Lead guest for Room ${missingExtra + 2} is required (ETG cert §5).`);
      return;
    }
    if (!custFirst.trim() || !custLast.trim() || !custEmail.trim()) {
      setBookingErr('Customer first name, last name and email are required.');
      return;
    }
    setBookingBusy(true);
    setBookingErr(null);

    // Two-checkpoint cert pattern: re-verify the rate right before
    // posting the booking. The Choose-time prebook may have run
    // minutes ago while the consultant filled the form. If the
    // supplier's price has moved since, we surface the banner again
    // — consultant must re-accept before the actual booking submit.
    try {
      const totalAdults = rooms.reduce((s, r) => s + r.adults, 0);
      const allChildAges = rooms.flatMap(r => r.childrenAges);
      const verify = await fetch('/api/admin/prebook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hotelId: detailHotel.id,
          supplier: chosenRate.supplier,
          // IMPORTANT: re-verify with the ORIGINAL h-* rateKey, not
          // the p-* prebookHash. RateHawk's prebook on an existing
          // p-hash isn't supported; we need a fresh round.
          rateKey: chosenRate.rateKey,
          expectedTotalAmount: prebook?.newPrice || chosenRate.pricing.sell?.totalAmount,
          expectedCurrency:    chosenRate.pricing.currency,
          accountType: chosenRate._channel || 'cug',
          searchParams: {
            checkIn, checkOut,
            adults: totalAdults,
            childrenAges: allChildAges,
            rooms: rooms.length,
            guests: rooms.map(r => ({ adults: r.adults, children: r.childrenAges })),
            nationalityCode: citizenship
          }
        })
      });
      const verifyJson = await verify.json();
      if (verify.ok && verifyJson?.success && verifyJson.data) {
        if (verifyJson.data.supplierFlaggedChange ?? verifyJson.data.priceChanged) {
          // Price moved between Choose and Submit. Replace the prebook
          // state with the new figures, lock submit, force re-accept.
          const info: PrebookInfo & { _forKey?: string } = {
            ...verifyJson.data,
            _forKey: chosenRate.rateKey
          };
          setPrebook(info);
          setAcceptedNewPrice(false);
          setBookingBusy(false);
          setBookingErr('Price changed since rate was picked. Review the new total and accept again to continue.');
          return;
        }
        // Same price; latch onto the fresh prebookHash so finish uses
        // the freshest p-hash (RateHawk holds it for a short window).
        setPrebook((prev) => prev ? { ...prev, prebookHash: verifyJson.data.prebookHash, partnerOrderId: verifyJson.data.partnerOrderId } : prev);
      }
    } catch (e) {
      // Don't block on verify failure — backend's inline prebook is
      // the final guard. Log and continue.
      console.warn('[confirmBooking] submit-time prebook check failed:', e);
    }
    setBookingResult(null);
    try {
      const totalAdults = rooms.reduce((s, r) => s + r.adults, 0);
      const allChildAges = rooms.flatMap(r => r.childrenAges);
      const payload = {
        hotelId: detailHotel.id,
        // Route the booking to the chosen rate's supplier (multi-supplier
        // fan-out) so it doesn't default to the hotel's surface supplier.
        supplier: chosenRate.supplier,
        // Use the prebooked p-* hash when available — createBooking
        // skips its inline prebook step and goes straight to the
        // booking form. Falls back to the search-time rateKey for
        // suppliers where prebook was skipped (Hummingbird).
        rateKey: prebook?.prebookHash || chosenRate.rateKey,
        partnerOrderIdOverride: prebook?.partnerOrderId,
        guestInfo:   { firstName: custFirst.trim(), lastName: custLast.trim(), email: custEmail.trim(), phone: custPhone.trim() || undefined },
        contactInfo: { firstName: custFirst.trim(), lastName: custLast.trim(), email: custEmail.trim(), phone: custPhone.trim() || undefined },
        searchParams: {
          checkIn, checkOut,
          adults:       totalAdults,
          children:     allChildAges.length,
          childrenAges: allChildAges,
          rooms:        rooms.length,
          guests:       rooms.map(r => ({ adults: r.adults, children: r.childrenAges })),
          // ETG cert §5: per-room lead-guest names so the backend
          // doesn't book the same person into every room.
          roomGuests: [
            { firstName: custFirst.trim(), lastName: custLast.trim() },
            ...extraRoomGuests.map(g => ({ firstName: g.firstName.trim(), lastName: g.lastName.trim() }))
          ],
          nationalityCode: 'AU'
        },
        specialRequests:     'B2B book-on-behalf via console',
        // Prefer the prebook-locked supplier sell price. priceChanged=false
        // just means RateHawk didn't flip its banner flag — the supplier
        // can still silently raise within our 10% tolerance, and the
        // booking row + audit + email must record what the customer is
        // actually charged, not the stale search-time quote. Falls back
        // to chosenRate when prebook never ran (e.g. Hummingbird).
        expectedTotalAmount: prebook?.newPrice || chosenRate.pricing.sell?.totalAmount,
        expectedCurrency:    prebook?.currency || chosenRate.pricing.currency,
        availabilityType:    'free_sell',
        // Audit-trail handoff: stamp the rate_decisions row with this
        // booking's internalBookingId once it's created.
        searchId:            searchId || undefined
      };
      const res = await fetch('/api/admin/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-consultant-email': user?.email || '' },
        body: JSON.stringify(payload)
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || json.details || 'Booking failed');
      setBookingResult(json.data);
    } catch (e: any) {
      setBookingErr(e.message || 'Booking failed');
    } finally {
      setBookingBusy(false);
    }
  }

  // Restore state from URL on initial mount. Two entry shapes:
  //   1. Deep-link from AI agent or shared link →
  //      ?q=Dubai&checkIn=…&checkOut=…&adults=2&rooms=1&citizenship=AU[&hotelId=N]
  //      Re-runs the search; opens the detail view if hotelId is set.
  //   2. Legacy deep-link from the agent with only hotelId (no q) →
  //      opens the detail directly, no list re-run.
  //
  // Form-state writes back to the URL via syncUrl() on search submit
  // and on detail open/close so refresh, share, and back-button all
  // round-trip cleanly.
  useEffect(() => {
    // Normalize the dates from the URL ONCE, up front, and reuse the result
    // everywhere below. This guards against a past or malformed checkIn/
    // checkOut in a shared/deep-link URL, and gives us concrete date values
    // to hand to runSearch/openHotel directly (instead of relying on the
    // not-yet-flushed checkIn/checkOut state).
    const norm = normalizeRange(sp.get('checkIn') || '', sp.get('checkOut') || '');
    setCheckIn(norm.checkIn);
    setCheckOut(norm.checkOut);
    // Primary: r=2|3&r=4|5,8 per-room composition (lossless).
    const rParams = sp.getAll('r');
    if (rParams.length > 0) {
      const parsed: RoomGuests[] = rParams.map(v => {
        const [aStr, kStr] = v.split('|');
        const a = Math.max(1, Math.min(10, Number(aStr) || 2));
        const kids = (kStr || '')
          .split(',')
          .map(s => Number(s))
          .filter(n => Number.isFinite(n) && n >= 0 && n <= 17);
        return { adults: a, childrenAges: kids };
      });
      if (parsed.length) setRooms(parsed);
    } else {
      // Legacy: ?adults=N&rooms=M (no children) — kept for AI-agent
      // deep-links that only know totals.
      const adultsParam = Number(sp.get('adults'));
      const roomsParam  = Number(sp.get('rooms')) || 1;
      if (Number.isFinite(adultsParam) && adultsParam > 0) {
        const perRoom = Math.floor(adultsParam / roomsParam);
        const extra   = adultsParam % roomsParam;
        setRooms(Array.from({ length: roomsParam }, (_, i) => ({
          adults: perRoom + (i < extra ? 1 : 0),
          childrenAges: []
        })));
      }
    }
    const cit = sp.get('citizenship');
    if (cit && /^[A-Z]{2}$/.test(cit)) setCitizenship(cit);
    const qParam = sp.get('q');
    if (qParam) setQ(qParam);

    const id = sp.get('hotelId');
    if (id) {
      const n = Number(id);
      if (Number.isFinite(n) && !detailHotel) {
        const stub: HotelHit = { id: n, name: '', sources: [] };
        const sup = sp.get('supplier');
        // Pass the normalized dates through so the rates call doesn't fire
        // with the stale default state on the deep-link path.
        void openHotel(stub, sup || null, { checkIn: norm.checkIn, checkOut: norm.checkOut });
        return;
      }
    }
    if (qParam) {
      // Re-run the search so the list rehydrates on refresh. Hand the
      // normalized dates in explicitly — runSearch would otherwise read the
      // stale default checkIn/checkOut from this same render's closure.
      void runSearch(qParam, { checkIn: norm.checkIn, checkOut: norm.checkOut });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── filter computation ─────────────────────────────────────
  // Default behaviour: only reveal hotels that have come back priced
  // and available. While compare() is enriching, pending hits stay
  // hidden and we render N skeleton rows for them instead — avoids
  // the "list pops in with junk, then prices dribble in" effect the
  // user flagged on /console/search.
  const filteredHits = useMemo(() => {
    return hits.filter(h => {
      if (filterSupplier !== 'all' && !h.sources.includes(filterSupplier)) return false;
      // Still loading prices on this hit — hide unless the user has
      // explicitly asked to see everything.
      if (!showUnavailable && h.priced === undefined) return false;
      if (!showUnavailable && h.priced !== undefined && !h.priced.available) return false;
      if (filterRefundable && h.priced && h.priced.available && !h.priced.refundable) return false;
      return true;
    });
  }, [hits, filterSupplier, filterRefundable, showUnavailable]);

  // Count of hits still resolving — drives skeleton row count. A hotel whose
  // first probe failed transiently (retryable) is STILL resolving (a retry is
  // in flight), so it counts as pending, never as unavailable — otherwise an
  // in-flight retry would render the page as "N unavailable hidden".
  const pendingCount = useMemo(
    () => hits.filter(h => h.priced === undefined || (h.priced && !h.priced.available && h.priced.retryable)).length,
    [hits]
  );
  const unavailableCount = useMemo(
    () => hits.filter(h => h.priced && !h.priced.available && !h.priced.retryable).length,
    [hits]
  );

  // Bulk-load control rows for the visible hits so each card can show a
  // state badge. Keyed on the comma-joined id list so it only re-fires when
  // the result set actually changes (not on every price-enrichment tick).
  const hitIdsKey = useMemo(() => hits.map(h => h.id).sort((a, b) => a - b).join(','), [hits]);
  useEffect(() => {
    if (!hitIdsKey) { setControlMap({}); return; }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/admin/control?ids=${encodeURIComponent(hitIdsKey)}`, { cache: 'no-store' });
        if (!res.ok) return;
        const json = await res.json();
        // Backend returns a { [id]: row } map (possibly wrapped in .data).
        const map = (json && typeof json === 'object' && json.data && typeof json.data === 'object') ? json.data : json;
        if (cancelled || !map || typeof map !== 'object') return;
        const normalized: Record<number, HotelControl> = {};
        for (const [k, v] of Object.entries(map)) {
          const id = Number(k);
          if (Number.isFinite(id) && v && typeof v === 'object') normalized[id] = v as HotelControl;
        }
        setControlMap(normalized);
      } catch { /* badges are best-effort */ }
    })();
    return () => { cancelled = true; };
  }, [hitIdsKey]);

  // ───────────────────────────────────────────────────────────
  return (
    <div style={{ minWidth: 0 }}>
      <div>
        {/* Header swaps to a breadcrumb when in detail view */}
        <div className="c-page-head">
          <div>
            <h1 className="c-page-title">B2B Search</h1>
            <p className="c-page-sub">
              Find hotels, see net cost + markup + sell price per rate, book on behalf of the customer.
            </p>
          </div>
        </div>

        {/* Quick prompts + search form — stays mounted; detail opens as a drawer */}
        {(
          <>
            <div style={{ marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <Sparkles size={14} style={{ color: 'var(--c-accent)' }} />
                <span style={{ fontSize: 12, color: 'var(--c-fg-muted)', letterSpacing: '0.04em', textTransform: 'uppercase', fontWeight: 700 }}>
                  Quick prompts
                </span>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {PROMPT_PILLS.map((p, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      // Use the silent setter so the autocomplete
                      // doesn't pop the dropdown after a programmatic
                      // fill (otherwise the consultant has to click
                      // the suggestion to dismiss it).
                      destRef.current?.setSilent(p.q);
                      const ci = todayPlus(30);
                      const co = todayPlus(30 + p.nights);
                      setCheckIn(ci);
                      setCheckOut(co);
                      setRooms(p.rooms);
                      // Pass the just-computed dates explicitly — runSearch
                      // would otherwise read the stale (default) checkIn/
                      // checkOut from the closure on this same tick.
                      runSearch(p.q, { checkIn: ci, checkOut: co });
                    }}
                    style={{ border: '1px solid var(--c-line)', borderRadius: 999, padding: '6px 12px', fontSize: 12, background: 'var(--c-bg)', color: 'var(--c-fg-soft)', cursor: 'pointer' }}
                  >{p.label}</button>
                ))}
              </div>
            </div>

            <div className="c-card" style={{ padding: 14, marginBottom: 20, overflow: 'visible' }}>
              <form
                onSubmit={(e) => { e.preventDefault(); runSearch(); }}
                style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 1.6fr) minmax(200px, 1.3fr) minmax(160px, 1.1fr) minmax(120px, 0.7fr) auto', gap: 10, alignItems: 'end' }}
              >
                <div>
                  <label style={labelStyle}>Destination or hotel name</label>
                  <DestinationAutocomplete
                    ref={destRef}
                    value={q}
                    onChange={setQ}
                    onSelectHotel={(h) => setQ(h.name || '')}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Dates</label>
                  <DateRangePicker checkIn={checkIn} checkOut={checkOut} onChange={({ checkIn, checkOut }) => { setCheckIn(checkIn); setCheckOut(checkOut); }} />
                </div>
                <div>
                  <label style={labelStyle}>Guests</label>
                  <GuestSelector rooms={rooms} onChange={setRooms} />
                </div>
                <div>
                  {/* Country picker with flags + typeahead search.
                      Same component used in B2C ReserveSidebar — keeps
                      input consistent across audiences. Consultants
                      type a lot of citizenship values; typeahead beats
                      a 12-option <select>. */}
                  <CountryPicker
                    value={citizenship}
                    onChange={setCitizenship}
                    label="Citizenship"
                  />
                </div>
                <button type="submit" className="c-btn c-btn-primary" disabled={searching}>
                  {searching ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
                  {searching ? 'Searching…' : 'Search'}
                </button>
              </form>
            </div>
          </>
        )}

        {/* Errors */}
        {searchErr && <div style={{ color: 'var(--c-danger)', fontSize: 13, marginBottom: 14 }}>Error: {searchErr}</div>}

        {/* Empty state */}
        {hits.length === 0 && !searching && !tierChip && !activeProfile && (
          <div className="c-card" style={{ padding: 32, textAlign: 'center', color: 'var(--c-fg-muted)', fontSize: 13 }}>
            Type a destination or hotel name above to start searching.
          </div>
        )}

        {/* Results list — stays mounted behind the detail drawer. Also renders
            when a profile/tier filter is active even with 0 hits, so the picker
            and chips stay visible/clearable instead of vanishing. */}
        {(hits.length > 0 || tierChip || activeProfile) && (
          <>
            {/* B2B profile picker + 5★ tier quick chips. Selecting a profile
                resolves its compiled Meili filter; the tier chips add a
                luxury_tier clause. Both compose (AND) into the search request,
                so changing either re-runs the search. */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
              <Sparkles size={13} style={{ color: 'var(--c-accent)' }} />
              <select
                className="c-select"
                value={activeProfile?.slug || ''}
                onChange={async (e) => {
                  const pf = await selectProfile(e.target.value);
                  runSearch(undefined, undefined, composedFilter(pf, tierChip));
                }}
                style={{ maxWidth: 240, fontSize: 12.5 }}
              >
                <option value="">No profile</option>
                {profiles.map((p) => (
                  <option key={p.slug} value={p.slug}>{p.name || p.title || p.slug}</option>
                ))}
              </select>
              {activeProfile && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: 'var(--c-fg)', background: 'var(--c-accent-soft)', border: '1px solid var(--c-line)', borderRadius: 999, padding: '3px 10px' }}>
                  {activeProfile.name || activeProfile.title || activeProfile.slug}
                  <button
                    onClick={() => { setActiveProfile(null); setProfileFilter(''); runSearch(undefined, undefined, composedFilter('', tierChip)); }}
                    title="Clear profile"
                    style={{ background: 'none', border: 0, cursor: 'pointer', color: 'var(--c-fg-soft)', padding: 0, display: 'inline-flex' }}
                  ><X size={12} /></button>
                </span>
              )}
              <div style={{ display: 'flex', gap: 4 }}>
                {([['5plus', '5★+'], ['5plusplus', '5★++']] as Array<[LuxuryTier, string]>).map(([tier, label]) => {
                  const on = tierChip === tier;
                  return (
                    <button
                      key={tier}
                      onClick={() => { const next = on ? null : tier; setTierChip(next); runSearch(undefined, undefined, composedFilter(profileFilter, next)); }}
                      style={{
                        fontSize: 12, padding: '4px 12px', borderRadius: 999,
                        border: '1px solid var(--c-line)', cursor: 'pointer',
                        background: on ? 'var(--c-accent-soft)' : 'var(--c-bg)',
                        color: on ? 'var(--c-fg)' : 'var(--c-fg-soft)',
                        fontWeight: on ? 600 : 500,
                      }}
                    >{label}</button>
                  );
                })}
              </div>
            </div>

            {/* Filter row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
              <Filter size={13} style={{ color: 'var(--c-fg-muted)' }} />
              <div style={{ display: 'flex', gap: 4 }}>
                {(['all','ratehawk','hummingbird'] as const).map(s => (
                  <button
                    key={s}
                    onClick={() => setFilterSupplier(s)}
                    style={{
                      fontSize: 12, padding: '4px 12px', borderRadius: 999,
                      border: '1px solid var(--c-line)', cursor: 'pointer',
                      background: filterSupplier === s ? 'var(--c-accent-soft)' : 'var(--c-bg)',
                      color: filterSupplier === s ? 'var(--c-fg)' : 'var(--c-fg-soft)',
                      fontWeight: filterSupplier === s ? 600 : 500,
                      textTransform: s === 'all' ? 'none' : 'capitalize'
                    }}
                  >{s === 'all' ? 'All suppliers' : s}</button>
                ))}
              </div>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer', color: 'var(--c-fg-soft)' }}>
                <input type="checkbox" checked={filterRefundable} onChange={(e) => setFilterRefundable(e.target.checked)} />
                Refundable only
              </label>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer', color: 'var(--c-fg-soft)' }}>
                <input type="checkbox" checked={showUnavailable} onChange={(e) => setShowUnavailable(e.target.checked)} />
                Show unavailable
              </label>
              <span style={{ fontSize: 11, color: 'var(--c-fg-muted)', marginLeft: 'auto' }}>
                {filteredHits.length} bookable
                {total > 0 && <span> · {total} found</span>}
                {pendingCount > 0 && <span> · {pendingCount} loading</span>}
                {!enrichingPrices && unavailableCount > 0 && !showUnavailable && (
                  <span> · {unavailableCount} unavailable hidden</span>
                )}
                {enrichingPrices && <span> · <Loader2 size={11} style={{ verticalAlign: 'middle' }} className="animate-spin" /> </span>}
              </span>
            </div>

            {/* Filter-aware empty state: a profile/tier filter matched nothing.
                Keeps the chips above visible so the user can clear them. */}
            {hits.length === 0 && !searching && (tierChip || activeProfile) && (
              <div className="c-card" style={{ padding: 24, textAlign: 'center', color: 'var(--c-fg-muted)', fontSize: 13, lineHeight: 1.5 }}>
                No hotels match {tierChip ? (tierChip === '5plus' ? '5★+' : '5★++') : 'this profile'}
                {activeProfile && tierChip ? ' + the active profile' : ''}.
                <br />
                {tierChip
                  ? 'No hotels are tagged this tier yet — tag them in a hotel’s Manage → Curation, or clear the chip above.'
                  : 'Try another profile or clear it above.'}
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 10 }}>
              {filteredHits.map((h) => (
                <MultiSupplierCard
                  key={h.id}
                  h={h}
                  control={controlMap[h.id]}
                  onOpen={(supplier) => openHotel(h, supplier)}
                  showUnavailable={showUnavailable}
                />
              ))}
              {/* Skeleton placeholders for hotels still being priced.
                  Renders N blocks (one per pending hit) so the user
                  sees the work in flight instead of an empty list or
                  half-populated rows. Hidden once enrichment lands. */}
              {pendingCount > 0 && Array.from({ length: pendingCount }).map((_, i) => (
                <div
                  key={`skeleton-${i}`}
                  className="c-card c-skeleton"
                  style={{
                    display: 'grid', gridTemplateColumns: '120px 1fr auto',
                    gap: 16, alignItems: 'center', padding: 12,
                    background: 'var(--c-bg)', border: '1px solid var(--c-line-soft)'
                  }}
                  aria-hidden="true"
                >
                  <div style={{ width: 120, height: 80, borderRadius: 6, background: 'var(--c-bg-soft)' }} />
                  <div>
                    <div style={{ height: 14, width: '55%', borderRadius: 3, background: 'var(--c-bg-soft)', marginBottom: 8 }} />
                    <div style={{ height: 10, width: '35%', borderRadius: 3, background: 'var(--c-bg-soft)' }} />
                  </div>
                  <div style={{ width: 130 }}>
                    <div style={{ height: 10, width: '60%', borderRadius: 3, background: 'var(--c-bg-soft)', marginBottom: 6, marginLeft: 'auto' }} />
                    <div style={{ height: 16, width: '80%', borderRadius: 3, background: 'var(--c-bg-soft)', marginLeft: 'auto' }} />
                  </div>
                </div>
              ))}
            </div>

            {/* "Load more" — pages the SAME search (lastSearchRef) and appends.
                Shown only while there are more results than we've loaded. */}
            {hits.length < total && (
              <div style={{ display: 'flex', justifyContent: 'center', marginTop: 14 }}>
                <button
                  type="button"
                  className="c-btn"
                  onClick={loadMore}
                  disabled={loadingMore}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
                >
                  {loadingMore && <Loader2 size={14} className="animate-spin" />}
                  Load more · showing {hits.length} of {total}
                </button>
              </div>
            )}
          </>
        )}

        {/* Detail drawer — slides over the dimmed results list so the
            consultant keeps the results + scroll position and can bounce
            between hotels. Expand widens it for the booking step. */}
        {detailHotel && (
          <>
            <div
              onClick={() => { setDetailHotel(null); setDetailExpanded(false); setEditingSearch(false); syncUrl({ hotelId: null }); }}
              style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.32)', zIndex: 40 }}
            />
            <aside
              role="dialog"
              aria-label={`${detailHotel.name} rates`}
              style={{
                position: 'fixed', top: 0, right: 0, bottom: 0,
                width: detailExpanded ? 'min(1320px, 98vw)' : 'min(900px, 96vw)',
                background: 'var(--c-bg)', borderLeft: '1px solid var(--c-line)',
                boxShadow: '-8px 0 28px rgba(0,0,0,0.18)', zIndex: 41,
                display: 'flex', flexDirection: 'column', transition: 'width 160ms ease'
              }}
            >
              {/* Drawer header */}
              <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--c-line)', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <button
                  onClick={() => { setDetailHotel(null); setDetailExpanded(false); setEditingSearch(false); syncUrl({ hotelId: null }); }}
                  title="Back to results"
                  style={{ ...iconBtnStyle, marginTop: 2 }}
                >
                  <ArrowLeft size={14} />
                </button>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: 'var(--c-fg)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{detailHotel.name}</h2>
                  <p className="c-page-sub" style={{ margin: '2px 0 0' }}>
                    {[detailHotel.city, detailHotel.country].filter(Boolean).join(', ')}
                    {' · '}{checkIn} → {checkOut}{' · '}
                    {rooms.reduce((s, r) => s + r.adults, 0)} adult{rooms.reduce((s, r) => s + r.adults, 0) > 1 ? 's' : ''}
                    {' · '}{rooms.length} room{rooms.length > 1 ? 's' : ''}
                    {' · '}
                    <button
                      onClick={() => setEditingSearch(s => !s)}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--c-accent)', background: 'none', border: 0, cursor: 'pointer', padding: 0, fontWeight: 600 }}
                    >
                      <Pencil size={11} /> Edit
                    </button>
                  </p>
                </div>
                <button onClick={() => setDetailExpanded(x => !x)} title={detailExpanded ? 'Collapse' : 'Expand'} style={{ ...iconBtnStyle, marginTop: 2 }}>
                  {detailExpanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                </button>
                <button
                  onClick={() => { setDetailHotel(null); setDetailExpanded(false); setEditingSearch(false); syncUrl({ hotelId: null }); }}
                  title="Close"
                  style={{ ...iconBtnStyle, marginTop: 2 }}
                >
                  <X size={14} />
                </button>
              </div>

              {/* Edit-search re-check form */}
              {editingSearch && (
                <div className="c-card" style={{ padding: 14, margin: '14px 18px 0', overflow: 'visible', position: 'relative', zIndex: 10 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 10, alignItems: 'end' }}>
                    <div style={{ position: 'relative' }}>
                      <label style={labelStyle}>Dates</label>
                      <DateRangePicker checkIn={checkIn} checkOut={checkOut} onChange={({ checkIn, checkOut }) => { setCheckIn(checkIn); setCheckOut(checkOut); }} />
                    </div>
                    <div style={{ position: 'relative' }}>
                      <label style={labelStyle}>Guests</label>
                      <GuestSelector rooms={rooms} onChange={setRooms} />
                    </div>
                    <button className="c-btn c-btn-primary" onClick={() => { void loadRatesFor(detailHotel); setEditingSearch(false); }} disabled={ratesBusy}>
                      {ratesBusy ? <Loader2 size={13} className="animate-spin" /> : <Search size={13} />}
                      Re-check
                    </button>
                  </div>
                </div>
              )}

              {/* Drawer body (scrollable both axes — the rate table is wide,
                  so allow horizontal scroll as a safety net; ⤢ expand widens
                  the drawer to near-full-width for the booking step). */}
              <div style={{ flex: 1, overflowY: 'auto', overflowX: 'auto', padding: 18 }}>
            {/* Per-hotel "Manage" controls — visibility, pricing, transfer,
                airport proximity, notes. Collapsible so it doesn't crowd the
                rate table; refreshes the result-card badges on save. */}
            <ManagePanel
              hotelId={detailHotel.id}
              hotelName={detailHotel.name}
              userEmail={user?.email || ''}
              onSaved={(row) => refreshControl(detailHotel.id, row)}
              onCloseDrawer={() => { setDetailHotel(null); setDetailExpanded(false); setEditingSearch(false); syncUrl({ hotelId: null }); }}
            />
            {/* Internal note surfaced + editable right under the Manage button
                (same control field as the Manage panel + MCP set_hotel_note).
                Shows an "Add internal note" button when empty. */}
            <InlineNote
              hotelId={detailHotel.id}
              note={controlMap[detailHotel.id]?.internal_notes || ''}
              userEmail={user?.email || ''}
              onSaved={(row) => refreshControl(detailHotel.id, row)}
            />
            {ratesErr && <div style={{ color: 'var(--c-danger)', fontSize: 13, marginBottom: 10 }}>Error: {ratesErr}</div>}

            {/* Hotel info section — appears above the rate list so the
                consultant has context (description, amenities, policies)
                while picking a rate to book. Renders the moment content
                arrives; the rate table loads into its own skeleton below
                so the drawer is never a blank spinner. */}
            {!chosenRate && detailContent && (
              <HotelInfo content={detailContent} />
            )}

            {/* Rates load into a room-card skeleton so the consultant sees
                the shell immediately rather than a lone "fetching" line. */}
            {ratesBusy && <RatesSkeleton hasContent={!!detailContent} />}
            {!ratesBusy && !ratesErr && rates.length === 0 && (
              <div style={{ color: 'var(--c-fg-muted)', fontSize: 13 }}>No rates returned for these dates.</div>
            )}

            {/* Supplier filter banner: when user clicked a supplier row
                on the list card, we focus the detail view on just that
                supplier. Banner offers to expand back to all suppliers. */}
            {supplierFocus && rates.some(r => r.supplier && r.supplier !== supplierFocus) && (
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                gap: 12, padding: '8px 12px', marginBottom: 10,
                background: 'var(--c-bg-soft)', border: '1px dashed var(--c-line)', borderRadius: 6,
                fontSize: 12.5
              }}>
                <span>
                  Showing <strong>{supplierFocus}</strong> rates only ({rates.filter(r => r.supplier === supplierFocus).length} of {rates.length})
                </span>
                <button
                  onClick={() => { setSupplierFocus(null); syncUrl({ supplier: null }); }}
                  style={{ background: 'none', border: 0, color: 'var(--c-accent)', fontWeight: 600, fontSize: 12, cursor: 'pointer' }}
                >Show all suppliers</button>
              </div>
            )}
            {/* Lazy rate-channel compare. Rates default to Member (CUG)
                everywhere. On demand we fetch the B2C channel for THIS hotel
                and merge it in (tagged), so consultants see both side by side
                without paying the 2x ETG cost (10/min cap) on every search. */}
            {rates.length > 0 && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10,
                fontSize: 12.5, color: 'var(--c-fg-soft)'
              }}>
                <span>Showing <strong>Member</strong> rates{b2cLoaded ? ' + Non-Member' : ''}.</span>
                {!b2cLoaded && (
                  <button
                    onClick={() => detailHotel && void addB2CRates(detailHotel)}
                    disabled={b2cBusy}
                    title="Also fetch the public non-member price for this hotel and compare it against the member rate"
                    style={{
                      fontSize: 12, padding: '4px 12px', borderRadius: 999,
                      border: '1px solid var(--c-line)', cursor: b2cBusy ? 'wait' : 'pointer',
                      background: 'var(--c-bg)', color: 'var(--c-accent)', fontWeight: 600,
                      opacity: b2cBusy ? 0.6 : 1,
                    }}
                  >{b2cBusy ? 'Loading non-member…' : 'Compare non-member price'}</button>
                )}
              </div>
            )}
            {/* Discount scanner — how the cheapest HB discount moves across
                the year for THIS hotel. Keyed by hotel id so its scan state
                resets cleanly when the consultant bounces to another hotel. */}
            {rates.length > 0 && detailHotel && (
              <DiscountScanner
                key={detailHotel.id}
                hotelId={detailHotel.id}
                rooms={rooms}
                citizenship={citizenship}
                defaultNights={Number(controlMap[detailHotel.id]?.package_nights) || 5}
              />
            )}
            {rates.length > 0 && (
              <RoomGroupedRates
                rates={supplierFocus ? rates.filter(r => r.supplier === supplierFocus) : rates}
                presentation={presentation}
                onChoose={(r) => {
                  setChosenRate(r);
                  // Audit: tell the backend which rate the consultant
                  // picked. Fire-and-forget — the user shouldn't wait
                  // on this and a write failure must not block the
                  // booking flow.
                  if (searchId) {
                    fetch(`/api/admin/search/decisions/${searchId}/choose`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ rateKey: r.rateKey, supplier: r.supplier })
                    }).catch(() => {});
                  }
                }}
                marginTop={detailContent ? 18 : 0}
                control={detailHotel ? controlMap[detailHotel.id] : undefined}
                rooms={rooms}
                roomMap={roomMap}
              />
            )}

            {/* Booking opens in BookingSidebar (rendered after the drawer). */}
              </div>
            </aside>
          </>
        )}
      </div>

      {/* Booking sidebar — slides in from the right when consultant
          clicks 'Choose' on a rate. Keeps the hotel info + rate
          table visible on the left while they fill customer details. */}
      {chosenRate && (
        <BookingSidebar
          hotel={detailHotel}
          rate={chosenRate}
          checkIn={checkIn}
          checkOut={checkOut}
          rooms={rooms}
          citizenship={citizenship}
          custFirst={custFirst}  setCustFirst={setCustFirst}
          custLast={custLast}    setCustLast={setCustLast}
          extraRoomGuests={extraRoomGuests}
          setExtraRoomGuests={setExtraRoomGuests}
          custEmail={custEmail}  setCustEmail={setCustEmail}
          custPhone={custPhone}  setCustPhone={setCustPhone}
          busy={bookingBusy}
          error={bookingErr}
          result={bookingResult}
          // Prebook state — sidebar shows "Verifying rate…" until done
          // and surfaces the price-change banner / cancellation-policy
          // confirmation before unlocking the submit button.
          prebookBusy={prebookBusy}
          prebookErr={prebookErr}
          prebook={prebook}
          acceptedNewPrice={acceptedNewPrice}
          onAcceptNewPrice={() => setAcceptedNewPrice(true)}
          canSubmit={!!prebook?.prebookHash && acceptedNewPrice}
          onClose={() => { setChosenRate(null); setBookingErr(null); setBookingResult(null); }}
          onConfirm={confirmBooking}
          onBookAnother={() => { setBookingResult(null); setChosenRate(null); setCustFirst(''); setCustLast(''); setCustEmail(''); setCustPhone(''); }}
        />
      )}

      {/* Agent lives on its own page now — /console/ai */}
    </div>
  );
}

// Normalize a room name for cross-supplier matching: lowercase + trim +
// collapse internal whitespace. Used on BOTH the room_mappings side and the
// rate side so a Hummingbird/RateHawk rate can resolve to its canonical room.
function normName(s: string | null | undefined): string {
  return (s || '').toLowerCase().trim().replace(/\s+/g, ' ');
}

// ─── small style helpers ────────────────────────────────────────
const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 11, color: 'var(--c-fg-muted)', textTransform: 'uppercase',
  letterSpacing: '0.04em', marginBottom: 4, fontWeight: 700
};
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 10px', fontSize: 14,
  border: '1px solid var(--c-line)', borderRadius: 6, background: 'var(--c-bg)', color: 'var(--c-fg)'
};
const iconBtnStyle: React.CSSProperties = {
  border: '1px solid var(--c-line)', borderRadius: 6, background: 'var(--c-bg)', cursor: 'pointer',
  padding: 6, color: 'var(--c-fg-soft)'
};
const priceLabelStyle: React.CSSProperties = {
  fontSize: 10, color: 'var(--c-fg-muted)', letterSpacing: '0.04em', marginBottom: 2, fontWeight: 700
};
function badgeStyle(supplier: string): React.CSSProperties {
  const map: Record<string, string> = { ratehawk: '#1f6feb', hummingbird: '#7c3aed' };
  const color = map[supplier] || '#525252';
  return {
    fontSize: 10, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase',
    color, border: `1px solid ${color}33`, background: `${color}11`, padding: '2px 8px', borderRadius: 999
  };
}
// Plan signature — pairs the SAME room+meal+cancellation across the Member
// and Non-Member channels so compare mode can sit the twin rates adjacent.
// Bedding/view is already in the room-group key, so meal + refundability is
// enough to identify the twin within a group.
function planSigOf(r: AdminRate): string {
  return `${r.ratePlan || 'nomeal'}|${r.refundable ? 'ref' : 'nonref'}`;
}

// Rate-channel badge — Member (CUG, our negotiated price) vs Non-Member
// (RateHawk's public B2C price). Only shown once the consultant has clicked
// "Compare Non-Member" so both channels coexist in the list.
function channelBadgeStyle(channel: 'cug' | 'b2c' | 'all'): React.CSSProperties {
  // 'all' = member & non-member price are identical → no member advantage (grey).
  const color = channel === 'cug' ? '#0a7d3e' : channel === 'b2c' ? '#b45309' : '#6b7280';
  return {
    marginLeft: 5,
    fontSize: 10, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase',
    color, border: `1px solid ${color}33`, background: `${color}11`, padding: '2px 8px', borderRadius: 999
  };
}
function fmtMoney(n?: number) {
  if (n === undefined || n === null || isNaN(n)) return '—';
  return n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

// Round a money figure to whole dollars for the decluttered rate-table cells
// (NET/SELL show totals-first; cents add noise). Passes undefined/null through
// so fmtMoney renders its em-dash placeholder.
function roundOrUndef(n?: number | null) {
  return n === undefined || n === null || isNaN(n) ? undefined : Math.round(n);
}

// Composite rate scorer — Valentin's recommendation (2026-05-28) is
// "don't optimize only for lowest price; surface 3–5 rates with
// different conditions per room type." This scores each rate so the
// UI can rank within a room group and highlight one with a
// "Recommended" border. Signals (per user 2026-05-28 decision):
//   • sell price (lower = better, normalised against the pool's min)
//   • refundability (with cancellation-window distance reinforcing)
//   • margin tie-break for B2B (consultant sees both quotes anyway)
// Meal plan and supplier preference are intentionally NOT in the
// score (user excluded; consultants pick by meal manually).
type ScorableRate = {
  pricing?: {
    sell?: { totalAmount?: number; nightlyAmount?: number };
    markup?: { amount?: number };
  };
  refundable?: boolean | null;
  cancellationDeadlineUtc?: string | null;
};
function scoreRate(rate: ScorableRate, poolMinSellTotal: number, opts?: { isB2B?: boolean }): number {
  let score = 0;
  // Price: normalise against the pool min. Cheapest gets +0; each
  // 1% over loses ~1 point. A rate 20% above cheapest loses 20 pts.
  const sell = rate.pricing?.sell?.totalAmount ?? Infinity;
  if (poolMinSellTotal > 0 && isFinite(sell)) {
    const ratio = sell / poolMinSellTotal;
    score -= (ratio - 1) * 100;
  } else if (!isFinite(sell)) {
    score -= 200;
  }
  // Refundability: solid bump. Reinforced when there's real cushion
  // on the cancellation deadline (consultants love a wide window).
  if (rate.refundable) {
    score += 25;
    if (rate.cancellationDeadlineUtc) {
      const daysOut = (new Date(rate.cancellationDeadlineUtc).getTime() - Date.now()) / 86400000;
      if (daysOut > 7) score += 15;
      else if (daysOut > 2) score += 8;
    }
  }
  // Margin tie-break (B2B only): nudge toward higher-markup options
  // when the rest is equal. Small weight so this never trumps a real
  // price/refund difference.
  if (opts?.isB2B && typeof rate.pricing?.markup?.amount === 'number') {
    score += rate.pricing.markup.amount * 0.05;
  }
  return score;
}

// Short cancellation deadline rendering for the search list. Full ISO
// timestamp would crowd the card — consultants only need date + time
// in local format ("25 Jun 14:00"). Detail page shows the full UTC
// timestamp per ETG cert §5.
function fmtCancelDate(iso?: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) +
    ' ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });
}

function Row({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: 12, alignItems: 'baseline' }}>
      <span style={{ fontSize: 11, color: 'var(--c-fg-muted)', textTransform: 'uppercase', letterSpacing: 0.04, fontWeight: 700 }}>{label}</span>
      <span style={{ fontFamily: mono ? 'var(--c-mono)' : undefined, fontSize: mono ? 12.5 : 13, color: 'var(--c-fg)' }}>{value}</span>
    </div>
  );
}

/**
 * Compact hotel detail card — description, top amenities, key policies
 * (check-in / check-out / metapolicy snapshot). Renders above the
 * rate list so the consultant has context while picking a rate.
 */
/**
 * Multi-supplier hotel card. Hotel header on top, one full-width row
 * per supplier underneath. Recommended row gets a gold outline.
 * Clicking the hotel header opens detail unfiltered; clicking a
 * supplier row opens detail pre-filtered to that supplier.
 *
 * Used only when h.priced.quotes.length > 1. Singletons stay on the
 * compact stacked layout — see filteredHits.map for the dispatch.
 */
// ─── Per-hotel "Manage" panel ───────────────────────────────────
// Editable form over the hotel-api control row. Loads on open, tracks a
// dirty flag, and saves via PUT /api/admin/control. On markup save it ALSO
// writes a per-hotel booking-engine pricing rule (the thing that actually
// changes the sell price) and echoes the % into control.markup_override_pct.
// Numeric fields from postgres arrive as strings — we keep them as strings
// in form state and coerce on save.

// Editable form shape — every field a string|boolean so inputs stay
// controlled; coerced to the API's types on save.
type ManageForm = {
  network_status: NetworkStatus;
  // Luxury curation tier: '' (standard 5★, → null) | '5plus' | '5plusplus'.
  luxury_tier: '' | LuxuryTier;
  // Lowercase supplier keys currently blocked for this hotel (e.g. ['ratehawk']).
  blocked_suppliers: string[];
  markup_override_pct: string;
  recommend_rank: string;
  transfer_type: string;
  // tri-state: '' = auto (null), 'yes' = true, 'no' = false
  transfer_included_override: '' | 'yes' | 'no';
  transfer_cost_adult: string;
  transfer_cost_child: string;
  transfer_currency: string;
  transfer_duration: string;
  transfer_notes: string;
  airport_code: string;
  airport_terminal: string;
  proximity_tier: string;
  airside: boolean;
  walk_minutes: string;
  day_use: boolean;
  internal_notes: string;
  // Marketing / Offer
  promotion_name: string;
  offers: string;            // textarea — one offer per line
  stay_from: string;         // YYYY-MM-DD
  stay_until: string;        // YYYY-MM-DD
  advertise_stay_until: string; // YYYY-MM-DD
  book_by: string;           // YYYY-MM-DD
  min_nights: string;
  package_nights: string;
  terms_conditions: string;
  competitor_comparison: CompetitorFormRow[]; // repeater rows (strings for inputs)
};

// Repeater row as strings so inputs stay controlled; coerced on save.
type CompetitorFormRow = { name: string; rate: string; currency: string };

// ── Editorial overrides (subset surfaced in the ManagePanel) ──
// Full media/reviews live on /console/editorial; here we expose the
// high-value override fields. Saved via POST /api/admin/editorial.
type EditorialForm = {
  title_override: string;
  subtitle: string;
  highlight_text: string;
  featured_badge: string;
  feature_priority: string; // numeric input kept as string
  is_featured: boolean;
};
function emptyEditorialForm(): EditorialForm {
  return { title_override: '', subtitle: '', highlight_text: '', featured_badge: '', feature_priority: '', is_featured: false };
}
function overridesToForm(ov: any): EditorialForm {
  const str = (v: any) => v === null || v === undefined ? '' : String(v);
  return {
    title_override:  str(ov?.title_override),
    subtitle:        str(ov?.subtitle),
    highlight_text:  str(ov?.highlight_text),
    featured_badge:  str(ov?.featured_badge),
    feature_priority: ov?.feature_priority === null || ov?.feature_priority === undefined ? '' : String(ov.feature_priority),
    is_featured:     ov?.is_featured === true,
  };
}
function editorialFormToBody(f: EditorialForm, updatedBy: string) {
  const txt = (s: string) => s.trim() === '' ? null : s.trim();
  const n = f.feature_priority.trim();
  return {
    title_override: txt(f.title_override),
    subtitle: txt(f.subtitle),
    highlight_text: txt(f.highlight_text),
    featured_badge: txt(f.featured_badge),
    feature_priority: n === '' || isNaN(Number(n)) ? null : Math.round(Number(n)),
    is_featured: f.is_featured,
    updated_by: updatedBy || undefined,
  };
}

// Lightweight collection row from GET /api/admin/collections?status=all.
type CollectionLite = { id: number; slug: string; title?: string; status?: string; hotelCount?: number };

function controlToForm(c: HotelControl | null): ManageForm {
  const triState = (v: boolean | null | undefined): '' | 'yes' | 'no' => v === true ? 'yes' : v === false ? 'no' : '';
  const str = (v: string | number | null | undefined) => v === null || v === undefined ? '' : String(v);
  // Dates may arrive as 'YYYY-MM-DD' or a full ISO timestamp — keep just the day.
  const dateStr = (v: string | null | undefined) => {
    const s = str(v);
    return s ? s.slice(0, 10) : '';
  };
  const competitors: CompetitorFormRow[] = Array.isArray(c?.competitor_comparison)
    ? c!.competitor_comparison!.map(r => ({
        name: str(r?.name),
        rate: r?.rate === null || r?.rate === undefined ? '' : String(r.rate),
        currency: str(r?.currency) || 'AUD',
      }))
    : [];
  return {
    network_status: (c?.network_status as NetworkStatus) || 'active',
    luxury_tier: (c?.luxury_tier === '5plus' || c?.luxury_tier === '5plusplus') ? c.luxury_tier : '',
    // Folds legacy use_ratehawk===false into 'ratehawk' so existing data shows.
    blocked_suppliers: blockedSuppliersOf(c),
    markup_override_pct: str(c?.markup_override_pct),
    recommend_rank: str(c?.recommend_rank),
    transfer_type: str(c?.transfer_type),
    transfer_included_override: triState(c?.transfer_included_override),
    transfer_cost_adult: str(c?.transfer_cost_adult),
    transfer_cost_child: str(c?.transfer_cost_child),
    transfer_currency: str(c?.transfer_currency),
    transfer_duration: str(c?.transfer_duration),
    transfer_notes: str(c?.transfer_notes),
    airport_code: str(c?.airport_code).toUpperCase(),
    airport_terminal: str(c?.airport_terminal),
    proximity_tier: str(c?.proximity_tier),
    airside: c?.airside === true,
    walk_minutes: str(c?.walk_minutes),
    day_use: c?.day_use === true,
    internal_notes: str(c?.internal_notes),
    // Marketing / Offer
    promotion_name: str(c?.promotion_name),
    offers: Array.isArray(c?.offers) ? c!.offers!.join('\n') : '',
    stay_from: dateStr(c?.stay_from),
    stay_until: dateStr(c?.stay_until),
    advertise_stay_until: dateStr(c?.advertise_stay_until),
    book_by: dateStr(c?.book_by),
    min_nights: str(c?.min_nights),
    package_nights: str(c?.package_nights),
    terms_conditions: str(c?.terms_conditions),
    competitor_comparison: competitors,
  };
}

// Inline internal-note editor shown under "Manage this hotel". Reads/writes
// hotel_control.internal_notes via the same control PUT the Manage panel + the
// MCP set_hotel_note tool use — a partial upsert, so other control fields are
// untouched. Lets a consultant add/edit a note without opening the full panel.
function InlineNote({ hotelId, note, userEmail, onSaved }: {
  hotelId: number;
  note: string;
  userEmail: string;
  onSaved: (row: HotelControl) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(note);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Reset when switching hotels or when the saved note changes externally.
  useEffect(() => { setDraft(note); setEditing(false); setErr(null); }, [note, hotelId]);

  async function save() {
    setSaving(true); setErr(null);
    try {
      const res = await fetch(`/api/admin/control?hotelId=${hotelId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ internal_notes: draft.trim(), updated_by: userEmail }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || json?.message || `Save failed (HTTP ${res.status})`);
      const saved: HotelControl = (json && json.data && typeof json.data === 'object') ? json.data : (json || {});
      onSaved(saved);
      setEditing(false);
    } catch (e: any) {
      setErr(e?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <div style={{ marginBottom: 14, padding: '10px 12px', borderRadius: 8, border: '1px solid var(--c-line)', background: 'var(--c-bg-soft)' }}>
        <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--c-fg-muted)', marginBottom: 6 }}>Internal note</div>
        <textarea
          className="c-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={3}
          autoFocus
          placeholder="e.g. Expedia TAAP ~12% comm; RateHawk cheaper net"
          style={{ width: '100%', fontSize: 13, resize: 'vertical' }}
        />
        {err && <div style={{ color: 'var(--c-danger)', fontSize: 12, marginTop: 4 }}>{err}</div>}
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <button className="c-btn c-btn-primary" onClick={() => void save()} disabled={saving} style={{ fontSize: 12.5, padding: '5px 14px' }}>
            {saving ? 'Saving…' : 'Save note'}
          </button>
          <button className="c-btn" onClick={() => { setDraft(note); setEditing(false); setErr(null); }} disabled={saving} style={{ fontSize: 12.5, padding: '5px 14px' }}>Cancel</button>
        </div>
      </div>
    );
  }

  if (!note.trim()) {
    return (
      <button onClick={() => setEditing(true)} className="c-btn" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 14, fontSize: 12.5 }}>
        <StickyNote size={13} /> Add internal note
      </button>
    );
  }

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 14, padding: '10px 12px', borderRadius: 8, border: '1px solid var(--c-line)', background: 'var(--c-bg-soft)' }}>
      <StickyNote size={14} style={{ color: 'var(--c-accent)', flexShrink: 0, marginTop: 2 }} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 2 }}>
          <span style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--c-fg-muted)' }}>Internal note</span>
          <button onClick={() => setEditing(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--c-accent)', fontSize: 11, fontWeight: 600 }}>
            <Pencil size={11} /> Edit
          </button>
        </div>
        <div style={{ fontSize: 13, color: 'var(--c-fg)', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{note}</div>
      </div>
    </div>
  );
}

function ManagePanel({ hotelId, hotelName, userEmail, onSaved, onCloseDrawer }: {
  hotelId: number;
  hotelName: string;
  userEmail: string;
  onSaved: (row: HotelControl) => void;
  // Fast-tag "Save & next": close the drawer so Tina opens the next hotel.
  onCloseDrawer: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [fastTag, setFastTag] = useState(false); // airport-only quick mode
  const [loading, setLoading] = useState(false);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [form, setForm] = useState<ManageForm>(controlToForm(null));
  const [baseline, setBaseline] = useState<ManageForm>(controlToForm(null));
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  // Note when the pricing-rule write is skipped/failed (markup still saved).
  const [ruleNote, setRuleNote] = useState<string | null>(null);

  // ── Editorial group state (separate endpoint from the control PUT) ──
  const [edForm, setEdForm] = useState<EditorialForm>(emptyEditorialForm());
  const [edBaseline, setEdBaseline] = useState<EditorialForm>(emptyEditorialForm());
  const [edLoaded, setEdLoaded] = useState(false);
  const [edLoading, setEdLoading] = useState(false);
  const [edSaving, setEdSaving] = useState(false);
  const [edErr, setEdErr] = useState<string | null>(null);
  const [edSavedAt, setEdSavedAt] = useState<number | null>(null);
  const edDirty = useMemo(() => JSON.stringify(edForm) !== JSON.stringify(edBaseline), [edForm, edBaseline]);
  const setEd = <K extends keyof EditorialForm>(k: K, v: EditorialForm[K]) =>
    setEdForm(prev => ({ ...prev, [k]: v }));

  // Lazily load editorial overrides the first time the panel opens.
  useEffect(() => {
    if (!open || edLoaded || edLoading) return;
    let cancelled = false;
    setEdLoading(true);
    (async () => {
      try {
        const res = await fetch(`/api/admin/editorial?hotelId=${hotelId}`, { cache: 'no-store' });
        const json = await res.json().catch(() => null);
        if (cancelled) return;
        // Proxy returns { overrides: { success, data }, tags }. The row is .overrides.data.
        const ov = json?.overrides?.data ?? json?.overrides ?? null;
        const f = overridesToForm(ov);
        setEdForm(f);
        setEdBaseline(f);
        setEdLoaded(true);
      } catch {
        if (!cancelled) setEdErr('Could not load editorial');
      } finally {
        if (!cancelled) setEdLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, hotelId]);

  // Reset editorial cache when switching hotel so the next open refetches.
  useEffect(() => {
    setEdLoaded(false);
    setEdForm(emptyEditorialForm());
    setEdBaseline(emptyEditorialForm());
    setEdSavedAt(null);
    setEdErr(null);
  }, [hotelId]);

  async function saveEditorial() {
    setEdSaving(true);
    setEdErr(null);
    try {
      const body = editorialFormToBody(edForm, userEmail);
      const res = await fetch(`/api/admin/editorial?hotelId=${hotelId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || json?.message || `Save failed (HTTP ${res.status})`);
      const saved = json?.data ?? json ?? null;
      const f = overridesToForm(saved);
      setEdForm(f);
      setEdBaseline(f);
      setEdSavedAt(Date.now());
    } catch (e: any) {
      setEdErr(e?.message || 'Save failed');
    } finally {
      setEdSaving(false);
    }
  }

  // ── Collections group state (lazy on expand; per-collection toggle) ──
  const [colExpanded, setColExpanded] = useState(false);
  const [collections, setCollections] = useState<CollectionLite[]>([]);
  const [colLoading, setColLoading] = useState(false);
  const [colErr, setColErr] = useState<string | null>(null);
  // collectionId → membership (true/false), undefined while resolving.
  const [colMembership, setColMembership] = useState<Record<number, boolean>>({});
  // collectionId → true while a toggle POST/DELETE is in flight.
  const [colSaving, setColSaving] = useState<Record<number, boolean>>({});

  // Reset collections cache when switching hotel.
  useEffect(() => {
    setColExpanded(false);
    setCollections([]);
    setColMembership({});
    setColErr(null);
  }, [hotelId]);

  // When the Collections group is expanded, fetch the list + each collection's
  // detail once to learn which contain this hotel. There are only a handful.
  useEffect(() => {
    if (!colExpanded || collections.length > 0 || colLoading) return;
    let cancelled = false;
    setColLoading(true);
    setColErr(null);
    (async () => {
      try {
        const listRes = await fetch('/api/admin/collections?status=all', { cache: 'no-store' });
        const listJson = await listRes.json().catch(() => null);
        const cols: CollectionLite[] = Array.isArray(listJson?.collections) ? listJson.collections : [];
        if (cancelled) return;
        setCollections(cols);
        // Resolve membership per collection (detail keyed by slug via the proxy).
        const membership: Record<number, boolean> = {};
        await Promise.all(cols.map(async (c) => {
          try {
            const dRes = await fetch(`/api/admin/collections/${encodeURIComponent(c.slug || c.id)}`, { cache: 'no-store' });
            const dJson = await dRes.json().catch(() => null);
            const hotels: any[] = Array.isArray(dJson?.hotels) ? dJson.hotels : [];
            membership[c.id] = hotels.some(h => Number(h.hotelId) === Number(hotelId));
          } catch {
            membership[c.id] = false;
          }
        }));
        if (!cancelled) setColMembership(membership);
      } catch {
        if (!cancelled) setColErr('Could not load collections');
      } finally {
        if (!cancelled) setColLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colExpanded, hotelId]);

  async function toggleCollection(c: CollectionLite, on: boolean) {
    setColSaving(prev => ({ ...prev, [c.id]: true }));
    setColErr(null);
    try {
      const res = await fetch(`/api/admin/collections/${c.id}/hotels/${hotelId}`, {
        method: on ? 'POST' : 'DELETE',
      });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        throw new Error(j?.error || j?.message || `HTTP ${res.status}`);
      }
      setColMembership(prev => ({ ...prev, [c.id]: on }));
    } catch (e: any) {
      setColErr(`${c.title || c.slug}: ${e?.message || 'toggle failed'}`);
    } finally {
      setColSaving(prev => ({ ...prev, [c.id]: false }));
    }
  }

  const dirty = useMemo(() => JSON.stringify(form) !== JSON.stringify(baseline), [form, baseline]);

  // Load the control row whenever the panel is first expanded for a hotel.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setLoadErr(null);
    (async () => {
      try {
        const res = await fetch(`/api/admin/control?hotelId=${hotelId}`, { cache: 'no-store' });
        const json = await res.json().catch(() => null);
        if (cancelled) return;
        // hotel-api returns the row directly or wrapped in .data; a missing
        // row (never managed) → defaults.
        const row: HotelControl | null = json && typeof json === 'object'
          ? (json.data && typeof json.data === 'object' ? json.data : (json.hotel_id !== undefined || json.network_status !== undefined ? json : null))
          : null;
        const f = controlToForm(row);
        setForm(f);
        setBaseline(f);
      } catch (e: any) {
        if (!cancelled) setLoadErr(e?.message || 'Could not load controls');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // Reload only when (re)opening or switching hotel.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, hotelId]);

  const set = <K extends keyof ManageForm>(k: K, v: ManageForm[K]) =>
    setForm(prev => ({ ...prev, [k]: v }));

  // Competitor-comparison repeater helpers.
  const addCompetitor = () =>
    setForm(prev => ({ ...prev, competitor_comparison: [...prev.competitor_comparison, { name: '', rate: '', currency: 'AUD' }] }));
  const removeCompetitor = (i: number) =>
    setForm(prev => ({ ...prev, competitor_comparison: prev.competitor_comparison.filter((_, idx) => idx !== i) }));
  const setCompetitor = (i: number, patch: Partial<CompetitorFormRow>) =>
    setForm(prev => ({
      ...prev,
      competitor_comparison: prev.competitor_comparison.map((r, idx) => idx === i ? { ...r, ...patch } : r),
    }));

  function formToBody(f: ManageForm): HotelControl {
    const num = (s: string): number | null => s.trim() === '' || isNaN(Number(s)) ? null : Number(s);
    const intNum = (s: string): number | null => { const n = num(s); return n === null ? null : Math.round(n); };
    const txt = (s: string): string | null => s.trim() === '' ? null : s.trim();
    const dateVal = (s: string): string | null => s.trim() === '' ? null : s.trim();
    // offers textarea → trimmed non-empty string[] (one per line).
    const offers = f.offers
      .split('\n')
      .map(o => o.trim())
      .filter(Boolean);
    // competitor rows → array, dropping rows with no name AND no rate.
    const competitors: CompetitorRow[] = f.competitor_comparison
      .map(r => ({ name: r.name.trim(), rate: num(r.rate), currency: r.currency.trim() || 'AUD' }))
      .filter(r => r.name !== '' || r.rate !== null);
    // Send the generalized array AND keep use_ratehawk in sync for back-compat
    // (enforcement honours both until use_ratehawk is retired).
    const blocked = Array.from(new Set(f.blocked_suppliers.map(s => s.trim().toLowerCase()).filter(Boolean)));
    return {
      network_status: f.network_status,
      luxury_tier: f.luxury_tier === '' ? null : f.luxury_tier,
      blocked_suppliers: blocked,
      use_ratehawk: !blocked.includes('ratehawk'),
      markup_override_pct: num(f.markup_override_pct),
      recommend_rank: intNum(f.recommend_rank),
      transfer_type: txt(f.transfer_type),
      transfer_included_override: f.transfer_included_override === '' ? null : f.transfer_included_override === 'yes',
      transfer_cost_adult: num(f.transfer_cost_adult),
      transfer_cost_child: num(f.transfer_cost_child),
      transfer_currency: txt(f.transfer_currency),
      transfer_duration: txt(f.transfer_duration),
      transfer_notes: txt(f.transfer_notes),
      airport_code: f.airport_code.trim() ? f.airport_code.trim().toUpperCase() : null,
      airport_terminal: txt(f.airport_terminal),
      proximity_tier: txt(f.proximity_tier) as ProximityTier | null,
      airside: f.airside,
      walk_minutes: intNum(f.walk_minutes),
      day_use: f.day_use,
      internal_notes: txt(f.internal_notes),
      // Marketing / Offer — offers + competitor_comparison sent as real arrays;
      // the proxy / hotel-api JSON-encode them into the jsonb columns.
      promotion_name: txt(f.promotion_name),
      offers,
      stay_from: dateVal(f.stay_from),
      stay_until: dateVal(f.stay_until),
      advertise_stay_until: dateVal(f.advertise_stay_until),
      book_by: dateVal(f.book_by),
      min_nights: intNum(f.min_nights),
      package_nights: intNum(f.package_nights),
      terms_conditions: txt(f.terms_conditions),
      competitor_comparison: competitors,
      updated_by: userEmail || undefined,
    };
  }

  // Persist a per-hotel pricing rule so the markup actually changes the sell
  // price. Best-effort: if the proxy rejects, surface a note but still let
  // the control save succeed.
  async function writePricingRule(pct: number): Promise<string | null> {
    try {
      const res = await fetch('/api/pricing/rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Console pricing-rule shape (pricingRulesMap.toBackend maps it to the
        // booking-engine model). hotel_id condition → per-hotel rule; high
        // priority so it wins the cascade over destination/global rules.
        body: JSON.stringify({
          name: `Hotel ${hotelId} override`,
          markup_type: 'percentage',
          markup_value: pct,
          priority: 100,
          is_active: true,
          conditions: { hotel_id: hotelId, hotel_name: hotelName || undefined },
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        return `rule write skipped — ${j?.message || j?.error || `HTTP ${res.status}`}`;
      }
      return null;
    } catch (e: any) {
      return `rule write skipped — ${e?.message || 'wire pricing POST'}`;
    }
  }

  async function save() {
    setSaving(true);
    setSaveErr(null);
    setRuleNote(null);
    try {
      const body = formToBody(form);
      // 1) Pricing rule first (only when the markup actually changed) so the
      //    note is ready before we report the save.
      let note: string | null = null;
      const pct = body.markup_override_pct;
      if (typeof pct === 'number' && form.markup_override_pct !== baseline.markup_override_pct) {
        note = await writePricingRule(pct);
      }
      // 2) Control row (always).
      const res = await fetch(`/api/admin/control?hotelId=${hotelId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || json?.message || `Save failed (HTTP ${res.status})`);
      const saved: HotelControl = (json && json.data && typeof json.data === 'object') ? json.data : (json || body);
      const f = controlToForm(saved);
      setForm(f);
      setBaseline(f);
      setSavedAt(Date.now());
      setRuleNote(note);
      onSaved(saved);
      // Fast-tag flow: after saving the airport tags, close the drawer so the
      // consultant can immediately open the next hotel from the results list.
      if (fastTag && !note) onCloseDrawer();
    } catch (e: any) {
      setSaveErr(e?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <div style={{ marginBottom: 14 }}>
        <button
          onClick={() => setOpen(true)}
          className="c-btn"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
        >
          <Pencil size={13} /> Manage this hotel
        </button>
      </div>
    );
  }

  return (
    <div className="c-card" style={{ padding: 14, marginBottom: 16 }}>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--c-fg)' }}>Manage hotel</span>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--c-fg-soft)', cursor: 'pointer' }}>
          <input type="checkbox" checked={fastTag} onChange={(e) => setFastTag(e.target.checked)} />
          Fast-tag (airport only)
        </label>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
          {dirty && <span style={{ fontSize: 11.5, color: 'var(--c-accent)', fontWeight: 600 }}>Unsaved changes</span>}
          {!dirty && savedAt && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11.5, color: 'var(--c-success)' }}><CheckCircle2 size={12} /> Saved</span>}
          <button onClick={() => setOpen(false)} title="Collapse" style={{ ...iconBtnStyle }}><Minimize2 size={13} /></button>
        </div>
      </div>

      {loading && <div style={{ fontSize: 13, color: 'var(--c-fg-muted)', display: 'inline-flex', alignItems: 'center', gap: 6 }}><Loader2 size={13} className="animate-spin" /> Loading controls…</div>}
      {loadErr && <div style={{ fontSize: 13, color: 'var(--c-danger)' }}>Error: {loadErr}</div>}

      {!loading && !loadErr && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
          {/* ── Airport proximity (always shown; the only group in fast-tag) ── */}
          <ManageGroup title="Airport proximity">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
              <Field label="Airport code">
                <input className="c-input" value={form.airport_code} maxLength={4}
                  onChange={(e) => set('airport_code', e.target.value.toUpperCase())} placeholder="e.g. MLE" />
              </Field>
              <Field label="Terminal">
                <input className="c-input" value={form.airport_terminal} onChange={(e) => set('airport_terminal', e.target.value)} placeholder="e.g. T1" />
              </Field>
              <Field label="Proximity tier">
                <select className="c-select" value={form.proximity_tier} onChange={(e) => set('proximity_tier', e.target.value)}>
                  <option value="">—</option>
                  <option value="in-terminal">In-terminal</option>
                  <option value="connected">Connected</option>
                  <option value="walkable">Walkable</option>
                  <option value="short-shuttle">Short shuttle</option>
                  <option value="off-airport">Off-airport</option>
                </select>
              </Field>
              <Field label="Walk minutes">
                <input className="c-input" type="number" min={0} value={form.walk_minutes} onChange={(e) => set('walk_minutes', e.target.value)} placeholder="e.g. 5" />
              </Field>
            </div>
            <div style={{ display: 'flex', gap: 18, marginTop: 10, flexWrap: 'wrap' }}>
              <label style={checkLabelStyle}>
                <input type="checkbox" checked={form.airside} onChange={(e) => set('airside', e.target.checked)} /> Airside (inside security)
              </label>
              <label style={checkLabelStyle}>
                <input type="checkbox" checked={form.day_use} onChange={(e) => set('day_use', e.target.checked)} /> Day-use available
              </label>
            </div>
          </ManageGroup>

          {!fastTag && (
            <>
              {/* ── Visibility ── */}
              <ManageGroup title="Visibility">
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
                  <Field label="Network status">
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginTop: 2 }}>
                      {([
                        ['active',  'Active'],
                        ['paused',  'Paused (kept, hidden from site)'],
                        ['hidden',  'Hidden'],
                        ['deleted', 'Deleted'],
                      ] as Array<[NetworkStatus, string]>).map(([val, label]) => (
                        <label key={val} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', color: form.network_status === val ? 'var(--c-fg)' : 'var(--c-fg-soft)' }}>
                          <input
                            type="radio"
                            name="network_status"
                            checked={form.network_status === val}
                            onChange={() => set('network_status', val)}
                          />
                          {label}
                        </label>
                      ))}
                    </div>
                  </Field>
                  <Field label="Curation (luxury tier)">
                    <select className="c-select" value={form.luxury_tier} onChange={(e) => set('luxury_tier', e.target.value as ManageForm['luxury_tier'])}>
                      <option value="">Standard 5★</option>
                      <option value="5plus">5★+ (5plus)</option>
                      <option value="5plusplus">5★++ (5plusplus)</option>
                    </select>
                  </Field>
                  <Field label="Recommended rank">
                    <input className="c-input" type="number" inputMode="numeric"
                      value={form.recommend_rank}
                      onChange={(e) => set('recommend_rank', e.target.value)}
                      placeholder="0 = auto" />
                    <div style={{ fontSize: 10.5, color: 'var(--c-fg-muted)', marginTop: 4 }}>
                      Pins this hotel higher in public “Recommended”. Beats collection + tier. 0 = automatic.
                    </div>
                  </Field>
                </div>
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--c-fg-soft)', marginBottom: 6 }}>
                    Block suppliers for this hotel
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14 }}>
                    {BLOCKABLE_SUPPLIERS.map((s) => {
                      const checked = form.blocked_suppliers.includes(s.key);
                      return (
                        <label key={s.key} style={checkLabelStyle}>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => set(
                              'blocked_suppliers',
                              e.target.checked
                                ? Array.from(new Set([...form.blocked_suppliers, s.key]))
                                : form.blocked_suppliers.filter(k => k !== s.key)
                            )}
                          />
                          {s.label}
                        </label>
                      );
                    })}
                  </div>
                  {form.blocked_suppliers.length > 0 && (
                    <div style={{ fontSize: 11.5, color: 'var(--c-fg-soft)', marginTop: 8 }}>
                      Add the reason in <strong>Internal notes</strong> below (e.g. “RateHawk excludes Harbour meals — book via Expedia”). It shows on the result card and on the “No&nbsp;RateHawk” badge.
                    </div>
                  )}
                </div>
              </ManageGroup>

              {/* ── Pricing ── */}
              <ManageGroup title="Pricing">
                <Field label="Markup override %">
                  <input className="c-input" type="number" step="0.1" style={{ maxWidth: 200 }}
                    value={form.markup_override_pct} onChange={(e) => set('markup_override_pct', e.target.value)} placeholder="e.g. 12.5" />
                </Field>
                <p style={{ fontSize: 11.5, color: 'var(--c-fg-muted)', margin: '6px 0 0' }}>
                  Saving also writes a per-hotel pricing rule (priority 100) so this markup applies to live rates.
                </p>
              </ManageGroup>

              {/* ── Transfer ── */}
              <ManageGroup title="Transfer (Maldives etc.)">
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
                  <Field label="Transfer type">
                    <select className="c-select" value={form.transfer_type} onChange={(e) => set('transfer_type', e.target.value)}>
                      <option value="">—</option>
                      <option value="seaplane">Seaplane</option>
                      <option value="speedboat">Speedboat</option>
                      <option value="domestic-flight">Domestic flight</option>
                      <option value="car">Car / road</option>
                      <option value="ferry">Ferry</option>
                    </select>
                  </Field>
                  <Field label="Included?">
                    <select className="c-select" value={form.transfer_included_override} onChange={(e) => set('transfer_included_override', e.target.value as ManageForm['transfer_included_override'])}>
                      <option value="">Auto (supplier)</option>
                      <option value="yes">Yes — included</option>
                      <option value="no">No — extra cost</option>
                    </select>
                  </Field>
                  <Field label="Cost / adult">
                    <input className="c-input" type="number" step="0.01" value={form.transfer_cost_adult} onChange={(e) => set('transfer_cost_adult', e.target.value)} />
                  </Field>
                  <Field label="Cost / child">
                    <input className="c-input" type="number" step="0.01" value={form.transfer_cost_child} onChange={(e) => set('transfer_cost_child', e.target.value)} />
                  </Field>
                  <Field label="Currency">
                    <input className="c-input" value={form.transfer_currency} maxLength={3} onChange={(e) => set('transfer_currency', e.target.value.toUpperCase())} placeholder="USD" />
                  </Field>
                  <Field label="Duration">
                    <input className="c-input" value={form.transfer_duration} onChange={(e) => set('transfer_duration', e.target.value)} placeholder="e.g. 45 min" />
                  </Field>
                </div>
                <Field label="Transfer notes" style={{ marginTop: 10 }}>
                  <textarea className="c-input" rows={2} value={form.transfer_notes} onChange={(e) => set('transfer_notes', e.target.value)} style={{ resize: 'vertical' }} />
                </Field>
              </ManageGroup>

              {/* ── Marketing / Offer ── */}
              <ManageGroup title="Marketing / Offer">
                <Field label="Promotion name">
                  <input className="c-input" value={form.promotion_name} onChange={(e) => set('promotion_name', e.target.value)} placeholder="e.g. Gili Summer Adventures 2026" />
                </Field>
                <Field label="Offers (one per line)" style={{ marginTop: 10 }}>
                  <textarea className="c-input" rows={3} value={form.offers} onChange={(e) => set('offers', e.target.value)} style={{ resize: 'vertical' }} placeholder={'Free breakfast for two\nComplimentary airport transfer\n50% off spa treatments'} />
                </Field>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginTop: 10 }}>
                  <Field label="Stay from">
                    <input className="c-input" type="date" value={form.stay_from} onChange={(e) => set('stay_from', e.target.value)} />
                  </Field>
                  <Field label="Stay until">
                    <input className="c-input" type="date" value={form.stay_until} onChange={(e) => set('stay_until', e.target.value)} />
                  </Field>
                  <Field label="Advertise stay until">
                    <input className="c-input" type="date" value={form.advertise_stay_until} onChange={(e) => set('advertise_stay_until', e.target.value)} />
                  </Field>
                  <Field label="Book by">
                    <input className="c-input" type="date" value={form.book_by} onChange={(e) => set('book_by', e.target.value)} />
                  </Field>
                </div>
                <p style={{ fontSize: 11.5, color: 'var(--c-fg-muted)', margin: '6px 0 0' }}>
                  Advertise stay until: window used to calculate the advertised &ldquo;from&rdquo; price (can be earlier than stay until).
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginTop: 10 }}>
                  <Field label="Min nights">
                    <input className="c-input" type="number" min={0} value={form.min_nights} onChange={(e) => set('min_nights', e.target.value)} placeholder="e.g. 3" />
                  </Field>
                  <Field label="Package nights">
                    <input className="c-input" type="number" min={0} value={form.package_nights} onChange={(e) => set('package_nights', e.target.value)} placeholder="e.g. 7" />
                  </Field>
                </div>
                <Field label="Terms & conditions" style={{ marginTop: 10 }}>
                  <textarea className="c-input" rows={3} value={form.terms_conditions} onChange={(e) => set('terms_conditions', e.target.value)} style={{ resize: 'vertical' }} />
                </Field>

                {/* Competitor comparison repeater (featured-product display) */}
                <div style={{ marginTop: 12 }}>
                  <label className="c-label">Competitor comparison</label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {form.competitor_comparison.map((row, i) => (
                      <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 110px 90px auto', gap: 8, alignItems: 'center' }}>
                        <input
                          className="c-input" value={row.name} placeholder="Competitor name"
                          onChange={(e) => setCompetitor(i, { name: e.target.value })}
                        />
                        <input
                          className="c-input" type="number" step="0.01" value={row.rate} placeholder="Rate"
                          onChange={(e) => setCompetitor(i, { rate: e.target.value })}
                        />
                        <input
                          className="c-input" value={row.currency} maxLength={3} placeholder="AUD"
                          onChange={(e) => setCompetitor(i, { currency: e.target.value.toUpperCase() })}
                        />
                        <button
                          type="button" className="c-btn" title="Remove row"
                          onClick={() => removeCompetitor(i)}
                          style={{ padding: '6px 10px' }}
                        >
                          <X size={13} />
                        </button>
                      </div>
                    ))}
                  </div>
                  <button type="button" className="c-btn" onClick={addCompetitor} style={{ marginTop: 8, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <Plus size={13} /> Add competitor
                  </button>
                </div>
              </ManageGroup>

              {/* ── Editorial (high-value overrides; full media on /console/editorial) ── */}
              <ManageGroup title="Editorial">
                {edLoading && <div style={{ fontSize: 12.5, color: 'var(--c-fg-muted)', display: 'inline-flex', alignItems: 'center', gap: 6 }}><Loader2 size={12} className="animate-spin" /> Loading editorial…</div>}
                {!edLoading && (
                  <>
                    <Field label="Title override">
                      <input className="c-input" value={edForm.title_override} onChange={(e) => setEd('title_override', e.target.value)} placeholder="Display name override" />
                    </Field>
                    <Field label="Subtitle" style={{ marginTop: 10 }}>
                      <input className="c-input" value={edForm.subtitle} onChange={(e) => setEd('subtitle', e.target.value)} />
                    </Field>
                    <Field label="Highlight text" style={{ marginTop: 10 }}>
                      <textarea className="c-input" rows={2} value={edForm.highlight_text} onChange={(e) => setEd('highlight_text', e.target.value)} style={{ resize: 'vertical' }} />
                    </Field>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginTop: 10 }}>
                      <Field label="Featured badge">
                        <input className="c-input" value={edForm.featured_badge} onChange={(e) => setEd('featured_badge', e.target.value)} placeholder="e.g. Editor's Pick" />
                      </Field>
                      <Field label="Feature priority">
                        <input className="c-input" type="number" value={edForm.feature_priority} onChange={(e) => setEd('feature_priority', e.target.value)} placeholder="Higher = more prominent" />
                      </Field>
                    </div>
                    <div style={{ display: 'flex', gap: 18, marginTop: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                      <label style={checkLabelStyle}>
                        <input type="checkbox" checked={edForm.is_featured} onChange={(e) => setEd('is_featured', e.target.checked)} /> Featured
                      </label>
                      <a href="/console/editorial" target="_blank" rel="noreferrer" style={{ fontSize: 12.5, color: 'var(--c-accent)', fontWeight: 600 }}>Open full editorial →</a>
                    </div>
                    {edErr && <div style={{ fontSize: 12.5, color: 'var(--c-danger)', marginTop: 8 }}>Error: {edErr}</div>}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10 }}>
                      <button type="button" className="c-btn" onClick={() => void saveEditorial()} disabled={edSaving || !edDirty} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        {edSaving ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
                        Save editorial
                      </button>
                      {!edDirty && edSavedAt && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11.5, color: 'var(--c-success)' }}><CheckCircle2 size={12} /> Saved</span>}
                      {edDirty && <span style={{ fontSize: 11.5, color: 'var(--c-fg-muted)' }}>Unsaved editorial changes</span>}
                    </div>
                  </>
                )}
              </ManageGroup>

              {/* ── Collections (membership toggles; lazy on expand) ── */}
              <ManageGroup title="Collections">
                {!colExpanded ? (
                  <button type="button" className="c-btn" onClick={() => setColExpanded(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <Plus size={13} /> Manage collection membership
                  </button>
                ) : (
                  <>
                    {colLoading && <div style={{ fontSize: 12.5, color: 'var(--c-fg-muted)', display: 'inline-flex', alignItems: 'center', gap: 6 }}><Loader2 size={12} className="animate-spin" /> Loading collections…</div>}
                    {colErr && <div style={{ fontSize: 12.5, color: 'var(--c-danger)', marginBottom: 8 }}>Error: {colErr}</div>}
                    {!colLoading && collections.length === 0 && !colErr && (
                      <div style={{ fontSize: 12.5, color: 'var(--c-fg-muted)' }}>No collections found.</div>
                    )}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {collections.map((c) => {
                        const checked = colMembership[c.id] === true;
                        const busy = colSaving[c.id] === true;
                        const resolved = colMembership[c.id] !== undefined;
                        return (
                          <label key={c.id} style={{ ...checkLabelStyle, opacity: resolved ? 1 : 0.6 }}>
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={busy || !resolved}
                              onChange={(e) => void toggleCollection(c, e.target.checked)}
                            />
                            {c.title || c.slug}
                            {busy && <Loader2 size={11} className="animate-spin" style={{ marginLeft: 6 }} />}
                          </label>
                        );
                      })}
                    </div>
                    <a href="/console/collections" target="_blank" rel="noreferrer" style={{ display: 'inline-block', marginTop: 10, fontSize: 12.5, color: 'var(--c-accent)', fontWeight: 600 }}>Open collections editor →</a>
                  </>
                )}
              </ManageGroup>

              {/* ── Notes ── */}
              <ManageGroup title="Notes">
                <Field label="Internal notes">
                  <textarea className="c-input" rows={3} value={form.internal_notes} onChange={(e) => set('internal_notes', e.target.value)} style={{ resize: 'vertical' }} />
                </Field>
              </ManageGroup>
            </>
          )}

          {/* Footer: errors + save */}
          {saveErr && <div style={{ fontSize: 13, color: 'var(--c-danger)' }}>Error: {saveErr}</div>}
          {ruleNote && <div style={{ fontSize: 12.5, color: 'var(--c-warning, #b45309)' }}><AlertTriangle size={12} style={{ verticalAlign: 'middle', marginRight: 4 }} />{ruleNote}</div>}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button className="c-btn c-btn-primary" onClick={() => void save()} disabled={saving || !dirty}>
              {saving ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
              {fastTag ? 'Save & next hotel' : 'Save'}
            </button>
            {!dirty && savedAt && <span style={{ fontSize: 11.5, color: 'var(--c-success)' }}>All changes saved.</span>}
            {dirty && <span style={{ fontSize: 11.5, color: 'var(--c-fg-muted)' }}>You have unsaved changes.</span>}
          </div>
        </div>
      )}
    </div>
  );
}

const checkLabelStyle: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 13, color: 'var(--c-fg)', cursor: 'pointer'
};

// Each section of the Manage panel is a labelled block: an uppercase header with
// a thin divider rule under it, separated from the next by generous whitespace.
// No enclosing border/box — clean sectioning (à la Luxury Escapes) so the long
// form reads as distinct groups without feeling boxy.
function ManageGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--c-fg-muted)', marginBottom: 14, paddingBottom: 8, borderBottom: '1px solid var(--c-line)' }}>{title}</div>
      {children}
    </div>
  );
}

function Field({ label, children, style }: { label: string; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={style}>
      <label className="c-label">{label}</label>
      {children}
    </div>
  );
}

// At-a-glance state pill on a result card: surfaces a non-active network
// status and/or a "RateHawk off" flag so Tina sees managed hotels without
// opening the drawer.
function ControlBadge({ control }: { control: HotelControl }) {
  const s = control.network_status;
  const labels: Array<{ text: string; color: string; title?: string }> = [];
  // Luxury curation tier — surfaced even on otherwise-active hotels.
  if (control.luxury_tier === '5plus')     labels.push({ text: '5★+',  color: '#9a6a00' });
  if (control.luxury_tier === '5plusplus') labels.push({ text: '5★++', color: '#9a6a00' });
  if (s === 'paused')  labels.push({ text: 'Paused',  color: '#b45309' });
  if (s === 'hidden')  labels.push({ text: 'Hidden',  color: '#6b7280' });
  if (s === 'deleted') labels.push({ text: 'Deleted', color: '#b91c1c' });
  // One "No <Supplier>" badge per blocked supplier (generalizes "No RateHawk").
  // The internal note (the "why we blocked it" reason) rides along as a tooltip
  // so a consultant can see the rationale on hover without opening Manage.
  const blockReason = (control.internal_notes || '').trim();
  for (const key of blockedSuppliersOf(control)) {
    const known = BLOCKABLE_SUPPLIERS.find(b => b.key === key);
    const name = known ? known.label : (key.charAt(0).toUpperCase() + key.slice(1));
    labels.push({
      text: `No ${name}`,
      color: known?.color || '#7c3aed',
      title: blockReason ? `Blocked — ${blockReason}` : `${name} blocked for this hotel`,
    });
  }
  if (labels.length === 0) return null;
  return (
    <>
      {labels.map((l) => (
        <span key={l.text} title={l.title} style={{
          fontSize: 10, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase',
          color: l.color, border: `1px solid ${l.color}33`, background: `${l.color}11`,
          padding: '2px 8px', borderRadius: 999, cursor: l.title ? 'help' : undefined
        }}>{l.text}</span>
      ))}
    </>
  );
}

function MultiSupplierCard({ h, control, onOpen, showUnavailable }: { h: HotelHit; control?: HotelControl; onOpen: (supplier: string | null) => void; showUnavailable: boolean }) {
  // Use the per-supplier quotes when present; otherwise synthesise a single
  // quote from the legacy priced fields so single-supplier hotels render in
  // the same card (one unified layout for the whole list).
  const quotes: Quote[] = (h.priced?.quotes && h.priced.quotes.length > 0)
    ? h.priced.quotes
    : (h.priced?.available ? [{
        supplier: h.priced.supplier || null, available: true,
        sellNightly: h.priced.sellNightly, sellTotal: h.priced.sellTotal,
        sellNightlyAud: h.priced.sellNightlyAud, sellTotalAud: h.priced.sellTotalAud, fxRate: h.priced.fxRate,
        netNightly: h.priced.netNightly, markupPct: h.priced.markupPct,
        currency: h.priced.currency, ratePlan: h.priced.ratePlan,
        refundable: h.priced.refundable, breakfastIncluded: h.priced.breakfastIncluded,
        cancellationDeadlineUtc: h.priced.cancellationDeadlineUtc, ratesCount: h.priced.ratesCount,
        transferLabel: h.priced.transferLabel ?? null,
      }] : []);
  // Score the quotes so the highest-scored gets the Recommended border.
  const minSell = Math.min(...quotes
    .filter(q => q.available && typeof q.sellTotal === 'number')
    .map(q => q.sellTotal as number));
  const scored = quotes.map(q => ({
    q,
    score: scoreRate({
      pricing: { sell: { totalAmount: q.sellTotal, nightlyAmount: q.sellNightly }, markup: { amount: q.markupAmount } },
      refundable: q.refundable, cancellationDeadlineUtc: q.cancellationDeadlineUtc
    }, minSell, { isB2B: true })
  }));
  const best = scored.filter(s => s.q.available).sort((a, b) => b.score - a.score)[0]?.q;

  return (
    <button
      onClick={() => onOpen(null)}
      className="c-card"
      style={{
        display: 'grid', gridTemplateColumns: '150px 1fr auto', gap: 16, alignItems: 'stretch',
        padding: 12, width: '100%', textAlign: 'left', cursor: 'pointer',
        background: 'var(--c-bg)', border: '1px solid var(--c-line)',
        opacity: best ? 1 : 0.6
      }}
    >
      {/* Image */}
      <div style={{ width: 150, height: 104, borderRadius: 8, overflow: 'hidden', background: 'var(--c-bg-soft)', backgroundImage: resolveImg(h.image, '240x240') ? `url(${resolveImg(h.image, '240x240')})` : undefined, backgroundSize: 'cover', backgroundPosition: 'center' }} />

      {/* Hotel info */}
      <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ fontSize: 16, fontWeight: 600, lineHeight: 1.2 }}>{h.name}</div>
        <div style={{ fontSize: 12.5, color: 'var(--c-fg-soft)', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <MapPin size={12} /> {[h.city, h.country].filter(Boolean).join(', ')}
          </span>
          {!!h.starRating && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
              {Array.from({ length: Math.round(h.starRating) }).map((_, i) => (
                <Star key={i} size={11} fill="var(--c-accent)" style={{ color: 'var(--c-accent)' }} />
              ))}
            </span>
          )}
        </div>
        {/* Supplier-count chip + best-rate badges (per-supplier breakdown is in the drawer) */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 'auto' }}>
          {(controlFlagged(control) || !!control?.luxury_tier) && <ControlBadge control={control!} />}
          {/* One chip per supplier this property exists under (h.sources), shown
              always — RateHawk-only → "RateHawk", HB-only → "Hummingbird", both →
              both chips. Console is cug, so supplier disclosure is allowed here. */}
          {Array.isArray(h.sources) && h.sources.map((s) => {
            const meta = BLOCKABLE_SUPPLIERS.find(b => b.key === String(s).toLowerCase());
            const label = meta?.label || String(s);
            const color = meta?.color || 'var(--c-fg-soft)';
            return (
              <span key={s} style={{ fontSize: 11, fontWeight: 600, color, background: 'var(--c-bg-soft)', border: `1px solid ${color}33`, borderRadius: 999, padding: '2px 9px' }}>
                {label}
              </span>
            );
          })}
          {best?.roomTypeName && <span style={{ fontSize: 11.5, color: 'var(--c-fg)' }}>{best.roomTypeName}</span>}
          {/* Offer badge — the card "from" price already reflects this promo (nett). */}
          {best?.offers?.[0]?.name && (
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--c-success)' }}>
              ★ {best.offers[0].name}{best.offers[0].code ? ` · ${best.offers[0].code}` : ''}
            </span>
          )}
          {best && (best.refundable
            ? <span style={{ fontSize: 11.5, color: 'var(--c-success)' }}>{best.cancellationDeadlineUtc ? `Free cancel to ${fmtCancelDate(best.cancellationDeadlineUtc)}` : 'Refundable'}</span>
            : <span style={{ fontSize: 11.5, color: 'var(--c-danger)' }}>Non-refundable</span>)}
          {best?.breakfastIncluded && <span style={{ fontSize: 11.5, color: 'var(--c-success)' }}>· Breakfast</span>}
          {/* Transfer-bundled note — the card "from" price already includes this transfer. */}
          {best?.transferLabel && <span style={{ fontSize: 11.5, color: 'var(--c-success)' }}>· incl. {best.transferLabel}</span>}
        </div>
        {/* Why a supplier is blocked — the consultant's note, shown inline so the
            rationale (e.g. "RateHawk excludes Harbour meals; book via Expedia")
            is visible at a glance, not only on hover or inside Manage. */}
        {blockedSuppliersOf(control).length > 0 && (control?.internal_notes || '').trim() && (
          <div style={{ fontSize: 11.5, color: '#b45309', display: 'flex', gap: 4, alignItems: 'flex-start', maxWidth: 520 }}>
            <span aria-hidden>⚠</span>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{(control!.internal_notes || '').trim()}</span>
          </div>
        )}
      </div>

      {/* Headline price — cheapest/recommended across suppliers */}
      <div style={{ textAlign: 'right', minWidth: 168, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 2 }}>
        {!best ? (
          <span style={{ fontSize: 12, color: 'var(--c-fg-muted)' }}>No rates for these dates</span>
        ) : best.sellNightly == null ? (
          <span style={{ fontSize: 13, color: 'var(--c-fg-soft)', fontStyle: 'italic' }}>Price on request</span>
        ) : (
          <>
            <div style={{ fontSize: 10, color: 'var(--c-fg-muted)', letterSpacing: '0.04em', fontWeight: 700 }}>FROM</div>
            {/* AUD primary (from pricing.aud) with USD small beneath; fall back
                to USD as the primary when no AUD block came back. Display only —
                booking still uses the USD basis. */}
            {best.sellNightlyAud != null ? (
              <>
                <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--c-accent)', fontFamily: 'var(--c-mono)', lineHeight: 1.15 }}>
                  {fmtMoney(best.sellNightlyAud)}<span style={{ fontSize: 11, color: 'var(--c-fg-muted)', fontFamily: 'inherit' }}> AUD / nt</span>
                </div>
                {best.sellTotalAud != null && best.sellTotalAud !== best.sellNightlyAud && (
                  <div style={{ fontSize: 11.5, color: 'var(--c-fg-soft)', fontFamily: 'var(--c-mono)' }}>
                    {fmtMoney(best.sellTotalAud)} AUD total
                  </div>
                )}
                <div style={{ fontSize: 10.5, color: 'var(--c-fg-muted)', fontFamily: 'var(--c-mono)' }}>
                  {fmtMoney(best.sellNightly)} USD / nt{best.fxRate != null ? ` · @ ${best.fxRate}` : ''}
                </div>
              </>
            ) : (
              <>
                <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--c-accent)', fontFamily: 'var(--c-mono)', lineHeight: 1.15 }}>
                  {fmtMoney(best.sellNightly)}<span style={{ fontSize: 11, color: 'var(--c-fg-muted)', fontFamily: 'inherit' }}> / nt</span>
                </div>
                {best.sellTotal != null && best.sellTotal !== best.sellNightly && (
                  <div style={{ fontSize: 11.5, color: 'var(--c-fg-soft)', fontFamily: 'var(--c-mono)' }}>
                    {fmtMoney(best.sellTotal)} total{best.currency ? ` ${best.currency}` : ''}
                  </div>
                )}
              </>
            )}
            {best.netNightly != null && (
              <div style={{ fontSize: 11, color: 'var(--c-fg-soft)', fontFamily: 'var(--c-mono)' }}>
                NET {fmtMoney(best.netNightly)}{best.markupPct != null ? ` · +${best.markupPct}%` : ''}
              </div>
            )}
            <div style={{ fontSize: 11, color: 'var(--c-accent)', fontWeight: 600, marginTop: 4 }}>Open →</div>
          </>
        )}
      </div>
    </button>
  );
}

function HotelInfo({ content }: { content: any }) {
  const desc = typeof content.description === 'string'
    ? content.description
    : (Array.isArray(content.description) ? content.description.map((s: any) => s.paragraphs?.join(' ') || '').join('\n\n').trim() : null);
  const ag: any[] = Array.isArray(content.amenity_groups) ? content.amenity_groups : [];
  const topAmenities = ag.flatMap(g => Array.isArray(g.amenities) ? g.amenities : []).slice(0, 12);
  const mp = content.metapolicy_struct || {};
  const mpItems: Array<{ k: string; v: string }> = [];
  if (mp.deposit) mpItems.push({ k: 'Deposit', v: 'Required' });
  if (mp.no_show) mpItems.push({ k: 'No-show', v: 'Penalty' });
  if (mp.cot && Array.isArray(mp.cot) && mp.cot.length) mpItems.push({ k: 'Cots', v: 'Available' });
  if (mp.pets && Array.isArray(mp.pets) && mp.pets.length) mpItems.push({ k: 'Pets', v: 'Conditional' });
  if (mp.parking && Array.isArray(mp.parking) && mp.parking.length) mpItems.push({ k: 'Parking', v: 'Available' });
  if (mp.smoking_policy && Array.isArray(mp.smoking_policy) && mp.smoking_policy.length) mpItems.push({ k: 'Smoking', v: 'See policy' });
  if (mp.shuttle && Array.isArray(mp.shuttle) && mp.shuttle.length) mpItems.push({ k: 'Shuttle', v: 'Available' });

  const [descExpanded, setDescExpanded] = useState(false);
  // RateHawk descriptions occasionally contain HTML (<em>X</em>,
  // <strong>X</strong>, <br/>) mixed with markdown. ReactMarkdown
  // escapes raw HTML by default — adding rehype-raw would let it
  // through but pulls a new dep. Cheaper: rewrite the handful of
  // tags suppliers actually emit into their markdown equivalents,
  // then strip anything residual so we never render `<tag>` as
  // visible text.
  const cleanDesc = desc
    ? desc
        .replace(/<\s*(em|i)\s*>([\s\S]*?)<\s*\/\s*\1\s*>/gi, '*$2*')
        .replace(/<\s*(strong|b)\s*>([\s\S]*?)<\s*\/\s*\1\s*>/gi, '**$2**')
        .replace(/<\s*br\s*\/?\s*>/gi, '\n')
        .replace(/<\s*p\s*>/gi, '\n\n')
        .replace(/<\s*\/\s*p\s*>/gi, '')
        .replace(/<[^>]+>/g, '')   // strip anything else
        .trim()
    : null;
  const trimmedDesc = cleanDesc && cleanDesc.length > 320 && !descExpanded ? cleanDesc.slice(0, 320) + '…' : cleanDesc;

  return (
    <div style={{ display: 'grid', gap: 14, marginBottom: 12 }}>
      {cleanDesc && (
        <div>
          <SectionLabel>About the property</SectionLabel>
          {/* RateHawk descriptions contain markdown — bold section
              headers (**Location**, **At the hotel**) and bulleted
              lists. Render as markdown not raw text. */}
          <div className="agent-md" style={{ fontSize: 13.5, lineHeight: 1.55, color: 'var(--c-fg)' }}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{trimmedDesc}</ReactMarkdown>
          </div>
          {desc.length > 320 && (
            <button onClick={() => setDescExpanded(x => !x)} style={{ marginTop: 4, fontSize: 12, color: 'var(--c-accent)', background: 'none', border: 0, cursor: 'pointer', padding: 0, fontWeight: 600 }}>
              {descExpanded ? 'Show less' : 'Read more'}
            </button>
          )}
        </div>
      )}

      {(content.check_in_time || content.check_out_time || content.phone || content.email || content.address || content.hotel_chain || content.property_type) && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
          {content.address && (() => {
            // Address shape varies by supplier: RateHawk = string or { text },
            // Hummingbird = object { addressLine1, addressLine2, city, state,
            // zipCode, country, ... }. Always render a STRING — never the raw
            // object (that throws React error #31 and blanks the page).
            const a = content.address;
            const addr = typeof a === 'string'
              ? a
              : (a && typeof a === 'object'
                  ? (typeof a.text === 'string' && a.text
                      ? a.text
                      : [a.addressLine1, a.addressLine2, a.city, a.state, a.zipCode, a.country].filter(Boolean).join(', '))
                  : '');
            if (!addr) return null;
            return (
              <FactCell
                label="Address"
                value={
                  content.latitude && content.longitude ? (
                    <a
                      href={`https://www.google.com/maps?q=${content.latitude},${content.longitude}`}
                      target="_blank" rel="noreferrer"
                      style={{ color: 'var(--c-accent)', textDecoration: 'none', borderBottom: '1px dashed var(--c-line)' }}
                    >{addr}</a>
                  ) : addr
                }
              />
            );
          })()}
          {content.check_in_time && <FactCell label="Check-in"  value={content.check_in_time} />}
          {content.check_out_time && <FactCell label="Check-out" value={content.check_out_time} />}
          {content.phone &&        <FactCell label="Phone"      value={content.phone} />}
          {content.email &&        <FactCell label="Email"      value={content.email} />}
          {content.hotel_chain &&  <FactCell label="Chain"      value={content.hotel_chain} />}
          {content.property_type && <FactCell label="Type"      value={content.property_type} />}
          {content.front_desk_time_start && content.front_desk_time_end && (
            <FactCell label="Front desk" value={`${content.front_desk_time_start}–${content.front_desk_time_end}`} />
          )}
          {content.number_of_rooms && <FactCell label="Rooms"   value={String(content.number_of_rooms)} />}
        </div>
      )}

      {Array.isArray(content.restaurants) && content.restaurants.length > 0 && (
        <div>
          <SectionLabel>Restaurants & bars ({content.restaurants.length})</SectionLabel>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {content.restaurants.slice(0, 8).map((r: any, i: number) => (
              <span key={i} style={{ fontSize: 12, padding: '3px 9px', borderRadius: 999, background: 'var(--c-bg-soft)', border: '1px solid var(--c-line)', color: 'var(--c-fg-soft)' }}>
                {typeof r === 'string' ? r : (r.name || r.title || 'Restaurant')}
              </span>
            ))}
            {content.restaurants.length > 8 && (
              <span style={{ fontSize: 12, color: 'var(--c-fg-muted)' }}>+{content.restaurants.length - 8} more</span>
            )}
          </div>
        </div>
      )}

      {topAmenities.length > 0 && (
        <div>
          <SectionLabel>Top amenities</SectionLabel>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {topAmenities.map((a, i) => (
              <span key={i} style={{ fontSize: 12, padding: '3px 9px', borderRadius: 999, background: 'var(--c-bg-soft)', border: '1px solid var(--c-line)', color: 'var(--c-fg-soft)' }}>{a}</span>
            ))}
          </div>
        </div>
      )}

      {mpItems.length > 0 && (
        <div>
          <SectionLabel>Policies snapshot</SectionLabel>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {mpItems.map((m, i) => (
              <span key={i} style={{ fontSize: 12, padding: '3px 9px', borderRadius: 999, background: 'var(--c-bg)', border: '1px dashed var(--c-line)', color: 'var(--c-fg-soft)' }}>
                <strong style={{ color: 'var(--c-fg)' }}>{m.k}:</strong> {m.v}
              </span>
            ))}
          </div>
          {content.metapolicy_extra_info && (
            <div style={{ marginTop: 6, fontSize: 12, color: 'var(--c-fg-muted)', whiteSpace: 'pre-wrap' }}>{content.metapolicy_extra_info}</div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Rates grouped by room type — RateHawk-style. Each unique
 * roomTypeName becomes a card with its image + amenities,
 * then a small table of rates inside (meals, cancellation,
 * NET, markup, sell, Choose).
 */
// ─── Discount scanner ───────────────────────────────────────────
// Scans how the cheapest Hummingbird discount varies across N monthly
// check-in windows for ONE hotel (Tina: HB discounts run deeper in low
// season, shallower from ~1 Oct). Fetches all windows IN PARALLEL via the
// same rates proxy the drawer uses, then tabulates Gross / Discount % /
// Nett / Offer and highlights the deepest discount. State is local and
// keyed by hotelId via React (the parent remounts this on hotel change by
// passing a `key`), so a new hotel starts clean.

// "13 Jul 2026" from a YYYY-MM-DD string (UTC, no date lib).
function fmtScanDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC'
  }).format(new Date(Date.UTC(y, m - 1, d)));
}
// today + n days as YYYY-MM-DD (UTC).
function utcPlusIso(days: number): string {
  const d = new Date();
  const base = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return new Date(base + days * 86400000).toISOString().slice(0, 10);
}

type ScanRow = {
  checkIn: string;
  gross: number | null;
  discount: number | null;
  nett: number | null;
  pct: number | null;
  offerName: string | null;
  currency: string | null;
  fxRate: number | null; // USD→AUD, so the scanner can lead with AUD like the rate table
};

function DiscountScanner({
  hotelId, rooms, citizenship, defaultNights
}: {
  hotelId: number;
  rooms: RoomGuests[];
  citizenship: string;
  defaultNights: number;
}) {
  const [nights, setNights] = useState(String(defaultNights));
  const [months, setMonths] = useState(6);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [results, setResults] = useState<ScanRow[] | null>(null);

  async function scan() {
    const pkgNights = Math.max(1, Math.round(Number(nights) || defaultNights || 5));
    const n = Math.max(1, Math.min(12, months));
    setBusy(true);
    setErr(null);
    setResults(null);
    try {
      const guests = JSON.stringify(rooms.map(r => ({ adults: r.adults, children: r.childrenAges || [] })));
      // Build N monthly windows starting ~14 days out: checkIn = today + 30*i + 14.
      const windows = Array.from({ length: n }, (_, i) => {
        const checkIn = utcPlusIso(30 * i + 14);
        const checkOut = utcPlusIso(30 * i + 14 + pkgNights);
        return { checkIn, checkOut };
      });
      const rows = await Promise.all(windows.map(async (w): Promise<ScanRow> => {
        const empty: ScanRow = { checkIn: w.checkIn, gross: null, discount: null, nett: null, pct: null, offerName: null, currency: null, fxRate: null };
        try {
          const qs = new URLSearchParams({
            checkIn: w.checkIn, checkOut: w.checkOut,
            nationalityCode: citizenship, accountType: 'cug', guests
          });
          const res = await fetch(`/api/admin/search/rates/${hotelId}?${qs.toString()}`);
          const json = await res.json();
          if (!json.success) return empty;
          const hbRates: AdminRate[] = (json.data?.rates || []).filter((r: AdminRate) => r.supplier === 'hummingbird');
          if (!hbRates.length) return empty;
          // Cheapest HB rate: min of (gross - discount) when present, else sell total.
          const basisOf = (r: AdminRate) => {
            const g = r.grossTotal ?? 0;
            const d = r.discountAmount ?? 0;
            if (g > 0) return g - d;
            return r.pricing.sell?.totalAmount ?? Infinity;
          };
          const best = hbRates.reduce((a, b) => (basisOf(b) < basisOf(a) ? b : a));
          const gross = best.grossTotal ?? null;
          const discount = best.discountAmount ?? null;
          if (gross == null || !(gross > 0) || discount == null || !(discount > 0)) {
            return { ...empty, currency: best.pricing.currency };
          }
          const nett = gross - discount;
          const pct = Math.round((discount / gross) * 100);
          return {
            checkIn: w.checkIn,
            gross, discount, nett, pct,
            offerName: best.offers?.[0]?.name ?? null,
            currency: best.pricing.currency,
            fxRate: best.pricing.aud?.fxRate ?? null,
          };
        } catch {
          return empty;
        }
      }));
      setResults(rows);
    } catch (e: any) {
      setErr(e?.message || 'Scan failed');
    } finally {
      setBusy(false);
    }
  }

  // Deepest discount % across the scanned windows — its row(s) get the accent.
  const maxPct = useMemo(
    () => (results || []).reduce((m, r) => (r.pct != null && r.pct > m ? r.pct : m), 0),
    [results]
  );

  return (
    <div className="c-card" style={{ padding: '12px 14px', marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--c-fg)' }}>Discount scanner</span>
        <span style={{ fontSize: 11, color: 'var(--c-fg-muted)' }}>
          How the cheapest Hummingbird discount moves across the year
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap', marginTop: 10 }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11, color: 'var(--c-fg-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.04 }}>
          Package nights
          <input
            className="c-input"
            type="number"
            min={1}
            value={nights}
            onChange={(e) => setNights(e.target.value)}
            style={{ width: 90 }}
          />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11, color: 'var(--c-fg-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.04 }}>
          Months
          <select className="c-input" value={months} onChange={(e) => setMonths(Number(e.target.value))} style={{ width: 90 }}>
            {[3, 6, 9, 12].map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </label>
        <button
          className="c-btn c-btn-primary"
          onClick={() => void scan()}
          disabled={busy}
          style={{ padding: '7px 16px', fontSize: 12.5, display: 'inline-flex', alignItems: 'center', gap: 6 }}
        >
          {busy && <Loader2 size={13} className="animate-spin" />}
          {busy ? 'Scanning…' : 'Scan discounts'}
        </button>
      </div>

      {err && <div style={{ marginTop: 10, fontSize: 12, color: 'var(--c-danger)' }}>{err}</div>}

      {results && results.length > 0 && (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, marginTop: 12 }}>
          <thead>
            <tr style={{ textAlign: 'left', color: 'var(--c-fg-muted)' }}>
              <th style={thStyle}>Check-in</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>Gross</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>Discount %</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>Nett</th>
              <th style={thStyle}>Offer</th>
            </tr>
          </thead>
          <tbody>
            {results.map((row, i) => {
              const hasRate = row.pct != null;
              const isBest = hasRate && maxPct > 0 && row.pct === maxPct;
              const accent = isBest ? 'var(--c-accent)' : 'var(--c-fg)';
              // AUD primary (converted via the rate's fxRate) with the supplier
              // USD small beneath — matches the rate table. Falls back to USD
              // only when no fxRate is available.
              const money = (v: number | null) => {
                if (v == null) return <>—</>;
                if (row.fxRate) return (
                  <>
                    {fmtMoney(v * row.fxRate)} AUD
                    <div style={{ fontSize: 10.5, color: 'var(--c-fg-muted)' }}>{fmtMoney(v)} {row.currency}</div>
                  </>
                );
                return <>{fmtMoney(v)} {row.currency}</>;
              };
              return (
                <tr key={i} style={{ borderTop: '1px solid var(--c-line-soft)', background: isBest ? 'rgba(155,123,51,0.06)' : undefined }}>
                  <td style={{ ...tdStyle, fontFamily: 'var(--c-mono)' }}>{fmtScanDate(row.checkIn)}</td>
                  {hasRate ? (
                    <>
                      <td style={{ ...tdStyle, textAlign: 'right', fontFamily: 'var(--c-mono)' }}>
                        {money(row.gross)}
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'right', fontFamily: 'var(--c-mono)', fontWeight: isBest ? 700 : 500, color: accent }}>
                        {row.pct}%
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'right', fontFamily: 'var(--c-mono)' }}>
                        {money(row.nett)}
                      </td>
                      <td style={{ ...tdStyle, color: 'var(--c-fg-soft)' }}>{row.offerName || '—'}</td>
                    </>
                  ) : (
                    <td colSpan={4} style={{ ...tdStyle, color: 'var(--c-fg-muted)', fontStyle: 'italic' }}>no HB rate</td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ── Meal × transfer matrix (B2B) ─────────────────────────────────────────────
// The consolidation rules now live in the booking-engine API
// (services/presentRates); the console renders that block via
// adminMatrixFromPresentation below. These two helpers remain for the per-row
// Enhanced filter and cheapest-recommend ordering.
function admIsEnhanced(r: AdminRate): boolean {
  return /enhanced/i.test(String(r.ratePlan || ''));
}
function admSellTotal(r: AdminRate): number {
  return r.pricing?.sell?.totalAmount ?? Infinity;
}
const admKey = (meal: string, transfer: string) => `${meal}|${transfer}`;
interface AdminMatrix {
  meals: string[];
  transfers: string[];
  hasTransfers: boolean;
  byCombo: Map<string, AdminRate>;
  defaultMeal: string;
  defaultTransfer: string;
  from: AdminRate;
}

// Adapt the API's presentation block (services/presentRates) into the
// AdminMatrix shape the table renders, resolving rateKeys against the group's
// rates. Single source of truth.
function adminMatrixFromPresentation(p: any, list: AdminRate[]): AdminMatrix | null {
  if (!p || !Array.isArray(p.options) || !p.options.length) return null;
  const byKey = new Map(list.map((r) => [r.rateKey, r]));
  const byCombo = new Map<string, AdminRate>();
  for (const o of p.options) {
    const r = byKey.get(o.rateKey);
    if (r) byCombo.set(admKey(o.meal, o.transfer), r);
  }
  if (!byCombo.size) return null;
  const from = byKey.get(p.fromRateKey) || Array.from(byCombo.values())[0]!;
  const defOpt = p.options.find((o: any) => o.rateKey === p.defaultRateKey);
  return {
    meals: p.meals, transfers: p.transfers, hasTransfers: p.hasTransfers, byCombo,
    defaultMeal: defOpt?.meal ?? (p.meals[0] || ''),
    defaultTransfer: defOpt?.transfer ?? (p.transfers[0] || ''),
    from,
  };
}

function RoomGroupedRates({
  rates, onChoose, marginTop = 0, control, rooms = [], roomMap, presentation
}: {
  rates: AdminRate[];
  onChoose: (r: AdminRate) => void;
  marginTop?: number;
  // API consolidation block (services/presentRates), looked up per room by name.
  presentation?: any;
  // Per-hotel control row (transfer cost) + the search occupancy, so a
  // room-only rate can show the transfer surcharge a transfer-bundled
  // (Hummingbird) rate already includes. Makes the comparison apple-to-apple.
  control?: HotelControl;
  rooms?: RoomGuests[];
  // Cross-supplier canonical room lookup. Keyed by `${supplier}|${normName(roomName)}`.
  // When a rate resolves here, it groups under the canonical key so the HB +
  // RateHawk rates for the same physical room share ONE card.
  roomMap?: Map<string, { key: string; label: string }>;
}) {
  const sp = useSearchParams();
  const showRgDebug = sp.get('debug') === 'rgmatch';
  // Occupancy totals for the per-rate transfer surcharge (room-only rates).
  const totalAdults   = rooms.reduce((s, r) => s + (r.adults || 0), 0);
  const totalChildren = rooms.reduce((s, r) => s + (r.childrenAges?.length || 0), 0);
  // Per-hotel transfer cost (Tina enters it in Manage → Transfer). Numeric
  // columns arrive as strings — Number() at the edge. Surcharge = the cost of
  // adding the transfer ETG/RateHawk omits, for THIS occupancy.
  const transferAdult = Number(control?.transfer_cost_adult);
  const transferChild = Number(control?.transfer_cost_child);
  const transferCurrency = control?.transfer_currency || 'AUD';
  // Suppliers blocked for THIS hotel (e.g. ['ratehawk']). Their rates still
  // appear in the console by design (so the consultant can see what they're
  // excluding), but we grey + strike them and tag "Blocked" so it's obvious
  // this rate will NOT be sold on the public site.
  const blockedSet = useMemo(() => new Set(blockedSuppliersOf(control)), [control]);
  const hasTransferCost = Number.isFinite(transferAdult) && transferAdult > 0;
  const transferSurcharge = hasTransferCost
    ? Math.round(transferAdult * totalAdults + (Number.isFinite(transferChild) ? transferChild : 0) * totalChildren)
    : null;
  // Group by the precise sub-variant name. roomGroupName is the
  // backend's resolved name from static content — for RateHawk it
  // refines "Ocean Villa" → "Ocean Villa, 1 king bed, ocean view"
  // so each view/bedding/floor combo becomes its own card. Falls
  // back to roomTypeName when no static-content match exists.
  // Group by sub-variant name, then score each rate per group so the
  // table can highlight the recommended option and surface the top-N
  // by default (Valentin, 2026-05-28). Within a group the cheapest
  // rate anchors the score pool — everything else is normalised
  // against it.
  // Compare mode kicks in once the consultant has pulled the Non-Member
  // channel in — it changes how rates are ordered (pair the twins) and how
  // many we surface when collapsed (top plan-pairs, not top rows).
  const comparing = useMemo(() => rates.some(r => r._channel === 'b2c'), [rates]);
  const groups = useMemo(() => {
    // Each bucket carries its rate list + a display label. The label is the
    // canonical room name when a rate merged via roomMap, else the room's own
    // name — so a merged card titles as the canonical room (e.g. "Villa Suite")
    // and contains BOTH the Hummingbird and RateHawk rate rows.
    const m = new Map<string, { list: AdminRate[]; label: string }>();
    for (const r of rates) {
      // Hide "Enhanced Half/Full Board" variants — they balloon the list and
      // confuse consultants; the standard boards remain.
      if (admIsEnhanced(r)) continue;
      // Try the cross-supplier canonical key first (collapses HB + RateHawk
      // rates for the same physical room into one group), else fall back to
      // the existing per-variant grouping.
      const lk = roomMap?.get(`${(r.supplier || '').toLowerCase()}|${normName(r.roomTypeName)}`);
      const k = lk?.key || r.roomGroupName || r.roomTypeName || r.rateKey || 'Room';
      const label = lk?.label || r.roomGroupName || r.roomTypeName || r.rateKey || 'Room';
      if (!m.has(k)) m.set(k, { list: [], label });
      m.get(k)!.list.push(r);
    }
    return Array.from(m.entries()).map(([, { list, label: name }]) => {
      const sellTotals = list
        .map(r => r.pricing?.sell?.totalAmount)
        .filter((v): v is number => typeof v === 'number' && v > 0);
      const poolMin = sellTotals.length ? Math.min(...sellTotals) : 0;
      const scored = list.map(r => ({
        r,
        score: scoreRate({
          pricing: {
            sell: { totalAmount: r.pricing?.sell?.totalAmount, nightlyAmount: r.pricing?.sell?.nightlyAmount },
            markup: { amount: r.pricing?.markup?.amount }
          },
          refundable: r.refundable,
          cancellationDeadlineUtc: r.cancellationDeadlineUtc
        }, poolMin, { isB2B: true })
      }));
      const byScore = [...scored].sort((a, b) => b.score - a.score);
      // Recommend the lead-in (cheapest SELL), not the highest composite score —
      // consultants expect the headline to be the cheapest bookable rate.
      const recommendedKey = [...list]
        .sort((a, b) => admSellTotal(a) - admSellTotal(b))[0]?.rateKey || null;

      // sellBySig: for each plan-pair, the Member + Non-Member sell totals so
      // a Member row can show "−$X vs non-member" inline.
      const sellBySig = new Map<string, { cug?: number; b2c?: number }>();
      for (const r of list) {
        const sig = planSigOf(r);
        const cur = sellBySig.get(sig) || {};
        const ch = r._channel === 'b2c' ? 'b2c' : 'cug';
        const s = r.pricing?.sell?.totalAmount;
        if (typeof s === 'number' && (cur[ch] === undefined || s < cur[ch]!)) cur[ch] = s;
        sellBySig.set(sig, cur);
      }

      let ordered: AdminRate[];
      if (comparing) {
        // Pair Member + Non-Member of the same plan adjacently; order the
        // pairs by their cheapest sell, Member first within a pair.
        const sigMin = new Map<string, number>();
        for (const r of list) {
          const sig = planSigOf(r);
          const s = r.pricing?.sell?.totalAmount ?? Infinity;
          if (!sigMin.has(sig) || s < sigMin.get(sig)!) sigMin.set(sig, s);
        }
        ordered = [...list].sort((a, b) => {
          const am = sigMin.get(planSigOf(a)) ?? Infinity;
          const bm = sigMin.get(planSigOf(b)) ?? Infinity;
          if (am !== bm) return am - bm;
          const ac = a._channel === 'b2c' ? 1 : 0;
          const bc = b._channel === 'b2c' ? 1 : 0;
          if (ac !== bc) return ac - bc;
          return (a.pricing?.sell?.totalAmount ?? Infinity) - (b.pricing?.sell?.totalAmount ?? Infinity);
        });
      } else {
        ordered = byScore.map(s => s.r);   // highest score first
      }
      // Distinct suppliers in this (possibly merged) group — drives the
      // subtle "N suppliers" hint on merged cards.
      const supplierCount = new Set(
        list.map(r => (r.supplier || '').toLowerCase()).filter(Boolean)
      ).size;
      return { name, rates: ordered, recommendedKey, sellBySig, supplierCount };
    });
  }, [rates, comparing, roomMap]);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  // Per-room meal/transfer dropdown selections (keyed by group name). Empty →
  // falls back to the matrix default (cheapest meal + Speedboat).
  const [selMeal, setSelMeal] = useState<Record<string, string>>({});
  const [selTransfer, setSelTransfer] = useState<Record<string, string>>({});
  const presByName = useMemo(() => {
    const m = new Map<string, any>();
    for (const r of (presentation?.rooms || [])) {
      if (r?.name) m.set(r.name, r);
      if (r?.groupKey) m.set(r.groupKey, r);
    }
    return m;
  }, [presentation]);
  // Room-photos lightbox — opened from a per-room "View photos" button.
  const [photoModal, setPhotoModal] = useState<{ name: string; images: string[] } | null>(null);

  // FX rate surfaced once as a caption next to the heading (the SELL/NET
  // columns show AUD primary). Pulled from the first rate carrying a derived
  // AUD block — display only, never recomputed here.
  const fxRate = useMemo(
    () => rates.find(r => r.pricing?.aud?.fxRate != null)?.pricing?.aud?.fxRate ?? null,
    [rates]
  );

  return (
    <div style={{ marginTop, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--c-fg)' }}>
          Available rooms ({groups.length})
        </span>
        {fxRate != null && (
          <span style={{ fontSize: 11, color: 'var(--c-fg-muted)', fontFamily: 'var(--c-mono)' }}>
            Sell + Net shown in AUD @ {fxRate}
          </span>
        )}
      </div>
      {groups.map((g) => {
        const groupImages = Array.from(new Set(g.rates.map(r => resolveImg(r.roomImage, '1024x768')).filter((v): v is string => !!v)));
        const cover = groupImages[0] || null;
        // Valentin (2026-05-28): show 3–5 rate options per room with
        // different conditions, not just the cheapest. We surface the
        // top 3 by composite score and collapse the rest behind a
        // toggle. In compare mode we collapse by plan-PAIR instead so the
        // Member + Non-Member twins are never split across the fold.
        const isExpanded = expandedGroups.has(g.name);
        // Meal × transfer matrix for the collapsed (default) view: one row,
        // dropdowns to switch. Skipped in compare mode (which pairs the
        // Member/Non-Member twins instead) and when expanded.
        const matrix = adminMatrixFromPresentation(presByName.get(g.name), g.rates);
        const selM = matrix && selMeal[g.name] && matrix.meals.includes(selMeal[g.name]) ? selMeal[g.name] : (matrix?.defaultMeal || '');
        const selT = matrix && selTransfer[g.name] && matrix.transfers.includes(selTransfer[g.name]) ? selTransfer[g.name] : (matrix?.defaultTransfer || '');
        const selectedRate = matrix ? (matrix.byCombo.get(admKey(selM, selT)) || matrix.from) : null;
        const showMatrix = !comparing && !isExpanded && !!matrix && (matrix.meals.length > 1 || matrix.hasTransfers);
        let visibleRates: AdminRate[];
        if (isExpanded) {
          visibleRates = g.rates;
        } else if (comparing) {
          const sigs: string[] = [];
          visibleRates = g.rates.filter(r => {
            const sig = planSigOf(r);
            if (!sigs.includes(sig)) {
              if (sigs.length >= 3) return false;
              sigs.push(sig);
            }
            return true;
          });
        } else if (selectedRate) {
          visibleRates = [selectedRate];
        } else {
          visibleRates = g.rates.slice(0, 3);
        }
        const hiddenCount = g.rates.length - visibleRates.length;
        return (
          <div key={g.name} className="c-card" style={{ overflow: 'hidden' }}>
            <div>
              <div style={{ padding: '12px 14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                    {cover && (
                      <div style={{
                        width: 64, height: 44, flexShrink: 0, borderRadius: 6, overflow: 'hidden',
                        backgroundColor: 'var(--c-bg-soft)',
                        backgroundImage: `url(${cover})`,
                        backgroundSize: 'cover',
                        backgroundPosition: 'center'
                      }} />
                    )}
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 700 }}>{g.name}</div>
                      {g.supplierCount > 1 && (
                        <div style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--c-fg-muted)', marginTop: 2 }}>
                          {g.supplierCount} suppliers
                        </div>
                      )}
                    </div>
                  </div>
                  {groupImages.length > 0 && (
                    <button
                      onClick={() => setPhotoModal({ name: g.name, images: groupImages })}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 5, flexShrink: 0,
                        fontSize: 11.5, fontWeight: 600, color: 'var(--c-accent)',
                        background: 'none', border: '1px solid var(--c-line)', borderRadius: 6,
                        padding: '3px 9px', cursor: 'pointer'
                      }}
                    >
                      <ImageIcon size={12} /> {groupImages.length} photo{groupImages.length > 1 ? 's' : ''}
                    </button>
                  )}
                </div>
                {showMatrix && matrix && (() => {
                  const pillStyle = (active: boolean) => ({
                    fontSize: 11.5, fontWeight: 600, padding: '3px 10px', borderRadius: 999,
                    cursor: 'pointer', whiteSpace: 'nowrap' as const,
                    border: active ? '1px solid var(--c-accent)' : '1px solid var(--c-line)',
                    background: active ? 'rgba(155,123,51,0.08)' : 'var(--c-bg)',
                    color: active ? 'var(--c-accent)' : 'var(--c-fg)',
                  });
                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
                      {matrix.meals.length > 1 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--c-fg-muted)', minWidth: 52 }}>Meal</span>
                          {matrix.meals.map(mm => (
                            <button key={mm} onClick={() => setSelMeal(s => ({ ...s, [g.name]: mm }))} style={pillStyle(mm === selM)}>{mm}</button>
                          ))}
                        </div>
                      )}
                      {matrix.hasTransfers && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--c-fg-muted)', minWidth: 52 }}>Transfer</span>
                          {matrix.transfers.map(tt => (
                            <button key={tt} onClick={() => setSelTransfer(s => ({ ...s, [g.name]: tt }))} style={pillStyle(tt === selT)}>{tt}</button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })()}
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                  <thead>
                    <tr style={{ textAlign: 'left', color: 'var(--c-fg-muted)' }}>
                      <th style={thStyle}>Supplier</th>
                      <th style={planThStyle}>Plan</th>
                      <th style={thStyle}>Cancellation</th>
                      <th style={thStyle}>NET (/ night · total)</th>
                      <th style={thStyle}>Markup</th>
                      <th style={thStyle}>Sell (/ night · total)</th>
                      <th style={thStyle}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleRates.map((r, i) => {
                      const isRecommended = r.rateKey === g.recommendedKey;
                      const rowBlocked = blockedSet.has((r.supplier || '').toLowerCase());
                      const rowBorder = isRecommended
                        ? '1.5px solid var(--c-accent)'
                        : '1px solid var(--c-line-soft)';
                      const rowBg = rowBlocked
                        ? 'rgba(185,28,28,0.05)'
                        : isRecommended ? 'rgba(155,123,51,0.04)' : undefined;
                      return (
                      <tr key={i} style={{ borderTop: rowBorder, background: rowBg, opacity: rowBlocked ? 0.55 : 1 }}>
                        <td style={tdStyle}>
                          {r.supplier && (
                            <span style={{ ...badgeStyle(r.supplier), textDecoration: rowBlocked ? 'line-through' : undefined }}>{r.supplier}</span>
                          )}
                          {rowBlocked && (
                            <span
                              title="Blocked for this hotel — will not be sold on the public site"
                              style={{ marginLeft: 6, padding: '1px 6px', borderRadius: 999, fontSize: 9.5, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: '#b91c1c', background: 'rgba(185,28,28,0.1)', border: '1px solid rgba(185,28,28,0.3)' }}
                            >Blocked</span>
                          )}
                          {/* Member/Non-Member is a RateHawk pool distinction
                              (cug vs public b2c). Hummingbird has no such split,
                              so the badge is noise there — show it only for
                              suppliers where the channel is meaningful. */}
                          {r._channel && (r.supplier || '').toLowerCase() !== 'hummingbird' && (() => {
                            // When the member (cug) and non-member (b2c) sell are
                            // the same for this plan, the "member" rate has no
                            // advantage — tag it "All" so the MEANINGFUL member
                            // rates (member < non-member) are the ones that stay
                            // green. Needs both channels loaded (Compare mode).
                            const pair = g.sellBySig.get(planSigOf(r));
                            const isAll = pair?.cug != null && pair?.b2c != null && Math.round(pair.cug) === Math.round(pair.b2c);
                            return (
                              <span
                                style={channelBadgeStyle(isAll ? 'all' : r._channel!)}
                                title={isAll ? 'Member and non-member price are identical — no member advantage' : undefined}
                              >
                                {isAll ? 'All' : r._channel === 'cug' ? 'Member' : 'Non-Member'}
                              </span>
                            );
                          })()}
                          {isRecommended && (
                            <div style={{
                              marginTop: 3,
                              fontSize: 9.5, fontWeight: 700, letterSpacing: 0.04, textTransform: 'uppercase',
                              color: 'var(--c-accent)'
                            }}>★ Recommended</div>
                          )}
                        </td>
                        <td style={planTdStyle}>
                          {r.ratePlan || 'nomeal'}
                          {showRgDebug && r.matchTier && r.matchTier !== 'strict' && (
                            <span style={{
                              marginLeft: 6,
                              padding: '1px 5px',
                              borderRadius: 3,
                              fontSize: 10,
                              fontFamily: 'var(--c-mono)',
                              background: 'var(--c-bg-soft)',
                              color: 'var(--c-fg-soft)',
                              border: '1px solid var(--c-line-soft)'
                            }}>{r.matchTier}</span>
                          )}
                          {/* Promo OFFER line — names the Hummingbird promo that
                              produced this price + the saving. Discount is in the
                              rate currency; convert to AUD when an fxRate exists. */}
                          {(r.offers?.length || (r.discountAmount ?? 0) > 0) && (() => {
                            const fx = r.pricing.aud?.fxRate;
                            const disc = r.discountAmount ?? 0;
                            const savedLabel = disc > 0
                              ? (fx
                                  ? `saved A$${fmtMoney(disc * fx)}`
                                  : `saved ${r.pricing.currency} ${fmtMoney(disc)}`)
                              : '';
                            const offer = r.offers?.[0];
                            const name = offer?.name || undefined;
                            const code = offer?.code ? `code ${offer.code}` : undefined;
                            return (
                              <div style={{
                                marginTop: 3,
                                fontSize: 11,
                                fontWeight: 600,
                                color: 'var(--c-success)',
                                lineHeight: 1.3
                              }}>
                                ★ {[name, code, savedLabel].filter(Boolean).join(' · ')}
                              </div>
                            );
                          })()}
                          {/* Transfer inclusion tag — make Maldives apple-to-apple.
                              Transfer-bundled (Hummingbird) rates carry r.transfer
                              and the PRICE already includes that transfer. Room-only
                              (RateHawk) rates have no r.transfer; show the per-hotel
                              transfer surcharge for this occupancy so the consultant
                              compares like for like. */}
                          {r.transfer ? (
                            <div style={{
                              marginTop: 3,
                              fontSize: 11,
                              fontWeight: 600,
                              color: 'var(--c-success)',
                              lineHeight: 1.3
                            }}>
                              ✓ incl. {r.transfer}
                            </div>
                          ) : transferSurcharge != null ? (
                            <div style={{
                              marginTop: 3,
                              fontSize: 11,
                              fontWeight: 600,
                              color: '#9a6a00',
                              lineHeight: 1.3
                            }}>
                              room only · +{transferCurrency} {fmtMoney(transferSurcharge)}
                            </div>
                          ) : (
                            <div style={{
                              marginTop: 3,
                              fontSize: 11,
                              fontWeight: 500,
                              color: 'var(--c-fg-muted)',
                              lineHeight: 1.3
                            }}>
                              room only
                            </div>
                          )}
                        </td>
                        <td style={tdStyle}>
                          {r.refundable
                            ? (
                              <div style={{ lineHeight: 1.3 }}>
                                <div style={{ color: 'var(--c-success)', fontWeight: 600 }}>Refundable</div>
                                {r.cancellationDeadlineUtc && (
                                  <div style={{ fontSize: 11, color: 'var(--c-fg-soft)' }}>
                                    until {fmtCancelDate(r.cancellationDeadlineUtc)}
                                  </div>
                                )}
                              </div>
                            )
                            : <span style={{ color: 'var(--c-danger)' }}>Non-refundable</span>}
                        </td>
                        <td style={tdStyle}>
                          <div style={{ fontFamily: 'var(--c-mono)', lineHeight: 1.3 }}>
                            {/* NET — total-first, decluttered. Primary = AUD total
                                (bold). Secondary = USD total (small/muted). One
                                combined per-night line (AUD/nt · USD/nt). Falls
                                back to USD-only when no AUD block. */}
                            {r.pricing.net?.aud?.totalAmount != null ? (
                              <>
                                <div style={{ fontWeight: 600 }}>
                                  {fmtMoney(roundOrUndef(r.pricing.net.aud.totalAmount))} <span style={{ color: 'var(--c-fg-muted)', fontSize: 10.5, fontWeight: 500 }}>AUD total</span>
                                </div>
                                <div style={{ color: 'var(--c-fg-soft)', fontSize: 11 }}>
                                  {fmtMoney(roundOrUndef(r.pricing.net?.totalAmount))} {r.pricing.currency}
                                </div>
                                <div style={{ color: 'var(--c-fg-muted)', fontSize: 10.5 }}>
                                  {fmtMoney(roundOrUndef(r.pricing.net.aud.nightlyAmount ?? undefined))} AUD/nt · {fmtMoney(roundOrUndef(r.pricing.net?.nightlyAmount))} {r.pricing.currency}/nt
                                </div>
                              </>
                            ) : (
                              <>
                                <div style={{ fontWeight: 600 }}>
                                  {fmtMoney(roundOrUndef(r.pricing.net?.totalAmount))} <span style={{ color: 'var(--c-fg-muted)', fontSize: 10.5, fontWeight: 500 }}>{r.pricing.currency} total</span>
                                </div>
                                <div style={{ color: 'var(--c-fg-muted)', fontSize: 10.5 }}>
                                  {fmtMoney(roundOrUndef(r.pricing.net?.nightlyAmount))} {r.pricing.currency}/nt
                                </div>
                              </>
                            )}
                          </div>
                        </td>
                        <td style={tdStyle}>
                          <span style={{ fontFamily: 'var(--c-mono)', color: 'var(--c-fg-soft)' }}>
                            {fmtMoney(r.pricing.markup?.amount)} ({r.pricing.markup?.value ?? 0}%)
                          </span>
                        </td>
                        <td style={tdStyle}>
                          <div style={{ fontFamily: 'var(--c-mono)', lineHeight: 1.3 }}>
                            {/* Struck "was" SELL — when a promo applied, apply the
                                same markup ratio to the rack (gross) rate so the
                                consultant sees the pre-offer sell price crossed out.
                                Display only — the row still books at the offer sell
                                price below. AUD when an fxRate exists, else native. */}
                            {(() => {
                              const gross = r.grossTotal ?? 0;
                              const disc = r.discountAmount ?? 0;
                              const nett = gross - disc;
                              const sellTotal = r.pricing.sell?.totalAmount;
                              if (!(disc > 0 && gross > 0 && nett > 0 && typeof sellTotal === 'number')) return null;
                              const wasSell = sellTotal * gross / nett;
                              const fx = r.pricing.aud?.fxRate;
                              const wasLabel = fx
                                ? `${fmtMoney(Math.round(wasSell * fx))} AUD`
                                : `${fmtMoney(Math.round(wasSell))} ${r.pricing.currency}`;
                              return (
                                <div style={{
                                  fontSize: 11,
                                  fontWeight: 500,
                                  color: 'var(--c-fg-muted)',
                                  textDecoration: 'line-through'
                                }}>
                                  was {wasLabel}
                                </div>
                              );
                            })()}
                            {/* SELL — total-first, decluttered. Primary = AUD
                                total (bold accent). Secondary = USD total
                                (small/muted). One combined per-night line.
                                Falls back to USD-only when no AUD block.
                                Display only — booking basis is still USD sell. */}
                            {r.pricing.aud?.totalAmount != null ? (
                              <>
                                <div style={{ fontWeight: 700, color: 'var(--c-accent)', fontSize: 14 }}>
                                  {fmtMoney(roundOrUndef(r.pricing.aud.totalAmount))} <span style={{ color: 'var(--c-fg-muted)', fontSize: 10.5, fontWeight: 600 }}>AUD total</span>
                                </div>
                                <div style={{ color: 'var(--c-fg-soft)', fontSize: 11, fontWeight: 500 }}>
                                  {fmtMoney(roundOrUndef(r.pricing.sell?.totalAmount))} {r.pricing.currency}
                                </div>
                                <div style={{ color: 'var(--c-fg-muted)', fontSize: 10.5 }}>
                                  {fmtMoney(roundOrUndef(r.pricing.aud.nightlyAmount ?? undefined))} AUD/nt · {fmtMoney(roundOrUndef(r.pricing.sell?.nightlyAmount))} {r.pricing.currency}/nt
                                </div>
                              </>
                            ) : (
                              <>
                                <div style={{ fontWeight: 700, color: 'var(--c-accent)', fontSize: 14 }}>
                                  {fmtMoney(roundOrUndef(r.pricing.sell?.totalAmount))} {r.pricing.currency} <span style={{ color: 'var(--c-fg-muted)', fontSize: 10.5, fontWeight: 600 }}>total</span>
                                </div>
                                <div style={{ color: 'var(--c-fg-muted)', fontSize: 10.5 }}>
                                  {fmtMoney(roundOrUndef(r.pricing.sell?.nightlyAmount))} {r.pricing.currency}/nt
                                </div>
                              </>
                            )}
                            {(() => {
                              // Compare hint: on a Member row, show how much
                              // cheaper (or dearer) it is than its Non-Member twin.
                              if (!comparing || r._channel !== 'cug') return null;
                              const pair = g.sellBySig.get(planSigOf(r));
                              const mine = r.pricing.sell?.totalAmount;
                              if (!pair || pair.b2c === undefined || typeof mine !== 'number') return null;
                              const diff = pair.b2c - mine;
                              if (Math.abs(diff) < 0.5) return null;
                              const cheaper = diff > 0;
                              return (
                                <div style={{ fontSize: 10.5, fontWeight: 600, marginTop: 2, color: cheaper ? 'var(--c-success)' : 'var(--c-danger)' }}>
                                  {cheaper ? '−' : '+'}{fmtMoney(Math.abs(diff))} vs non-member
                                </div>
                              );
                            })()}
                          </div>
                        </td>
                        <td style={{ ...tdStyle, textAlign: 'right' }}>
                          <button className="c-btn c-btn-primary" onClick={() => onChoose(r)} style={{ padding: '5px 12px', fontSize: 12 }}>
                            Choose
                          </button>
                        </td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
                {hiddenCount > 0 && (
                  <button
                    onClick={() => setExpandedGroups(prev => {
                      const next = new Set(prev);
                      next.add(g.name);
                      return next;
                    })}
                    style={{
                      marginTop: 6, fontSize: 11.5, color: 'var(--c-accent)',
                      background: 'none', border: 0, cursor: 'pointer', padding: 0, fontWeight: 600
                    }}
                  >Show {hiddenCount} more rate{hiddenCount > 1 ? 's' : ''}</button>
                )}
                {isExpanded && g.rates.length > 3 && (
                  <button
                    onClick={() => setExpandedGroups(prev => {
                      const next = new Set(prev);
                      next.delete(g.name);
                      return next;
                    })}
                    style={{
                      marginTop: 6, fontSize: 11.5, color: 'var(--c-fg-soft)',
                      background: 'none', border: 0, cursor: 'pointer', padding: 0, fontWeight: 600
                    }}
                  >Show top 3 only</button>
                )}
              </div>
            </div>
          </div>
        );
      })}

      {/* Room-photos lightbox */}
      {photoModal && (
        <div
          onClick={() => setPhotoModal(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ background: 'var(--c-bg)', borderRadius: 10, maxWidth: 'min(900px, 94vw)', maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 12px 40px rgba(0,0,0,0.4)' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '12px 16px', borderBottom: '1px solid var(--c-line)' }}>
              <div style={{ fontSize: 14, fontWeight: 700 }}>{photoModal.name}</div>
              <button onClick={() => setPhotoModal(null)} title="Close" style={iconBtnStyle}><X size={14} /></button>
            </div>
            <div style={{ overflowY: 'auto', padding: 16, display: 'grid', gridTemplateColumns: photoModal.images.length > 1 ? 'repeat(auto-fill, minmax(240px, 1fr))' : '1fr', gap: 10 }}>
              {photoModal.images.map((src, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={i} src={src} alt={`${photoModal.name} ${i + 1}`} style={{ width: '100%', borderRadius: 8, objectFit: 'cover', background: 'var(--c-bg-soft)' }} />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
const thStyle: React.CSSProperties = { fontWeight: 700, fontSize: 11, letterSpacing: 0.05, textTransform: 'uppercase', padding: '6px 8px', color: 'var(--c-fg-muted)' };
const tdStyle: React.CSSProperties = { padding: '8px 8px', verticalAlign: 'middle', color: 'var(--c-fg)' };
// Plan column: rate-plan strings like "Half Board Dine Around · Transfer YT"
// were getting squeezed into a 1-word-per-line vertical stack because the
// auto-layout table starved the column. Give it room (min/max width) and
// wrap on whole words only (normal, not break-word) so it reads on 1–2 lines.
// max-width keeps it from eating the table when the drawer is narrow, and the
// drawer body already allows horizontal scroll as the final safety net.
const planThStyle: React.CSSProperties = { ...thStyle, minWidth: 200, width: '26%' };
const planTdStyle: React.CSSProperties = { ...tdStyle, minWidth: 200, maxWidth: 320, whiteSpace: 'normal', wordBreak: 'normal', overflowWrap: 'normal', lineHeight: 1.35 };

// Loading placeholder for the rate table — shows the room-card shell
// (image + title + a few rate rows) while the supplier call is in flight,
// plus an "about" block skeleton if the hotel content hasn't landed yet.
// Keeps the drawer feeling populated instead of a lone spinner.
function RatesSkeleton({ hasContent }: { hasContent: boolean }) {
  const bar = (w: string | number, h = 12): React.CSSProperties => ({
    width: w, height: h, borderRadius: 4, background: 'var(--c-bg-soft)'
  });
  return (
    <div className="animate-pulse" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {!hasContent && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 4 }}>
          <div style={bar('40%', 16)} />
          <div style={bar('92%')} />
          <div style={bar('85%')} />
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--c-fg-soft)', fontSize: 13 }}>
        <Loader2 size={14} className="animate-spin" /> Loading rooms…
      </div>
      {[0, 1, 2].map(i => (
        <div key={i} className="c-card" style={{ overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: 0 }}>
            <div style={{ width: 160, minHeight: 120, background: 'var(--c-bg-soft)' }} />
            <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={bar('55%', 14)} />
              {[0, 1].map(j => (
                <div key={j} style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <div style={bar(80)} />
                  <div style={bar(90)} />
                  <div style={bar(70)} />
                  <div style={{ ...bar(60), marginLeft: 'auto' }} />
                </div>
              ))}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.06, textTransform: 'uppercase', color: 'var(--c-fg-muted)', marginBottom: 6 }}>
      {children}
    </div>
  );
}
/**
 * Right-side slide-out booking form. Hotel info + rate table stay
 * visible on the left while the consultant fills customer details.
 * Width capped at 480px on desktop, full width on mobile.
 */
function BookingSidebar(props: {
  hotel: HotelHit | null;
  rate: AdminRate;
  checkIn: string;
  checkOut: string;
  rooms: RoomGuests[];
  citizenship: string;
  custFirst: string; setCustFirst: (s: string) => void;
  custLast:  string; setCustLast:  (s: string) => void;
  custEmail: string; setCustEmail: (s: string) => void;
  custPhone: string; setCustPhone: (s: string) => void;
  extraRoomGuests: Array<{ firstName: string; lastName: string }>;
  setExtraRoomGuests: (g: Array<{ firstName: string; lastName: string }>) => void;
  busy: boolean;
  error: string | null;
  result: any;
  prebookBusy: boolean;
  prebookErr: string | null;
  prebook: {
    prebookHash: string;
    priceChanged: boolean;            // truthful delta — informational
    supplierFlaggedChange: boolean;   // strict — gates the banner
    originalPrice?: number | null;
    newPrice?: number | null;
    currency?: string | null;
    isFreeCancellation?: boolean | null;
    partnerOrderId?: string;
    supplier?: string;
    skipped?: string;
  } | null;
  acceptedNewPrice: boolean;
  onAcceptNewPrice: () => void;
  canSubmit: boolean;
  onClose: () => void;
  onConfirm: () => void;
  onBookAnother: () => void;
}) {
  const r = props.rate;
  const totalAdults = props.rooms.reduce((s, x) => s + x.adults, 0);
  const totalChildren = props.rooms.reduce((s, x) => s + x.childrenAges.length, 0);
  return (
    <>
      {/* dimmed backdrop */}
      <div
        onClick={props.onClose}
        style={{
          position: 'fixed', inset: 0,
          background: 'rgba(15, 15, 15, 0.34)',
          zIndex: 70
        }}
      />
      <aside
        style={{
          position: 'fixed', top: 0, right: 0, bottom: 0,
          width: 'min(480px, 100vw)',
          background: 'var(--c-bg)',
          borderLeft: '1px solid var(--c-line)',
          boxShadow: '-16px 0 36px rgba(0,0,0,0.10)',
          display: 'flex', flexDirection: 'column',
          zIndex: 80
        }}
      >
        {/* header */}
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--c-line)', background: 'var(--c-bg-soft)', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700 }}>
              {props.result ? 'Booking confirmed' : 'Book on behalf of customer'}
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--c-fg-muted)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {props.hotel?.name} · {props.checkIn} → {props.checkOut}
            </div>
          </div>
          <button onClick={props.onClose} style={{ ...iconBtnStyle, padding: 6 }} aria-label="Close">
            <ArrowLeft size={14} />
          </button>
        </div>

        {/* body */}
        <div style={{ flex: 1, overflow: 'auto', padding: 18 }}>
          {/* rate summary */}
          <div className="c-card" style={{ padding: 12, marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>{r.roomTypeName}</div>
            <div style={{ fontSize: 11.5, color: 'var(--c-fg-soft)', marginBottom: 10 }}>
              {r.ratePlan} · {r.refundable ? <span style={{ color: 'var(--c-success)' }}>Refundable</span> : <span style={{ color: 'var(--c-danger)' }}>Non-refundable</span>} · {r.supplier}
            </div>
            {/* ETG cert §6 — full tax transparency for B2B.
                Sell total already contains supplier-included taxes
                (included_by_supplier:true). We show those inline as
                "of which" rows for consultant transparency, then
                excluded taxes as separate line items added on top. */}
            {(() => {
              const sellTotal = r.pricing.sell?.totalAmount || 0;
              const included = r.taxes?.included || [];
              const excluded = r.taxes?.excluded || [];
              const excludedTotal = r.taxes?.excludedTotal || 0;
              const hasIncluded = included.length > 0;
              const hasExcluded = excluded.length > 0 && excludedTotal > 0;
              const grandTotal = sellTotal + excludedTotal;
              const prettify = (t: { name?: string; type?: string }) =>
                String(t.name || t.type || 'Tax').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
              return (
                <div style={{ display: 'grid', gap: 6 }}>
                  {(hasIncluded || hasExcluded) && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--c-fg-soft)' }}>
                      <span>Room rate</span>
                      <span style={{ fontFamily: 'var(--c-mono)' }}>{fmtMoney(sellTotal)} {r.pricing.currency}</span>
                    </div>
                  )}
                  {hasIncluded && included.map((t, i) => (
                    <div key={`inc-${i}`} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, color: 'var(--c-fg-muted)', paddingLeft: 12 }}>
                      <span>↳ {prettify(t)} <span style={{ fontStyle: 'italic' }}>(included)</span></span>
                      <span style={{ fontFamily: 'var(--c-mono)' }}>{fmtMoney(t.amount)} {t.currency || r.pricing.currency}</span>
                    </div>
                  ))}
                  {hasExcluded && excluded.map((t, i) => (
                    <div key={`exc-${i}`} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--c-fg-soft)' }}>
                      <span>{prettify(t)}</span>
                      <span style={{ fontFamily: 'var(--c-mono)' }}>{fmtMoney(t.amount)} {t.currency || r.pricing.currency}</span>
                    </div>
                  ))}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', paddingTop: (hasIncluded || hasExcluded) ? 6 : 0, borderTop: (hasIncluded || hasExcluded) ? '1px solid var(--c-line-soft)' : 'none' }}>
                    <span style={{ fontSize: 12, color: 'var(--c-fg-muted)' }}>Total payable</span>
                    <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--c-accent)', fontFamily: 'var(--c-mono)' }}>
                      {fmtMoney(grandTotal)} {r.pricing.currency}
                    </span>
                  </div>
                  {!hasIncluded && !hasExcluded && (
                    <div style={{ fontSize: 10.5, color: 'var(--c-fg-muted)', textAlign: 'right' }}>
                      Includes taxes & fees (supplier did not return a breakdown)
                    </div>
                  )}
                </div>
              );
            })()}
            <div style={{ marginTop: 6, fontSize: 11, color: 'var(--c-fg-muted)', display: 'flex', justifyContent: 'space-between' }}>
              <span>Net {fmtMoney(r.pricing.net?.totalAmount)} · +Markup {fmtMoney(r.pricing.markup?.amount)} ({r.pricing.markup?.value ?? 0}%)</span>
              <span>{totalAdults} adult{totalAdults !== 1 ? 's' : ''}{totalChildren ? ` · ${totalChildren} child${totalChildren !== 1 ? 'ren' : ''}` : ''}</span>
            </div>
          </div>

          {/* Prebook status — ETG cert §1.1 ─────────────────────────
              Verifying availability + surfacing any price change
              BEFORE the consultant fills the form. */}
          {props.prebookBusy && (
            <div style={{ padding: '10px 14px', background: 'var(--c-bg-soft)', border: '1px solid var(--c-line)', borderRadius: 6, fontSize: 13, color: 'var(--c-fg-soft)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Loader2 size={14} className="animate-spin" />
              Verifying rate with supplier…
            </div>
          )}
          {props.prebookErr && (
            <div style={{ padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, fontSize: 13, color: 'var(--c-danger)', marginBottom: 12 }}>
              Rate verification failed: {props.prebookErr}. <button onClick={props.onClose} style={{ background: 'none', border: 0, color: 'var(--c-danger)', textDecoration: 'underline', cursor: 'pointer', padding: 0 }}>Pick another</button>
            </div>
          )}
          {props.prebook?.supplierFlaggedChange && !props.acceptedNewPrice && (
            // Premium price-change banner — ported from B2C ReserveSidebar
            // for consistency across audiences. Same cert evidence on
            // both flows. Brand-gold accent, serif numbers, single
            // primary CTA.
            <div style={{
              marginBottom: 14,
              borderRadius: 10,
              border: '1px solid #E8DCC4',
              background: 'linear-gradient(180deg, #FDFAF0 0%, #FAF4E2 100%)',
              padding: '16px 16px 14px',
              boxShadow: '0 1px 2px rgba(155, 123, 51, 0.08)'
            }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 6,
                fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em',
                color: '#9B7B33', textTransform: 'uppercase', marginBottom: 10
              }}>
                <AlertTriangle size={12} /> Rate updated by supplier
              </div>
              <div style={{
                display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
                paddingBottom: 10, marginBottom: 10, borderBottom: '1px solid #E8DCC4'
              }}>
                <span style={{ fontSize: 12.5, color: '#7A6635' }}>Previous total</span>
                <span style={{
                  fontSize: 13.5, color: '#9C8B5D',
                  textDecoration: 'line-through', fontFamily: 'Georgia, serif'
                }}>
                  {fmtMoney(props.prebook.originalPrice ?? undefined)} {props.prebook.currency}
                </span>
              </div>
              <div style={{
                display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
                marginBottom: 12
              }}>
                <span style={{ fontSize: 13, color: '#3F2F0E', fontWeight: 600 }}>New total</span>
                <span style={{
                  fontSize: 22, color: '#3F2F0E', fontWeight: 600,
                  fontFamily: 'Georgia, serif', letterSpacing: '-0.01em'
                }}>
                  {fmtMoney(props.prebook.newPrice ?? undefined)} {props.prebook.currency}
                </span>
              </div>
              <button
                onClick={props.onAcceptNewPrice}
                style={{
                  width: '100%', padding: '10px 14px', borderRadius: 8,
                  background: '#9B7B33', color: 'white', border: 0,
                  fontWeight: 600, fontSize: 13, cursor: 'pointer'
                }}
              >
                Accept new total of {fmtMoney(props.prebook.newPrice ?? undefined)} {props.prebook.currency}
              </button>
            </div>
          )}
          {props.prebook && !props.prebook.supplierFlaggedChange && !props.prebook.skipped && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '8px 12px', borderRadius: 6, marginBottom: 12,
              background: '#FAF7EE', borderLeft: '3px solid #9B7B33',
              fontSize: 12, color: '#5C4A1F'
            }}>
              <CheckCircle2 size={13} style={{ color: '#9B7B33' }} />
              Rate held at <strong style={{ color: '#3F2F0E' }}>{fmtMoney((props.prebook.newPrice ?? props.prebook.originalPrice) ?? undefined)} {props.prebook.currency}</strong>
            </div>
          )}

          {/* SUCCESS view */}
          {props.result && (
            <div>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 6, color: 'var(--c-success)', fontSize: 13.5, fontWeight: 700, marginBottom: 14 }}>
                <CheckCircle2 size={16} /> Booking confirmed
              </div>
              <div style={{ display: 'grid', gap: 8, fontSize: 13 }}>
                <Row label="Status"           value={String(props.result.status || '—')} />
                <Row label="Supplier order"   value={String(props.result.bookingId || props.result.confirmationNumber || '—')} />
                <Row label="Partner order"    value={String(props.result.partnerOrderId || '—')} mono />
                <Row label="Internal booking" value={String(props.result.internalBookingId || '—')} mono />
                <Row label="Total"            value={`${props.result.totalAmount || '—'} ${props.result.currency || ''}`} />
                <Row label="Guest"            value={`${props.result.guestInfo?.firstName || ''} ${props.result.guestInfo?.lastName || ''}`} />
                {/* ETG cert §9 — multi-room composition. Read from
                    the rooms[] state (true per-room) rather than the
                    supplier echo, which only carries the lead-guest
                    block. Matches what the consultant entered. */}
                {(() => {
                  const totalAdults   = props.rooms.reduce((s, r) => s + (r.adults || 0), 0);
                  const totalChildren = props.rooms.reduce((s, r) => s + ((r.childrenAges || []).length), 0);
                  const composition = [
                    `${totalAdults}A`,
                    totalChildren > 0 ? `${totalChildren}C` : null,
                    `${props.rooms.length} room${props.rooms.length === 1 ? '' : 's'}`
                  ].filter(Boolean).join(' · ');
                  return <Row label="Guests & rooms" value={composition} />;
                })()}
              </div>
            </div>
          )}

          {/* FORM view */}
          {!props.result && (
            <>
              {props.error && (
                <div style={{ marginBottom: 12, padding: '10px 12px', background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 6, color: 'var(--c-danger)', fontSize: 13, display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                  <AlertTriangle size={14} style={{ marginTop: 2, flexShrink: 0 }} />
                  <span>{props.error}</span>
                </div>
              )}
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--c-fg-soft)', textTransform: 'uppercase', letterSpacing: 0.05, marginBottom: 10 }}>
                Customer details
              </div>
              <div style={{ display: 'grid', gap: 10, gridTemplateColumns: '1fr 1fr' }}>
                <div>
                  <label style={labelStyle}>First name</label>
                  <input style={inputStyle} value={props.custFirst} onChange={(e) => props.setCustFirst(e.target.value)} placeholder="First" />
                </div>
                <div>
                  <label style={labelStyle}>Last name</label>
                  <input style={inputStyle} value={props.custLast} onChange={(e) => props.setCustLast(e.target.value)} placeholder="Last" />
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={labelStyle}>Email</label>
                  <input style={inputStyle} type="email" value={props.custEmail} onChange={(e) => props.setCustEmail(e.target.value)} placeholder="customer@example.com" />
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={labelStyle}>Phone</label>
                  <input style={inputStyle} type="tel" value={props.custPhone} onChange={(e) => props.setCustPhone(e.target.value)} placeholder="+61 ..." />
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={labelStyle}>Citizenship</label>
                  <div style={{ ...inputStyle, background: 'var(--c-bg-soft)', color: 'var(--c-fg-soft)' }}>
                    {props.citizenship} (set on search)
                  </div>
                </div>
              </div>

              {/* ETG cert §5 — per-room lead-guest names. Only shown
                  for multi-room bookings. */}
              {props.extraRoomGuests.length > 0 && (
                <>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--c-fg-soft)', textTransform: 'uppercase', letterSpacing: 0.05, marginTop: 16, marginBottom: 6 }}>
                    Lead guest in each additional room
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--c-fg-muted)', marginBottom: 10, lineHeight: 1.5 }}>
                    Hotels require a real name for the lead guest in each room. The customer above is the lead guest in Room 1.
                  </div>
                  {props.extraRoomGuests.map((rg, i) => (
                    <div key={i} style={{ marginBottom: 10 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--c-fg-soft)', marginBottom: 6 }}>Room {i + 2}</div>
                      <div style={{ display: 'grid', gap: 10, gridTemplateColumns: '1fr 1fr' }}>
                        <div>
                          <label style={labelStyle}>First name</label>
                          <input
                            style={inputStyle}
                            value={rg.firstName}
                            onChange={(e) => props.setExtraRoomGuests(props.extraRoomGuests.map((x, j) => j === i ? { ...x, firstName: e.target.value } : x))}
                            placeholder="First"
                          />
                        </div>
                        <div>
                          <label style={labelStyle}>Last name</label>
                          <input
                            style={inputStyle}
                            value={rg.lastName}
                            onChange={(e) => props.setExtraRoomGuests(props.extraRoomGuests.map((x, j) => j === i ? { ...x, lastName: e.target.value } : x))}
                            placeholder="Last"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </>
          )}
        </div>

        {/* footer / action */}
        <div style={{ padding: 14, borderTop: '1px solid var(--c-line)', display: 'flex', gap: 8 }}>
          {props.result ? (
            <>
              <button className="c-btn" onClick={props.onBookAnother} style={{ flex: 1, justifyContent: 'center' }}>
                Book another rate
              </button>
              <button className="c-btn c-btn-primary" onClick={props.onClose} style={{ flex: 1, justifyContent: 'center' }}>
                Done
              </button>
            </>
          ) : (
            <button
              className="c-btn c-btn-primary"
              onClick={props.onConfirm}
              // Gated on canSubmit: must have a prebookHash AND the
              // consultant must have accepted any price change. Without
              // a hash the booking would 400 at the supplier; without
              // accepting price change ETG §1.1 would flag the booking.
              disabled={props.busy || !props.canSubmit}
              title={!props.canSubmit ? 'Verifying rate or awaiting price-change confirmation' : ''}
              style={{ flex: 1, justifyContent: 'center', opacity: props.canSubmit ? 1 : 0.6 }}
            >
              {props.busy ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
              {props.busy ? 'Booking…' : (() => {
                // Use the prebook-locked newPrice whenever it's
                // present — silent shifts must show on the Confirm
                // button so the consultant sees the real total. Was
                // gated on priceChanged before, which hid moves
                // RateHawk didn't flip the banner flag for.
                const base = props.prebook?.newPrice || r.pricing.sell?.totalAmount || 0;
                const grand = base + (r.taxes?.excludedTotal || 0);
                return `Confirm · ${fmtMoney(grand)} ${r.pricing.currency}`;
              })()}
            </button>
          )}
        </div>
      </aside>
    </>
  );
}

function FactCell({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ background: 'var(--c-bg-soft)', border: '1px solid var(--c-line-soft)', borderRadius: 6, padding: '8px 10px' }}>
      <div style={{ fontSize: 10.5, color: 'var(--c-fg-muted)', textTransform: 'uppercase', letterSpacing: 0.04, fontWeight: 700, marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 13, color: 'var(--c-fg)' }}>{value}</div>
    </div>
  );
}
