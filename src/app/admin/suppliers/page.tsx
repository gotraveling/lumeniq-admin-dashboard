'use client';

import React, { useState, useEffect } from 'react';
import { 
  Server, 
  Plus, 
  Search, 
  Filter, 
  Settings, 
  CheckCircle, 
  XCircle, 
  AlertTriangle,
  BarChart3,
  Globe,
  Link,
  Edit,
  Trash2,
  Activity
} from 'lucide-react';

interface Supplier {
  id: string;
  name: string;
  type: 'real' | 'demo';
  status: 'active' | 'inactive' | 'testing';
  endpoint: string;
  api_version: string;
  total_hotels: number;
  mapped_hotels: number;
  total_bookings: number;
  avg_response_time: number;
  commission_rate: number;
  last_sync: string;
  connection_status: 'connected' | 'disconnected' | 'error';
  supported_features: string[];
}

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  useEffect(() => {
    // Load suppliers data - for now using mock data
    // In production, this would call your booking-engine-api
    loadSuppliersData();
  }, []);

  const loadSuppliersData = async () => {
    try {
      setLoading(true);
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://booking-engine-api-91901273027.us-central1.run.app';

      // Get real supplier data and stats using local API routes (server-side with API key)
      const [healthResponse, bookingsResponse, suppliersResponse] = await Promise.all([
        fetch(`${apiUrl}/health`).catch(() => null),
        fetch('/api/bookings?limit=100').catch(() => null),
        fetch('/api/suppliers').catch(() => null)
      ]);

      let totalBookings = 0;
      let systemStatus = 'disconnected';

      // Get system health
      if (healthResponse?.ok) {
        const healthData = await healthResponse.json();
        systemStatus = healthData.status === 'healthy' ? 'connected' : 'error';
      }

      // Get booking stats
      if (bookingsResponse?.ok) {
        const bookingsData = await bookingsResponse.json();
        if (bookingsData.success && bookingsData.data?.pagination) {
          totalBookings = bookingsData.data.pagination.total || 0;
        }
      }

      // Get hotel count from Hotel Content API
      const hotelApiUrl = process.env.NEXT_PUBLIC_HOTEL_API_URL || 'http://localhost:8080';
      let totalHotelsInSystem = 0;
      try {
        const hotelsResponse = await fetch(`${hotelApiUrl}/api/hotels?limit=1`);
        if (hotelsResponse.ok) {
          const hotelsData = await hotelsResponse.json();
          totalHotelsInSystem = hotelsData.pagination?.total || 0;
        }
      } catch (err) {
        console.error('Error fetching hotel count:', err);
      }

      // Transform API suppliers data to UI format
      const realSuppliers: Supplier[] = [];

      if (suppliersResponse?.ok) {
        const suppliersData = await suppliersResponse.json();
        if (suppliersData.success && suppliersData.data?.suppliers) {
          for (const supplier of suppliersData.data.suppliers) {
            // Map API supplier status to UI status
            const uiStatus = supplier.enabled ?
              (supplier.status === 'active' ? 'active' : 'testing') :
              'inactive';

            // Get detailed status for each supplier
            let detailedStatus = null;
            try {
              const statusResponse = await fetch(`${apiUrl}/api/suppliers/${supplier.id}/status`);
              if (statusResponse.ok) {
                const statusData = await statusResponse.json();
                detailedStatus = statusData.data;
              }
            } catch (err) {
              console.error(`Error fetching status for ${supplier.id}:`, err);
            }

            // Get bookings count per supplier
            let supplierBookings = 0;
            try {
              const supplierBookingsResponse = await fetch(`${apiUrl}/api/bookings?supplier=${supplier.id}&limit=1`);
              if (supplierBookingsResponse.ok) {
                const supplierBookingsData = await supplierBookingsResponse.json();
                supplierBookings = supplierBookingsData.data?.pagination?.total || 0;
              }
            } catch (err) {
              console.error(`Error fetching bookings for ${supplier.id}:`, err);
            }

            realSuppliers.push({
              id: supplier.id,
              name: supplier.name,
              type: supplier.id === 'demo' ? 'demo' : 'real',
              status: uiStatus,
              endpoint: detailedStatus?.configuration?.apiUrl || supplier.description || 'N/A',
              api_version: '1.0',
              total_hotels: totalHotelsInSystem,
              mapped_hotels: supplier.enabled ? totalHotelsInSystem : 0,
              total_bookings: supplierBookings,
              avg_response_time: detailedStatus?.responseTime ? parseInt(detailedStatus.responseTime) || 0 : 0,
              commission_rate: 0, // To be configured per supplier
              last_sync: supplier.enabled ? new Date().toISOString() : '',
              connection_status: detailedStatus?.status === 'healthy' ? 'connected' :
                                (supplier.enabled ? 'error' : 'disconnected'),
              supported_features: supplier.features || []
            });
          }
        }
      }

      setSuppliers(realSuppliers);
    } catch (error) {
      console.error('Error loading suppliers:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredSuppliers = suppliers.filter(supplier => {
    const matchesSearch = supplier.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || supplier.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return (
          <div className="flex items-center space-x-1 px-2 py-1 bg-white border border-green-600 text-black text-xs rounded-full">
            <CheckCircle className="h-3 w-3 text-green-600" />
            <span>Active</span>
          </div>
        );
      case 'inactive':
        return (
          <div className="flex items-center space-x-1 px-2 py-1 bg-white border border-gray-600 text-black text-xs rounded-full">
            <XCircle className="h-3 w-3 text-gray-600" />
            <span>Inactive</span>
          </div>
        );
      case 'testing':
        return (
          <div className="flex items-center space-x-1 px-2 py-1 bg-white border border-yellow-600 text-black text-xs rounded-full">
            <AlertTriangle className="h-3 w-3 text-yellow-600" />
            <span>Testing</span>
          </div>
        );
      default:
        return <span className="text-gray-400">{status}</span>;
    }
  };

  const getConnectionBadge = (connectionStatus: string) => {
    switch (connectionStatus) {
      case 'connected':
        return (
          <div className="flex items-center space-x-1 text-green-600">
            <Activity className="h-3 w-3" />
            <span className="text-xs">Connected</span>
          </div>
        );
      case 'disconnected':
        return (
          <div className="flex items-center space-x-1 text-gray-600">
            <Activity className="h-3 w-3" />
            <span className="text-xs">Disconnected</span>
          </div>
        );
      case 'error':
        return (
          <div className="flex items-center space-x-1 text-red-600">
            <AlertTriangle className="h-3 w-3" />
            <span className="text-xs">Error</span>
          </div>
        );
      default:
        return null;
    }
  };

  const formatNumber = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(0)}K`;
    return num.toString();
  };

  const getTotalStats = () => {
    return {
      totalHotels: suppliers.reduce((sum, s) => sum + s.total_hotels, 0),
      mappedHotels: suppliers.reduce((sum, s) => sum + s.mapped_hotels, 0),
      totalBookings: suppliers.reduce((sum, s) => sum + s.total_bookings, 0),
      activeSuppliers: suppliers.filter(s => s.status === 'active').length
    };
  };

  const stats = getTotalStats();

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Supplier Management</h2>
            <p className="text-gray-600 text-sm mt-1">
              Manage hotel suppliers, API connections, and mapping configurations
            </p>
          </div>
          <button className="flex items-center space-x-2 px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors">
            <Plus className="h-4 w-4" />
            <span>Add Supplier</span>
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Globe className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <div className="text-2xl font-bold text-gray-900">{formatNumber(stats.totalHotels)}</div>
              <div className="text-sm text-gray-600">Total Hotels</div>
            </div>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-green-100 rounded-lg">
              <Link className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <div className="text-2xl font-bold text-gray-900">{formatNumber(stats.mappedHotels)}</div>
              <div className="text-sm text-gray-600">Mapped Hotels</div>
            </div>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-purple-100 rounded-lg">
              <BarChart3 className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <div className="text-2xl font-bold text-gray-900">{formatNumber(stats.totalBookings)}</div>
              <div className="text-sm text-gray-600">Total Bookings</div>
            </div>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-yellow-100 rounded-lg">
              <CheckCircle className="h-5 w-5 text-yellow-600" />
            </div>
            <div>
              <div className="text-2xl font-bold text-gray-900">{stats.activeSuppliers}</div>
              <div className="text-sm text-gray-600">Active Suppliers</div>
            </div>
          </div>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <div className="flex items-center space-x-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search suppliers..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-500"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-4 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-500"
          >
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="testing">Testing</option>
          </select>
          <button className="flex items-center space-x-2 px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
            <Filter className="h-4 w-4" />
            <span>Advanced Filters</span>
          </button>
        </div>
      </div>

      {/* Suppliers Table */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Supplier
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Hotels & Mappings
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Performance
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Commission
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredSuppliers.map((supplier) => (
                <tr key={supplier.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center space-x-3">
                      <div className="p-2 bg-blue-100 rounded-lg">
                        <Server className="h-5 w-5 text-blue-600" />
                      </div>
                      <div>
                        <div className="text-sm font-medium text-gray-900">{supplier.name}</div>
                        <div className="text-xs text-gray-600">{supplier.type} • API v{supplier.api_version}</div>
                        {getConnectionBadge(supplier.connection_status)}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-gray-900">
                      {formatNumber(supplier.mapped_hotels)} / {formatNumber(supplier.total_hotels)} hotels
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2 mt-1">
                      <div 
                        className="bg-blue-600 h-2 rounded-full" 
                        style={{ width: `${supplier.total_hotels > 0 ? (supplier.mapped_hotels / supplier.total_hotels) * 100 : 0}%` }}
                      ></div>
                    </div>
                    <div className="text-xs text-gray-600 mt-1">
                      {supplier.total_hotels > 0 ? Math.round((supplier.mapped_hotels / supplier.total_hotels) * 100) : 0}% mapped
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-gray-900">{formatNumber(supplier.total_bookings)} bookings</div>
                    <div className="text-xs text-gray-600">
                      {supplier.avg_response_time > 0 ? `${supplier.avg_response_time}ms avg` : 'No data'}
                    </div>
                    {supplier.last_sync && (
                      <div className="text-xs text-gray-500 mt-1">
                        Last sync: {new Date(supplier.last_sync).toLocaleDateString()}
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <div className="space-y-2">
                      {getStatusBadge(supplier.status)}
                      <div className="flex flex-wrap gap-1">
                        {supplier.supported_features.slice(0, 2).map(feature => (
                          <span key={feature} className="px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded">
                            {feature}
                          </span>
                        ))}
                        {supplier.supported_features.length > 2 && (
                          <span className="px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded">
                            +{supplier.supported_features.length - 2}
                          </span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-gray-900">
                      {supplier.commission_rate > 0 ? `${supplier.commission_rate}%` : 'N/A'}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end space-x-2">
                      <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                        <Settings className="h-4 w-4 text-gray-600" />
                      </button>
                      <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                        <Edit className="h-4 w-4 text-gray-600" />
                      </button>
                      <button className="p-2 hover:bg-red-100 rounded-lg transition-colors">
                        <Trash2 className="h-4 w-4 text-red-600" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filteredSuppliers.length === 0 && !loading && (
          <div className="text-center py-12">
            <Server className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <div className="text-gray-500 mb-2">No suppliers found</div>
            <div className="text-sm text-gray-400">Try adjusting your search criteria</div>
          </div>
        )}
      </div>

      {/* Integration Guide */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Integration Architecture</h3>
        <div className="bg-gray-50 p-4 rounded-lg">
          <div className="text-sm text-gray-700 space-y-2">
            <div><strong>Hotel Content API:</strong> Provides hotel data from Google Cloud SQL</div>
            <div><strong>Inventory Management:</strong> Maps hotels to multiple suppliers (Gimmonix, RateHawk, etc.)</div>
            <div><strong>Booking Flow:</strong> Customer books → Inventory system finds best supplier → Creates booking</div>
            <div><strong>Admin Tools:</strong> Manage supplier connections, hotel mappings, and pricing rules</div>
          </div>
        </div>
      </div>
    </div>
  );
}