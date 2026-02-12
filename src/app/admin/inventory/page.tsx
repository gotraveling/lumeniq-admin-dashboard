'use client';

import React, { useState, useEffect } from 'react';
import { 
  Calendar, 
  Hotel, 
  Plus, 
  Search, 
  Filter, 
  TrendingUp, 
  DollarSign,
  AlertTriangle,
  MapPin,
  Users,
  Bed,
  Settings,
  Eye,
  Edit,
  Globe
} from 'lucide-react';

interface Hotel {
  master_hotel_id: string;
  hotel_name: string;
  hotel_location: string;
  hotel_country: string;
  hotel_city: string;
  star_rating: number;
  supplier_mappings: SupplierMapping[];
}

interface SupplierMapping {
  supplier_name: string;
  supplier_hotel_id: string;
  supplier_hotel_code: string;
  priority: number;
  is_active: boolean;
}

interface InventoryLevel {
  master_hotel_id: string;
  master_room_type_id: string;
  master_room_name: string;
  check_in_date: string;
  available_rooms: number;
  total_rooms: number;
  stop_sale: boolean;
  supplier_name: string;
  base_rate: number;
  rate_currency: string;
  last_updated: string;
}

export default function InventoryPage() {
  const [hotels, setHotels] = useState<Hotel[]>([]);
  const [selectedHotel, setSelectedHotel] = useState<Hotel | null>(null);
  const [inventory, setInventory] = useState<InventoryLevel[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState<'hotels' | 'calendar' | 'rates'>('hotels');

  useEffect(() => {
    fetchHotels();
  }, []);

  const fetchHotels = async () => {
    try {
      setLoading(true);
      
      // First try to fetch from booking engine API inventory endpoint
      const bookingEngineUrl = process.env.NEXT_PUBLIC_API_URL || 'https://booking-engine-api-91901273027.us-central1.run.app';
      let response = await fetch(`${bookingEngineUrl}/api/inventory/hotels`);
      
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.data && data.data.length > 0) {
          setHotels(data.data);
          return;
        }
      }
      
      // Fallback: Use Hotel API data and transform it for inventory management
      const hotelApiUrl = process.env.NEXT_PUBLIC_HOTEL_API_URL || 'http://localhost:8080';
      response = await fetch(`${hotelApiUrl}/api/hotels?limit=50`);
      
      if (response.ok) {
        const hotelData = await response.json();
        if (hotelData.hotels && hotelData.hotels.length > 0) {
          // Transform Hotel API data to match inventory interface
          const transformedHotels = hotelData.hotels.map((hotel: any) => ({
            master_hotel_id: hotel.hotel_id?.toString() || hotel.id?.toString(),
            hotel_name: hotel.name || 'Unknown Hotel',
            hotel_location: `${hotel.city || ''}, ${hotel.country || ''}`.trim().replace(/^,\s*|,\s*$/, ''),
            hotel_country: hotel.country || 'Unknown',
            hotel_city: hotel.city || 'Unknown',
            star_rating: 4, // Default star rating since not available in Hotel API
            supplier_mappings: [
              {
                supplier_name: 'Demo Supplier',
                supplier_hotel_id: hotel.hotel_id?.toString() || hotel.id?.toString(),
                supplier_hotel_code: `DEMO_${hotel.hotel_id || hotel.id}`,
                priority: 1,
                is_active: true
              }
            ]
          }));
          
          setHotels(transformedHotels);
        }
      }
    } catch (error) {
      console.error('Error fetching hotels:', error);
      // Set empty array to show "no hotels" state rather than loading forever
      setHotels([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchInventory = async (hotelId: string) => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const endDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]; // Next 30 days
      
      const bookingEngineUrl = process.env.NEXT_PUBLIC_API_URL || 'https://booking-engine-api-91901273027.us-central1.run.app';
      
      // Try to get real rates from Demo Supplier via booking engine
      try {
        const ratesResponse = await fetch(
          `${bookingEngineUrl}/api/search/rates/${hotelId}?checkIn=${today}&checkOut=${endDate}&adults=2&rooms=1`
        );
        
        if (ratesResponse.ok) {
          const ratesData = await ratesResponse.json();
          if (ratesData.success && ratesData.data && ratesData.data.roomTypes) {
            // Transform rates data into inventory format
            const inventoryData: InventoryLevel[] = [];
            
            ratesData.data.roomTypes.forEach((roomType: any) => {
              // Generate inventory for next 7 days
              for (let i = 0; i < 7; i++) {
                const date = new Date();
                date.setDate(date.getDate() + i);
                const checkInDate = date.toISOString().split('T')[0];
                
                inventoryData.push({
                  master_hotel_id: hotelId,
                  master_room_type_id: roomType.roomTypeCode || `ROOM_${i}`,
                  master_room_name: roomType.roomTypeName || roomType.name || 'Standard Room',
                  check_in_date: checkInDate,
                  available_rooms: roomType.availability?.available || Math.floor(Math.random() * 10) + 1,
                  total_rooms: roomType.availability?.total || 20,
                  stop_sale: false,
                  supplier_name: 'Demo Supplier',
                  base_rate: roomType.rates?.[0]?.total || roomType.price || 250,
                  rate_currency: roomType.rates?.[0]?.currency || 'USD',
                  last_updated: new Date().toISOString()
                });
              }
            });
            
            setInventory(inventoryData);
            return;
          }
        }
      } catch (error) {
        console.log('Could not fetch real rates, using demo data:', error);
      }
      
      // Fallback to demo inventory data
      const demoInventory: InventoryLevel[] = [
        {
          master_hotel_id: hotelId,
          master_room_type_id: 'STD',
          master_room_name: 'Standard Room',
          check_in_date: today,
          available_rooms: 8,
          total_rooms: 20,
          stop_sale: false,
          supplier_name: 'Demo Supplier',
          base_rate: 250,
          rate_currency: 'USD',
          last_updated: new Date().toISOString()
        },
        {
          master_hotel_id: hotelId,
          master_room_type_id: 'DLX',
          master_room_name: 'Deluxe Room',
          check_in_date: today,
          available_rooms: 5,
          total_rooms: 15,
          stop_sale: false,
          supplier_name: 'Demo Supplier',
          base_rate: 350,
          rate_currency: 'USD',
          last_updated: new Date().toISOString()
        },
        {
          master_hotel_id: hotelId,
          master_room_type_id: 'STE',
          master_room_name: 'Suite',
          check_in_date: today,
          available_rooms: 2,
          total_rooms: 10,
          stop_sale: false,
          supplier_name: 'Demo Supplier',
          base_rate: 550,
          rate_currency: 'USD',
          last_updated: new Date().toISOString()
        }
      ];
      
      setInventory(demoInventory);
    } catch (error) {
      console.error('Error fetching inventory:', error);
      setInventory([]);
    }
  };

  const handleHotelSelect = (hotel: Hotel) => {
    setSelectedHotel(hotel);
    fetchInventory(hotel.master_hotel_id);
    setViewMode('rates'); // Show rates view by default when selecting a hotel
  };

  const filteredHotels = hotels.filter(hotel =>
    hotel.hotel_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    hotel.hotel_city.toLowerCase().includes(searchTerm.toLowerCase()) ||
    hotel.hotel_country.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getSupplierCount = (mappings: SupplierMapping[]) => {
    return mappings?.filter(m => m.is_active).length || 0;
  };

  const getInventoryStats = () => {
    if (!inventory.length) return { totalRooms: 0, availableRooms: 0, occupancyRate: 0, avgRate: 0 };

    const totalRooms = inventory.reduce((sum, inv) => sum + inv.total_rooms, 0);
    const availableRooms = inventory.reduce((sum, inv) => sum + inv.available_rooms, 0);
    const occupancyRate = totalRooms > 0 ? ((totalRooms - availableRooms) / totalRooms) * 100 : 0;
    const avgRate = inventory.length > 0 ? inventory.reduce((sum, inv) => sum + inv.base_rate, 0) / inventory.length : 0;

    return { totalRooms, availableRooms, occupancyRate, avgRate };
  };

  const stats = getInventoryStats();

  const renderHotelsView = () => (
    <div className="space-y-6">
      {/* Search and Filters */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Hotel Portfolio</h3>
          <div className="flex items-center space-x-3">
            <button 
              onClick={() => window.location.href = '/admin/inventory/pricing'}
              className="flex items-center space-x-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
            >
              <DollarSign className="h-4 w-4" />
              <span>Pricing Rules</span>
            </button>
            <button 
              onClick={() => window.location.href = '/admin/inventory/mapping'}
              className="flex items-center space-x-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
            >
              <Globe className="h-4 w-4" />
              <span>Hotel Mapping</span>
            </button>
            <button 
              onClick={() => window.location.href = '/admin/inventory/browse'}
              className="flex items-center space-x-2 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors"
            >
              <Search className="h-4 w-4" />
              <span>Browse Hotels</span>
            </button>
            <button 
              onClick={() => window.location.href = '/admin/inventory/import'}
              className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus className="h-4 w-4" />
              <span>Import from Hotel API</span>
            </button>
            <button className="flex items-center space-x-2 px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors">
              <Plus className="h-4 w-4" />
              <span>Add Hotel Manually</span>
            </button>
          </div>
        </div>
        
        <div className="flex items-center space-x-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search hotels..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-500"
            />
          </div>
          <button className="flex items-center space-x-2 px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
            <Filter className="h-4 w-4" />
            <span>Filter</span>
          </button>
        </div>
      </div>

      {/* Hotels Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredHotels.map((hotel) => (
          <div
            key={hotel.master_hotel_id}
            className="bg-white border border-gray-200 rounded-lg p-6 hover:border-gray-400 transition-colors cursor-pointer"
            onClick={() => handleHotelSelect(hotel)}
          >
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <Hotel className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <h4 className="font-semibold text-gray-900">{hotel.hotel_name}</h4>
                  <div className="flex items-center space-x-1 text-sm text-gray-600">
                    <MapPin className="h-3 w-3" />
                    <span>{hotel.hotel_city}, {hotel.hotel_country}</span>
                  </div>
                </div>
              </div>
              <div className="text-right">
                <div className="flex items-center space-x-1">
                  {[...Array(hotel.star_rating)].map((_, i) => (
                    <span key={i} className="text-yellow-400">★</span>
                  ))}
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  {getSupplierCount(hotel.supplier_mappings)} suppliers
                </div>
              </div>
            </div>
            
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600">Hotel ID: {hotel.master_hotel_id}</span>
              <div className="flex items-center space-x-2">
                <button className="p-1 hover:bg-gray-100 rounded">
                  <Eye className="h-4 w-4 text-gray-400" />
                </button>
                <button className="p-1 hover:bg-gray-100 rounded">
                  <Edit className="h-4 w-4 text-gray-400" />
                </button>
                <button className="p-1 hover:bg-gray-100 rounded">
                  <Settings className="h-4 w-4 text-gray-400" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {filteredHotels.length === 0 && !loading && (
        <div className="text-center py-12">
          <Hotel className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <div className="text-gray-500 mb-2">No hotels found</div>
          <div className="text-sm text-gray-400">Try adjusting your search criteria</div>
        </div>
      )}
    </div>
  );

  const renderRatesView = () => (
    <div className="space-y-6">
      {/* Hotel Header */}
      {selectedHotel && (
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">{selectedHotel.hotel_name}</h3>
              <p className="text-gray-600">{selectedHotel.hotel_location}</p>
            </div>
            <div className="flex items-center space-x-4">
              <button
                onClick={() => setViewMode('hotels')}
                className="px-4 py-2 text-gray-600 hover:text-gray-900 transition-colors"
              >
                ← Back to Hotels
              </button>
              <button className="px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors">
                Update Rates
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Room Types & Rates */}
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
        {Array.from(new Set(inventory.map(item => item.master_room_type_id))).map((roomTypeId) => {
          const roomData = inventory.find(item => item.master_room_type_id === roomTypeId);
          if (!roomData) return null;
          
          const roomInventory = inventory.filter(item => item.master_room_type_id === roomTypeId);
          const avgRate = roomInventory.reduce((sum, item) => sum + item.base_rate, 0) / roomInventory.length;
          const totalAvailable = roomInventory.reduce((sum, item) => sum + item.available_rooms, 0);
          
          return (
            <div key={roomTypeId} className="bg-white border border-gray-200 rounded-lg p-6">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h4 className="text-lg font-semibold text-gray-900">{roomData.master_room_name}</h4>
                  <div className="text-sm text-gray-600 mt-1">
                    {roomTypeId} • {roomData.supplier_name}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold text-gray-900">${avgRate.toFixed(0)}</div>
                  <div className="text-sm text-gray-600">{roomData.rate_currency} / night</div>
                </div>
              </div>
              
              <div className="space-y-3">
                <div className="flex justify-between items-center py-2 border-b border-gray-100">
                  <span className="text-sm text-gray-600">Available Rooms</span>
                  <span className="text-sm font-medium text-gray-900">{totalAvailable}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-gray-100">
                  <span className="text-sm text-gray-600">Total Inventory</span>
                  <span className="text-sm font-medium text-gray-900">{roomData.total_rooms}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-gray-100">
                  <span className="text-sm text-gray-600">Occupancy</span>
                  <span className="text-sm font-medium text-gray-900">
                    {(((roomData.total_rooms - totalAvailable) / roomData.total_rooms) * 100).toFixed(1)}%
                  </span>
                </div>
                <div className="flex justify-between items-center py-2">
                  <span className="text-sm text-gray-600">Status</span>
                  <span className={`text-sm font-medium ${
                    roomData.stop_sale 
                      ? 'text-red-600' 
                      : totalAvailable <= 2 
                      ? 'text-yellow-600' 
                      : 'text-green-600'
                  }`}>
                    {roomData.stop_sale ? 'Stop Sale' : totalAvailable <= 2 ? 'Low Stock' : 'Available'}
                  </span>
                </div>
              </div>
              
              <div className="mt-4 pt-4 border-t border-gray-200">
                <div className="bg-gray-50 p-3 rounded-lg">
                  <div className="text-xs text-gray-600 mb-1">Rate Control:</div>
                  <div className="text-sm text-gray-800">
                    Rates shown include supplier base rate + your markup rules.
                    Manage via <strong>Pricing Rules</strong> (purple button above).
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {inventory.length === 0 && (
        <div className="text-center py-12">
          <DollarSign className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <div className="text-gray-500 mb-2">No rate data available</div>
          <div className="text-sm text-gray-400">Select a hotel to view room rates and pricing</div>
        </div>
      )}
    </div>
  );

  const renderCalendarView = () => (
    <div className="space-y-6">
      {/* Hotel Header */}
      {selectedHotel && (
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">{selectedHotel.hotel_name}</h3>
              <p className="text-gray-600">{selectedHotel.hotel_location}</p>
            </div>
            <div className="flex items-center space-x-4">
              <button
                onClick={() => setViewMode('hotels')}
                className="px-4 py-2 text-gray-600 hover:text-gray-900 transition-colors"
              >
                ← Back to Hotels
              </button>
              <button className="px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors">
                Update Inventory
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Bed className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <div className="text-2xl font-bold text-gray-900">{stats.totalRooms}</div>
              <div className="text-sm text-gray-600">Total Rooms</div>
            </div>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-green-100 rounded-lg">
              <Users className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <div className="text-2xl font-bold text-gray-900">{stats.availableRooms}</div>
              <div className="text-sm text-gray-600">Available</div>
            </div>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-yellow-100 rounded-lg">
              <TrendingUp className="h-5 w-5 text-yellow-600" />
            </div>
            <div>
              <div className="text-2xl font-bold text-gray-900">{stats.occupancyRate.toFixed(1)}%</div>
              <div className="text-sm text-gray-600">Occupancy</div>
            </div>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-purple-100 rounded-lg">
              <DollarSign className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <div className="text-2xl font-bold text-gray-900">${stats.avgRate.toFixed(0)}</div>
              <div className="text-sm text-gray-600">Avg Rate</div>
            </div>
          </div>
        </div>
      </div>

      {/* Inventory Calendar/Table */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-900">Inventory Calendar</h3>
            <div className="flex items-center space-x-2">
              <button className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50">Today</button>
              <button className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50">Next 7 Days</button>
              <button className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50">Next 30 Days</button>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Room Type</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Available</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Total</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Rate</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Supplier</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {inventory.map((item, index) => (
                <tr key={index} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div className="text-sm font-medium text-gray-900">{item.master_room_name}</div>
                    <div className="text-xs text-gray-500">{item.master_room_type_id}</div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-900">
                    {new Date(item.check_in_date).toLocaleDateString('en-AU', { 
                      month: 'short', 
                      day: 'numeric',
                      weekday: 'short'
                    })}
                  </td>
                  <td className="px-6 py-4">
                    <div className={`text-sm font-medium ${item.available_rooms <= 2 ? 'text-red-600' : 'text-gray-900'}`}>
                      {item.available_rooms}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-900">{item.total_rooms}</td>
                  <td className="px-6 py-4 text-sm text-gray-900">
                    ${item.base_rate} {item.rate_currency}
                  </td>
                  <td className="px-6 py-4">
                    <span className="px-2 py-1 text-xs bg-gray-100 text-gray-800 rounded-full">
                      {item.supplier_name}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    {item.stop_sale ? (
                      <span className="flex items-center space-x-1 text-red-600">
                        <AlertTriangle className="h-4 w-4" />
                        <span className="text-sm">Stop Sale</span>
                      </span>
                    ) : item.available_rooms <= 2 ? (
                      <span className="text-sm text-yellow-600">Low Stock</span>
                    ) : (
                      <span className="text-sm text-green-600">Available</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {inventory.length === 0 && (
          <div className="text-center py-12">
            <Calendar className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <div className="text-gray-500 mb-2">No inventory data available</div>
            <div className="text-sm text-gray-400">Check your supplier connections and try again</div>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Inventory Management</h2>
            <p className="text-gray-600 text-sm mt-1">
              Manage hotel inventory, room availability, and pricing across suppliers
            </p>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setViewMode('hotels')}
              className={`px-4 py-2 text-sm rounded-lg transition-colors ${
                viewMode === 'hotels' 
                  ? 'bg-gray-900 text-white' 
                  : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'
              }`}
            >
              Hotels
            </button>
            <button
              onClick={() => setViewMode('calendar')}
              disabled={!selectedHotel}
              className={`px-4 py-2 text-sm rounded-lg transition-colors ${
                viewMode === 'calendar' 
                  ? 'bg-gray-900 text-white' 
                  : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50'
              }`}
            >
              Calendar
            </button>
            <button
              onClick={() => setViewMode('rates')}
              disabled={!selectedHotel}
              className={`px-4 py-2 text-sm rounded-lg transition-colors ${
                viewMode === 'rates' 
                  ? 'bg-gray-900 text-white' 
                  : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50'
              }`}
            >
              Rates
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="text-center py-12">
          <div className="text-gray-500">Loading inventory data...</div>
        </div>
      ) : viewMode === 'hotels' ? (
        renderHotelsView()
      ) : viewMode === 'calendar' ? (
        renderCalendarView()
      ) : (
        renderRatesView()
      )}
    </div>
  );
}