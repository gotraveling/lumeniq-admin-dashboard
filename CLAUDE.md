# LumenIQ Platform Development Plan

## Current Status ✅
- Admin dashboard theme updated to clean black/white WhatsApp-style design ✅
- Multi-tenant authentication with Firebase working ✅
- Booking management system with real-time data ✅
- User management and tenant settings pages ✅
- Professional booking detail views with action menus ✅
- Text visibility issues fixed ✅
- All admin navigation pages implemented ✅
- **Hotel Inventory Management System** - Complete Gimmonix-style implementation ✅
- **Supplier Management Interface** - Monitor and manage API connections ✅
- **Database Schema** - Professional-grade inventory and mapping tables ✅

## Next Priority: Professional Booking Engine Features

### 1. Inventory Management System
**Priority: HIGH**
- Hotel inventory tracking and management
- Room availability calendar with real-time updates
- Allotment management (contracted rooms vs on-request)
- Stop sales management (disable sales for specific dates/room types)
- Inventory alerts and low stock warnings
- Multi-supplier inventory consolidation

### 2. Supplier Hotel Mapping & Normalization
**Priority: HIGH - Similar to Gimmonix**
- Hotel mapping across multiple suppliers (Gimmonix-style)
- Room type normalization and standardization
- Amenity mapping and categorization
- Rate comparison across suppliers for same hotels
- Supplier preference management and failover logic
- Hotel content consolidation (descriptions, images, amenities)

### 3. Smart Rebooking Engine
**Priority: MEDIUM**
- Price monitoring and better rate detection
- Automated rebooking suggestions when cheaper rates found
- Customer notification system for price drops
- Rebooking workflow with approval processes
- Commission optimization based on rate changes

### 4. Advanced Channel Management
**Priority: MEDIUM**
- Multi-channel inventory distribution
- Rate parity management across channels
- Channel-specific rate loading and restrictions
- OTA connectivity and XML integration
- Channel performance analytics

### 5. Revenue Management Tools
**Priority: LOW**
- Dynamic pricing based on demand patterns
- Seasonal rate adjustments
- Competitor rate monitoring
- Revenue optimization recommendations
- Commission management across suppliers

## Technical Architecture

### Project Structure & Data Flow
```
hotels/
├── admin-dashboard/          # ✅ LumenIQ Admin Panel (Complete)
│   ├── Inventory Management  # ✅ Hotel portfolio, availability calendar
│   ├── Supplier Management   # ✅ API connections, mapping stats
│   ├── Booking Management   # ✅ Reservations, actions, details
│   └── User/Tenant Mgmt     # ✅ Multi-tenant administration
├── hotel-search-app/        # ✅ Customer booking interface  
├── booking-engine-api/      # ✅ Core booking engine + Inventory APIs
├── hotel-api/              # ✅ Hotel content & search API (Google Cloud)
└── supplier-integration-service/  # 🚧 Next: Real supplier connections
```

### **Current Architecture & Integration:**
```
Hotel Content API (Google Cloud)
      ↓ (provides hotel data)
Hotel Search App (Customer Frontend)  
      ↓ (creates bookings)
Booking Engine API (with Inventory Management)
      ↓ (maps to suppliers & applies markup)
LumenIQ Admin Dashboard (Management Interface)
      ↓ (manages suppliers, inventory, bookings)
Multiple Suppliers (Gimmonix, RateHawk, Hotelbeds, Demo)
```

### Required New Components

#### Inventory Management Service
```
inventory-management/
├── src/
│   ├── controllers/
│   │   ├── inventory.js      # Room availability tracking
│   │   ├── mapping.js        # Hotel/room mapping across suppliers
│   │   └── normalization.js  # Room type standardization
│   ├── services/
│   │   ├── gimmonixMapping.js    # Gimmonix-style hotel mapping
│   │   ├── rateComparison.js     # Cross-supplier rate comparison
│   │   └── inventoryTracker.js   # Real-time inventory updates
│   └── models/
│       ├── hotelMapping.js       # Hotel supplier mappings
│       ├── roomNormalization.js  # Standardized room types
│       └── inventory.js          # Inventory tracking
```

#### Database Schema Extensions
```sql
-- Hotel supplier mapping (Gimmonix-style)
CREATE TABLE hotel_mappings (
  id SERIAL PRIMARY KEY,
  master_hotel_id INT,
  supplier_name VARCHAR(50),
  supplier_hotel_id VARCHAR(100),
  supplier_hotel_code VARCHAR(50),
  mapping_confidence DECIMAL(3,2), -- 0.00 to 1.00
  created_at TIMESTAMP DEFAULT NOW()
);

-- Room type normalization
CREATE TABLE room_type_mappings (
  id SERIAL PRIMARY KEY,
  master_room_type VARCHAR(100),
  supplier_name VARCHAR(50),
  supplier_room_type VARCHAR(200),
  supplier_room_code VARCHAR(50),
  occupancy_max INT,
  bed_configuration VARCHAR(100),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Inventory tracking
CREATE TABLE inventory_levels (
  id SERIAL PRIMARY KEY,
  hotel_id INT,
  room_type_code VARCHAR(50),
  check_in_date DATE,
  available_rooms INT,
  total_rooms INT,
  stop_sale BOOLEAN DEFAULT FALSE,
  supplier_name VARCHAR(50),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

## 🏗️ **Platform Architecture Decision: EquationX SaaS**

### **Deployment Strategy: Multi-Tenant SaaS Platform**
**Deploy on EquationX infrastructure as platform service:**

```
Platform: booking-engine.equationx.com
├── 🏢 Tenant: firstclass-au (existing)
├── 🏢 Tenant: wanderlust-uk  
├── 🏢 Tenant: dreamtrips-usa
└── 🏢 Tenant: [future customers]
```

**Benefits:**
- **Shared hotel mappings** - All tenants benefit from mapping investments
- **Supplier economies** - Negotiate better rates with volume
- **Revenue model** - SaaS subscriptions + transaction fees  
- **Faster customer onboarding** - New tenants get full inventory immediately

### **Supplier Integration Strategy**

**Tier 1 Suppliers (Global):**
- Gimmonix (existing connections)
- RateHawk (high volume)
- Hotelbeds (comprehensive coverage)

**Tier 2 Suppliers (Regional/Specialized):**
- Innstant (specific regions)
- Local DMCs
- Direct hotel contracts

**Mapping Sources:**
1. **Algorithmic matching** (80% automated) - Name/location/address similarity
2. **Supplier-provided mappings** - Pre-mapped datasets from Gimmonix/others
3. **Manual review** (20%) - Edge cases and new properties
4. **Crowdsourced** - Learn from booking patterns over time

## 🚀 Next Development Phases

### **Phase 1: Real Supplier Integration (HIGH PRIORITY)**
**Objective:** Connect to actual supplier APIs instead of demo data

1. **Hotel API Integration Enhancement**
   - Map existing Hotel API hotels (from Google Cloud) to inventory system
   - Create bulk hotel import from Hotel API to inventory management
   - Add hotel detail enrichment (amenities, images, descriptions)

2. **Gimmonix Integration** 
   - Implement Gimmonix API connector
   - Hotel mapping: Match Hotel API hotels to Gimmonix properties
   - Room type normalization: Map Gimmonix room types to standardized categories
   - Real-time rate and availability feeds

3. **RateHawk Integration**
   - API authentication and connection testing
   - Hotel and room mapping engine
   - Rate comparison with Gimmonix and markup application

4. **Supplier Failover Logic**
   - Primary/secondary supplier routing
   - Automatic failover when primary supplier unavailable
   - Response time monitoring and optimization

### **Phase 2: Advanced Booking Management (MEDIUM PRIORITY)**
1. **Smart Rebooking Engine**
   - Monitor rate changes across suppliers
   - Automatic rebooking suggestions for better rates
   - Customer notification system for price drops
   - Admin approval workflow for rebookings

2. **Channel Management**
   - Multi-channel inventory distribution
   - Rate parity management across channels
   - Channel-specific restrictions and rate loading
   - Performance analytics per channel

3. **Revenue Optimization**
   - Dynamic markup rules based on demand
   - Seasonal pricing adjustments
   - Competitor rate monitoring
   - Commission optimization recommendations

### **Phase 3: Enterprise Features (LOW PRIORITY)**  
1. **Advanced Analytics**
   - Booking conversion rates by supplier
   - Revenue per hotel/room type/supplier
   - Demand forecasting and inventory planning
   - Profit margin analysis

2. **Automation & AI**
   - Auto-mapping of new hotels to suppliers
   - Room type normalization using ML
   - Demand-based dynamic pricing
   - Anomaly detection for rates and availability

## Development Best Practices

### **IMPORTANT: API-First Development Approach**
When building any new feature, ALWAYS follow this sequence:

1. **Check Existing APIs First**
   - Review existing endpoints in `/api/docs`
   - Check if similar functionality already exists
   - Understand current data models and patterns

2. **Build/Enhance API First**
   - Create or modify backend API endpoints
   - Test thoroughly with curl commands
   - Ensure proper error handling and validation
   - Document the API endpoint

3. **Test API with curl**
   - Test all success scenarios
   - Test error cases and edge cases
   - Verify response format and data

4. **Only Then Build UX**
   - Create UI components that consume the API
   - Handle loading states and errors properly
   - Follow existing UI patterns and styling

**Example Workflow:**
```bash
# 1. Check existing endpoints
curl http://localhost:3003/api/docs

# 2. Build new endpoint (e.g., inventory/hotels)
# 3. Test with curl
curl -X POST http://localhost:3003/api/inventory/hotels -H "Content-Type: application/json" -d '{...}'

# 4. Only after API works, build the UI
```

## Key Features to Implement

### Admin Dashboard Enhancements Needed
- **Inventory Calendar**: Visual room availability calendar
- **Mapping Manager**: Hotel/room mapping across suppliers
- **Rate Monitor**: Real-time rate comparison dashboard  
- **Supplier Manager**: Configure and manage multiple suppliers
- **Revenue Dashboard**: Analytics and performance metrics