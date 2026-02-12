// /Users/muralik/projects/fc/hotels/admin-dashboard/src/app/admin/inventory/pricing-rules/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { HotelAutocomplete } from './HotelAutocomplete';

// Define the type for a pricing rule
interface PricingRule {
  id: number;
  rule_type: 'global' | 'destination' | 'hotel';
  target_value: string | null;
  markup_type: 'percentage' | 'fixed_amount';
  markup_value: number;
  description: string;
  is_active: boolean;
}

// The API endpoint for our hotel-api service
const API_URL = process.env.NEXT_PUBLIC_HOTEL_API_URL || 'http://localhost:8080';

export default function PricingRulesPage() {
  const [rules, setRules] = useState<PricingRule[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ruleType, setRuleType] = useState<'global' | 'destination' | 'hotel'>('global');
  const [targetValue, setTargetValue] = useState('');
  const [hotelSearch, setHotelSearch] = useState('');
  const [selectedHotelId, setSelectedHotelId] = useState<string | null>(null);


  // Fetch data on component mount
  useEffect(() => {
    const fetchRules = async () => {
      try {
        setIsLoading(true);
        const response = await fetch(`${API_URL}/api/pricing/rules`);
        if (!response.ok) {
          throw new Error('Failed to fetch data');
        }
        const data = await response.json();
        setRules(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An unknown error occurred');
      } finally {
        setIsLoading(false);
      }
    };
    fetchRules();
  }, []);

  const handleAddNew = () => {
    setRuleType('global');
    setTargetValue('');
    setHotelSearch('');
    setSelectedHotelId(null);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
  };

  const handleSave = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    let targetValueToSend: string | null = null;

    if (ruleType === 'destination') {
      targetValueToSend = formData.get('target_value') as string;
    } else if (ruleType === 'hotel') {
      if (!selectedHotelId) {
        alert('Please select a hotel.');
        return;
      }
      targetValueToSend = selectedHotelId;
    }

    const newRule = {
      rule_type: ruleType,
      target_value: targetValueToSend,
      markup_type: formData.get('markup_type') as 'percentage' | 'fixed_amount',
      markup_value: Number(formData.get('markup_value')),
      description: formData.get('description') as string,
    };

    try {
      const response = await fetch(`${API_URL}/api/pricing/rules`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newRule),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Failed to save rule' }));
        throw new Error(errorData.message || 'Failed to save rule');
      }
      const savedRule = await response.json();
      setRules([savedRule, ...rules]);
      handleCloseModal();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'An unknown error occurred';
      alert(`Error saving rule: ${message}`);
    }
  };

  const handleDelete = async (ruleId: number) => {
    console.log(`Attempting to delete rule with ID: ${ruleId}`);
    if (window.confirm('Are you sure you want to delete this rule?')) {
      try {
        const response = await fetch(`${API_URL}/api/pricing/rules/${ruleId}`, {
          method: 'DELETE',
        });

        console.log('Delete API response:', response);

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ message: 'Failed to delete rule' }));
          console.error('Failed to delete, error data:', errorData);
          throw new Error(errorData.message || 'Failed to delete rule');
        }

        console.log('Rule deleted successfully from API, updating UI.');
        setRules(rules.filter(rule => rule.id !== ruleId));
      } catch (err) {
        const message = err instanceof Error ? err.message : 'An unknown error occurred';
        console.error('Error in handleDelete catch block:', message);
        alert(`Error deleting rule: ${message}`);
      }
    } else {
      console.log('User cancelled delete operation.');
    }
  };

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-semibold text-gray-800">Pricing Rules</h1>
        <button
          onClick={handleAddNew}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50"
        >
          + Add New Rule
        </button>
      </div>

      {isLoading && <p>Loading...</p>}
      {error && <p className="text-red-500">Error: {error}</p>}

      {!isLoading && !error && (
        <div className="bg-white shadow-md rounded-lg overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Target</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Markup</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Description</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {rules.map((rule) => (
                <tr key={rule.id}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{rule.rule_type}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{rule.target_value || 'N/A'}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                    {rule.markup_type === 'percentage' ? `${rule.markup_value}%` : `$${Number(rule.markup_value).toFixed(2)}`}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{rule.description}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${rule.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                      {rule.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <button onClick={() => alert(`Delete clicked for rule ID: ${rule.id}`)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
            <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">Add New Pricing Rule</h3>
            <form onSubmit={handleSave}>
              <div className="mb-4">
                <label htmlFor="rule_type" className="block text-sm font-medium text-gray-700">Rule Type</label>
                <select
                  name="rule_type"
                  id="rule_type"
                  value={ruleType}
                  onChange={(e) => setRuleType(e.target.value as 'global' | 'destination' | 'hotel')}
                  className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                >
                  <option value="global">Global</option>
                  <option value="destination">Destination</option>
                  <option value="hotel">Hotel</option>
                </select>
              </div>

              {ruleType === 'destination' && (
                <div className="mb-4">
                  <label htmlFor="target_value" className="block text-sm font-medium text-gray-700">Destination</label>
                  <input
                    type="text"
                    name="target_value"
                    id="target_value"
                    value={targetValue}
                    onChange={(e) => setTargetValue(e.target.value)}
                    className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                    placeholder="e.g., city:london"
                  />
                </div>
              )}

              {ruleType === 'hotel' && (
                <div className="mb-4">
                  <label htmlFor="hotel_search" className="block text-sm font-medium text-gray-700">Hotel</label>
                  <HotelAutocomplete
                    value={hotelSearch}
                    onValueChange={setHotelSearch}
                    onHotelSelect={setSelectedHotelId}
                  />
                  <input type="hidden" name="target_value" value={selectedHotelId || ''} />
                </div>
              )}

              <div className="mb-4">
                <label htmlFor="markup_type" className="block text-sm font-medium text-gray-700">Markup Type</label>
                <select
                  name="markup_type"
                  id="markup_type"
                  className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                >
                  <option value="percentage">Percentage</option>
                  <option value="fixed_amount">Fixed Amount</option>
                </select>
              </div>

              <div className="mb-4">
                <label htmlFor="markup_value" className="block text-sm font-medium text-gray-700">Markup Value</label>
                <input
                  type="number"
                  name="markup_value"
                  id="markup_value"
                  step="0.01"
                  className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                  required
                />
              </div>

              <div className="mb-4">
                <label htmlFor="description" className="block text-sm font-medium text-gray-700">Description</label>
                <textarea
                  name="description"
                  id="description"
                  rows={3}
                  className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                ></textarea>
              </div>

              <div className="flex items-center justify-end gap-4 pt-4">
                <button type="button" onClick={handleCloseModal} className="px-4 py-2 bg-gray-200 text-gray-800 text-base font-medium rounded-md hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-400">
                  Cancel
                </button>
                <button type="submit" className="px-4 py-2 bg-blue-600 text-white text-base font-medium rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500">
                  Save Rule
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
