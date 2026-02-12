'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Building2, Search } from 'lucide-react';

interface Hotel {
  id?: string;
  hotel_id: number;
  name: string;
  city: string;
  country: string;
  hotel_code?: string;
  hummingbird_code?: string;
}

interface HotelAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  onSelectHotel?: (hotel: Hotel) => void;
  placeholder?: string;
  className?: string;
}

export const HotelAutocomplete = ({
  value,
  onChange,
  onSelectHotel,
  placeholder = 'Search hotels...',
  className = ''
}: HotelAutocompleteProps) => {
  const [suggestions, setSuggestions] = useState<Hotel[]>([]);
  const [isDropdownVisible, setDropdownVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedHotel, setSelectedHotel] = useState<Hotel | null>(null);
  const [displayValue, setDisplayValue] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownVisible(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Search hotels using server-side API route
  const searchHotels = async (query: string) => {
    if (query.length < 2) {
      setSuggestions([]);
      setDropdownVisible(false);
      return;
    }

    setLoading(true);
    try {
      // Use server-side API route to hide Meilisearch credentials
      const response = await fetch('/api/search/hotels', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ q: query, limit: 20 })
      });

      if (response.ok) {
        const data = await response.json();
        const hotels = (data.hits || []).map((hotel: any) => ({
          hotel_id: hotel.hotel_id || parseInt(hotel.id),
          name: hotel.name,
          city: hotel.city,
          country: hotel.country,
          hotel_code: hotel.id, // Use Meilisearch 'id' as hotel_code
          hummingbird_code: hotel.hummingbird_code || hotel.id // Hummingbird supplier code
        }));
        setSuggestions(hotels);
        setDropdownVisible(true);
      } else {
        setSuggestions([]);
      }
    } catch (error) {
      console.error('Search error:', error);
      setSuggestions([]);
    } finally {
      setLoading(false);
    }
  };

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (displayValue && !selectedHotel) {
        searchHotels(displayValue);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [displayValue, selectedHotel]);

  const handleQueryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newQuery = e.target.value;
    setDisplayValue(newQuery);
    setSelectedHotel(null); // Clear selection when user types
    onChange(''); // Clear the hotel code
  };

  const handleSelect = (hotel: Hotel) => {
    // Prefer supplier code (hummingbird_code) if available, otherwise use hotel_id
    const hotelCode = hotel.hummingbird_code || hotel.hotel_code || hotel.hotel_id.toString();
    setSelectedHotel(hotel);
    setDisplayValue(hotel.name); // Just show hotel name
    onChange(hotelCode); // Pass hotel code to parent
    setDropdownVisible(false);
    setSuggestions([]);
    onSelectHotel?.(hotel);
  };

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={displayValue}
          onChange={handleQueryChange}
          onFocus={() => displayValue.length >= 2 && suggestions.length > 0 && !selectedHotel && setDropdownVisible(true)}
          placeholder={placeholder}
          className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
          {loading ? (
            <div className="animate-spin h-4 w-4 border-2 border-gray-300 border-t-blue-500 rounded-full" />
          ) : (
            <Search className="h-4 w-4 text-gray-400" />
          )}
        </div>
      </div>

      {isDropdownVisible && suggestions.length > 0 && (
        <ul className="absolute left-0 z-50 w-full bg-white border border-gray-200 rounded-lg mt-2 shadow-lg max-h-80 overflow-y-auto">
          {suggestions.map((hotel) => (
            <li
              key={hotel.hotel_id}
              onClick={() => handleSelect(hotel)}
              className="p-3 cursor-pointer hover:bg-blue-50 flex items-start border-b border-gray-100 last:border-0 transition-colors"
            >
              <Building2 className="h-4 w-4 text-blue-500 mr-3 mt-0.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gray-900 truncate">{hotel.name}</div>
                <div className="text-xs text-gray-500 mt-0.5">
                  <div className="mb-1">{hotel.city}, {hotel.country}</div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
                    <span className="font-mono text-blue-600 font-semibold">ID: {hotel.hotel_id}</span>
                    {hotel.hummingbird_code && hotel.hummingbird_code !== hotel.hotel_id.toString() && (
                      <>
                        <span className="text-gray-400">|</span>
                        <span className="font-mono text-purple-600">Supplier: {hotel.hummingbird_code}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {isDropdownVisible && !loading && displayValue.length >= 2 && suggestions.length === 0 && !selectedHotel && (
        <div className="absolute left-0 z-50 w-full bg-white border border-gray-200 rounded-lg mt-2 shadow-lg p-4 text-center text-sm text-gray-500">
          No hotels found
        </div>
      )}
    </div>
  );
};
