'use client';

import React, { useState, useEffect } from 'react';
import {
  Search,
  Image,
  Video,
  Star,
  Tag,
  FileText,
  Plus,
  X,
  Edit,
  Save,
  Youtube,
  Award,
  Sparkles
} from 'lucide-react';

const HOTEL_API_URL = process.env.NEXT_PUBLIC_HOTEL_API_URL || 'https://hotel-api-91901273027.us-central1.run.app';

interface Hotel {
  hotel_id: number;
  name: string;
  city: string;
  country: string;
}

interface EditorialMedia {
  id?: number;
  hotel_id: number;
  media_type: 'image' | 'video' | 'youtube';
  media_url: string;
  title: string;
  caption?: string;
  sort_order: number;
  is_featured: boolean;
}

interface EditorialReview {
  id?: number;
  hotel_id: number;
  reviewer_name: string;
  reviewer_title?: string;
  reviewer_avatar_url?: string;
  rating: number;
  review_title: string;
  review_text: string;
  review_date?: string;
  is_featured: boolean;
}

interface EditorialOverrides {
  hotel_id: number;
  title_override?: string;
  subtitle?: string;
  description_override?: string;
  highlight_text?: string;
  seo_title?: string;
  seo_description?: string;
  seo_keywords?: string[];
  is_featured: boolean;
  featured_badge?: string;
  feature_priority?: number;
}

interface EditorialTag {
  id: number;
  tag_name: string;
  tag_type: string;
  description?: string;
  icon_name?: string;
}

export default function HotelEditorialPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [hotels, setHotels] = useState<Hotel[]>([]);
  const [selectedHotel, setSelectedHotel] = useState<Hotel | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'media' | 'reviews' | 'overrides' | 'tags'>('overrides');
  const [recentHotels, setRecentHotels] = useState<Hotel[]>([]);

  // Editorial content state
  const [media, setMedia] = useState<EditorialMedia[]>([]);
  const [reviews, setReviews] = useState<EditorialReview[]>([]);
  const [overrides, setOverrides] = useState<EditorialOverrides | null>(null);
  const [hotelTags, setHotelTags] = useState<EditorialTag[]>([]);
  const [availableTags, setAvailableTags] = useState<EditorialTag[]>([]);

  // Form states
  const [showMediaForm, setShowMediaForm] = useState(false);
  const [showReviewForm, setShowReviewForm] = useState(false);
  const [newMedia, setNewMedia] = useState<Partial<EditorialMedia>>({
    media_type: 'image',
    sort_order: 0,
    is_featured: false
  });
  const [newReview, setNewReview] = useState<Partial<EditorialReview>>({
    rating: 5,
    is_featured: false
  });

  // Load recent hotels from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem('recentEditorialHotels');
    if (stored) {
      try {
        setRecentHotels(JSON.parse(stored));
      } catch (e) {
        console.error('Error loading recent hotels:', e);
      }
    }
  }, []);

  // Search hotels
  const searchHotels = async () => {
    if (!searchTerm) return;

    setLoading(true);
    try {
      const response = await fetch(`${HOTEL_API_URL}/api/hotels/search?query=${encodeURIComponent(searchTerm)}&limit=10`);
      const data = await response.json();
      setHotels(data.hotels || []);
    } catch (error) {
      console.error('Error searching hotels:', error);
    } finally {
      setLoading(false);
    }
  };

  // Load editorial content for selected hotel
  const loadEditorialContent = async (hotelId: number) => {
    try {
      const [editorialResponse, tagsResponse] = await Promise.all([
        fetch(`${HOTEL_API_URL}/api/editorial/hotels/${hotelId}`),
        fetch(`${HOTEL_API_URL}/api/editorial/tags`)
      ]);

      const editorialData = await editorialResponse.json();
      const tagsData = await tagsResponse.json();

      if (editorialData.success) {
        setMedia(editorialData.data.media || []);
        setReviews(editorialData.data.reviews || []);
        setOverrides(editorialData.data.overrides);
        setHotelTags(editorialData.data.tags || []);
      }

      if (tagsData.success) {
        setAvailableTags(tagsData.data || []);
      }
    } catch (error) {
      console.error('Error loading editorial content:', error);
    }
  };

  // Select hotel
  const handleSelectHotel = (hotel: Hotel) => {
    setSelectedHotel(hotel);
    loadEditorialContent(hotel.hotel_id);

    // Save to recent hotels (keep last 5)
    const updated = [hotel, ...recentHotels.filter(h => h.hotel_id !== hotel.hotel_id)].slice(0, 5);
    setRecentHotels(updated);
    localStorage.setItem('recentEditorialHotels', JSON.stringify(updated));
  };

  // Save media
  const handleSaveMedia = async () => {
    if (!selectedHotel || !newMedia.media_url) return;

    try {
      const response = await fetch(`${HOTEL_API_URL}/api/editorial/hotels/${selectedHotel.hotel_id}/media`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...newMedia,
          created_by: 'admin@firstclass.com.au'
        })
      });

      if (response.ok) {
        loadEditorialContent(selectedHotel.hotel_id);
        setShowMediaForm(false);
        setNewMedia({ media_type: 'image', sort_order: 0, is_featured: false });
      }
    } catch (error) {
      console.error('Error saving media:', error);
    }
  };

  // Delete media
  const handleDeleteMedia = async (mediaId: number) => {
    if (!confirm('Delete this media?')) return;

    try {
      await fetch(`${HOTEL_API_URL}/api/editorial/media/${mediaId}`, {
        method: 'DELETE'
      });
      if (selectedHotel) {
        loadEditorialContent(selectedHotel.hotel_id);
      }
    } catch (error) {
      console.error('Error deleting media:', error);
    }
  };

  // Save review
  const handleSaveReview = async () => {
    if (!selectedHotel || !newReview.reviewer_name || !newReview.review_text) return;

    try {
      const response = await fetch(`${HOTEL_API_URL}/api/editorial/hotels/${selectedHotel.hotel_id}/reviews`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...newReview,
          review_date: new Date().toISOString().split('T')[0],
          created_by: 'admin@firstclass.com.au'
        })
      });

      if (response.ok) {
        loadEditorialContent(selectedHotel.hotel_id);
        setShowReviewForm(false);
        setNewReview({ rating: 5, is_featured: false });
      }
    } catch (error) {
      console.error('Error saving review:', error);
    }
  };

  // Delete review
  const handleDeleteReview = async (reviewId: number) => {
    if (!confirm('Delete this review?')) return;

    try {
      await fetch(`${HOTEL_API_URL}/api/editorial/reviews/${reviewId}`, {
        method: 'DELETE'
      });
      if (selectedHotel) {
        loadEditorialContent(selectedHotel.hotel_id);
      }
    } catch (error) {
      console.error('Error deleting review:', error);
    }
  };

  // Save overrides
  const handleSaveOverrides = async () => {
    if (!selectedHotel || !overrides) return;

    try {
      const response = await fetch(`${HOTEL_API_URL}/api/editorial/hotels/${selectedHotel.hotel_id}/overrides`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...overrides,
          updated_by: 'admin@firstclass.com.au'
        })
      });

      if (response.ok) {
        alert('Overrides saved successfully!');
      }
    } catch (error) {
      console.error('Error saving overrides:', error);
    }
  };

  // Toggle tag
  const handleToggleTag = async (tagId: number) => {
    if (!selectedHotel) return;

    const isCurrentlyTagged = hotelTags.some(t => t.id === tagId);

    try {
      if (isCurrentlyTagged) {
        await fetch(`${HOTEL_API_URL}/api/editorial/hotels/${selectedHotel.hotel_id}/tags/${tagId}`, {
          method: 'DELETE'
        });
      } else {
        await fetch(`${HOTEL_API_URL}/api/editorial/hotels/${selectedHotel.hotel_id}/tags`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tag_ids: [tagId],
            added_by: 'admin@firstclass.com.au'
          })
        });
      }
      loadEditorialContent(selectedHotel.hotel_id);
    } catch (error) {
      console.error('Error toggling tag:', error);
    }
  };

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-2">Hotel Editorial Content</h1>
        <p className="text-gray-600">Manage additional content, media, reviews, and overrides for hotels</p>
      </div>

      {/* Hotel Search */}
      {!selectedHotel && (
        <>
          {/* Recently Edited Hotels */}
          {recentHotels.length > 0 && (
            <div className="bg-white rounded-lg shadow p-6 mb-6">
              <h2 className="text-lg font-semibold mb-4">Recently Edited</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {recentHotels.map(hotel => (
                  <div
                    key={hotel.hotel_id}
                    onClick={() => handleSelectHotel(hotel)}
                    className="p-4 border border-blue-200 bg-blue-50 rounded-lg hover:bg-blue-100 cursor-pointer transition-colors"
                  >
                    <div className="font-semibold text-gray-900">{hotel.name}</div>
                    <div className="text-sm text-gray-600">{hotel.city}, {hotel.country}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Search Section */}
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <h2 className="text-lg font-semibold mb-4">Search Hotels</h2>
            <div className="flex gap-4">
              <div className="flex-1">
                <input
                  type="text"
                  placeholder="Search hotels by name, city, or country..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && searchHotels()}
                  className="w-full px-4 py-2 border rounded-lg"
                />
              </div>
              <button
                onClick={searchHotels}
                disabled={loading}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
              >
                <Search className="w-4 h-4" />
                Search
              </button>
            </div>

            {hotels.length > 0 && (
              <div className="mt-4 space-y-2">
                {hotels.map(hotel => (
                  <div
                    key={hotel.hotel_id}
                    onClick={() => handleSelectHotel(hotel)}
                    className="p-4 border rounded-lg hover:bg-gray-50 cursor-pointer"
                  >
                    <div className="font-semibold">{hotel.name}</div>
                    <div className="text-sm text-gray-600">{hotel.city}, {hotel.country}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* Selected Hotel Editor */}
      {selectedHotel && (
        <div>
          {/* Hotel Header */}
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <div className="flex justify-between items-start">
              <div>
                <h2 className="text-xl font-bold">{selectedHotel.name}</h2>
                <p className="text-gray-600">{selectedHotel.city}, {selectedHotel.country}</p>
              </div>
              <button
                onClick={() => setSelectedHotel(null)}
                className="text-gray-500 hover:text-gray-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div className="bg-white rounded-lg shadow mb-6">
            <div className="border-b">
              <div className="flex">
                <button
                  onClick={() => setActiveTab('overrides')}
                  className={`px-6 py-3 font-medium ${
                    activeTab === 'overrides'
                      ? 'border-b-2 border-blue-600 text-blue-600'
                      : 'text-gray-600'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4" />
                    Overrides & SEO
                  </div>
                </button>
                <button
                  onClick={() => setActiveTab('media')}
                  className={`px-6 py-3 font-medium ${
                    activeTab === 'media'
                      ? 'border-b-2 border-blue-600 text-blue-600'
                      : 'text-gray-600'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Image className="w-4 h-4" />
                    Media ({media.length})
                  </div>
                </button>
                <button
                  onClick={() => setActiveTab('reviews')}
                  className={`px-6 py-3 font-medium ${
                    activeTab === 'reviews'
                      ? 'border-b-2 border-blue-600 text-blue-600'
                      : 'text-gray-600'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Star className="w-4 h-4" />
                    Reviews ({reviews.length})
                  </div>
                </button>
                <button
                  onClick={() => setActiveTab('tags')}
                  className={`px-6 py-3 font-medium ${
                    activeTab === 'tags'
                      ? 'border-b-2 border-blue-600 text-blue-600'
                      : 'text-gray-600'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Tag className="w-4 h-4" />
                    Tags ({hotelTags.length})
                  </div>
                </button>
              </div>
            </div>

            {/* Tab Content */}
            <div className="p-6">
              {/* Overrides Tab */}
              {activeTab === 'overrides' && (
                <div className="space-y-6">
                  <div>
                    <label className="block text-sm font-medium mb-2">Title Override</label>
                    <input
                      type="text"
                      value={overrides?.title_override || ''}
                      onChange={(e) => setOverrides({ ...overrides, hotel_id: selectedHotel.hotel_id, title_override: e.target.value, is_featured: overrides?.is_featured || false })}
                      placeholder="Custom hotel title..."
                      className="w-full px-4 py-2 border rounded-lg"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2">Subtitle</label>
                    <input
                      type="text"
                      value={overrides?.subtitle || ''}
                      onChange={(e) => setOverrides({ ...overrides, hotel_id: selectedHotel.hotel_id, subtitle: e.target.value, is_featured: overrides?.is_featured || false })}
                      placeholder="e.g., Paradise Awaits..."
                      className="w-full px-4 py-2 border rounded-lg"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2">Description Override</label>
                    <textarea
                      value={overrides?.description_override || ''}
                      onChange={(e) => setOverrides({ ...overrides, hotel_id: selectedHotel.hotel_id, description_override: e.target.value, is_featured: overrides?.is_featured || false })}
                      placeholder="Enhanced description..."
                      rows={4}
                      className="w-full px-4 py-2 border rounded-lg"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2">Highlight Text</label>
                    <input
                      type="text"
                      value={overrides?.highlight_text || ''}
                      onChange={(e) => setOverrides({ ...overrides, hotel_id: selectedHotel.hotel_id, highlight_text: e.target.value, is_featured: overrides?.is_featured || false })}
                      placeholder="Special offer or highlight..."
                      className="w-full px-4 py-2 border rounded-lg"
                    />
                  </div>

                  <div className="border-t pt-6">
                    <h3 className="font-semibold mb-4">Featured Settings</h3>

                    <div className="flex items-center gap-4 mb-4">
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={overrides?.is_featured || false}
                          onChange={(e) => setOverrides({ ...overrides, hotel_id: selectedHotel.hotel_id, is_featured: e.target.checked })}
                          className="w-4 h-4"
                        />
                        <span>Mark as Featured Hotel</span>
                      </label>
                    </div>

                    {overrides?.is_featured && (
                      <>
                        <div className="mb-4">
                          <label className="block text-sm font-medium mb-2">Featured Badge</label>
                          <input
                            type="text"
                            value={overrides?.featured_badge || ''}
                            onChange={(e) => setOverrides({ ...overrides, featured_badge: e.target.value })}
                            placeholder="e.g., Editor's Pick, Best Value"
                            className="w-full px-4 py-2 border rounded-lg"
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-medium mb-2">Feature Priority (higher = more prominent)</label>
                          <input
                            type="number"
                            value={overrides?.feature_priority || 0}
                            onChange={(e) => setOverrides({ ...overrides, feature_priority: parseInt(e.target.value) })}
                            min="0"
                            max="100"
                            className="w-full px-4 py-2 border rounded-lg"
                          />
                        </div>
                      </>
                    )}
                  </div>

                  <div className="border-t pt-6">
                    <h3 className="font-semibold mb-4">SEO Settings</h3>

                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium mb-2">SEO Title</label>
                        <input
                          type="text"
                          value={overrides?.seo_title || ''}
                          onChange={(e) => setOverrides({ ...overrides, hotel_id: selectedHotel.hotel_id, seo_title: e.target.value, is_featured: overrides?.is_featured || false })}
                          placeholder="SEO optimized title..."
                          className="w-full px-4 py-2 border rounded-lg"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium mb-2">SEO Description</label>
                        <textarea
                          value={overrides?.seo_description || ''}
                          onChange={(e) => setOverrides({ ...overrides, hotel_id: selectedHotel.hotel_id, seo_description: e.target.value, is_featured: overrides?.is_featured || false })}
                          placeholder="SEO meta description..."
                          rows={3}
                          className="w-full px-4 py-2 border rounded-lg"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium mb-2">SEO Keywords (comma separated)</label>
                        <input
                          type="text"
                          value={overrides?.seo_keywords?.join(', ') || ''}
                          onChange={(e) => setOverrides({ ...overrides, hotel_id: selectedHotel.hotel_id, seo_keywords: e.target.value.split(',').map(k => k.trim()), is_featured: overrides?.is_featured || false })}
                          placeholder="luxury, maldives, resort..."
                          className="w-full px-4 py-2 border rounded-lg"
                        />
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={handleSaveOverrides}
                    className="w-full px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center justify-center gap-2"
                  >
                    <Save className="w-4 h-4" />
                    Save Overrides
                  </button>
                </div>
              )}

              {/* Media Tab - Continued in next part due to length */}
              {activeTab === 'media' && (
                <div>
                  <div className="flex justify-between items-center mb-6">
                    <h3 className="font-semibold">Media Gallery</h3>
                    <button
                      onClick={() => setShowMediaForm(!showMediaForm)}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
                    >
                      <Plus className="w-4 h-4" />
                      Add Media
                    </button>
                  </div>

                  {showMediaForm && (
                    <div className="bg-gray-50 p-4 rounded-lg mb-6 space-y-4">
                      <div>
                        <label className="block text-sm font-medium mb-2">Media Type</label>
                        <select
                          value={newMedia.media_type}
                          onChange={(e) => setNewMedia({ ...newMedia, media_type: e.target.value as any })}
                          className="w-full px-4 py-2 border rounded-lg"
                        >
                          <option value="image">Image</option>
                          <option value="youtube">YouTube Video</option>
                          <option value="video">Video URL</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-sm font-medium mb-2">
                          {newMedia.media_type === 'youtube' ? 'YouTube URL' : 'Media URL'}
                        </label>
                        <input
                          type="text"
                          value={newMedia.media_url || ''}
                          onChange={(e) => setNewMedia({ ...newMedia, media_url: e.target.value })}
                          placeholder={newMedia.media_type === 'youtube' ? 'https://www.youtube.com/watch?v=...' : 'https://...'}
                          className="w-full px-4 py-2 border rounded-lg"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium mb-2">Title</label>
                        <input
                          type="text"
                          value={newMedia.title || ''}
                          onChange={(e) => setNewMedia({ ...newMedia, title: e.target.value })}
                          placeholder="Media title..."
                          className="w-full px-4 py-2 border rounded-lg"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium mb-2">Caption</label>
                        <input
                          type="text"
                          value={newMedia.caption || ''}
                          onChange={(e) => setNewMedia({ ...newMedia, caption: e.target.value })}
                          placeholder="Caption or description..."
                          className="w-full px-4 py-2 border rounded-lg"
                        />
                      </div>

                      <div className="flex items-center gap-4">
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={newMedia.is_featured || false}
                            onChange={(e) => setNewMedia({ ...newMedia, is_featured: e.target.checked })}
                            className="w-4 h-4"
                          />
                          <span>Featured Media</span>
                        </label>
                      </div>

                      <div className="flex gap-2">
                        <button
                          onClick={handleSaveMedia}
                          className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                        >
                          Save Media
                        </button>
                        <button
                          onClick={() => setShowMediaForm(false)}
                          className="px-4 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {media.map(item => (
                      <div key={item.id} className="border rounded-lg p-4">
                        <div className="flex justify-between items-start mb-2">
                          <div className="flex items-center gap-2">
                            {item.media_type === 'youtube' && <Youtube className="w-5 h-5 text-red-600" />}
                            {item.media_type === 'image' && <Image className="w-5 h-5 text-blue-600" />}
                            {item.media_type === 'video' && <Video className="w-5 h-5 text-purple-600" />}
                            <span className="font-medium">{item.title}</span>
                          </div>
                          <button
                            onClick={() => handleDeleteMedia(item.id!)}
                            className="text-red-600 hover:text-red-700"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                        {item.caption && (
                          <p className="text-sm text-gray-600 mb-2">{item.caption}</p>
                        )}
                        <div className="text-xs text-gray-500 truncate">{item.media_url}</div>
                        {item.is_featured && (
                          <span className="inline-block mt-2 px-2 py-1 bg-yellow-100 text-yellow-800 text-xs rounded">
                            Featured
                          </span>
                        )}
                      </div>
                    ))}
                  </div>

                  {media.length === 0 && (
                    <div className="text-center text-gray-500 py-8">
                      No media added yet. Click "Add Media" to get started.
                    </div>
                  )}
                </div>
              )}

              {/* Reviews Tab */}
              {activeTab === 'reviews' && (
                <div>
                  <div className="flex justify-between items-center mb-6">
                    <h3 className="font-semibold">Editorial Reviews</h3>
                    <button
                      onClick={() => setShowReviewForm(!showReviewForm)}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
                    >
                      <Plus className="w-4 h-4" />
                      Add Review
                    </button>
                  </div>

                  {showReviewForm && (
                    <div className="bg-gray-50 p-4 rounded-lg mb-6 space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium mb-2">Reviewer Name*</label>
                          <input
                            type="text"
                            value={newReview.reviewer_name || ''}
                            onChange={(e) => setNewReview({ ...newReview, reviewer_name: e.target.value })}
                            placeholder="Jane Smith"
                            className="w-full px-4 py-2 border rounded-lg"
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-medium mb-2">Title</label>
                          <input
                            type="text"
                            value={newReview.reviewer_title || ''}
                            onChange={(e) => setNewReview({ ...newReview, reviewer_title: e.target.value })}
                            placeholder="Senior Travel Editor"
                            className="w-full px-4 py-2 border rounded-lg"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-medium mb-2">Rating (0-5)</label>
                        <input
                          type="number"
                          value={newReview.rating || 5}
                          onChange={(e) => setNewReview({ ...newReview, rating: parseFloat(e.target.value) })}
                          min="0"
                          max="5"
                          step="0.1"
                          className="w-full px-4 py-2 border rounded-lg"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium mb-2">Review Title*</label>
                        <input
                          type="text"
                          value={newReview.review_title || ''}
                          onChange={(e) => setNewReview({ ...newReview, review_title: e.target.value })}
                          placeholder="An Unforgettable Experience"
                          className="w-full px-4 py-2 border rounded-lg"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium mb-2">Review Text*</label>
                        <textarea
                          value={newReview.review_text || ''}
                          onChange={(e) => setNewReview({ ...newReview, review_text: e.target.value })}
                          placeholder="Full review content..."
                          rows={6}
                          className="w-full px-4 py-2 border rounded-lg"
                        />
                      </div>

                      <div className="flex items-center gap-4">
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={newReview.is_featured || false}
                            onChange={(e) => setNewReview({ ...newReview, is_featured: e.target.checked })}
                            className="w-4 h-4"
                          />
                          <span>Featured Review</span>
                        </label>
                      </div>

                      <div className="flex gap-2">
                        <button
                          onClick={handleSaveReview}
                          className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                        >
                          Save Review
                        </button>
                        <button
                          onClick={() => setShowReviewForm(false)}
                          className="px-4 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="space-y-4">
                    {reviews.map(review => (
                      <div key={review.id} className="border rounded-lg p-4">
                        <div className="flex justify-between items-start mb-2">
                          <div>
                            <div className="font-semibold">{review.review_title}</div>
                            <div className="text-sm text-gray-600">
                              by {review.reviewer_name}
                              {review.reviewer_title && ` - ${review.reviewer_title}`}
                            </div>
                            <div className="flex items-center gap-1 mt-1">
                              {Array.from({ length: 5 }).map((_, i) => (
                                <Star
                                  key={i}
                                  className={`w-4 h-4 ${
                                    i < Math.floor(review.rating)
                                      ? 'fill-yellow-400 text-yellow-400'
                                      : 'text-gray-300'
                                  }`}
                                />
                              ))}
                              <span className="text-sm text-gray-600 ml-1">{review.rating}</span>
                            </div>
                          </div>
                          <button
                            onClick={() => handleDeleteReview(review.id!)}
                            className="text-red-600 hover:text-red-700"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                        <p className="text-gray-700 text-sm mt-3">{review.review_text}</p>
                        {review.is_featured && (
                          <span className="inline-block mt-2 px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded">
                            Featured
                          </span>
                        )}
                      </div>
                    ))}
                  </div>

                  {reviews.length === 0 && (
                    <div className="text-center text-gray-500 py-8">
                      No reviews added yet. Click "Add Review" to get started.
                    </div>
                  )}
                </div>
              )}

              {/* Tags Tab */}
              {activeTab === 'tags' && (
                <div>
                  <h3 className="font-semibold mb-4">Manage Tags</h3>
                  <p className="text-sm text-gray-600 mb-6">
                    Select tags that apply to this hotel. Tags help with filtering and categorization.
                  </p>

                  <div className="space-y-6">
                    {['occasion', 'experience', 'amenity', 'style'].map(tagType => {
                      const typeTags = availableTags.filter(t => t.tag_type === tagType);
                      if (typeTags.length === 0) return null;

                      return (
                        <div key={tagType}>
                          <h4 className="font-medium mb-3 capitalize">{tagType} Tags</h4>
                          <div className="flex flex-wrap gap-2">
                            {typeTags.map(tag => {
                              const isSelected = hotelTags.some(t => t.id === tag.id);
                              return (
                                <button
                                  key={tag.id}
                                  onClick={() => handleToggleTag(tag.id)}
                                  className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                                    isSelected
                                      ? 'bg-blue-600 text-white'
                                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                  }`}
                                >
                                  {tag.tag_name}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
