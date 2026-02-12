'use client';

import React,
 { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { onAuthStateChanged, User } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import {
  LayoutDashboard,
  Hotel,
  Users,
  Settings,
  Building2,
  BarChart3,
  Globe,
  LogOut,
  Menu,
  X,
  Zap,
  Percent,
  DollarSign,
  Sparkles,
  EyeOff
} from 'lucide-react';

interface UserClaims {
  role?: 'super_admin' | 'admin' | 'user';
  tenant_id?: string;
  tenant_name?: string;
}

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);
  const [userClaims, setUserClaims] = useState<UserClaims>({});
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setUser(user);
        try {
          const tokenResult = await user.getIdTokenResult();
          setUserClaims(tokenResult.claims as UserClaims);
        } catch (error) {
          console.error('Error getting token claims:', error);
        }
      } else {
        router.push('/auth/login');
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [router]);

  const handleLogout = async () => {
    try {
      await auth.signOut();
      router.push('/');
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  const getPageTitle = (pathname: string, claims: UserClaims) => {
    // ... (This function can remain the same)
    return 'Admin Portal';
  };

  const getPageDescription = (pathname: string, claims: UserClaims) => {
    // ... (This function can remain the same)
    return 'LumenIQ Administration Portal';
  };

  const getNavigationItems = () => {
    const baseItems = [
      { name: 'Dashboard', href: '/admin/dashboard', icon: LayoutDashboard, description: 'Overview and analytics' }
    ];

    const commonItems = [
      { name: 'My Bookings', href: '/admin/bookings', icon: Hotel, description: 'Tenant bookings' },
      { name: 'Browse Hotels', href: '/admin/inventory/browse', icon: BarChart3, description: 'Browse hotel inventory' },
      { name: 'Editorial Content', href: '/admin/hotels/editorial', icon: Sparkles, description: 'Manage hotel content, media & reviews' },
      { name: 'Hotel Visibility', href: '/admin/hotels/visibility', icon: EyeOff, description: 'Control hotel visibility & rules' },
      { name: 'Pricing Rules', href: '/admin/inventory/pricing', icon: Percent, description: 'Manage markup rules' },
      { name: 'Display Overrides', href: '/admin/inventory/display-overrides', icon: DollarSign, description: 'Manual "from prices"' },
      { name: 'Suppliers', href: '/admin/suppliers', icon: Globe, description: 'Manage API suppliers' },
      // { name: 'Users', href: '/admin/users', icon: Users, description: 'Manage tenant users' }, // Hidden - mock data
      { name: 'Settings', href: '/admin/tenant-settings', icon: Settings, description: 'Tenant configuration' }
    ];

    const superAdminItems = [
      { name: 'Tenant Management', href: '/admin/tenants', icon: Building2, description: 'Manage all tenants' },
      { name: 'Platform Settings', href: '/admin/settings', icon: Settings, description: 'Platform configuration' }
    ];

    if (userClaims.role === 'super_admin') {
      // Super admin sees everything
      return [...baseItems, ...commonItems, ...superAdminItems];
    } else {
      // Tenant admin sees common items
      return [...baseItems, ...commonItems];
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-600">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  const navigationItems = getNavigationItems();

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 shadow-sm z-50">
        {/* ... (Header JSX remains the same) ... */}
      </div>

      {/* Main Content Area */}
      <div className="flex flex-1">
        {/* Sidebar */}
        <div className={`
          fixed inset-y-0 left-0 top-[80px] z-50 w-64 transform bg-white border-r border-gray-200 lg:relative lg:top-0
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
          transition-transform duration-300 ease-in-out lg:translate-x-0 lg:block
        `}>
          <div className="flex flex-col h-full">
            {/* User info */}
            <div className="p-4 border-b border-gray-200">
              {/* ... (User info JSX remains the same) ... */}
            </div>

            {/* Navigation */}
            <nav className="flex-1 px-4 py-6 space-y-1">
              {navigationItems.map((item) => {
                const Icon = item.icon;
                const isActive = pathname === item.href;
                
                return (
                  <button
                    key={item.name}
                    onClick={() => {
                      router.push(item.href);
                      setSidebarOpen(false);
                    }}
                    className={`
                      w-full flex items-center space-x-3 px-3 py-2 rounded-lg text-left transition-colors border
                      ${isActive 
                        ? 'bg-gray-900 text-white border-gray-900' 
                        : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900 border-gray-200'
                      }
                    `}
                  >
                    <Icon className="h-5 w-5 flex-shrink-0" />
                    <div className="flex-1 text-left">
                      <div className="text-sm font-medium">{item.name}</div>
                      <div className="text-xs opacity-75">{item.description}</div>
                    </div>
                  </button>
                );
              })}
            </nav>

            {/* Logout */}
            <div className="p-4 border-t border-gray-200">
              <button
                onClick={handleLogout}
                className="w-full flex items-center space-x-3 px-3 py-2 rounded-lg text-gray-700 hover:bg-gray-100 hover:text-gray-900 border border-gray-200 transition-colors"
              >
                <LogOut className="h-5 w-5" />
                <span className="text-sm">Sign out</span>
              </button>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 bg-gray-50">
          {children}
        </div>
      </div>
    </div>
  );
}
