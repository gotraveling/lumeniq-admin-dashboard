// Mapping between the console's pricing-rule shape and the AUTHORITATIVE
// booking-engine `pricing_rules` model (the one pricingService.js applies).
//
//  console.rule_type (scope)  <->  booking-engine hotel_filter  ({} / {country} / {hotel_id})
//  console.markup_type        <->  booking-engine rule_type     (percentage | fixed_amount)
//  console.markup_value       <->  markup_percentage | markup_fixed_amount
//  console.description        <->  rule_name

export const TENANT = 'default';

export type ConsoleRule = {
  id: number;
  rule_type: 'global' | 'destination' | 'hotel';
  target_value: string | null;
  markup_type: 'percentage' | 'fixed_amount';
  markup_value: number;
  priority?: number;
  description: string;
  is_active: boolean;
};

export function toConsole(be: any): ConsoleRule {
  const hf = be.hotel_filter || {};
  let rule_type: ConsoleRule['rule_type'] = 'global';
  let target_value: string | null = null;
  if (hf.hotel_id != null) { rule_type = 'hotel'; target_value = String(hf.hotel_id); }
  else if (hf.hotel_code != null) { rule_type = 'hotel'; target_value = String(hf.hotel_code); }
  else if (hf.country) { rule_type = 'destination'; target_value = String(hf.country); }
  else if (hf.city) { rule_type = 'destination'; target_value = String(hf.city); }
  const markup_type: ConsoleRule['markup_type'] = be.rule_type === 'fixed_amount' ? 'fixed_amount' : 'percentage';
  const markup_value = Number(markup_type === 'percentage' ? be.markup_percentage : be.markup_fixed_amount) || 0;
  return {
    id: be.id,
    rule_type,
    target_value,
    markup_type,
    markup_value,
    priority: be.priority,
    description: be.rule_name || '',
    is_active: be.is_active,
  };
}

export function toBackend(c: Partial<ConsoleRule>) {
  let hotel_filter: Record<string, any> = {};
  if (c.rule_type === 'destination' && c.target_value) {
    hotel_filter = { country: String(c.target_value).trim().toUpperCase() };
  } else if (c.rule_type === 'hotel' && c.target_value) {
    const n = Number(c.target_value);
    hotel_filter = { hotel_id: Number.isFinite(n) ? n : String(c.target_value).trim() };
  }
  const isPct = c.markup_type !== 'fixed_amount';
  return {
    tenant_id: TENANT,
    rule_type: isPct ? 'percentage' : 'fixed_amount',
    rule_name: c.description?.trim() || (c.rule_type === 'global' ? 'Global Markup' : `${c.rule_type} ${c.target_value || ''}`.trim()),
    markup_percentage: isPct ? c.markup_value : null,
    markup_fixed_amount: isPct ? null : c.markup_value,
    hotel_filter,
    room_filter: null,
    date_range: null,
    priority: c.rule_type === 'hotel' ? 30 : c.rule_type === 'destination' ? 20 : 10,
  };
}
