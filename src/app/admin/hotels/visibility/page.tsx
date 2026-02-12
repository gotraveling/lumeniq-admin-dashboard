'use client';

import React, { useState, useEffect } from 'react';
import { Search, Eye, EyeOff, Plus, Trash2, Edit, RefreshCw, AlertTriangle, CheckCircle } from 'lucide-react';

const HOTEL_API_URL = process.env.NEXT_PUBLIC_HOTEL_API_URL || 'https://hotel-api-91901273027.us-central1.run.app';

interface VisibilityRule {
  id: number;
  rule_name: string;
  rule_type: 'star_rating' | 'price_range' | 'country' | 'city' | 'supplier';
  rule_condition: any;
  action: 'show' | 'hide';
  priority: number;
  is_active: boolean;
  notes?: string;
  created_at: string;
}

interface HotelVisibility {
  hotel_id: number;
  hotel_name: string;
  city: string;
  country: string;
  star_rating: number;
  explicit_visibility: boolean | null;
  effective_visibility: boolean;
  visibility_reason?: string;
  visibility_updated_at?: string;
  visibility_updated_by?: string;
}

export default function HotelVisibilityPage() {
  const [activeTab, setActiveTab] = useState<'hotels' | 'rules'>('rules');
  const [rules, setRules] = useState<VisibilityRule[]>([]);
  const [hotels, setHotels] = useState<HotelVisibility[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'hidden' | 'visible' | 'explicit_only'>('all');

  // Rule form state
  const [showRuleForm, setShowRuleForm] = useState(false);
  const [editingRule, setEditingRule] = useState<VisibilityRule | null>(null);
  const [ruleForm, setRuleForm] = useState({
    rule_name: '',
    rule_type: 'star_rating' as const,
    action: 'hide' as const,
    priority: 0,
    notes: '',
    // Star rating condition
    star_operator: '<=',
    star_value: 2,
    // Price range condition
    price_operator: '<=',
    price_value: 100,
    price_currency: 'USD',
    // List conditions (country, city, supplier)
    list_values: ''
  });

  // Preview state
  const [preview, setPreview] = useState<{ affected_count: number; sample_hotels: any[]; rule_summary: string } | null>(null);

  useEffect(() => {
    loadRules();
  }, []);

  useEffect(() => {
    if (activeTab === 'hotels') {
      loadHotels();
    }
  }, [activeTab, filterType]);

  const loadRules = async () => {
    try {
      const response = await fetch(`${HOTEL_API_URL}/api/visibility/rules`);
      const data = await response.json();
      if (data.success) {
        setRules(data.data);
      }
    } catch (error) {
      console.error('Error loading rules:', error);
      alert('Failed to load visibility rules');
    }
  };

  const loadHotels = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterType !== 'all') {
        params.set('filter', filterType);
      }
      params.set('limit', '100');

      const response = await fetch(`${HOTEL_API_URL}/api/visibility/hotels?${params}`);
      const data = await response.json();
      if (data.success) {
        setHotels(data.data.hotels);
      }
    } catch (error) {
      console.error('Error loading hotels:', error);
      alert('Failed to load hotel visibility');
    }
    setLoading(false);
  };

  const handleToggleRule = async (ruleId: number, currentActive: boolean) => {
    try {
      const response = await fetch(`${HOTEL_API_URL}/api/visibility/rules/${ruleId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !currentActive })
      });

      if (response.ok) {
        loadRules();
        alert('Rule updated successfully');
      }
    } catch (error) {
      console.error('Error toggling rule:', error);
      alert('Failed to toggle rule');
    }
  };

  const handleDeleteRule = async (ruleId: number) => {
    if (!confirm('Are you sure you want to delete this rule?')) return;

    try {
      const response = await fetch(`${HOTEL_API_URL}/api/visibility/rules/${ruleId}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        loadRules();
        alert('Rule deleted successfully');
      }
    } catch (error) {
      console.error('Error deleting rule:', error);
      alert('Failed to delete rule');
    }
  };

  const handlePreviewRule = async () => {
    try {
      const condition = buildRuleCondition();
      const response = await fetch(`${HOTEL_API_URL}/api/visibility/rules/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rule_type: ruleForm.rule_type,
          rule_condition: condition,
          action: ruleForm.action
        })
      });

      const data = await response.json();
      if (data.success) {
        setPreview(data.data);
      }
    } catch (error) {
      console.error('Error previewing rule:', error);
      alert('Failed to preview rule');
    }
  };

  const buildRuleCondition = () => {
    switch (ruleForm.rule_type) {
      case 'star_rating':
        return { operator: ruleForm.star_operator, value: ruleForm.star_value };
      case 'price_range':
        return {
          operator: ruleForm.price_operator,
          value: ruleForm.price_value,
          currency: ruleForm.price_currency
        };
      case 'country':
      case 'city':
      case 'supplier':
        return { values: ruleForm.list_values.split(',').map(v => v.trim()).filter(v => v) };
      default:
        return {};
    }
  };

  const handleSaveRule = async () => {
    try {
      const condition = buildRuleCondition();

      const payload = {
        rule_name: ruleForm.rule_name,
        rule_type: ruleForm.rule_type,
        rule_condition: condition,
        action: ruleForm.action,
        priority: ruleForm.priority,
        notes: ruleForm.notes,
        created_by: 'admin@firstclass.com.au'
      };

      const url = editingRule
        ? `${HOTEL_API_URL}/api/visibility/rules/${editingRule.id}`
        : `${HOTEL_API_URL}/api/visibility/rules`;

      const response = await fetch(url, {
        method: editingRule ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        loadRules();
        setShowRuleForm(false);
        setEditingRule(null);
        resetRuleForm();
        alert('Rule saved successfully');
      }
    } catch (error) {
      console.error('Error saving rule:', error);
      alert('Failed to save rule');
    }
  };

  const handleToggleHotel = async (hotelId: number, currentVisibility: boolean | null) => {
    const newVisibility = currentVisibility === false ? null : false; // Toggle: visible -> hide, hidden/null -> hide, hidden -> null
    const reason = newVisibility === false ? 'Manually hidden via admin' : 'Reset to use global rules';

    try {
      const response = await fetch(`${HOTEL_API_URL}/api/visibility/hotels/${hotelId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          is_visible: newVisibility,
          reason,
          updated_by: 'admin@firstclass.com.au'
        })
      });

      if (response.ok) {
        loadHotels();
      }
    } catch (error) {
      console.error('Error toggling hotel:', error);
      alert('Failed to toggle hotel visibility');
    }
  };

  const resetRuleForm = () => {
    setRuleForm({
      rule_name: '',
      rule_type: 'star_rating',
      action: 'hide',
      priority: 0,
      notes: '',
      star_operator: '<=',
      star_value: 2,
      price_operator: '<=',
      price_value: 100,
      price_currency: 'USD',
      list_values: ''
    });
    setPreview(null);
  };

  const filteredHotels = hotels.filter(hotel =>
    hotel.hotel_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    hotel.city.toLowerCase().includes(searchQuery.toLowerCase()) ||
    hotel.country.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-2">Hotel Visibility Management</h1>
        <p className="text-gray-600">
          Control which hotels are displayed to customers using individual toggles or global rules
        </p>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <div className="flex gap-4">
          <button
            onClick={() => setActiveTab('rules')}
            className={`px-4 py-2 border-b-2 transition-colors ${
              activeTab === 'rules'
                ? 'border-gray-900 text-gray-900 font-medium'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            Visibility Rules
          </button>
          <button
            onClick={() => setActiveTab('hotels')}
            className={`px-4 py-2 border-b-2 transition-colors ${
              activeTab === 'hotels'
                ? 'border-gray-900 text-gray-900 font-medium'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            Individual Hotels
          </button>
        </div>
      </div>

      {/* Rules Tab */}
      {activeTab === 'rules' && (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <div className="bg-blue-50 border border-blue-200 rounded p-4 flex-1 mr-4">
              <p className="text-sm text-blue-900">
                <strong>How Rules Work:</strong> Rules are evaluated by priority (highest first).
                Hotels can override rules with explicit visibility settings.
              </p>
            </div>
            <button
              onClick={() => {
                resetRuleForm();
                setShowRuleForm(true);
              }}
              className="px-4 py-2 bg-gray-900 text-white rounded hover:bg-gray-800 flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Add Rule
            </button>
          </div>

          {/* Rules List */}
          <div className="bg-white rounded border border-gray-200">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold">Active Rules ({rules.filter(r => r.is_active).length})</h2>
            </div>
            <div className="divide-y divide-gray-200">
              {rules.length === 0 ? (
                <div className="px-6 py-8 text-center text-gray-500">
                  No rules configured. Click "Add Rule" to create your first rule.
                </div>
              ) : (
                rules.map(rule => (
                  <div key={rule.id} className="px-6 py-4 hover:bg-gray-50">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="font-semibold">{rule.rule_name}</h3>
                          <span className={`px-2 py-1 text-xs rounded ${
                            rule.action === 'hide'
                              ? 'bg-red-100 text-red-800'
                              : 'bg-green-100 text-green-800'
                          }`}>
                            {rule.action.toUpperCase()}
                          </span>
                          <span className="px-2 py-1 text-xs bg-gray-100 text-gray-800 rounded">
                            Priority: {rule.priority}
                          </span>
                          {!rule.is_active && (
                            <span className="px-2 py-1 text-xs bg-yellow-100 text-yellow-800 rounded">
                              INACTIVE
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-600">
                          Type: <strong>{rule.rule_type}</strong> |
                          Condition: <strong>{JSON.stringify(rule.rule_condition)}</strong>
                        </p>
                        {rule.notes && (
                          <p className="text-sm text-gray-500 mt-1">{rule.notes}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleToggleRule(rule.id, rule.is_active)}
                          className={`p-2 rounded border ${
                            rule.is_active
                              ? 'border-green-300 text-green-700 hover:bg-green-50'
                              : 'border-gray-300 text-gray-500 hover:bg-gray-50'
                          }`}
                          title={rule.is_active ? 'Deactivate rule' : 'Activate rule'}
                        >
                          {rule.is_active ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                        </button>
                        <button
                          onClick={() => handleDeleteRule(rule.id)}
                          className="p-2 rounded border border-red-300 text-red-700 hover:bg-red-50"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Rule Form Modal */}
          {showRuleForm && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <div className="bg-white rounded-lg p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
                <h2 className="text-xl font-bold mb-4">
                  {editingRule ? 'Edit Rule' : 'Create New Rule'}
                </h2>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Rule Name *</label>
                    <input
                      type="text"
                      value={ruleForm.rule_name}
                      onChange={(e) => setRuleForm({ ...ruleForm, rule_name: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded"
                      placeholder="e.g., Hide low-quality hotels"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-1">Rule Type *</label>
                      <select
                        value={ruleForm.rule_type}
                        onChange={(e) => setRuleForm({ ...ruleForm, rule_type: e.target.value as any })}
                        className="w-full px-3 py-2 border border-gray-300 rounded"
                      >
                        <option value="star_rating">Star Rating</option>
                        <option value="price_range">Price Range</option>
                        <option value="country">Country</option>
                        <option value="city">City</option>
                        <option value="supplier">Supplier</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium mb-1">Action *</label>
                      <select
                        value={ruleForm.action}
                        onChange={(e) => setRuleForm({ ...ruleForm, action: e.target.value as any })}
                        className="w-full px-3 py-2 border border-gray-300 rounded"
                      >
                        <option value="hide">Hide Hotels</option>
                        <option value="show">Show Hotels</option>
                      </select>
                    </div>
                  </div>

                  {/* Conditional Rule Inputs */}
                  {ruleForm.rule_type === 'star_rating' && (
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium mb-1">Operator</label>
                        <select
                          value={ruleForm.star_operator}
                          onChange={(e) => setRuleForm({ ...ruleForm, star_operator: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded"
                        >
                          <option value="<=">Less than or equal to (≤)</option>
                          <option value=">=">Greater than or equal to (≥)</option>
                          <option value="=">Equal to (=)</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">Star Rating</label>
                        <input
                          type="number"
                          min="1"
                          max="5"
                          value={ruleForm.star_value}
                          onChange={(e) => setRuleForm({ ...ruleForm, star_value: parseInt(e.target.value) })}
                          className="w-full px-3 py-2 border border-gray-300 rounded"
                        />
                      </div>
                    </div>
                  )}

                  {ruleForm.rule_type === 'price_range' && (
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <label className="block text-sm font-medium mb-1">Operator</label>
                        <select
                          value={ruleForm.price_operator}
                          onChange={(e) => setRuleForm({ ...ruleForm, price_operator: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded"
                        >
                          <option value="<=">Less than or equal to (≤)</option>
                          <option value=">=">Greater than or equal to (≥)</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">Price</label>
                        <input
                          type="number"
                          value={ruleForm.price_value}
                          onChange={(e) => setRuleForm({ ...ruleForm, price_value: parseFloat(e.target.value) })}
                          className="w-full px-3 py-2 border border-gray-300 rounded"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">Currency</label>
                        <select
                          value={ruleForm.price_currency}
                          onChange={(e) => setRuleForm({ ...ruleForm, price_currency: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded"
                        >
                          <option value="USD">USD</option>
                          <option value="AUD">AUD</option>
                          <option value="EUR">EUR</option>
                        </select>
                      </div>
                    </div>
                  )}

                  {['country', 'city', 'supplier'].includes(ruleForm.rule_type) && (
                    <div>
                      <label className="block text-sm font-medium mb-1">
                        {ruleForm.rule_type.charAt(0).toUpperCase() + ruleForm.rule_type.slice(1)} Names (comma-separated)
                      </label>
                      <input
                        type="text"
                        value={ruleForm.list_values}
                        onChange={(e) => setRuleForm({ ...ruleForm, list_values: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded"
                        placeholder="e.g., Afghanistan, Iraq, Syria"
                      />
                    </div>
                  )}

                  <div>
                    <label className="block text-sm font-medium mb-1">Priority (higher = evaluated first)</label>
                    <input
                      type="number"
                      value={ruleForm.priority}
                      onChange={(e) => setRuleForm({ ...ruleForm, priority: parseInt(e.target.value) })}
                      className="w-full px-3 py-2 border border-gray-300 rounded"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1">Notes</label>
                    <textarea
                      value={ruleForm.notes}
                      onChange={(e) => setRuleForm({ ...ruleForm, notes: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded"
                      rows={3}
                      placeholder="Optional notes about this rule"
                    />
                  </div>

                  {/* Preview Section */}
                  <div className="border-t pt-4">
                    <button
                      onClick={handlePreviewRule}
                      className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 flex items-center gap-2"
                    >
                      <RefreshCw className="w-4 h-4" />
                      Preview Impact
                    </button>

                    {preview && (
                      <div className="mt-4 p-4 bg-gray-50 rounded">
                        <div className="flex items-center gap-2 mb-2">
                          <AlertTriangle className="w-5 h-5 text-orange-600" />
                          <strong>{preview.rule_summary}</strong>
                        </div>
                        {preview.sample_hotels.length > 0 && (
                          <div className="text-sm text-gray-700">
                            <strong>Sample hotels affected:</strong>
                            <ul className="mt-1 ml-4 list-disc">
                              {preview.sample_hotels.map(hotel => (
                                <li key={hotel.hotel_id}>{hotel.name}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex justify-end gap-3 mt-6">
                  <button
                    onClick={() => {
                      setShowRuleForm(false);
                      setEditingRule(null);
                      resetRuleForm();
                    }}
                    className="px-4 py-2 border border-gray-300 rounded hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveRule}
                    disabled={!ruleForm.rule_name}
                    className="px-4 py-2 bg-gray-900 text-white rounded hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {editingRule ? 'Update Rule' : 'Create Rule'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Hotels Tab */}
      {activeTab === 'hotels' && (
        <div className="space-y-6">
          <div className="flex gap-4 items-center">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search hotels by name, city, or country..."
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded"
              />
            </div>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value as any)}
              className="px-4 py-2 border border-gray-300 rounded"
            >
              <option value="all">All Hotels</option>
              <option value="visible">Visible Only</option>
              <option value="hidden">Hidden Only</option>
              <option value="explicit_only">Manual Overrides Only</option>
            </select>
            <button
              onClick={loadHotels}
              className="px-4 py-2 bg-gray-900 text-white rounded hover:bg-gray-800 flex items-center gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              Refresh
            </button>
          </div>

          {/* Hotels List */}
          <div className="bg-white rounded border border-gray-200">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold">Hotels ({filteredHotels.length})</h2>
            </div>
            <div className="divide-y divide-gray-200 max-h-[600px] overflow-y-auto">
              {loading ? (
                <div className="px-6 py-8 text-center text-gray-500">
                  Loading hotels...
                </div>
              ) : filteredHotels.length === 0 ? (
                <div className="px-6 py-8 text-center text-gray-500">
                  No hotels found
                </div>
              ) : (
                filteredHotels.map(hotel => (
                  <div key={hotel.hotel_id} className="px-6 py-4 hover:bg-gray-50">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-1">
                          <h3 className="font-semibold">{hotel.hotel_name}</h3>
                          {hotel.star_rating > 0 && (
                            <span className="text-sm text-gray-500">
                              {'★'.repeat(hotel.star_rating)}
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-600">
                          {hotel.city}, {hotel.country}
                        </p>
                        {hotel.explicit_visibility !== null && (
                          <p className="text-xs text-orange-600 mt-1">
                            Manual override: {hotel.explicit_visibility ? 'Force show' : 'Force hide'}
                            {hotel.visibility_reason && ` - ${hotel.visibility_reason}`}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right mr-4">
                          <div className={`flex items-center gap-2 text-sm font-medium ${
                            hotel.effective_visibility ? 'text-green-700' : 'text-red-700'
                          }`}>
                            {hotel.effective_visibility ? (
                              <><CheckCircle className="w-4 h-4" /> Visible</>
                            ) : (
                              <><EyeOff className="w-4 h-4" /> Hidden</>
                            )}
                          </div>
                          {hotel.explicit_visibility === null && (
                            <div className="text-xs text-gray-500">Via rules</div>
                          )}
                        </div>
                        <button
                          onClick={() => handleToggleHotel(hotel.hotel_id, hotel.explicit_visibility)}
                          className={`px-4 py-2 rounded border ${
                            hotel.explicit_visibility === false
                              ? 'border-red-300 text-red-700 hover:bg-red-50'
                              : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                          }`}
                        >
                          {hotel.explicit_visibility === false ? 'Unhide' : 'Hide'}
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
