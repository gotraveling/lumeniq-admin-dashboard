'use client';

import React, { useState, useEffect } from 'react';
import { Plus, Edit, Trash2, DollarSign, CheckCircle, XCircle } from 'lucide-react';
import { HotelAutocomplete } from '@/components/ui/HotelAutocomplete';

// Define the type for a price override
interface PriceOverride {
  id: number;
  supplier_hotel_id: string;
  hotel_name?: string;
  hotel_id?: number;
  price: number;
  currency: string;
  description: string;
  is_active: boolean;
}

export default function DisplayOverridesPage() {
  const [overrides, setOverrides] = useState<PriceOverride[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingOverride, setEditingOverride] = useState<PriceOverride | null>(null);
  const [saving, setSaving] = useState(false);
  const [hotelCode, setHotelCode] = useState('');
  const [selectedHotel, setSelectedHotel] = useState<any>(null);

  useEffect(() => {
    loadOverrides();
  }, []);

  const loadOverrides = async () => {
    setLoading(true);
    try {
      const apiUrl = process.env.NEXT_PUBLIC_HOTEL_API_URL || 'http://localhost:8080';
      const response = await fetch(`${apiUrl}/api/pricing/overrides`);
      if (!response.ok) throw new Error('Failed to fetch overrides');
      const data = await response.json();
      setOverrides(data);
    } catch (error) {
      console.error('Error loading overrides:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hotelCode && !editingOverride) {
      alert('Please select a hotel.');
      return;
    }

    setSaving(true);
    try {
      const formData = new FormData(e.target as HTMLFormElement);
      const overrideData = {
        supplier_hotel_id: hotelCode || editingOverride?.supplier_hotel_id,
        supplier_id: 'hummingbird',
        price: parseFloat(formData.get('price') as string),
        currency: formData.get('currency') as string,
        description: formData.get('description') as string,
        is_active: formData.get('is_active') === 'true',
        hotel_name: selectedHotel?.name || editingOverride?.hotel_name,
        hotel_id: selectedHotel?.hotel_id || editingOverride?.hotel_id,
      };

      const apiUrl = process.env.NEXT_PUBLIC_HOTEL_API_URL || 'http://localhost:8080';
      const url = editingOverride
        ? `${apiUrl}/api/pricing/overrides/${editingOverride.id}`
        : `${apiUrl}/api/pricing/overrides`;
      const method = editingOverride ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(overrideData),
      });

      if (response.ok) {
        setShowAddModal(false);
        setEditingOverride(null);
        setHotelCode('');
        setSelectedHotel(null);
        loadOverrides();
      } else {
        const error = await response.json();
        alert('Error saving override: ' + (error.message || 'Unknown error'));
      }
    } catch (error: any) {
      alert('Error saving override: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (overrideId: number) => {
    if (window.confirm('Are you sure you want to delete this price override?')) {
      try {
        const apiUrl = process.env.NEXT_PUBLIC_HOTEL_API_URL || 'http://localhost:8080';
        const response = await fetch(`${apiUrl}/api/pricing/overrides/${overrideId}`, {
          method: 'DELETE',
        });

        if (response.ok) {
          loadOverrides();
        } else {
          const error = await response.json();
          alert('Error deleting override: ' + (error.message || 'Unknown error'));
        }
      } catch (error: any) {
        alert('Error deleting override: ' + error.message);
      }
    }
  };

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Display Price Overrides</h2>
            <p className="text-gray-600 text-sm mt-1">
              Set custom display prices for specific hotels
            </p>
          </div>
          <button
            onClick={() => { setShowAddModal(true); setHotelCode(''); }}
            className="flex items-center space-x-2 px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors"
          >
            <Plus className="h-4 w-4" />
            <span>Add Price Override</span>
          </button>
        </div>
      </div>

      {/* Overrides Table */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Hotel</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Description</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Price</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-sm text-gray-500">
                    Loading overrides...
                  </td>
                </tr>
              ) : overrides.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-sm text-gray-500">
                    No price overrides found. Click "Add Price Override" to create one.
                  </td>
                </tr>
              ) : (
                overrides.map((override) => (
                  <tr key={override.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="text-sm font-medium text-gray-900">
                        {override.hotel_name || 'Unknown Hotel'}
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        {override.hotel_id && `ID: ${override.hotel_id} | `}
                        Supplier: {override.supplier_hotel_id}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-600">{override.description || '-'}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm font-medium text-gray-900">
                        {override.currency} {Number(override.price).toFixed(2)}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center space-x-1">
                        {override.is_active ? (
                          <>
                            <CheckCircle className="h-4 w-4 text-green-600" />
                            <span className="text-xs text-green-600">Active</span>
                          </>
                        ) : (
                          <>
                            <XCircle className="h-4 w-4 text-gray-400" />
                            <span className="text-xs text-gray-500">Inactive</span>
                          </>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end space-x-2">
                        <button
                          onClick={() => {
                            setEditingOverride(override);
                            setHotelCode(override.supplier_hotel_id);
                            setShowAddModal(true);
                          }}
                          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                        >
                          <Edit className="h-4 w-4 text-gray-600" />
                        </button>
                        <button
                          onClick={() => handleDelete(override.id)}
                          className="p-2 hover:bg-red-100 rounded-lg transition-colors"
                        >
                          <Trash2 className="h-4 w-4 text-red-600" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add/Edit Override Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-2xl mx-4">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-gray-900">
                {editingOverride ? 'Edit Price Override' : 'Add Price Override'}
              </h3>
              <button
                onClick={() => { setShowAddModal(false); setEditingOverride(null); setHotelCode(''); setSelectedHotel(null); }}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>
            <form className="space-y-6" onSubmit={handleSubmit}>
              {/* Hotel Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Hotel (Search by name, location, or supplier code)
                </label>
                {editingOverride ? (
                  <div className="px-3 py-2 bg-gray-100 rounded-lg text-sm text-gray-700">
                    {editingOverride.supplier_hotel_id}
                  </div>
                ) : (
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
                      setHotelCode(hotel.hummingbird_code || hotel.hotel_code || `h${hotel.hotel_id}`);
                      setSelectedHotel(hotel);
                    }}
                  />
                )}
                <input type="hidden" name="hotelCode" value={hotelCode} />
              </div>

              {/* Price and Currency */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Price</label>
                  <div className="relative">
                    <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <input
                      type="number"
                      name="price"
                      step="0.01"
                      placeholder="999.00"
                      defaultValue={editingOverride?.price || ''}
                      className="w-full pl-10 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      required
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Currency</label>
                  <select
                    name="currency"
                    defaultValue={editingOverride?.currency || 'USD'}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="USD">USD</option>
                    <option value="AUD">AUD</option>
                    <option value="EUR">EUR</option>
                    <option value="GBP">GBP</option>
                  </select>
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Description (Optional)
                </label>
                <textarea
                  name="description"
                  rows={3}
                  placeholder="e.g., Special promotional rate"
                  defaultValue={editingOverride?.description || ''}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                ></textarea>
              </div>

              {/* Active Status */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
                <select
                  name="is_active"
                  defaultValue={editingOverride?.is_active !== false ? 'true' : 'false'}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="true">Active</option>
                  <option value="false">Inactive</option>
                </select>
              </div>

              {/* Actions */}
              <div className="flex justify-end space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => { setShowAddModal(false); setEditingOverride(null); setHotelCode(''); setSelectedHotel(null); }}
                  className="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-6 py-2 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving ? 'Saving...' : (editingOverride ? 'Update Override' : 'Create Override')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
