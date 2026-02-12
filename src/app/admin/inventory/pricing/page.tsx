'use client';

import React, { useState, useEffect } from 'react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth } from '@/lib/firebase';
import { Plus, Edit, Trash2, DollarSign, Percent, Settings, Star, Globe, Building, ArrowLeft, CheckCircle, XCircle, TrendingUp, Target } from 'lucide-react';
import { HotelAutocomplete } from '@/components/ui/HotelAutocomplete';

// Define the new, simplified interface for a rule from our database
interface PricingRule {
  id: string;
  name: string;
  priority: number;
  markup_type: 'percentage' | 'fixed_amount';
  markup_value: number | string; // API returns as string from NUMERIC column
  conditions: any; // This will be our JSONB object
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface UserClaims {
  role?: 'super_admin' | 'admin' | 'user';
  tenant_id?: string;
}

export default function PricingRulesPage() {
  const [user] = useAuthState(auth);
  const [userClaims, setUserClaims] = useState<UserClaims>({});
  const [rules, setRules] = useState<PricingRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddRule, setShowAddRule] = useState(false);
  const [editingRule, setEditingRule] = useState<PricingRule | null>(null);
  const [saving, setSaving] = useState(false);
  const [hotelCode, setHotelCode] = useState('');
  const [selectedHotel, setSelectedHotel] = useState<any>(null);

  useEffect(() => {
    if (user) {
      user.getIdTokenResult().then(token => setUserClaims(token.claims as UserClaims));
    }
    loadPricingRules();
  }, [user]);

  const loadPricingRules = async () => {
    setLoading(true);
    try {
      const apiUrl = process.env.NEXT_PUBLIC_HOTEL_API_URL || 'http://localhost:8080';
      const response = await fetch(`${apiUrl}/api/pricing/rules`);
      if (!response.ok) throw new Error('Failed to fetch rules');
      const data = await response.json();
      setRules(data);
    } catch (error) {
      console.error('Error loading pricing rules:', error);
      // In a real app, you'd show a toast notification here
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      const formData = new FormData(e.target as HTMLFormElement);
      
      const conditions: any = {};
      if (formData.get('country')) conditions.country = formData.get('country');
      if (formData.get('starRating')) conditions.star_rating = parseInt(formData.get('starRating') as string);
      if (formData.get('city')) conditions.city = formData.get('city');
      if (formData.get('supplier')) conditions.supplier = formData.get('supplier');
      if (formData.get('minRate')) conditions.min_rate = parseFloat(formData.get('minRate') as string);
      if (formData.get('maxRate')) conditions.max_rate = parseFloat(formData.get('maxRate') as string);
      if (hotelCode) {
        conditions.hotel_code = hotelCode;
        if (selectedHotel) {
          conditions.hotel_id = selectedHotel.hotel_id;
          conditions.hotel_name = selectedHotel.name;
        }
      }

      const ruleData = {
        name: formData.get('ruleName') as string,
        priority: parseInt(formData.get('priority') as string) || 5,
        markup_type: formData.get('markupType') as string,
        markup_value: parseFloat(formData.get('markupValue') as string) || 0,
        conditions: conditions,
      };

      const apiUrl = process.env.NEXT_PUBLIC_HOTEL_API_URL || 'http://localhost:8080';
      const url = editingRule
        ? `${apiUrl}/api/pricing/rules/${editingRule.id}`
        : `${apiUrl}/api/pricing/rules`;
      const method = editingRule ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ruleData),
      });

      if (response.ok) {
        setShowAddRule(false);
        setEditingRule(null);
        setHotelCode('');
        setSelectedHotel(null);
        loadPricingRules();
      } else {
        const error = await response.json();
        alert('Error saving rule: ' + (error.message || 'Unknown error'));
      }
    } catch (error: any) {
      alert('Error saving rule: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (ruleId: string) => {
    if (window.confirm('Are you sure you want to delete this pricing rule?')) {
      try {
        const apiUrl = process.env.NEXT_PUBLIC_HOTEL_API_URL || 'http://localhost:8080';
        const response = await fetch(`${apiUrl}/api/pricing/rules/${ruleId}`, {
          method: 'DELETE',
        });

        if (response.ok) {
          loadPricingRules(); // Reload rules after deletion
        } else {
          const error = await response.json();
          alert('Error deleting rule: ' + (error.message || 'Unknown error'));
        }
      } catch (error: any) {
        alert('Error deleting rule: ' + error.message);
      }
    }
  };
  
  // ... (The data handling logic is now correct)

  const getPriorityColor = (priority: number) => {
    if (priority >= 4) return 'text-red-600 bg-red-100';
    if (priority === 3) return 'text-orange-600 bg-orange-100';
    if (priority === 2) return 'text-blue-600 bg-blue-100';
    return 'text-gray-600 bg-gray-100';
  };

  const getConditionDisplay = (rule: PricingRule) => {
    const conditions = rule.conditions;
    if (Object.keys(conditions).length === 0) return 'All Hotels';

    const parts: string[] = [];

    // Handle hotel display specially
    if (conditions.hotel_name) {
      const hotelParts = [conditions.hotel_name];
      if (conditions.hotel_id) hotelParts.push(`ID: ${conditions.hotel_id}`);
      if (conditions.hotel_code) hotelParts.push(`Supplier Code: ${conditions.hotel_code}`);
      parts.push(hotelParts.join(' | '));
    }

    // Add other conditions
    if (conditions.country) parts.push(`Country: ${conditions.country}`);
    if (conditions.city) parts.push(`City: ${conditions.city}`);
    if (conditions.star_rating) parts.push(`${conditions.star_rating}+ Stars`);
    if (conditions.supplier) parts.push(`Supplier: ${conditions.supplier}`);

    return parts.join(', ') || 'All Hotels';
  };

  const getMarkupDisplay = (rule: PricingRule) => {
    const value = Number(rule.markup_value);
    if (rule.markup_type === 'percentage') {
      return `+${value.toFixed(2)}%`;
    } else if (rule.markup_type === 'fixed_amount') {
      return `+$${value.toFixed(2)}`;
    }
    return 'Unknown';
  };

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Pricing Rules & Markup Management</h2>
            <p className="text-gray-600 text-sm mt-1">
              Configure markup rules by hotel rating, location, supplier, and more
            </p>
          </div>
          <button
            onClick={() => { setShowAddRule(true); setHotelCode(''); }}
            className="flex items-center space-x-2 px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors"
          >
            <Plus className="h-4 w-4" />
            <span>Add Pricing Rule</span>
          </button>
        </div>
      </div>

      {/* Rules Table */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Rule Name & Conditions</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Markup</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Priority & Status</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {rules.map((rule) => (
                <tr key={rule.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="text-sm font-medium text-gray-900">{rule.name}</div>
                    <div className="text-xs text-gray-600 mt-1">{getConditionDisplay(rule)}</div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm font-medium text-gray-900">{getMarkupDisplay(rule)}</div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center space-x-2 mb-2">
                      <span className={`px-2 py-1 text-xs rounded-full ${getPriorityColor(rule.priority)}`}>
                        Priority {rule.priority}
                      </span>
                    </div>
                    <div className="flex items-center space-x-1">
                      {rule.is_active ? (
                        <><CheckCircle className="h-4 w-4 text-green-600" /><span className="text-xs text-green-600">Active</span></>
                      ) : (
                        <><XCircle className="h-4 w-4 text-gray-400" /><span className="text-xs text-gray-500">Inactive</span></>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end space-x-2">
                      <button onClick={() => {
                        setEditingRule(rule);
                        setHotelCode(rule.conditions?.hotel_code || '');
                        setSelectedHotel(rule.conditions?.hotel_name ? {
                          hotel_id: rule.conditions?.hotel_id,
                          name: rule.conditions?.hotel_name,
                          hotel_code: rule.conditions?.hotel_code
                        } : null);
                      }} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                        <Edit className="h-4 w-4 text-gray-600" />
                      </button>
                      <button onClick={() => handleDelete(rule.id)} className="p-2 hover:bg-red-100 rounded-lg transition-colors">
                        <Trash2 className="h-4 w-4 text-red-600" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add/Edit Rule Modal */}
      {(showAddRule || editingRule) && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-2xl mx-4">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-gray-900">{editingRule ? 'Edit Pricing Rule' : 'Add New Pricing Rule'}</h3>
              <button onClick={() => { setShowAddRule(false); setEditingRule(null); setHotelCode(''); setSelectedHotel(null); }} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <form className="space-y-6" onSubmit={handleSubmit}>
              {/* Rule Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Rule Name</label>
                <input type="text" name="ruleName" placeholder="e.g., 'Sydney Premium Hotels'" defaultValue={editingRule?.name || ''} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" required />
              </div>

              {/* Markup Type & Priority */}
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Markup Type</label>
                  <select name="markupType" defaultValue={editingRule?.markup_type || 'percentage'} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="percentage">Percentage</option>
                    <option value="fixed_amount">Fixed Amount</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Markup Value</label>
                  <input type="number" name="markupValue" step="any" placeholder="15" defaultValue={editingRule?.markup_value || ''} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Priority (1-10)
                    <span className="ml-2 text-xs text-gray-500">Higher = More important</span>
                  </label>
                  <input type="number" name="priority" min="1" max="10" placeholder="5" defaultValue={editingRule?.priority || 5} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" required />
                  <p className="mt-1 text-xs text-gray-500">Rules with higher priority are applied first</p>
                </div>
              </div>

              {/* Filters */}
              <div className="border border-gray-200 rounded-lg p-4">
                <h4 className="text-sm font-medium text-gray-900 mb-4">Conditions (Apply to hotels matching):</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-gray-700 mb-1">Country</label>
                    <input type="text" name="country" placeholder="e.g., Maldives" defaultValue={editingRule?.conditions?.country || ''} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-700 mb-1">City</label>
                    <input type="text" name="city" placeholder="e.g., Male" defaultValue={editingRule?.conditions?.city || ''} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-700 mb-1">Star Rating (Minimum)</label>
                    <select name="starRating" defaultValue={editingRule?.conditions?.star_rating || ''} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                      <option value="">All</option>
                      <option value="5">5 Stars</option>
                      <option value="4">4 Stars</option>
                      <option value="3">3 Stars</option>
                    </select>
                  </div>
                   <div>
                    <label className="block text-sm text-gray-700 mb-1">Hotel (Search by name, location, or supplier code)</label>
                    <HotelAutocomplete
                      value={selectedHotel?.name || ''}
                      onChange={(val) => {
                        if (!val) {
                          setHotelCode('');
                          setSelectedHotel(null);
                        }
                      }}
                      placeholder="Search hotels..."
                      onSelectHotel={(hotel) => {
                        setHotelCode(hotel.hotel_code || hotel.hummingbird_code || `h${hotel.hotel_id}`);
                        setSelectedHotel(hotel);
                      }}
                    />
                    <input type="hidden" name="hotelCode" value={hotelCode} />
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex justify-end space-x-3 pt-4">
                <button type="button" onClick={() => { setShowAddRule(false); setEditingRule(null); setHotelCode(''); setSelectedHotel(null); }} className="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors">Cancel</button>
                <button type="submit" disabled={saving} className="px-6 py-2 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                  {saving ? 'Saving...' : (editingRule ? 'Update Rule' : 'Create Rule')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
