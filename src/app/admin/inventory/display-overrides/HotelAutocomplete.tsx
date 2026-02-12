'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Hotel } from 'lucide-react';

const MEILI_HOST = process.env.NEXT_PUBLIC_MEILI_HOST || 'http://34.9.214.217:7700';
const MEILI_API_KEY = process.env.NEXT_PUBLIC_MEILI_SEARCH_API_KEY || '';

interface Hotel {
  id: string;
  name: string;
  city: string;
  country: string;
}

interface HotelAutocompleteProps {
  value: string;
  onValueChange: (value: string) => void;
  onHotelSelect: (hotelId: string) => void;
}

export const HotelAutocomplete = ({ value, onValueChange, onHotelSelect }: HotelAutocompleteProps) => {
  const [results, setResults] = useState<Hotel[]>([]);
  const [isDropdownVisible, setDropdownVisible] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setDropdownVisible(false);
      }
    };

    if (isDropdownVisible) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isDropdownVisible]);

  const searchMeilisearch = async (query: string) => {
    if (!query || query.length < 2) {
      setResults([]);
      setDropdownVisible(false);
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch(`${MEILI_HOST}/multi-search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${MEILI_API_KEY}`
        },
        body: JSON.stringify({
          queries: [
            {
              indexUid: 'hotels',
              q: query,
              limit: 10
            }
          ]
        })
      });

      if (!response.ok) {
        throw new Error('Search failed');
      }

      const data = await response.json();
      const hotelHits = data.results.find((result: any) => result.indexUid === 'hotels')?.hits || [];
      setResults(hotelHits);
      setDropdownVisible(true);
    } catch (error) {
      console.error('Meilisearch error:', error);
      setResults([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleQueryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newQuery = e.target.value;
    onValueChange(newQuery);

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      searchMeilisearch(newQuery);
    }, 300);
  };

  const handleSelect = (hotel: Hotel) => {
    onValueChange(hotel.name);
    onHotelSelect(hotel.id);
    setDropdownVisible(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isDropdownVisible || results.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => (prev < results.length - 1 ? prev + 1 : prev));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => (prev > 0 ? prev - 1 : -1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (selectedIndex >= 0 && selectedIndex < results.length) {
        handleSelect(results[selectedIndex]);
      }
    } else if (e.key === 'Escape') {
      setDropdownVisible(false);
      setSelectedIndex(-1);
    }
  };

  useEffect(() => {
    setSelectedIndex(-1);
  }, [results]);

  return (
    <div className="relative" ref={containerRef}>
      <input
        type="text"
        value={value}
        onChange={handleQueryChange}
        onKeyDown={handleKeyDown}
        placeholder="Search for a hotel..."
        className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
        autoComplete="off"
      />
      {isLoading && (
        <div className="absolute top-1/2 right-3 -translate-y-1/2 animate-spin h-4 w-4 border-2 border-gray-500 border-t-transparent rounded-full"></div>
      )}

      {isDropdownVisible && results.length > 0 && (
        <div className="absolute left-0 z-50 w-full bg-white border border-gray-200 rounded-lg mt-1 shadow-lg max-h-60 overflow-y-auto">
          {results.map((hotel, index) => {
            const isSelected = selectedIndex === index;
            return (
              <div
                key={hotel.id}
                onClick={() => handleSelect(hotel)}
                className={`px-3 py-2.5 cursor-pointer flex items-center text-sm transition-colors ${
                  isSelected ? 'bg-indigo-100' : 'hover:bg-gray-100'
                }`}
              >
                <Hotel className="h-4 w-4 text-gray-500 mr-3 flex-shrink-0" />
                <div>
                  <div className="font-medium">{hotel.name}</div>
                  <div className="text-xs text-gray-500">
                    {hotel.city}, {hotel.country}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
