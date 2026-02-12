'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Search,
  Filter,
  MapPin,
  Star,
  Building2,
  Eye,
  ArrowLeft,
  Globe,
  Users,
  Bed,
  Calendar,
  RefreshCw,
  ExternalLink,
  Sparkles,
  CheckCircle
} from 'lucide-react';

interface Hotel {
  hotel_id: number;
  name: string;
  address: string;
  city: string;
  country: string;
  latitude: number;
  longitude: number;
  star_rating: number;
  description: string;
  phone: string;
  email: string;
  website: string;
  amenities: string[];
  room_types: any[];
  images: string[];
  check_in_time: string;
  check_out_time: string;
  policies: any;
  created_at: string;
  updated_at: string;
}

export default function HotelBrowsePage() {
  const router = useRouter();
  const [hotels, setHotels] = useState<Hotel[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCountry, setSelectedCountry] = useState<string>('all');
  const [selectedStarRating, setSelectedStarRating] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalHotels, setTotalHotels] = useState(0);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [showFilters, setShowFilters] = useState(false);
  const [selectedHotel, setSelectedHotel] = useState<Hotel | null>(null);
  const [selectedHotels, setSelectedHotels] = useState<Set<number>>(new Set());
  const [importedHotels, setImportedHotels] = useState<Set<number>>(new Set());

  const hotelsPerPage = 12;

  useEffect(() => {
    loadHotels();
  }, [searchTerm, selectedCountry, selectedStarRating, currentPage]);

  const loadHotels = async () => {
    setLoading(true);
    try {
      const apiUrl = process.env.NEXT_PUBLIC_HOTEL_API_URL || 'http://localhost:8080';
      const params = new URLSearchParams();
      
      if (searchTerm) params.append('search', searchTerm);
      if (selectedCountry !== 'all') params.append('country', selectedCountry);
      if (selectedStarRating !== 'all') params.append('star_rating', selectedStarRating);
      params.append('page', currentPage.toString());
      params.append('limit', hotelsPerPage.toString());

      const response = await fetch(`${apiUrl}/api/hotels?${params.toString()}`);
      
      if (response.ok) {
        const data = await response.json();
        if (data.hotels) {
          setHotels(data.hotels);
          setTotalHotels(data.total || data.hotels.length);
        }
      }
    } catch (error) {
      console.error('Error loading hotels:', error);
    } finally {
      setLoading(false);
    }
  };

  const totalPages = Math.ceil(totalHotels / hotelsPerPage);
  const countries = [...new Set(hotels.map(hotel => hotel.country))];

  const handleEditEditorial = (hotel: Hotel) => {
    // Save hotel to localStorage for Editorial page to pick up
    localStorage.setItem('selectedEditorialHotel', JSON.stringify({
      hotel_id: hotel.hotel_id,
      name: hotel.name,
      city: hotel.city,
      country: hotel.country
    }));
    router.push('/admin/hotels/editorial');
  };

  const toggleHotelSelection = (hotelId: number) => {
    setSelectedHotels(prev => {
      const newSet = new Set(prev);
      if (newSet.has(hotelId)) {
        newSet.delete(hotelId);
      } else {
        newSet.add(hotelId);
      }
      return newSet;
    });
  };

  const selectAllVisible = () => {
    setSelectedHotels(prev => {
      const newSet = new Set(prev);
      hotels.forEach(hotel => newSet.add(hotel.hotel_id));
      return newSet;
    });
  };

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <button
              onClick={() => window.history.back()}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Browse Hotels</h2>
              <p className="text-gray-600 text-sm mt-1">
                Discover hotels in your inventory ({totalHotels.toLocaleString()} hotels available)
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <div className="flex flex-col lg:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search hotels by name, city, or country..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full pl-10 pr-4 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          
          <div className="flex gap-3">
            <select
              value={selectedCountry}
              onChange={(e) => {
                setSelectedCountry(e.target.value);
                setCurrentPage(1);
              }}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Countries</option>
              {countries.map(country => (
                <option key={country} value={country}>{country}</option>
              ))}
            </select>

            <select
              value={selectedStarRating}
              onChange={(e) => {
                setSelectedStarRating(e.target.value);
                setCurrentPage(1);
              }}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Ratings</option>
              <option value="5">5 Star</option>
              <option value="4">4 Star</option>
              <option value="3">3 Star</option>
              <option value="2">2 Star</option>
              <option value="1">1 Star</option>
            </select>

            <button
              onClick={selectAllVisible}
              className="flex items-center space-x-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
            >
              <CheckCircle className="h-4 w-4" />
              <span>Select All</span>
            </button>
          </div>
        </div>
      </div>

      {/* Hotel Grid */}
      <div className="bg-white border border-gray-200 rounded-lg">
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-900">
              Hotels ({loading ? '...' : totalHotels.toLocaleString()})
            </h3>
            <div className="flex items-center space-x-3">
              <span className="text-sm text-gray-500">
                Page {currentPage} of {totalPages}
              </span>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="h-8 w-8 animate-spin text-gray-400" />
            <span className="ml-3 text-gray-600">Loading hotels...</span>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 p-6">
              {hotels.map((hotel) => (
                <div key={hotel.hotel_id} className="border border-gray-200 rounded-lg overflow-hidden hover:shadow-md transition-shadow">
                  <div className="relative">
                    <div className="h-32 bg-gray-100 flex items-center justify-center">
                      <Building2 className="h-8 w-8 text-gray-400" />
                    </div>
                    <div className="absolute top-2 right-2">
                      <input
                        type="checkbox"
                        checked={selectedHotels.has(hotel.hotel_id)}
                        onChange={() => toggleHotelSelection(hotel.hotel_id)}
                        className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                      />
                    </div>
                    {importedHotels.has(hotel.hotel_id) && (
                      <div className="absolute top-2 left-2">
                        <CheckCircle className="h-4 w-4 text-green-600" />
                      </div>
                    )}
                  </div>
                  
                  <div className="p-4">
                    <div className="flex items-start justify-between mb-2">
                      <h4 className="font-medium text-gray-900 text-sm line-clamp-2">{hotel.name}</h4>
                    </div>
                    
                    <div className="flex items-center space-x-1 mb-2">
                      <MapPin className="h-3 w-3 text-gray-400" />
                      <span className="text-xs text-gray-600">{hotel.city}, {hotel.country}</span>
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-1">
                        {[...Array(hotel.star_rating || 0)].map((_, i) => (
                          <Star key={i} className="h-3 w-3 text-yellow-400 fill-current" />
                        ))}
                      </div>
                      <button
                        onClick={() => setSelectedHotel(hotel)}
                        className="p-1 hover:bg-gray-100 rounded"
                      >
                        <Eye className="h-4 w-4 text-gray-400" />
                      </button>
                    </div>

                    <div className="text-xs text-gray-500 mt-2">
                      ID: {hotel.hotel_id}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="border-t border-gray-200 px-6 py-4">
                <div className="flex items-center justify-between">
                  <button
                    onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                    disabled={currentPage === 1}
                    className="px-3 py-2 text-sm bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
                  >
                    Previous
                  </button>
                  
                  <div className="flex space-x-2">
                    {[...Array(Math.min(5, totalPages))].map((_, i) => {
                      const pageNum = Math.max(1, currentPage - 2) + i;
                      if (pageNum <= totalPages) {
                        return (
                          <button
                            key={pageNum}
                            onClick={() => setCurrentPage(pageNum)}
                            className={`px-3 py-2 text-sm rounded-lg ${
                              currentPage === pageNum 
                                ? 'bg-blue-600 text-white' 
                                : 'bg-white border border-gray-300 hover:bg-gray-50'
                            }`}
                          >
                            {pageNum}
                          </button>
                        );
                      }
                      return null;
                    })}
                  </div>

                  <button
                    onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                    disabled={currentPage === totalPages}
                    className="px-3 py-2 text-sm bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Hotel Detail Modal */}
      {selectedHotel && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-semibold text-gray-900">{selectedHotel.name}</h3>
                  <div className="flex items-center space-x-2 mt-1">
                    <MapPin className="h-4 w-4 text-gray-400" />
                    <span className="text-gray-600">{selectedHotel.address}</span>
                  </div>
                  <div className="flex items-center space-x-4 mt-2">
                    <div className="flex items-center space-x-1">
                      {[...Array(selectedHotel.star_rating || 0)].map((_, i) => (
                        <Star key={i} className="h-4 w-4 text-yellow-400 fill-current" />
                      ))}
                    </div>
                    <span className="text-sm text-gray-500">Hotel ID: {selectedHotel.hotel_id}</span>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedHotel(null)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  ×
                </button>
              </div>
            </div>

            <div className="p-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h4 className="font-medium text-gray-900 mb-3">Hotel Information</h4>
                  <div className="space-y-3 text-sm">
                    <div><strong>Phone:</strong> {selectedHotel.phone || 'Not available'}</div>
                    <div><strong>Email:</strong> {selectedHotel.email || 'Not available'}</div>
                    <div><strong>Website:</strong> 
                      {selectedHotel.website ? (
                        <a href={selectedHotel.website} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline ml-1">
                          {selectedHotel.website}
                        </a>
                      ) : ' Not available'}
                    </div>
                    <div><strong>Check-in:</strong> {selectedHotel.check_in_time || 'Not specified'}</div>
                    <div><strong>Check-out:</strong> {selectedHotel.check_out_time || 'Not specified'}</div>
                  </div>
                </div>

                <div>
                  <h4 className="font-medium text-gray-900 mb-3">Location</h4>
                  <div className="space-y-3 text-sm">
                    <div><strong>City:</strong> {selectedHotel.city}</div>
                    <div><strong>Country:</strong> {selectedHotel.country}</div>
                    <div><strong>Coordinates:</strong> {selectedHotel.latitude}, {selectedHotel.longitude}</div>
                  </div>
                </div>
              </div>

              {selectedHotel.description && (
                <div>
                  <h4 className="font-medium text-gray-900 mb-3">Description</h4>
                  <p className="text-gray-700 text-sm leading-relaxed">{selectedHotel.description}</p>
                </div>
              )}

              {selectedHotel.amenities && selectedHotel.amenities.length > 0 && (
                <div>
                  <h4 className="font-medium text-gray-900 mb-3">Amenities</h4>
                  <div className="flex flex-wrap gap-2">
                    {selectedHotel.amenities.map((amenity, index) => (
                      <span
                        key={index}
                        className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded-full"
                      >
                        {amenity}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200">
                <button
                  onClick={() => setSelectedHotel(null)}
                  className="px-4 py-2 text-gray-600 hover:text-gray-800"
                >
                  Close
                </button>
                <button
                  onClick={() => {
                    toggleHotelSelection(selectedHotel.hotel_id);
                    setSelectedHotel(null);
                  }}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  {selectedHotels.has(selectedHotel.hotel_id) ? 'Remove from Selection' : 'Add to Selection'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}