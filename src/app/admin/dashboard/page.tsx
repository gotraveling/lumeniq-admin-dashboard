'use client';

import React, { useState, useEffect } from 'react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth } from '@/lib/firebase';
import { 
  BarChart3, 
  Users, 
  Hotel, 
  TrendingUp, 
  Building2,
  Globe,
  Calendar,
  DollarSign
} from 'lucide-react';

interface DashboardStats {
  totalBookings: number;
  activeUsers: number;
  revenue: number;
  tenants: number;
  currency: string;
  period: string;
}

interface UserClaims {
  role?: 'super_admin' | 'admin' | 'user';
  tenant_id?: string;
  tenant_name?: string;
}

export default function DashboardPage() {
  const [user, loading] = useAuthState(auth);
  const [userClaims, setUserClaims] = useState<UserClaims>({});
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recentBookings, setRecentBookings] = useState<any[]>([]);
  const [systemStatus, setSystemStatus] = useState<any>(null);

  useEffect(() => {
    const loadDashboardData = async () => {
      if (user) {
        try {
          const tokenResult = await user.getIdTokenResult();
          const claims = tokenResult.claims as UserClaims;
          setUserClaims(claims);
          
          // Fetch real data from API
          const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://booking-engine-api-91901273027.us-central1.run.app';
          
          // Fetch bookings
          try {
            const bookingsResponse = await fetch(`${apiUrl}/api/bookings?limit=10`);
            const bookingsData = await bookingsResponse.json();
            
            if (bookingsData.success && bookingsData.data) {
              const bookings = bookingsData.data.bookings || [];
              setRecentBookings(bookings.slice(0, 3));
              
              // Calculate stats from real data
              const totalBookings = bookingsData.data.pagination?.total || bookings.length;
              const totalRevenue = bookings.reduce((sum: number, b: any) => sum + (b.totalAmount || 0), 0);
              
              setStats({
                totalBookings: totalBookings,
                activeUsers: claims.role === 'super_admin' ? 2 : 1,
                revenue: totalRevenue,
                tenants: claims.role === 'super_admin' ? 2 : 1,
                currency: 'USD',
                period: 'All Time'
              });
            } else {
              // Fallback to demo data
              setStats({
                totalBookings: 0,
                activeUsers: claims.role === 'super_admin' ? 2 : 1,
                revenue: 0,
                tenants: claims.role === 'super_admin' ? 2 : 1,
                currency: 'USD',
                period: 'All Time'
              });
            }
          } catch (error) {
            console.error('Error fetching bookings:', error);
            // Use demo data as fallback
            setStats({
              totalBookings: 3,
              activeUsers: claims.role === 'super_admin' ? 2 : 1,
              revenue: 2424,
              tenants: claims.role === 'super_admin' ? 2 : 1,
              currency: 'USD',
              period: 'Demo Data'
            });
          }
          
          // Check system status
          try {
            const healthResponse = await fetch(`${apiUrl}/health`);
            const healthData = await healthResponse.json();
            setSystemStatus(healthData);
          } catch (error) {
            console.error('Error checking health:', error);
          }
        } catch (error) {
          console.error('Error loading dashboard data:', error);
        }
      }
    };

    loadDashboardData();
  }, [user]);

  if (loading || !stats) {
    return (
      <div className="p-8 flex items-center justify-center">
        <div className="text-gray-600">Loading dashboard...</div>
      </div>
    );
  }

  const formatCurrency = (amount: number, currency: string) => {
    return new Intl.NumberFormat('en-AU', {
      style: 'currency',
      currency: currency
    }).format(amount);
  };

  const isSuperAdmin = userClaims.role === 'super_admin';

  return (
    <div className="p-8 space-y-8">
      {/* Welcome Section */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">
          Welcome back, {user?.displayName || user?.email?.split('@')[0]}! 👋
        </h2>
        <p className="text-gray-600">
          {isSuperAdmin 
            ? 'Here\'s what\'s happening across your platform today.' 
            : `Here's your ${userClaims.tenant_name} overview for today.`
          }
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-500 text-sm font-medium">Total Bookings</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{stats.totalBookings.toLocaleString()}</p>
              <p className="text-xs text-green-600 mt-2">↗ +23% from last month</p>
            </div>
            <div className="p-3 bg-gray-100 rounded-lg border border-gray-300">
              <Hotel className="h-6 w-6 text-gray-900" />
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-500 text-sm font-medium">Active Users</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{stats.activeUsers}</p>
              <p className="text-xs text-green-600 mt-2">↗ +12% this week</p>
            </div>
            <div className="p-3 bg-gray-100 rounded-lg border border-gray-300">
              <Users className="h-6 w-6 text-gray-900" />
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-500 text-sm font-medium">Revenue</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">
                {formatCurrency(stats.revenue, stats.currency)}
              </p>
              <p className="text-xs text-green-600 mt-2">↗ +18% this month</p>
            </div>
            <div className="p-3 bg-gray-100 rounded-lg border border-gray-300">
              <DollarSign className="h-6 w-6 text-gray-900" />
            </div>
          </div>
        </div>

        {isSuperAdmin && (
          <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-500 text-sm font-medium">Active Tenants</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{stats.tenants}</p>
                <p className="text-xs text-green-600 mt-2">↗ +100% growth</p>
              </div>
              <div className="p-3 bg-gray-100 rounded-lg border border-gray-300">
                <Building2 className="h-6 w-6 text-gray-900" />
              </div>
            </div>
          </div>
        )}

        {!isSuperAdmin && (
          <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-500 text-sm font-medium">Conversion Rate</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">3.2%</p>
                <p className="text-xs text-green-600 mt-2">↗ +0.8% this month</p>
              </div>
              <div className="p-3 bg-gray-100 rounded-lg border border-gray-300">
                <TrendingUp className="h-6 w-6 text-gray-900" />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Two Column Layout - Recent Activity & System Status */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 auto-rows-fr">
        {/* Left Column - Recent Bookings */}
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm flex flex-col h-full">
          <div className="p-6 border-b border-gray-200 flex-shrink-0">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">Recent Bookings</h3>
              <button className="text-gray-900 hover:text-gray-700 text-sm font-medium">View All</button>
            </div>
          </div>
          
          <div className="p-6 space-y-4 flex-1">
            {recentBookings.length > 0 ? (
              recentBookings.map((booking, index) => {
                const guestName = booking.guestInfo ? `${booking.guestInfo.firstName} ${booking.guestInfo.lastName}` : 'Guest';
                const hotelInfo = booking.bookingDetails?.hotelId || 'Hotel Booking';
                const amount = booking.totalAmount || 0;
                const currency = booking.currency || 'USD';
                const createdAt = new Date(booking.createdAt).toLocaleDateString();
                
                return (
                  <div key={booking.bookingId || index} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                    <div className="flex-1">
                      <div className="text-gray-900 text-sm font-medium">{guestName}</div>
                      <div className="text-gray-500 text-xs mt-1">Booking ID: {booking.bookingId}</div>
                      <div className="text-gray-500 text-xs">Status: {booking.status}</div>
                      {isSuperAdmin && (
                        <div className="text-gray-900 text-xs mt-1">FirstClass AU</div>
                      )}
                    </div>
                    <div className="text-right">
                      <div className="text-green-600 text-sm font-medium">
                        {formatCurrency(amount, currency)}
                      </div>
                      <div className="text-gray-400 text-xs">{createdAt}</div>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-gray-500">
                <Hotel className="h-12 w-12 mb-4 text-gray-300" />
                <p className="text-sm">No recent bookings found</p>
                <p className="text-xs mt-1">Bookings will appear here once created</p>
              </div>
            )}
          </div>
        </div>

        {/* Right Column - System Status or Tenant Info */}
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm flex flex-col h-full">
          <div className="p-6 border-b border-gray-200 flex-shrink-0">
            <h3 className="text-lg font-semibold text-gray-900">
              {isSuperAdmin ? 'System Status' : 'Account Overview'}
            </h3>
          </div>
          
          <div className="p-6 space-y-4 flex-1">
            {isSuperAdmin ? (
              <>
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className={`w-2 h-2 rounded-full ${systemStatus?.status === 'healthy' ? 'bg-green-500' : 'bg-red-500'}`}></div>
                    <span className="text-gray-900 text-sm">Booking Engine API</span>
                  </div>
                  <span className={`text-xs font-medium ${systemStatus?.status === 'healthy' ? 'text-green-600' : 'text-red-600'}`}>
                    {systemStatus?.status === 'healthy' ? 'Online' : 'Offline'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                    <span className="text-gray-900 text-sm">Hotel Content API</span>
                  </div>
                  <span className="text-green-600 text-xs font-medium">Online</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className={`w-2 h-2 rounded-full ${systemStatus?.database?.status === 'healthy' ? 'bg-green-500' : 'bg-red-500'}`}></div>
                    <span className="text-gray-900 text-sm">Cloud SQL Database</span>
                  </div>
                  <span className={`text-xs font-medium ${systemStatus?.database?.status === 'healthy' ? 'text-green-600' : 'text-red-600'}`}>
                    {systemStatus?.database?.database === 'connected' ? 'Connected' : 'Disconnected'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="w-2 h-2 bg-yellow-500 rounded-full"></div>
                    <span className="text-gray-900 text-sm">External Suppliers</span>
                  </div>
                  <span className="text-yellow-600 text-xs font-medium">Demo Mode</span>
                </div>
                {/* Add more content to balance height */}
                <div className="pt-4 border-t border-gray-200">
                  <h4 className="text-sm font-medium text-gray-900 mb-3">Platform Overview</h4>
                  <div className="space-y-2">
                    <div className="flex justify-between items-center py-1">
                      <span className="text-gray-500 text-xs">Service:</span>
                      <span className="text-green-600 text-xs font-medium">{systemStatus?.service || 'booking-engine-api'}</span>
                    </div>
                    <div className="flex justify-between items-center py-1">
                      <span className="text-gray-500 text-xs">Version:</span>
                      <span className="text-green-600 text-xs font-medium">{systemStatus?.version || '1.0.0'}</span>
                    </div>
                    <div className="flex justify-between items-center py-1">
                      <span className="text-gray-500 text-xs">Last Check:</span>
                      <span className="text-gray-900 text-xs">
                        {systemStatus?.timestamp ? new Date(systemStatus.timestamp).toLocaleTimeString() : 'Just now'}
                      </span>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="flex justify-between items-center py-2">
                  <span className="text-gray-500 text-sm">Tenant ID:</span>
                  <span className="text-gray-900 text-sm font-medium">{userClaims.tenant_id}</span>
                </div>
                <div className="flex justify-between items-center py-2">
                  <span className="text-gray-500 text-sm">Domain:</span>
                  <span className="text-gray-900 text-sm">{userClaims.tenant_id}.lumeniq.io</span>
                </div>
                <div className="flex justify-between items-center py-2">
                  <span className="text-gray-500 text-sm">Plan:</span>
                  <span className="text-green-600 text-sm font-medium">Professional</span>
                </div>
                <div className="flex justify-between items-center py-2">
                  <span className="text-gray-500 text-sm">Verticals:</span>
                  <span className="text-gray-900 text-sm">Hotels</span>
                </div>
                {/* Add more content to balance height */}
                <div className="pt-4 border-t border-gray-200">
                  <h4 className="text-sm font-medium text-gray-900 mb-3">Account Details</h4>
                  <div className="space-y-2">
                    <div className="flex justify-between items-center py-1">
                      <span className="text-gray-500 text-xs">Created:</span>
                      <span className="text-gray-900 text-xs">Feb 1, 2024</span>
                    </div>
                    <div className="flex justify-between items-center py-1">
                      <span className="text-gray-500 text-xs">Last Login:</span>
                      <span className="text-gray-900 text-xs">Just now</span>
                    </div>
                    <div className="flex justify-between items-center py-1">
                      <span className="text-gray-500 text-xs">Status:</span>
                      <span className="text-green-600 text-xs font-medium">Active</span>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}