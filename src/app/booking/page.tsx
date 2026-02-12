'use client';

import React, { useState, useEffect } from 'react';
import { 
  Search, 
  Calendar, 
  Users, 
  MapPin, 
  Star,
  Heart,
  Filter,
  SlidersHorizontal,
  ChevronDown,
  Wifi,
  Car,
  Coffee,
  Waves,
  ArrowRight
} from 'lucide-react';

interface Hotel {
  id: string;
  name: string;
  description: string;
  location: string;
  rating: number;
  price_per_night: number;
  currency: string;
  image_url: string;
  amenities: string[];
  room_types: RoomType[];
}

interface RoomType {
  id: string;
  name: string;
  description: string;
  price_per_night: number;
  max_guests: number;
  amenities: string[];
}

interface SearchParams {
  destination: string;
  check_in: string;
  check_out: string;
  guests: number;
  rooms: number;
}

export default function BookingPage() {
  const [searchParams, setSearchParams] = useState<SearchParams>({
    destination: '',
    check_in: '',
    check_out: '',
    guests: 2,
    rooms: 1
  });
  
  const [hotels, setHotels] = useState<Hotel[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [selectedHotel, setSelectedHotel] = useState<Hotel | null>(null);
  const [showBookingForm, setShowBookingForm] = useState(false);

  // Mock hotel data - in production this would come from the API
  const mockHotels: Hotel[] = [
    {
      id: '1',
      name: 'Conrad Maldives Rangali Island',
      description: 'A luxury resort featuring overwater villas and pristine beaches in the heart of the Maldives',
      location: 'South Ari Atoll, Maldives',
      rating: 4.8,
      price_per_night: 2200,
      currency: 'AUD',
      image_url: '/api/placeholder/400/300',
      amenities: ['Pool', 'Spa', 'Restaurant', 'WiFi', 'Room Service'],
      room_types: [
        {
          id: 'beach-villa',
          name: 'Beach Villa',
          description: 'Spacious villa with direct beach access',
          price_per_night: 2200,
          max_guests: 3,
          amenities: ['Ocean View', 'Private Terrace', 'King Bed']
        },
        {
          id: 'water-villa',
          name: 'Water Villa',
          description: 'Overwater villa with glass floor panels',
          price_per_night: 3500,
          max_guests: 2,
          amenities: ['Water Access', 'Glass Floor', 'King Bed']
        }
      ]
    },
    {
      id: '2', 
      name: 'One&Only Reethi Rah',
      description: 'Ultra-luxury resort with expansive beaches and world-class amenities',
      location: 'North Malé Atoll, Maldives',
      rating: 4.9,
      price_per_night: 3100,
      currency: 'AUD',
      image_url: '/api/placeholder/400/300',
      amenities: ['Multiple Pools', 'Spa', 'Fine Dining', 'WiFi', 'Water Sports'],
      room_types: [
        {
          id: 'beach-villa-premium',
          name: 'Beach Villa with Pool',
          description: 'Premium beach villa with private pool',
          price_per_night: 3100,
          max_guests: 4,
          amenities: ['Private Pool', 'Beach Access', 'King Bed']
        }
      ]
    },
    {
      id: '3',
      name: 'St. Regis Maldives Vommuli Resort', 
      description: 'Sophisticated luxury resort with contemporary design and pristine natural beauty',
      location: 'Dhaalu Atoll, Maldives',
      rating: 4.7,
      price_per_night: 4450,
      currency: 'USD',
      image_url: '/api/placeholder/400/300',
      amenities: ['Infinity Pool', 'Spa', 'Butler Service', 'WiFi', 'Fine Dining'],
      room_types: [
        {
          id: 'overwater-villa',
          name: 'Overwater Villa',
          description: 'Stunning overwater villa with lagoon access',
          price_per_night: 4450,
          max_guests: 3,
          amenities: ['Water Access', 'Butler Service', 'King Bed']
        }
      ]
    }
  ];

  const handleSearch = async () => {
    if (!searchParams.destination || !searchParams.check_in || !searchParams.check_out) {
      alert('Please fill in all required fields');
      return;
    }

    setLoading(true);
    setSearched(true);

    try {
      // In production, this would call the hotel search API
      console.log('Searching hotels with params:', searchParams);
      
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // Filter mock data based on search params
      const filteredHotels = mockHotels.filter(hotel => 
        hotel.location.toLowerCase().includes(searchParams.destination.toLowerCase())
      );
      
      setHotels(filteredHotels.length > 0 ? filteredHotels : mockHotels);
    } catch (error) {
      console.error('Error searching hotels:', error);
      setHotels(mockHotels);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number, currency: string) => {
    return new Intl.NumberFormat('en-AU', {
      style: 'currency',
      currency: currency
    }).format(amount);
  };

  const calculateNights = () => {
    if (searchParams.check_in && searchParams.check_out) {
      const checkIn = new Date(searchParams.check_in);
      const checkOut = new Date(searchParams.check_out);
      const diffTime = Math.abs(checkOut.getTime() - checkIn.getTime());
      return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    }
    return 1;
  };

  const getAmenityIcon = (amenity: string) => {
    switch (amenity.toLowerCase()) {
      case 'wifi':
        return <Wifi className="h-4 w-4" />;
      case 'pool':
      case 'private pool':
        return <Waves className="h-4 w-4" />;
      case 'restaurant':
      case 'fine dining':
        return <Coffee className="h-4 w-4" />;
      case 'car':
      case 'parking':
        return <Car className="h-4 w-4" />;
      default:
        return <Star className="h-4 w-4" />;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-gray-900 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-sm">L</span>
              </div>
              <div>
                <h1 className="text-lg font-bold text-gray-900">LumenIQ Hotels</h1>
                <p className="text-xs text-gray-500">by FirstClass Travel</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Search Form */}
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6 mb-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-6">Search Hotels</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Destination
              </label>
              <div className="relative">
                <MapPin className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Where do you want to go?"
                  value={searchParams.destination}
                  onChange={(e) => setSearchParams({...searchParams, destination: e.target.value})}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Check-in
              </label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="date"
                  value={searchParams.check_in}
                  onChange={(e) => setSearchParams({...searchParams, check_in: e.target.value})}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Check-out
              </label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="date"
                  value={searchParams.check_out}
                  onChange={(e) => setSearchParams({...searchParams, check_out: e.target.value})}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Guests
              </label>
              <div className="relative">
                <Users className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <select
                  value={searchParams.guests}
                  onChange={(e) => setSearchParams({...searchParams, guests: parseInt(e.target.value)})}
                  className="w-full pl-10 pr-8 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500 appearance-none"
                >
                  <option value={1}>1 Guest</option>
                  <option value={2}>2 Guests</option>
                  <option value={3}>3 Guests</option>
                  <option value={4}>4 Guests</option>
                  <option value={5}>5+ Guests</option>
                </select>
                <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              </div>
            </div>
          </div>

          <button
            onClick={handleSearch}
            disabled={loading}
            className="w-full md:w-auto flex items-center justify-center space-x-2 px-8 py-3 bg-gray-900 hover:bg-gray-800 text-white rounded-lg transition-colors disabled:opacity-50"
          >
            <Search className="h-5 w-5" />
            <span>{loading ? 'Searching...' : 'Search Hotels'}</span>
          </button>
        </div>

        {/* Results */}
        {searched && (
          <div>
            {loading ? (
              <div className="text-center py-12">
                <div className="text-gray-600">Finding the best hotels for you...</div>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">
                      {hotels.length} hotels found
                    </h3>
                    <p className="text-sm text-gray-600">
                      {searchParams.destination && `in ${searchParams.destination} • `}
                      {searchParams.check_in && searchParams.check_out && 
                        `${calculateNights()} night${calculateNights() > 1 ? 's' : ''} • `
                      }
                      {searchParams.guests} guest{searchParams.guests > 1 ? 's' : ''}
                    </p>
                  </div>
                  
                  <button className="flex items-center space-x-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
                    <SlidersHorizontal className="h-4 w-4" />
                    <span>Filters</span>
                  </button>
                </div>

                <div className="space-y-6">
                  {hotels.map((hotel) => (
                    <div key={hotel.id} className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
                      <div className="p-6">
                        <div className="flex flex-col lg:flex-row lg:space-x-6">
                          {/* Hotel Image */}
                          <div className="lg:w-80 mb-4 lg:mb-0">
                            <div className="aspect-[4/3] bg-gray-100 rounded-lg overflow-hidden">
                              <div className="w-full h-full flex items-center justify-center text-gray-400">
                                Hotel Image
                              </div>
                            </div>
                          </div>

                          {/* Hotel Details */}
                          <div className="flex-1">
                            <div className="flex items-start justify-between mb-3">
                              <div>
                                <h4 className="text-xl font-semibold text-gray-900 mb-1">
                                  {hotel.name}
                                </h4>
                                <p className="text-sm text-gray-600 flex items-center">
                                  <MapPin className="h-4 w-4 mr-1" />
                                  {hotel.location}
                                </p>
                              </div>
                              
                              <div className="flex items-center space-x-2">
                                <div className="flex items-center space-x-1">
                                  <Star className="h-4 w-4 text-yellow-400 fill-current" />
                                  <span className="text-sm font-medium text-gray-900">
                                    {hotel.rating}
                                  </span>
                                </div>
                                <button className="p-2 hover:bg-gray-100 rounded-lg">
                                  <Heart className="h-4 w-4 text-gray-400" />
                                </button>
                              </div>
                            </div>

                            <p className="text-gray-600 text-sm mb-4 line-clamp-2">
                              {hotel.description}
                            </p>

                            {/* Amenities */}
                            <div className="flex flex-wrap gap-2 mb-4">
                              {hotel.amenities.slice(0, 4).map((amenity, index) => (
                                <div key={index} className="flex items-center space-x-1 px-2 py-1 bg-gray-100 rounded-lg">
                                  {getAmenityIcon(amenity)}
                                  <span className="text-xs text-gray-600">{amenity}</span>
                                </div>
                              ))}
                              {hotel.amenities.length > 4 && (
                                <div className="px-2 py-1 bg-gray-100 rounded-lg">
                                  <span className="text-xs text-gray-600">
                                    +{hotel.amenities.length - 4} more
                                  </span>
                                </div>
                              )}
                            </div>

                            {/* Price and Book Button */}
                            <div className="flex items-center justify-between">
                              <div>
                                <div className="text-2xl font-bold text-gray-900">
                                  {formatCurrency(hotel.price_per_night, hotel.currency)}
                                </div>
                                <div className="text-sm text-gray-600">per night</div>
                              </div>
                              
                              <button 
                                onClick={() => {
                                  setSelectedHotel(hotel);
                                  setShowBookingForm(true);
                                }}
                                className="flex items-center space-x-2 px-6 py-3 bg-gray-900 hover:bg-gray-800 text-white rounded-lg transition-colors"
                              >
                                <span>Book Now</span>
                                <ArrowRight className="h-4 w-4" />
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* Welcome Message */}
        {!searched && (
          <div className="text-center py-16">
            <div className="max-w-md mx-auto">
              <div className="w-16 h-16 bg-gray-900 rounded-full flex items-center justify-center mx-auto mb-6">
                <Search className="h-8 w-8 text-white" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-4">
                Find Your Perfect Stay
              </h2>
              <p className="text-gray-600 mb-8">
                Search through our curated collection of luxury hotels and resorts worldwide
              </p>
              <p className="text-sm text-gray-500">
                Enter your destination and dates above to get started
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Booking Modal - This would be expanded into a full booking flow */}
      {showBookingForm && selectedHotel && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-semibold text-gray-900">
                  Book {selectedHotel.name}
                </h3>
                <button
                  onClick={() => setShowBookingForm(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  ×
                </button>
              </div>
              
              <div className="text-center py-12">
                <p className="text-gray-600 mb-4">
                  Booking form would go here with:
                </p>
                <ul className="text-sm text-gray-500 space-y-2 text-left max-w-sm mx-auto">
                  <li>• Guest information form</li>
                  <li>• Room selection</li>
                  <li>• Payment processing</li>
                  <li>• Booking confirmation</li>
                  <li>• Integration with booking API</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}