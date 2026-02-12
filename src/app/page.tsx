// /Users/muralik/projects/fc/hotels/admin-dashboard/src/app/page.tsx
'use client';

import React from 'react';
import { Zap, ArrowRight } from 'lucide-react';
import Link from 'next/link';

export default function HomePage() {
  return (
    <div className="min-h-screen bg-white flex items-center justify-center">
      <div className="w-full max-w-md p-8 text-center">
        
        {/* Logo and Title */}
        <div className="flex items-center justify-center space-x-3 mb-6">
          <Zap className="h-12 w-12 text-blue-600" />
          <div>
            <h1 className="text-3xl font-bold text-gray-900">LumenIQ</h1>
            <p className="text-sm text-gray-500">by EquationX</p>
          </div>
        </div>

        {/* Description */}
        <p className="text-gray-600 mb-8">
          Welcome to the LumenIQ Admin Portal. Please log in to manage your tenants, suppliers, and bookings.
        </p>

        {/* Login Button */}
        <Link href="/auth/login" legacyBehavior>
          <a className="inline-flex items-center justify-center w-full px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white text-lg font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50">
            <span>Admin Login</span>
            <ArrowRight className="h-5 w-5 ml-2" />
          </a>
        </Link>

      </div>
    </div>
  );
}
