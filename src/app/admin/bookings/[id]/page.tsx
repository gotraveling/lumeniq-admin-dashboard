'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { 
  ArrowLeft, 
  Calendar, 
  Users, 
  Phone, 
  Mail, 
  MapPin, 
  CreditCard, 
  Hotel, 
  Clock,
  Edit,
  X,
  RefreshCw,
  DollarSign,
  CheckCircle,
  XCircle
} from 'lucide-react';

interface BookingDetail {
  bookingId: string;
  status: string;
  guestInfo: any;
  contactInfo: any;
  bookingDetails: any;
  totalAmount: number;
  currency: string;
  confirmationNumber: string;
  cancellationNumber?: string;
  specialRequests?: string;
  createdAt: string;
  updatedAt: string;
  cancelledAt?: string;
}

export default function BookingDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [booking, setBooking] = useState<BookingDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);

  const bookingId = params.id as string;

  useEffect(() => {
    fetchBookingDetail();
  }, [bookingId]);

  const fetchBookingDetail = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/bookings/${bookingId}`);
      
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setBooking(data.data);
        } else {
          setError('Booking not found');
        }
      } else {
        setError('Failed to fetch booking details');
      }
    } catch (err) {
      setError('Network error occurred');
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'confirmed':
        return (
          <div className="flex items-center space-x-1 px-3 py-1 bg-white border border-green-600 text-black text-sm rounded-full">
            <CheckCircle className="h-4 w-4 text-green-600" />
            <span>Confirmed</span>
          </div>
        );
      case 'cancelled':
        return (
          <div className="flex items-center space-x-1 px-3 py-1 bg-white border border-red-600 text-black text-sm rounded-full">
            <XCircle className="h-4 w-4 text-red-600" />
            <span>Cancelled</span>
          </div>
        );
      case 'pending':
        return (
          <div className="flex items-center space-x-1 px-3 py-1 bg-white border border-yellow-600 text-black text-sm rounded-full">
            <Clock className="h-4 w-4 text-yellow-600" />
            <span>Pending</span>
          </div>
        );
      default:
        return <span className="text-gray-400">{status}</span>;
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const formatDateTime = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const handleCancelBooking = async () => {
    if (!booking) return;

    const guestName = `${booking.guestInfo.firstName} ${booking.guestInfo.lastName}`;
    const hotelName = `Hotel #${booking.bookingDetails?.hotelId}`;

    if (!confirm(`Are you sure you want to cancel this booking?\n\nBooking: ${booking.bookingId}\nGuest: ${guestName}\nHotel: ${hotelName}\n\nThis action cannot be undone.`)) {
      return;
    }

    setCancelling(true);

    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/bookings/${bookingId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        // Refresh booking details to show updated status
        await fetchBookingDetail();
        alert('Booking cancelled successfully!');
      } else {
        const errorData = await response.json();
        alert(`Failed to cancel booking: ${errorData.error || 'Unknown error'}`);
      }
    } catch (err) {
      console.error('Error cancelling booking:', err);
      alert('Failed to cancel booking. Please try again.');
    } finally {
      setCancelling(false);
    }
  };

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center">
        <div className="text-gray-900">Loading booking details...</div>
      </div>
    );
  }

  if (error || !booking) {
    return (
      <div className="p-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="text-red-800">
            <p className="font-medium">Error</p>
            <p className="text-sm">{error || 'Booking not found'}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <button 
            onClick={() => router.back()}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Booking Details</h1>
            <p className="text-gray-600">{booking.bookingId}</p>
          </div>
        </div>
        
        <div className="flex items-center space-x-3">
          {getStatusBadge(booking.status)}
          <div className="flex space-x-2">
            <button className="flex items-center space-x-1 px-3 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors">
              <Edit className="h-4 w-4" />
              <span>Edit</span>
            </button>
            <button className="flex items-center space-x-1 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
              <RefreshCw className="h-4 w-4" />
              <span>Find Better Rate</span>
            </button>
            {booking.status !== 'cancelled' && (
              <button
                onClick={handleCancelBooking}
                disabled={cancelling}
                className="flex items-center space-x-1 px-3 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <X className="h-4 w-4" />
                <span>{cancelling ? 'Cancelling...' : 'Cancel'}</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Booking Information */}
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
            <CreditCard className="h-5 w-5 mr-2" />
            Booking Information
          </h3>
          
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-gray-500">Booking ID</label>
              <p className="text-gray-900 font-mono">{booking.bookingId}</p>
            </div>
            
            <div>
              <label className="text-sm font-medium text-gray-500">Confirmation Number</label>
              <p className="text-gray-900 font-mono">{booking.confirmationNumber}</p>
            </div>
            
            {booking.cancellationNumber && (
              <div>
                <label className="text-sm font-medium text-gray-500">Cancellation Number</label>
                <p className="text-gray-900 font-mono">{booking.cancellationNumber}</p>
              </div>
            )}
            
            <div>
              <label className="text-sm font-medium text-gray-500">Total Amount</label>
              <p className="text-2xl font-bold text-gray-900">${booking.totalAmount} {booking.currency}</p>
            </div>
            
            <div>
              <label className="text-sm font-medium text-gray-500">Hotel</label>
              <p className="text-gray-900">Hotel #{booking.bookingDetails?.hotelId}</p>
            </div>
          </div>
        </div>

        {/* Guest Information */}
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
            <Users className="h-5 w-5 mr-2" />
            Guest Information
          </h3>
          
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-gray-500">Guest Name</label>
              <p className="text-gray-900">{booking.guestInfo.firstName} {booking.guestInfo.lastName}</p>
            </div>
            
            <div>
              <label className="text-sm font-medium text-gray-500 flex items-center">
                <Mail className="h-4 w-4 mr-1" />
                Email
              </label>
              <p className="text-gray-900">{booking.guestInfo.email}</p>
            </div>
            
            {booking.guestInfo.phone && (
              <div>
                <label className="text-sm font-medium text-gray-500 flex items-center">
                  <Phone className="h-4 w-4 mr-1" />
                  Phone
                </label>
                <p className="text-gray-900">{booking.guestInfo.phone}</p>
              </div>
            )}
          </div>
        </div>

        {/* Contact Information */}
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
            <MapPin className="h-5 w-5 mr-2" />
            Contact Information
          </h3>
          
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-gray-500">Contact Name</label>
              <p className="text-gray-900">{booking.contactInfo.firstName} {booking.contactInfo.lastName}</p>
            </div>
            
            <div>
              <label className="text-sm font-medium text-gray-500">Email</label>
              <p className="text-gray-900">{booking.contactInfo.email}</p>
            </div>
            
            {booking.contactInfo.phone && (
              <div>
                <label className="text-sm font-medium text-gray-500">Phone</label>
                <p className="text-gray-900">{booking.contactInfo.phone}</p>
              </div>
            )}
            
            {booking.contactInfo.address && (
              <div>
                <label className="text-sm font-medium text-gray-500">Address</label>
                <div className="text-gray-900">
                  {booking.contactInfo.address.street && <p>{booking.contactInfo.address.street}</p>}
                  <p>
                    {booking.contactInfo.address.city}
                    {booking.contactInfo.address.postalCode && `, ${booking.contactInfo.address.postalCode}`}
                  </p>
                  <p>{booking.contactInfo.address.country}</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Stay Details */}
        {booking.bookingDetails?.searchParams && (
          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
              <Hotel className="h-5 w-5 mr-2" />
              Stay Details
            </h3>
            
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-500 flex items-center">
                  <Calendar className="h-4 w-4 mr-1" />
                  Check-in Date
                </label>
                <p className="text-gray-900">{formatDate(booking.bookingDetails.searchParams.checkIn)}</p>
              </div>
              
              <div>
                <label className="text-sm font-medium text-gray-500 flex items-center">
                  <Calendar className="h-4 w-4 mr-1" />
                  Check-out Date
                </label>
                <p className="text-gray-900">{formatDate(booking.bookingDetails.searchParams.checkOut)}</p>
              </div>
              
              <div>
                <label className="text-sm font-medium text-gray-500 flex items-center">
                  <Users className="h-4 w-4 mr-1" />
                  Guests
                </label>
                <p className="text-gray-900">
                  {booking.bookingDetails.searchParams.adults} adults
                  {booking.bookingDetails.searchParams.children > 0 && `, ${booking.bookingDetails.searchParams.children} children`}
                </p>
              </div>
              
              <div>
                <label className="text-sm font-medium text-gray-500">Rooms</label>
                <p className="text-gray-900">{booking.bookingDetails.searchParams.rooms}</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Additional Information */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Additional Information</h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {booking.specialRequests && (
            <div>
              <label className="text-sm font-medium text-gray-500">Special Requests</label>
              <p className="text-gray-900 bg-gray-50 p-3 rounded-lg">{booking.specialRequests}</p>
            </div>
          )}
          
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-gray-500 flex items-center">
                <Clock className="h-4 w-4 mr-1" />
                Created At
              </label>
              <p className="text-gray-900">{formatDateTime(booking.createdAt)}</p>
            </div>
            
            <div>
              <label className="text-sm font-medium text-gray-500 flex items-center">
                <Clock className="h-4 w-4 mr-1" />
                Last Updated
              </label>
              <p className="text-gray-900">{formatDateTime(booking.updatedAt)}</p>
            </div>
            
            {booking.cancelledAt && (
              <div>
                <label className="text-sm font-medium text-gray-500 flex items-center">
                  <Clock className="h-4 w-4 mr-1" />
                  Cancelled At
                </label>
                <p className="text-gray-900">{formatDateTime(booking.cancelledAt)}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}