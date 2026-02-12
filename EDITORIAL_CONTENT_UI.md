# Hotel Editorial Content Management UI

## Overview
Complete admin interface for managing hotel editorial content - additional media, reviews, overrides, and tags.

## Location
**Page**: `/admin/hotels/editorial`
**File**: `src/app/admin/hotels/editorial/page.tsx`

## Features Implemented

### 1. Hotel Search & Selection
- Search hotels by name, city, or country
- Real-time search with hotel-api integration
- Select hotel to manage editorial content
- Clean interface with hotel details display

### 2. Four Management Tabs

#### Tab 1: Overrides & SEO
**Content Overrides**:
- Title Override - Custom hotel title
- Subtitle - Additional tagline
- Description Override - Enhanced description
- Highlight Text - Special callout/offer text

**Featured Settings**:
- Mark as Featured Hotel checkbox
- Featured Badge (e.g., "Editor's Pick", "Best Value")
- Feature Priority (0-100, higher = more prominent)

**SEO Settings**:
- SEO Title - Optimized title for search engines
- SEO Description - Meta description
- SEO Keywords - Comma-separated keywords array

**Save Button**: Saves all overrides in one action

#### Tab 2: Media Gallery
**Features**:
- Add multiple media types: Image, YouTube Video, Video URL
- Each media item has:
  - Media type selector
  - URL input
  - Title field
  - Caption field
  - Featured checkbox
  - Sort order (automatic)
- View all media in grid layout
- Delete media with confirmation
- Media icons by type (YouTube = red, Image = blue, Video = purple)
- Featured badge display

**YouTube Integration**: Paste YouTube URL directly

#### Tab 3: Editorial Reviews
**Features**:
- Add expert/editorial reviews
- Review fields:
  - Reviewer Name (required)
  - Reviewer Title (e.g., "Senior Travel Editor")
  - Rating (0-5 stars)
  - Review Title (required)
  - Review Text (required)
  - Featured checkbox
- Star rating display (visual stars)
- Delete reviews with confirmation
- Featured badge display

**Review Display**: Shows reviewer credentials, star rating, and full review text

#### Tab 4: Tags
**Features**:
- Tag categories: Occasion, Experience, Amenity, Style
- 12 default tags included:
  - **Occasion**: Honeymoon, Family Friendly, Adults Only
  - **Experience**: Beach Resort, City Hotel
  - **Amenity**: Spa & Wellness, All-Inclusive, Overwater Villas, Private Pool
  - **Style**: Luxury, Boutique, Eco-Friendly
- Toggle tags on/off (click to select/deselect)
- Visual feedback (blue = selected, gray = unselected)
- Organized by tag type

## API Integration

**Endpoints Used**:
```
GET  /api/hotels/search?query=...                        # Search hotels
GET  /api/editorial/hotels/:hotelId                      # Get all editorial content
POST /api/editorial/hotels/:hotelId/media                # Add media
DELETE /api/editorial/media/:mediaId                     # Delete media
POST /api/editorial/hotels/:hotelId/reviews              # Add review
DELETE /api/editorial/reviews/:reviewId                  # Delete review
POST /api/editorial/hotels/:hotelId/overrides            # Save overrides
GET  /api/editorial/tags                                 # Get all tags
POST /api/editorial/hotels/:hotelId/tags                 # Add tags to hotel
DELETE /api/editorial/hotels/:hotelId/tags/:tagId        # Remove tag
```

## User Interface

### Navigation
Added to admin sidebar:
- **Icon**: Sparkles (✨)
- **Label**: Editorial Content
- **Description**: Manage hotel content, media & reviews
- **Position**: Between "Browse Hotels" and "Pricing Rules"

### Design
- Clean, modern interface
- Tab-based navigation
- Collapsible forms for adding content
- Confirmation dialogs for deletions
- Visual feedback for featured items
- Badge displays for featured content
- Color-coded media types

### User Flow
1. **Search Hotel**: Type hotel name/location, click Search
2. **Select Hotel**: Click hotel from search results
3. **Choose Tab**: Click tab to manage specific content type
4. **Add Content**: Click "Add" button, fill form, save
5. **Edit Content**: Make changes, click Save
6. **Delete Content**: Click X icon, confirm deletion

## Example Use Cases

### Adding a YouTube Video
1. Search for "Kuredu Island Resort"
2. Select hotel from results
3. Click "Media" tab
4. Click "Add Media" button
5. Select "YouTube Video" from dropdown
6. Paste YouTube URL
7. Add title: "Resort Tour"
8. Add caption: "Aerial view of resort"
9. Check "Featured" if main video
10. Click "Save Media"

### Creating Featured Hotel
1. Search and select hotel
2. Click "Overrides & SEO" tab
3. Add title override: "Paradise Awaits at Kuredu"
4. Add subtitle: "Maldives' Best Value Luxury Resort"
5. Check "Mark as Featured Hotel"
6. Enter featured badge: "Editor's Pick"
7. Set priority: 10 (high priority)
8. Add SEO title and description
9. Click "Save Overrides"

### Adding Expert Review
1. Search and select hotel
2. Click "Reviews" tab
3. Click "Add Review"
4. Enter reviewer: "Jane Smith"
5. Enter title: "Senior Travel Editor"
6. Set rating: 4.5
7. Enter review title: "An Unforgettable Experience"
8. Write full review text
9. Check "Featured" to show first
10. Click "Save Review"

### Tagging Hotels
1. Search and select hotel
2. Click "Tags" tab
3. Click tags that apply:
   - "Beach Resort" (Experience)
   - "Spa & Wellness" (Amenity)
   - "Honeymoon" (Occasion)
   - "Luxury" (Style)
4. Tags save automatically on click
5. Click again to remove tag

## Technical Details

### State Management
- Local React state for form data
- Async data fetching from hotel-api
- Real-time updates after save operations
- Automatic content reload after changes

### Validation
- Required fields marked with *
- URL validation for media links
- Rating range validation (0-5)
- Array handling for SEO keywords

### Error Handling
- Console logging for debugging
- Alert messages for successful saves
- Confirmation dialogs for deletions
- Loading states during operations

## Environment Variables

Required in admin-dashboard `.env.local`:
```
NEXT_PUBLIC_HOTEL_API_URL=https://hotel-api-91901273027.us-central1.run.app
```

## Testing

### Test Flow
1. **Start admin dashboard**: `npm run dev`
2. **Login**: Use Firebase auth credentials
3. **Navigate**: Click "Editorial Content" in sidebar
4. **Search**: Search for "Kuredu" or any hotel
5. **Test each tab**:
   - Overrides: Add title, subtitle, save
   - Media: Add YouTube URL, save
   - Reviews: Add review, save
   - Tags: Click tags to select/deselect

### Test Data
**Hotel ID**: 603877766 (Kuredu Island Resort & Spa)
- Has existing YouTube media from previous test
- Can be used for testing all features

## Future Enhancements

### Planned Features
1. **Image Upload**: Direct image upload to Cloud Storage
2. **Bulk Operations**: Tag multiple hotels at once
3. **Media Reordering**: Drag-and-drop media sorting
4. **Review Editing**: Edit existing reviews inline
5. **Preview Mode**: Preview how content looks on frontend
6. **Audit Log**: Track who changed what and when
7. **Media Library**: Reusable media across hotels
8. **Template Reviews**: Save review templates for reuse

### Performance Optimizations
1. **Pagination**: For hotels with many media/reviews
2. **Lazy Loading**: Load tabs only when clicked
3. **Caching**: Cache hotel search results
4. **Batch Updates**: Group multiple changes into one save

## Deployment

The admin UI is ready to use once admin-dashboard is deployed to Vercel.

**Current Status**: ✅ Code complete, ready for testing

**Access URL** (after deployment):
```
https://admin-dashboard-[vercel-url].vercel.app/admin/hotels/editorial
```

## Support

For issues or questions:
1. Check browser console for API errors
2. Verify hotel-api is running and accessible
3. Confirm Firebase authentication is working
4. Check network tab for failed API calls
