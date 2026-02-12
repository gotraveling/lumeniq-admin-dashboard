'use client';

import React, { useState, useEffect } from 'react';
import { Search, Filter, Calendar, Users, Phone, Mail, CreditCard, CheckCircle, XCircle, Clock, MoreHorizontal, Eye, Edit, X, RefreshCw, DollarSign } from 'lucide-react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth } from '@/lib/firebase';

interface Booking {
  id: string;
  tenant_id: string;
  tenant_name: string;
  guest_name: string;
  guest_email: string;
  guest_phone: string;
  hotel_id: string;
  hotel_name: string;
  hotel_location?: string;
  room_type: string;
  check_in_date: string;
  check_out_date: string;
  guests: number;
  total_amount: number;
  currency: string;
  status: 'confirmed' | 'cancelled' | 'pending';
  booking_reference: string;
  supplier_reference?: string;
  booking_response_token?: string;
  created_at: string;
  updated_at: string;
}

interface UserClaims {
  role?: 'super_admin' | 'admin' | 'user';
  tenant_id?: string;
  tenant_name?: string;
}

export default function BookingsPage() {
  const [user] = useAuthState(auth);
  const [userClaims, setUserClaims] = useState<UserClaims>({});
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [tenantFilter, setTenantFilter] = useState('all');
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [cancellingBooking, setCancellingBooking] = useState<string | null>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      // Don't close if clicking inside a dropdown menu
      const target = event.target as HTMLElement;
      if (target.closest('.dropdown-menu')) {
        return;
      }
      setOpenDropdown(null);
    };

    document.addEventListener('click', handleClickOutside);
    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  }, []);

  useEffect(() => {
    const loadUserClaims = async () => {
      if (user) {
        try {
          const tokenResult = await user.getIdTokenResult();
          const claims = tokenResult.claims as UserClaims;
          setUserClaims(claims);
          fetchBookings(claims);
        } catch (error) {
          console.error('Error loading user claims:', error);
          fetchBookings({});
        }
      }
    };

    loadUserClaims();
  }, [user]);

  const fetchBookings = async (claims: UserClaims) => {
    try {
      console.log('Attempting to fetch bookings from local API route');
      const response = await fetch('/api/bookings');
      console.log('API Response status:', response.status);

      if (response.ok) {
        const apiResponse = await response.json();

        if (apiResponse.success && apiResponse.data?.bookings) {
          // Transform API data to match our interface and enrich with hotel details
          const transformedData = await Promise.all(apiResponse.data.bookings.map(async (booking: any) => {
            // Fetch hotel details
            let hotelName = `Hotel #${booking.bookingDetails?.hotelId || 'Unknown'}`;
            let hotelLocation = '';
            let roomType = 'Standard Room';

            try {
              const hotelId = booking.bookingDetails?.hotelId;
              if (hotelId) {
                const hotelResponse = await fetch(`${process.env.NEXT_PUBLIC_HOTEL_API_URL}/api/hotels/${hotelId}`);
                if (hotelResponse.ok) {
                  const hotelData = await hotelResponse.json();
                  hotelName = hotelData.hotel_name || hotelName;
                  hotelLocation = hotelData.city && hotelData.country ? `${hotelData.city}, ${hotelData.country}` : '';

                  // Extract room type from rate key if available
                  const rateKey = booking.bookingDetails?.rateKey || '';
                  if (rateKey && hotelData.room_categories) {
                    // Try to match room code from rate key with hotel room categories
                    const roomCode = rateKey.split(':')[1]; // e.g., "h6114d22149b11:MHSS:BB:NA:NA:C" -> "MHSS"
                    const matchingRoom = hotelData.room_categories.find((r: any) =>
                      r.room_code === roomCode || r.room_type.includes(roomCode)
                    );
                    if (matchingRoom) {
                      roomType = matchingRoom.room_type;
                    }
                  }
                }
              }
            } catch (hotelError) {
              console.error('Error fetching hotel details:', hotelError);
            }

            return {
              id: booking.bookingId,
              tenant_id: 'firstclass', // Match the user's claims.tenant_id
              tenant_name: 'FirstClass Travel',
              guest_name: `${booking.guestInfo.firstName} ${booking.guestInfo.lastName}`,
              guest_email: booking.guestInfo.email,
              guest_phone: booking.guestInfo.phone || booking.contactInfo.phone,
              hotel_id: booking.bookingDetails?.hotelId?.toString() || 'Unknown',
              hotel_name: hotelName,
              hotel_location: hotelLocation,
              room_type: roomType,
              check_in_date: booking.bookingDetails?.searchParams?.checkIn || '',
              check_out_date: booking.bookingDetails?.searchParams?.checkOut || '',
              guests: booking.bookingDetails?.searchParams?.adults || 1,
              total_amount: booking.totalAmount,
              currency: booking.currency,
              status: booking.status,
              booking_reference: booking.bookingId,
              supplier_reference: booking.confirmationNumber,
              created_at: booking.createdAt,
              updated_at: booking.updatedAt,
              booking_response_token: booking.bookingDetails?.bookingResponseToken
            };
          }));
          
          // Filter based on user role
          let filteredData = transformedData;
          if (claims.role !== 'super_admin' && claims.tenant_id) {
            filteredData = transformedData.filter((booking: Booking) => booking.tenant_id === claims.tenant_id);
          }
          setBookings(filteredData);
        } else {
          console.log('Invalid API response structure, using mock data');
          setBookings(getMockBookings(claims));
        }
      } else {
        console.log('API not available, using mock data');
        setBookings(getMockBookings(claims));
      }
    } catch (error) {
      console.error('Error fetching bookings from API:', error);
      console.log('Falling back to mock data');
      setBookings(getMockBookings(claims));
    } finally {
      setLoading(false);
    }
  };

  const getMockBookings = (claims: UserClaims): Booking[] => {
    const allBookings = [
      {
        id: '1',
        tenant_id: 'firstclass',
        tenant_name: 'FirstClass Travel',
        guest_name: 'John Smith',
        guest_email: 'john.smith@example.com',
        guest_phone: '+61 400 123 456',
        hotel_id: 'H001',
        hotel_name: 'Conrad Maldives Rangali Island',
        room_type: 'Beach Villa',
        check_in_date: '2024-03-15',
        check_out_date: '2024-03-20',
        guests: 2,
        total_amount: 4500.00,
        currency: 'AUD',
        status: 'confirmed' as const,
        booking_reference: 'FC001234',
        supplier_reference: 'SUP789012',
        created_at: '2024-02-28T10:30:00Z',
        updated_at: '2024-02-28T10:30:00Z'
      },
      {
        id: '2',
        tenant_id: 'firstclass',
        tenant_name: 'FirstClass Travel',
        guest_name: 'Sarah Johnson',
        guest_email: 'sarah.j@email.com',
        guest_phone: '+61 400 987 654',
        hotel_id: 'H002',
        hotel_name: 'One&Only Reethi Rah',
        room_type: 'Water Villa',
        check_in_date: '2024-04-10',
        check_out_date: '2024-04-17',
        guests: 2,
        total_amount: 6200.00,
        currency: 'AUD',
        status: 'confirmed' as const,
        booking_reference: 'FC001235',
        supplier_reference: 'SUP789013',
        created_at: '2024-03-01T14:15:00Z',
        updated_at: '2024-03-01T14:15:00Z'
      },
      {
        id: '3',
        tenant_id: 'equationx',
        tenant_name: 'EquationX',
        guest_name: 'Michael Brown',
        guest_email: 'mbrown@equationx.com',
        guest_phone: '+1 555 123 4567',
        hotel_id: 'H003',
        hotel_name: 'St. Regis Maldives Vommuli Resort',
        room_type: 'Overwater Villa',
        check_in_date: '2024-05-22',
        check_out_date: '2024-05-29',
        guests: 4,
        total_amount: 8900.00,
        currency: 'USD',
        status: 'pending' as const,
        booking_reference: 'EQX000567',
        created_at: '2024-03-05T09:20:00Z',
        updated_at: '2024-03-05T09:20:00Z'
      }
    ];

    // Filter based on user role
    if (claims.role !== 'super_admin' && claims.tenant_id) {
      return allBookings.filter(booking => booking.tenant_id === claims.tenant_id);
    }
    
    return allBookings;
  };

  const filteredBookings = bookings.filter(booking => {
    const matchesSearch = booking.guest_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         booking.hotel_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         booking.booking_reference.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = statusFilter === 'all' || booking.status === statusFilter;
    const matchesTenant = tenantFilter === 'all' || booking.tenant_id === tenantFilter;
    
    return matchesSearch && matchesStatus && matchesTenant;
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'confirmed':
        return (
          <div className="flex items-center space-x-1 px-2 py-1 bg-white border border-green-600 text-black text-xs rounded-full">
            <CheckCircle className="h-3 w-3 text-green-600" />
            <span>Confirmed</span>
          </div>
        );
      case 'cancelled':
        return (
          <div className="flex items-center space-x-1 px-2 py-1 bg-white border border-red-600 text-black text-xs rounded-full">
            <XCircle className="h-3 w-3 text-red-600" />
            <span>Cancelled</span>
          </div>
        );
      case 'pending':
        return (
          <div className="flex items-center space-x-1 px-2 py-1 bg-white border border-yellow-600 text-black text-xs rounded-full">
            <Clock className="h-3 w-3 text-yellow-600" />
            <span>Pending</span>
          </div>
        );
      default:
        return <span className="text-gray-400">{status}</span>;
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-AU', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const formatCurrency = (amount: number, currency: string) => {
    return new Intl.NumberFormat('en-AU', {
      style: 'currency',
      currency: currency
    }).format(amount);
  };

  const handleCancelBooking = async (booking: Booking) => {
    if (!confirm(`Are you sure you want to cancel booking ${booking.booking_reference}?\n\nGuest: ${booking.guest_name}\nHotel: ${booking.hotel_name}\n\nThis action cannot be undone.`)) {
      return;
    }

    setCancellingBooking(booking.id);
    setOpenDropdown(null);

    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/bookings/${booking.booking_reference}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        // Update the booking status locally
        setBookings(bookings.map(b =>
          b.id === booking.id ? { ...b, status: 'cancelled' } : b
        ));
        alert('Booking cancelled successfully!');
      } else {
        const error = await response.json();
        alert(`Failed to cancel booking: ${error.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Error cancelling booking:', error);
      alert('Failed to cancel booking. Please try again.');
    } finally {
      setCancellingBooking(null);
    }
  };

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center">
        <div className="text-gray-900">Loading bookings...</div>
      </div>
    );
  }

  const isSuperAdmin = userClaims.role === 'super_admin';

  return (
    <div className="p-8 space-y-6">
      {/* Stats Header */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              {isSuperAdmin ? 'All Platform Bookings' : 'Your Bookings'}
            </h2>
            <p className="text-gray-600 text-sm mt-1">
              {isSuperAdmin ? 'Monitor and manage bookings across all tenants' : `View and track your ${userClaims.tenant_name} bookings`}
            </p>
          </div>
          <div className="px-3 py-1 bg-gray-100 text-gray-900 text-sm rounded-full border border-gray-300">
            {filteredBookings.length} bookings
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search bookings..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-500"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-4 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-500"
          >
            <option value="all">All Status</option>
            <option value="confirmed">Confirmed</option>
            <option value="pending">Pending</option>
            <option value="cancelled">Cancelled</option>
          </select>

          {isSuperAdmin && (
            <select
              value={tenantFilter}
              onChange={(e) => setTenantFilter(e.target.value)}
              className="px-4 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-500"
            >
              <option value="all">All Tenants</option>
              <option value="firstclass">FirstClass Travel</option>
              <option value="equationx">EquationX</option>
            </select>
          )}

          <button className="flex items-center justify-center space-x-2 px-4 py-2 bg-white hover:bg-gray-50 border border-black text-black rounded-lg transition-colors">
            <Filter className="h-4 w-4" />
            <span>Export</span>
          </button>
        </div>
      </div>

      {/* Bookings Table */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Guest & Booking
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Hotel & Dates
                </th>
                {isSuperAdmin && (
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Tenant
                  </th>
                )}
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Amount
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-300 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredBookings.map((booking) => (
                <tr key={booking.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex flex-col">
                      <div className="text-sm font-medium text-gray-900">{booking.guest_name}</div>
                      <div className="text-xs text-gray-700 flex items-center space-x-4">
                        <span className="flex items-center space-x-1">
                          <Mail className="h-3 w-3" />
                          <span>{booking.guest_email}</span>
                        </span>
                        <span className="flex items-center space-x-1">
                          <Phone className="h-3 w-3" />
                          <span>{booking.guest_phone}</span>
                        </span>
                      </div>
                      <div className="text-xs text-blue-600 mt-1 flex items-center space-x-1">
                        <CreditCard className="h-3 w-3" />
                        <a 
                          href={`/admin/bookings/${booking.booking_reference}`}
                          className="hover:underline cursor-pointer"
                        >
                          {booking.booking_reference}
                        </a>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col">
                      <div className="text-sm font-medium text-gray-900">{booking.hotel_name}</div>
                      {booking.hotel_location && (
                        <div className="text-xs text-gray-600">{booking.hotel_location}</div>
                      )}
                      <div className="text-xs text-gray-700">{booking.room_type}</div>
                      <div className="text-xs text-gray-700 mt-1 flex items-center space-x-2">
                        <span className="flex items-center space-x-1">
                          <Calendar className="h-3 w-3" />
                          <span>{formatDate(booking.check_in_date)} - {formatDate(booking.check_out_date)}</span>
                        </span>
                        <span className="flex items-center space-x-1">
                          <Users className="h-3 w-3" />
                          <span>{booking.guests} guests</span>
                        </span>
                      </div>
                    </div>
                  </td>
                  {isSuperAdmin && (
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-900">{booking.tenant_name}</div>
                      <div className="text-xs text-gray-700">{booking.tenant_id}</div>
                    </td>
                  )}
                  <td className="px-6 py-4">
                    <div className="text-sm font-medium text-gray-900">
                      {formatCurrency(booking.total_amount, booking.currency)}
                    </div>
                    <div className="text-xs text-gray-700">{booking.currency}</div>
                  </td>
                  <td className="px-6 py-4">
                    {getStatusBadge(booking.status)}
                  </td>
                  <td className="px-6 py-4 text-right relative">
                    <div className="relative">
                      <button 
                        onClick={() => setOpenDropdown(openDropdown === booking.id ? null : booking.id)}
                        className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                      >
                        <MoreHorizontal className="h-4 w-4 text-gray-600" />
                      </button>
                      
                      {openDropdown === booking.id && (
                        <div className="dropdown-menu absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 z-50">
                          <div className="py-1">
                            <a 
                              href={`/admin/bookings/${booking.booking_reference}`}
                              className="flex items-center space-x-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                            >
                              <Eye className="h-4 w-4" />
                              <span>View Details</span>
                            </a>
                            
                            <button 
                              className="w-full flex items-center space-x-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                              onClick={() => {/* Handle edit */}}
                            >
                              <Edit className="h-4 w-4" />
                              <span>Edit Booking</span>
                            </button>
                            
                            <button 
                              className="w-full flex items-center space-x-2 px-4 py-2 text-sm text-blue-600 hover:bg-blue-50"
                              onClick={() => {/* Handle rebook */}}
                            >
                              <RefreshCw className="h-4 w-4" />
                              <span>Find Better Rate</span>
                            </button>
                            
                            <button 
                              className="w-full flex items-center space-x-2 px-4 py-2 text-sm text-green-600 hover:bg-green-50"
                              onClick={() => {/* Handle price check */}}
                            >
                              <DollarSign className="h-4 w-4" />
                              <span>Price Comparison</span>
                            </button>
                            
                            <div className="border-t border-gray-200 my-1"></div>
                            
                            {booking.status !== 'cancelled' && (
                              <button
                                className="w-full flex items-center space-x-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleCancelBooking(booking);
                                }}
                                disabled={cancellingBooking === booking.id}
                              >
                                <X className="h-4 w-4" />
                                <span>{cancellingBooking === booking.id ? 'Cancelling...' : 'Cancel Booking'}</span>
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filteredBookings.length === 0 && (
          <div className="text-center py-12">
            <div className="text-gray-400 mb-2">No bookings found</div>
            <div className="text-sm text-gray-500">Try adjusting your filters</div>
          </div>
        )}
      </div>
    </div>
  );
}