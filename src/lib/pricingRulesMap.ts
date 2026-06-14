// Mapping between the console's pricing-rule shape and the AUTHORITATIVE
// booking-engine `pricing_rules` model (the one pricingService.js applies).
//
// The engine matches a hotel against rule.hotel_filter on these keys (ALL must
// match), then applies the SINGLE highest-`priority` matching rule:
//     country, city, star_rating (minimum), supplier, hotel_id, hotel_code
// markup: rule_type ('percentage'|'fixed_amount') + markup_percentage|markup_fixed_amount.
// (min_rate/max_rate/date_range columns exist but are NOT used by the matcher.)

export const TENANT = 'default';

export type RuleConditions = {
  hotel_id?: number;
  hotel_code?: string;
  hotel_name?: string; // display-only; matcher ignores it
  country?: string;
  city?: string;
  star_rating?: number; // minimum
  supplier?: string;
};

export type ConsoleRule = {
  id: number;
  name: string;
  markup_type: 'percentage' | 'fixed_amount';
  markup_value: number;
  priority: number;
  is_active: boolean;
  conditions: RuleConditions;
};

export type Tier = 'hotel' | 'destination' | 'segment' | 'global';

// Specificity tier — drives the cascade display + default priority.
export function tierOf(c: RuleConditions = {}): Tier {
  if (c.hotel_id != null || c.hotel_code) return 'hotel';
  if (c.country || c.city) return 'destination';
  if (c.star_rating || c.supplier) return 'segment';
  return 'global';
}

export const TIER_PRIORITY: Record<Tier, number> = { hotel: 40, destination: 30, segment: 20, global: 10 };

export function toConsole(be: any): ConsoleRule {
  const hf = be.hotel_filter || {};
  const markup_type: ConsoleRule['markup_type'] = be.rule_type === 'fixed_amount' ? 'fixed_amount' : 'percentage';
  return {
    id: be.id,
    name: be.rule_name || '',
    markup_type,
    markup_value: Number(markup_type === 'percentage' ? be.markup_percentage : be.markup_fixed_amount) || 0,
    priority: be.priority ?? 5,
    is_active: be.is_active !== false,
    conditions: {
      hotel_id: hf.hotel_id != null ? Number(hf.hotel_id) : undefined,
      hotel_code: hf.hotel_code,
      hotel_name: hf.hotel_name,
      country: hf.country,
      city: hf.city,
      star_rating: hf.star_rating != null ? Number(hf.star_rating) : undefined,
      supplier: hf.supplier,
    },
  };
}

export function toBackend(input: Partial<ConsoleRule>) {
  const c = input.conditions || {};
  const hotel_filter: Record<string, any> = {};
  if (c.hotel_id != null && `${c.hotel_id}` !== '') hotel_filter.hotel_id = Number(c.hotel_id);
  if (c.hotel_code) hotel_filter.hotel_code = String(c.hotel_code).trim();
  if (c.hotel_name) hotel_filter.hotel_name = String(c.hotel_name).trim();
  if (c.country) hotel_filter.country = String(c.country).trim().toUpperCase();
  if (c.city) hotel_filter.city = String(c.city).trim();
  if (c.star_rating) hotel_filter.star_rating = Number(c.star_rating);
  if (c.supplier) hotel_filter.supplier = String(c.supplier).trim();

  const isPct = input.markup_type !== 'fixed_amount';
  const tier = tierOf(c);
  return {
    tenant_id: TENANT,
    rule_type: isPct ? 'percentage' : 'fixed_amount',
    rule_name: input.name?.trim() || autoName(c, tier),
    markup_percentage: isPct ? input.markup_value : null,
    markup_fixed_amount: isPct ? null : input.markup_value,
    hotel_filter,
    room_filter: null,
    date_range: null,
    priority: input.priority != null ? input.priority : TIER_PRIORITY[tier],
  };
}

function autoName(c: RuleConditions, tier: Tier): string {
  if (tier === 'hotel') return c.hotel_name || `Hotel ${c.hotel_id ?? c.hotel_code}`;
  if (tier === 'destination') return [c.city, c.country].filter(Boolean).join(', ');
  if (tier === 'segment') return [c.star_rating ? `${c.star_rating}★+` : '', c.supplier].filter(Boolean).join(' ');
  return 'Global markup';
}

// Same logic the engine uses — for the console's "which rule wins?" preview.
export function matchesHotel(c: RuleConditions, h: { hotel_id?: number; country?: string; city?: string; star_rating?: number; supplier?: string }): boolean {
  if (c.hotel_id != null && Number(h.hotel_id) !== Number(c.hotel_id)) return false;
  if (c.country && (h.country || '').toUpperCase() !== c.country.toUpperCase()) return false;
  if (c.city && (h.city || '').toLowerCase() !== c.city.toLowerCase()) return false;
  if (c.star_rating && Number(h.star_rating || 0) < Number(c.star_rating)) return false;
  if (c.supplier && h.supplier !== c.supplier) return false;
  return true;
}
