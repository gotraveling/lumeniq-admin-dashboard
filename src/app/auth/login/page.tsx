// /Users/muralik/projects/fc/hotels/admin-dashboard/src/app/auth/login/page.tsx
'use client';

import React, { useState } from 'react';
import { Zap, Mail, Lock, AlertCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import Link from 'next/link';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;
      const tokenResult = await user.getIdTokenResult();
      const { role } = tokenResult.claims;

      // Redirect to the main admin dashboard after successful login
      router.push('/admin/dashboard');

    } catch (error: any) {
      console.error('Login error:', error);
      setError(error.message || 'Login failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  const handleQuickLogin = (role: 'super_admin' | 'firstclass_admin') => {
    if (role === 'super_admin') {
      setEmail('admin@equationx.ai');
      setPassword('superadmin123');
    } else if (role === 'firstclass_admin') {
      setEmail('admin@firstclass.com.au');
      setPassword('firstclass123');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="max-w-md w-full mx-4">
        
        {/* Header */}
        <div className="flex items-center justify-center space-x-3 mb-6">
          <Zap className="h-10 w-10 text-blue-600" />
          <div>
            <h1 className="text-3xl font-bold text-gray-900">LumenIQ</h1>
            <p className="text-sm text-gray-500">Admin Portal</p>
          </div>
        </div>

        {/* Login Form Card */}
        <div className="bg-white shadow-md rounded-lg p-8">
          <h2 className="text-xl font-semibold text-center text-gray-800 mb-6">Sign in to your account</h2>
          
          <form onSubmit={handleLogin} className="space-y-6">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                Email address
              </label>
              <div className="mt-1 relative">
                <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="admin@example.com"
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                Password
              </label>
              <div className="mt-1 relative">
                <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="••••••••"
                />
              </div>
            </div>

            {error && (
              <div className="flex items-center space-x-2 p-3 bg-red-100 border border-red-200 rounded-md">
                <AlertCircle className="h-4 w-4 text-red-600" />
                <span className="text-red-700 text-sm">{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </form>

          {/* Demo Login Buttons */}
          <div className="mt-6 pt-6 border-t border-gray-200">
            <p className="text-center text-sm text-gray-500 mb-4">Quick Demo Login:</p>
            <div className="space-y-2">
              <button
                onClick={() => handleQuickLogin('super_admin')}
                className="w-full text-left px-4 py-2 bg-gray-100 hover:bg-gray-200 border border-gray-200 rounded-md text-gray-700 transition-colors"
              >
                <div className="font-medium">Super Admin</div>
              </button>
              <button
                onClick={() => handleQuickLogin('firstclass_admin')}
                className="w-full text-left px-4 py-2 bg-gray-100 hover:bg-gray-200 border border-gray-200 rounded-md text-gray-700 transition-colors"
              >
                <div className="font-medium">FirstClass Admin</div>
              </button>
            </div>
          </div>
        </div>

        <div className="text-center mt-6">
          <Link href="/" legacyBehavior>
            <a className="text-sm text-blue-600 hover:underline">
              ← Back to Homepage
            </a>
          </Link>
        </div>
      </div>
    </div>
  );
}
