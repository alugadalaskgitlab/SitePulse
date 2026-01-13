# SiteLog - Construction Daily Progress Report System

## Overview

SiteLog is a construction management web application for tracking Daily Progress Reports (DPRs) and Plant Production logs. It enables construction site engineers, project managers, and administrators to record daily activities including work progress, equipment usage, labour deployment, and material consumption. The system supports role-based access control with PIN authentication for elevated privileges.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter (lightweight React router)
- **State Management**: TanStack React Query for server state, React Hook Form for form state
- **UI Components**: shadcn/ui component library built on Radix UI primitives
- **Styling**: Tailwind CSS with CSS variables for theming (industrial/construction color palette with amber/orange primary)
- **Build Tool**: Vite with path aliases (@/, @shared/, @assets/)

### Backend Architecture
- **Runtime**: Node.js with Express
- **Language**: TypeScript (ESM modules)
- **API Pattern**: RESTful API with Zod schema validation
- **Route Definitions**: Centralized in `shared/routes.ts` with typed request/response schemas

### Data Storage
- **Database**: PostgreSQL
- **ORM**: Drizzle ORM with drizzle-zod for schema-to-validation generation
- **Schema Location**: `shared/schema.ts` contains all table definitions
- **Migrations**: Managed via `drizzle-kit push` command

### Data Models
- **DPRs (Daily Progress Reports)**: Header with date, site, engineer, role
- **Progress Entries**: Activity tracking with chainage, dimensions, quantities
- **Equipment Logs**: Machine usage with operator, time, diesel consumption
- **Labour Logs**: Worker categories by skill level and gender
- **Material Logs**: Material consumption tracking
- **Plant Reports**: Plant production with production entries
- **DPR Versions**: Version history for audit trails

### Authentication Pattern
- Role-based access: engineer (view), manager (edit), admin (full control)
- PIN-based authentication for elevated access (client-side demonstration)
- No session management currently implemented

### Build System
- **Development**: `tsx` for TypeScript execution with Vite dev server
- **Production**: esbuild bundles server with selective dependency bundling, Vite builds client to `dist/public`
- **Static Serving**: Express serves built client files in production

## External Dependencies

### Database
- PostgreSQL via `DATABASE_URL` environment variable
- `pg` driver with `drizzle-orm/node-postgres` adapter
- `connect-pg-simple` for potential session storage

### Export Functionality
- `xlsx` library for Excel file generation (binary export endpoint)

### UI Libraries
- Full Radix UI primitive suite for accessible components
- `embla-carousel-react` for carousels
- `react-day-picker` for calendar components
- `cmdk` for command palette
- `vaul` for drawer components
- `recharts` for charts (via chart.tsx)

### Form & Validation
- `react-hook-form` with `@hookform/resolvers` for Zod integration
- `zod` for runtime validation across client and server
- `drizzle-zod` for generating Zod schemas from Drizzle tables

### Date Utilities
- `date-fns` for date formatting and manipulation

## Plant Module - Stock & Production Accounting

### Data Flow
1. **Material Receipts** (Stock IN) → Creates +quantity ledger entry → Updates party/plant-common stock balance
2. **Mix Templates** define consumption rules: aggregate kgPerTon, bitumen %, LDO norm (L/ton)
3. **Truck Dispatch** (Single Source of Truth) → Computes theoretical consumption → Deducts stock (party-first, plant-common fallback) → Creates ledger entries
4. **Dashboard** derives all values from ledger: stock balances, efficiency, savings, shortages

### Stock Deduction Priority
1. Party-specific stock first
2. Plant common stock as fallback
3. Shortage flagged only if combined stock insufficient

### Diesel Consumption Formula
- **Primary**: (Opening diesel + Diesel issued) - Closing diesel
- **Fallback** (if closing not entered): Hours run × diesel norm (5 L/hr default)
- **Validation**: Cannot be negative, cannot exceed (opening + issued)

### Access Control
- **Engineer**: Can add new entries (dispatches, receipts, logs), view data
- **Manager**: Can unlock Dashboard and Masters tabs with PIN for view + add capabilities; no edit/delete/export/print
- **Admin**: Full access including edit, delete, export, and print capabilities

### Key Business Rules
- Stock balances are always derived from ledger - no manual entry
- Theoretical consumption is used for stock deduction
- Actual consumption is for management analysis (savings/wastage)

## Recent Changes (January 2026)

### Site Reports Enhanced Filtering & Export
- **Filters**: Extended filter options on Site Reports page (/site/dashboard)
  - Date range (from/to)
  - Site-wise filtering
  - Engineer-wise filtering
  - Activity-wise filtering (populated from DPR progress entries)
  - Equipment-wise filtering (populated from DPR equipment logs)
  - Diesel usage filter (show only reports with diesel usage)
- **Admin-Only Export**: Excel, PDF, and Print features require Admin PIN authentication
  - Excel: Exports site reports with Date, Site, Engineer, and Role columns
  - PDF: Formatted document with High Lane Constructions header and applied filters
  - Print: Browser print dialog with formatted report list
- **Data Source**: Uses DprWithDetails API endpoint for rich filtering capabilities

### Dashboard Tab (formerly Material Log)
- **Tab Renamed**: "Material Log" tab renamed to "Dashboard" for clarity
- **Enhanced Filters**: 8 comprehensive filter options
  - Date range (from/to)
  - Site-wise filtering
  - Material-wise filtering
  - Engineer-wise filtering (NEW)
  - Activity-wise filtering (NEW)
  - Equipment-wise filtering (NEW)
  - Diesel usage filter (NEW)
- **Cross-Reference Filtering**: Engineer/activity/equipment/diesel filters match material logs to DPR records via date+site correlation
- **Collapsible Date Groups**: Data grouped by date with material totals (trips and quantity) 
- **Expand/Collapse All**: Buttons to expand or collapse all date groups at once
- **Admin-Only Export**: Excel, PDF, and Print features require Admin PIN authentication
  - Excel: Multi-sheet export with material logs and summary
  - PDF: Formatted document with jsPDF/autoTable showing applied filters
  - Print: Browser print dialog with filter information
- **Print Fix**: Print functions use setTimeout(250ms) + focus() for reliable cross-browser print dialog triggering
- **Duplicate Prevention**: Dashboard shows only entries from the latest DPR version per site+date
  - Server-side: Deduplicates by keeping highest DPR ID per base site name + date
  - Client-side: Strips "– Edited by..." suffix from site names using getBaseSiteName helper

### Admin Notifications
- **Notification System**: In-app notifications with bell icon on Home page
- **Notification Types**: info, warning, success, error with color-coded icons
- **CRUD Operations**: Create, read, mark as read, delete notifications
- **API Endpoints**: /api/notifications with Zod validation
- **Automatic Triggers**:
  - DPR edited/submitted by Manager (via version/clone routes)
  - Material receipt added (Plant module)
  - Truck dispatch created (Plant module)
- **Sound Alert**: Plays notification sound when new notifications arrive
- **Auto-refresh**: Polls for new notifications every 30 seconds

### Access Control PINs (Database Stored)
- Default Manager PIN: 1234 (can be changed via settings)
- Default Admin PIN: 5678 (can be changed via settings)
- Actual PINs stored in app_settings table

### Material Issues Register (Plant Module)
- **Purpose**: Track materials issued from central plant store to sites
- **Schema**: `material_issues` table with stock owner (partyId or isPlantCommon), materialId, quantity, issuedTo, purpose
- **Stock Deduction**: Issues deduct from specified party stock or plant common stock
- **Ledger Integration**: Creates ledger entries with transactionType="issue" for audit trail
- **Transaction Types**: Stock ledger now supports: receipt, dispatch, issue, opening, equipment_usage
- **UI Features**:
  - Full CRUD operations with date/time, material, quantity, issued to, purpose, vehicle number
  - Filters by date range, party/stock owner, and material
  - Export to Excel/PDF and Print (Admin PIN required)
  - Navigation from Plant Dashboard Operations tab
- **Notifications**: Material issues trigger admin notifications (type: warning)
- **Route**: /plant/material-issues

### Material Opening Stocks (Plant Module)
- **Schema**: `materialOpeningStocks` table with stock owner support (partyId for party-specific or isPlantCommon=1 for plant common)
- **Purpose**: Allows entering initial stock balances for materials with proper stock owner attribution
- **UI Features**:
  - "+" button on each material in Masters tab opens Add Opening Stock dialog
  - Stock owner selection: Plant Common Stock or Party/Job Specific
  - Party dropdown appears when Party/Job Specific is selected
  - Quantity, date, and notes fields
- **Ledger Integration**: Opening stock entries create ledger entries with transactionType="opening"
- **Stock Balance**: Opening stocks are added to stock balance calculations
- **API Endpoints**: /api/plant-module/opening-stocks (GET, POST)