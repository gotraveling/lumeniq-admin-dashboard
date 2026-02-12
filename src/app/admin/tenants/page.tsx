'use client';

import React, { useState, useEffect } from 'react';
import { ArrowLeft, Plus, Search, Building2, Users, Globe, Settings, MoreHorizontal, Edit, Trash2, Eye, CheckCircle, XCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface Tenant {
  id: string;
  name: string;
  domain: string;
  status: 'active' | 'inactive' | 'suspended';
  verticals: string[];
  user_count: number;
  booking_count: number;
  revenue: number;
  currency: string;
  created_at: string;
  last_login: string;
  subscription_plan: string;
  contact_email: string;
  contact_phone: string;
}

export default function TenantsPage() {
  const router = useRouter();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showAddModal, setShowAddModal] = useState(false);

  useEffect(() => {
    fetchTenants();
  }, []);

  const fetchTenants = async () => {
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/tenants`);
      if (response.ok) {
        const data = await response.json();
        setTenants(data);
      } else {
        setTenants(getMockTenants());
      }
    } catch (error) {
      console.error('Error fetching tenants:', error);
      setTenants(getMockTenants());
    } finally {
      setLoading(false);
    }
  };

  const getMockTenants = (): Tenant[] => [
    {
      id: 'equationx',
      name: 'EquationX',
      domain: 'admin.lumeniq.io',
      status: 'active',
      verticals: ['Hotels', 'Flights', 'Cars', 'Tours'],
      user_count: 5,
      booking_count: 12,
      revenue: 2500.00,
      currency: 'USD',
      created_at: '2024-01-15T00:00:00Z',
      last_login: '2024-03-05T14:30:00Z',
      subscription_plan: 'Platform Owner',
      contact_email: 'admin@equationx.com',
      contact_phone: '+1 555 123 4567'
    },
    {
      id: 'firstclass',
      name: 'FirstClass Travel',
      domain: 'firstclass.lumeniq.io',
      status: 'active',
      verticals: ['Hotels'],
      user_count: 8,
      booking_count: 1247,
      revenue: 89250.00,
      currency: 'AUD',
      created_at: '2024-02-01T00:00:00Z',
      last_login: '2024-03-06T09:15:00Z',
      subscription_plan: 'Professional',
      contact_email: 'contact@firstclass.com.au',
      contact_phone: '+61 2 8765 4321'
    },
    {
      id: 'demo_travel',
      name: 'Demo Travel Agency',
      domain: 'demo.lumeniq.io',
      status: 'inactive',
      verticals: ['Hotels', 'Cars'],
      user_count: 3,
      booking_count: 45,
      revenue: 12750.00,
      currency: 'USD',
      created_at: '2024-01-20T00:00:00Z',
      last_login: '2024-02-28T16:45:00Z',
      subscription_plan: 'Basic',
      contact_email: 'demo@example.com',
      contact_phone: '+1 555 987 6543'
    }
  ];

  const filteredTenants = tenants.filter(tenant => {
    const matchesSearch = tenant.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         tenant.domain.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = statusFilter === 'all' || tenant.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return (
          <div className="flex items-center space-x-1 px-2 py-1 bg-green-600/20 text-green-300 text-xs rounded-full">
            <CheckCircle className="h-3 w-3" />
            <span>Active</span>
          </div>
        );
      case 'inactive':
        return (
          <div className="flex items-center space-x-1 px-2 py-1 bg-gray-600/20 text-gray-300 text-xs rounded-full">
            <XCircle className="h-3 w-3" />
            <span>Inactive</span>
          </div>
        );
      case 'suspended':
        return (
          <div className="flex items-center space-x-1 px-2 py-1 bg-red-600/20 text-red-300 text-xs rounded-full">
            <XCircle className="h-3 w-3" />
            <span>Suspended</span>
          </div>
        );
      default:
        return <span className="text-gray-400">{status}</span>;
    }
  };

  const getPlanBadge = (plan: string) => {
    switch (plan) {
      case 'Platform Owner':
        return <span className="px-2 py-1 bg-purple-600/30 text-purple-300 text-xs rounded-full">Platform Owner</span>;
      case 'Professional':
        return <span className="px-2 py-1 bg-blue-600/30 text-blue-300 text-xs rounded-full">Professional</span>;
      case 'Basic':
        return <span className="px-2 py-1 bg-gray-600/30 text-gray-300 text-xs rounded-full">Basic</span>;
      default:
        return <span className="px-2 py-1 bg-gray-600/30 text-gray-300 text-xs rounded-full">{plan}</span>;
    }
  };

  const formatCurrency = (amount: number, currency: string) => {
    return new Intl.NumberFormat('en-AU', {
      style: 'currency',
      currency: currency
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-AU', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center">
        <div className="text-white">Loading tenants...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900">
      {/* Header */}
      <header className="border-b border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-4">
              <button
                onClick={() => router.push('/')}
                className="p-2 hover:bg-white/10 rounded-lg transition-colors"
              >
                <ArrowLeft className="h-5 w-5 text-white" />
              </button>
              <div>
                <h1 className="text-xl font-bold text-white">Tenant Management</h1>
                <p className="text-xs text-gray-400">Manage platform tenants and configurations</p>
              </div>
            </div>
            
            <div className="flex items-center space-x-4">
              <div className="px-3 py-1 bg-blue-600/20 text-blue-300 text-xs rounded-full border border-blue-500/30">
                {filteredTenants.length} tenants
              </div>
              <button
                onClick={() => setShowAddModal(true)}
                className="flex items-center space-x-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg transition-colors"
              >
                <Plus className="h-4 w-4" />
                <span>Add Tenant</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Filters */}
        <div className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-lg p-6 mb-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search tenants..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-white/5 border border-white/20 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-4 py-2 bg-white/5 border border-white/20 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="suspended">Suspended</option>
            </select>

            <button className="flex items-center justify-center space-x-2 px-4 py-2 bg-gray-600/20 hover:bg-gray-600/30 text-gray-300 rounded-lg transition-colors">
              <Settings className="h-4 w-4" />
              <span>Export Data</span>
            </button>
          </div>
        </div>

        {/* Tenant Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {filteredTenants.map((tenant) => (
            <div key={tenant.id} className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-lg p-6">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center space-x-3">
                  <div className="p-2 bg-blue-600/20 rounded-lg">
                    <Building2 className="h-6 w-6 text-blue-400" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-white">{tenant.name}</h3>
                    <div className="flex items-center space-x-2 text-sm text-gray-400">
                      <Globe className="h-3 w-3" />
                      <span>{tenant.domain}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  {getStatusBadge(tenant.status)}
                  <button className="p-1 hover:bg-white/10 rounded">
                    <MoreHorizontal className="h-4 w-4 text-gray-400" />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-4">
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">Plan:</span>
                    {getPlanBadge(tenant.subscription_plan)}
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">Users:</span>
                    <span className="text-white">{tenant.user_count}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">Bookings:</span>
                    <span className="text-white">{tenant.booking_count.toLocaleString()}</span>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">Revenue:</span>
                    <span className="text-green-300">{formatCurrency(tenant.revenue, tenant.currency)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">Created:</span>
                    <span className="text-white">{formatDate(tenant.created_at)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">Last Login:</span>
                    <span className="text-white">{formatDate(tenant.last_login)}</span>
                  </div>
                </div>
              </div>

              <div className="mb-4">
                <div className="text-xs text-gray-400 mb-2">Verticals:</div>
                <div className="flex flex-wrap gap-2">
                  {tenant.verticals.map((vertical, index) => (
                    <span
                      key={index}
                      className="px-2 py-1 bg-gray-600/20 text-gray-300 text-xs rounded-full"
                    >
                      {vertical}
                    </span>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-white/10">
                <div className="text-xs text-gray-400">
                  <div>{tenant.contact_email}</div>
                  <div>{tenant.contact_phone}</div>
                </div>
                <div className="flex space-x-2">
                  <button className="p-2 hover:bg-white/10 rounded-lg transition-colors">
                    <Eye className="h-4 w-4 text-gray-400" />
                  </button>
                  <button className="p-2 hover:bg-white/10 rounded-lg transition-colors">
                    <Edit className="h-4 w-4 text-gray-400" />
                  </button>
                  <button className="p-2 hover:bg-white/10 rounded-lg transition-colors">
                    <Trash2 className="h-4 w-4 text-red-400" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {filteredTenants.length === 0 && (
          <div className="text-center py-12">
            <Building2 className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <div className="text-gray-400 mb-2">No tenants found</div>
            <div className="text-sm text-gray-500">Try adjusting your filters or add a new tenant</div>
          </div>
        )}
      </div>
    </div>
  );
}