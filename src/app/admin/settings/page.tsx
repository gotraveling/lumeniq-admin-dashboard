'use client';

import React, { useState } from 'react';
import { ArrowLeft, Save, RefreshCw, Database, Globe, Shield, Bell, Mail, Key, Server, Cloud, Monitor } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function SettingsPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState('platform');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    // Simulate save operation
    await new Promise(resolve => setTimeout(resolve, 1000));
    setSaving(false);
  };

  const tabs = [
    { id: 'platform', name: 'Platform', icon: Globe },
    { id: 'database', name: 'Database', icon: Database },
    { id: 'suppliers', name: 'Suppliers', icon: Server },
    { id: 'security', name: 'Security', icon: Shield },
    { id: 'notifications', name: 'Notifications', icon: Bell },
    { id: 'monitoring', name: 'Monitoring', icon: Monitor }
  ];

  const renderPlatformSettings = () => (
    <div className="space-y-6">
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Platform Configuration</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Platform Name</label>
            <input
              type="text"
              defaultValue="LumenIQ"
              className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Company</label>
            <input
              type="text"
              defaultValue="EquationX"
              className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Base Domain</label>
            <input
              type="text"
              defaultValue="lumeniq.io"
              className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Version</label>
            <input
              type="text"
              defaultValue="1.0.0"
              className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-500"
            />
          </div>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Supported Verticals</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {['Hotels', 'Flights', 'Cars', 'Tours'].map((vertical) => (
            <label key={vertical} className="flex items-center space-x-3 cursor-pointer">
              <input
                type="checkbox"
                defaultChecked={true}
                className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
              />
              <span className="text-gray-900">{vertical}</span>
            </label>
          ))}
        </div>
      </div>
    </div>
  );

  const renderDatabaseSettings = () => (
    <div className="space-y-6">
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Cloud SQL Configuration</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Instance ID</label>
            <input
              type="text"
              defaultValue="hotel-db"
              className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Project ID</label>
            <input
              type="text"
              defaultValue="travelx-451306"
              className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Database Name</label>
            <input
              type="text"
              defaultValue="hotel_data"
              className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Connection String</label>
            <input
              type="text"
              defaultValue="34.57.41.39:5432"
              className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-500"
            />
          </div>
        </div>
        <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg">
          <div className="flex items-center space-x-2 text-green-800 text-sm">
            <Cloud className="h-4 w-4" />
            <span>Connected to Google Cloud SQL - Multi-tenant enabled</span>
          </div>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Backup & Recovery</h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-gray-900">Automated Backups</div>
              <div className="text-sm text-gray-600">Daily backups at 2:00 AM UTC</div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" defaultChecked className="sr-only peer" />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
            </label>
          </div>
        </div>
      </div>
    </div>
  );

  const renderSupplierSettings = () => (
    <div className="space-y-6">
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Active Suppliers</h3>
        <div className="space-y-4">
          {[
            { name: 'Demo Supplier', status: 'active', type: 'Demo', bookings: 1247 },
            { name: 'Gimmonix', status: 'inactive', type: 'Real', bookings: 0 },
            { name: 'RateHawk', status: 'inactive', type: 'Real', bookings: 0 }
          ].map((supplier, index) => (
            <div key={index} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-200">
              <div className="flex items-center space-x-4">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <Server className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <div className="text-gray-900 font-medium">{supplier.name}</div>
                  <div className="text-sm text-gray-600">{supplier.type} • {supplier.bookings} bookings</div>
                </div>
              </div>
              <div className="flex items-center space-x-3">
                <span className={`px-2 py-1 text-xs rounded-full border ${
                  supplier.status === 'active' 
                    ? 'bg-white border-green-600 text-black' 
                    : 'bg-white border-gray-600 text-black'
                }`}>
                  {supplier.status}
                </span>
                <button className="text-blue-600 hover:text-blue-800 text-sm">Configure</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">API Endpoints</h3>
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Hotel Content API</label>
            <input
              type="text"
              defaultValue="http://localhost:3001"
              className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Booking Engine API</label>
            <input
              type="text"
              defaultValue="http://localhost:3003"
              className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-500"
            />
          </div>
        </div>
      </div>
    </div>
  );

  const renderSecuritySettings = () => (
    <div className="space-y-6">
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Firebase Authentication</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Project ID</label>
            <input
              type="text"
              defaultValue="lumeniq-platform"
              className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Auth Domain</label>
            <input
              type="text"
              defaultValue="lumeniq-platform.firebaseapp.com"
              className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-500"
            />
          </div>
        </div>
        <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg">
          <div className="flex items-center space-x-2 text-green-800 text-sm">
            <Key className="h-4 w-4" />
            <span>Firebase Authentication Active - Multi-tenant support enabled</span>
          </div>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Security Policies</h3>
        <div className="space-y-4">
          {[
            { name: 'Row-Level Security', description: 'Tenant data isolation', enabled: true },
            { name: 'API Rate Limiting', description: '100 requests per minute', enabled: true },
            { name: 'CORS Protection', description: 'Cross-origin request filtering', enabled: true },
            { name: 'SQL Injection Protection', description: 'Parameterized queries', enabled: true }
          ].map((policy, index) => (
            <div key={index} className="flex items-center justify-between">
              <div>
                <div className="text-gray-900">{policy.name}</div>
                <div className="text-sm text-gray-600">{policy.description}</div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" defaultChecked={policy.enabled} className="sr-only peer" />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
              </label>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  const renderContent = () => {
    switch (activeTab) {
      case 'platform':
        return renderPlatformSettings();
      case 'database':
        return renderDatabaseSettings();
      case 'suppliers':
        return renderSupplierSettings();
      case 'security':
        return renderSecuritySettings();
      default:
        return (
          <div className="bg-white border border-gray-200 rounded-lg p-8 text-center">
            <div className="text-gray-600">Settings for {activeTab} are coming soon...</div>
          </div>
        );
    }
  };

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Platform Settings</h2>
            <p className="text-gray-600 text-sm mt-1">
              Configure platform, suppliers and integrations
            </p>
          </div>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center space-x-2 px-4 py-2 bg-black hover:bg-gray-800 disabled:opacity-50 text-white text-sm rounded-lg transition-colors"
          >
            {saving ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            <span>{saving ? 'Saving...' : 'Save Changes'}</span>
          </button>
        </div>
      </div>

      <div className="flex gap-6">
        {/* Sidebar */}
        <div className="w-64 flex-shrink-0">
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <nav className="space-y-1">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`w-full flex items-center space-x-3 px-3 py-2 rounded-lg text-left transition-colors border ${
                      activeTab === tab.id
                        ? 'bg-gray-900 text-white border-gray-900'
                        : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900 border-gray-200'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    <span className="text-sm">{tab.name}</span>
                  </button>
                );
              })}
            </nav>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1">
          {renderContent()}
        </div>
      </div>
    </div>
  );
}