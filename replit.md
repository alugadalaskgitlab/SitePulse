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
- **Equipment Usage diesel creates stock entries** - When "Diesel Issued" is entered in Equipment Usage, it automatically creates a ledger entry (transactionType="equipment_usage") and deducts from plant-common diesel stock

## Recent Changes (January 2026)

### Equipment Tracking Dual Entry System
- **Both Modules Support**: Site Report Equipment Log and Plant Module Equipment Usage now support BOTH time entry AND hour meter entry
- **User Choice**: Users can enter:
  - Time only (Start Time, End Time)
  - Hour meter only (Opening Reading, Closing Reading)
  - Both (hour meter takes priority for calculations)
- **Database Schema Updates**:
  - `equipmentLogs` table: Added openingReading, closingReading, hoursWorked, dieselNorm, expectedDiesel
  - `equipmentUsage` table: Added startTime, endTime (readings now optional)
- **Live Efficiency Calculation**: 
  - Working Hours calculated automatically from time or meter
  - Expected Diesel = hours × norm (L/hr)
  - Efficiency = (expected / actual) × 100%
  - Recalculates immediately when norm or entries change
- **UI Enhancements**:
  - Helper text: "Enter time OR hour meter readings (or both). Hour meter takes priority."
  - Visual efficiency indicator (green for >=100%, red for <100%)

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

### Site Reports Simplified (Dashboard Tab Removed)
- **Simplification**: Dashboard tab removed entirely; Site Reports page now shows reports directly without tabs
- **Material Filter Added**: Added Material filter to Reports page for filtering DPRs by materials used
- **Filters Available**: 8 comprehensive filters on Reports page
  - Date range (from/to)
  - Site-wise filtering
  - Engineer-wise filtering
  - Activity-wise filtering (from DPR progress entries)
  - Equipment-wise filtering (from DPR equipment logs)
  - Diesel usage filter (show only reports with diesel usage)
  - Material-wise filtering (from DPR material logs)
- **Code Cleanup**: Removed unused Dashboard-related state, queries, memos, and handlers

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
- **Schema**: `material_issues` table with partyId (stock owner), materialId, quantity, issuedTo, purpose
- **Stock Deduction**: Issues deduct from specified party stock
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
- **Schema**: `materialOpeningStocks` table with partyId for stock owner attribution
- **Purpose**: Allows entering initial stock balances for materials with party attribution
- **UI Features**:
  - "+" button on each material in Masters tab opens Add Opening Stock dialog
  - Party selection dropdown (required)
  - Quantity, date, and notes fields
- **Ledger Integration**: Opening stock entries create ledger entries with transactionType="opening"
- **Stock Balance**: Opening stocks are added to stock balance calculations
- **API Endpoints**: /api/plant-module/opening-stocks (GET, POST)

### Equipment Master Enhanced (Plant Module)
- **Ownership Field**: Equipment can be marked as "Owned" or "Hired"
- **Vendor Name**: For hired equipment, vendor/contractor name can be recorded
- **Registration/ID Number**: Unique identifier for each equipment unit (e.g., MH12AB1234)
- **Active Status**: Equipment can be marked as active/inactive (hide returned equipment)
- **Display**: Equipment list shows ownership status with color coding (green for Owned, orange for Hired with vendor name)
- **Use Case**: Track hired equipment like JCB, Tippers, Soil Compactor with varying vendors and quantities

### Stock Summary Display Fix
- **Opening Stock Separated**: Stock Summary now shows "Opening Stock" column separately from "Received" column
- **Correct Classification**: Opening stock entries (from Masters tab) are no longer grouped with receipts
- **Ledger Display**: Transaction type labels correctly show "Opening" for opening stock entries

### Equipment Usage - Tracking Only (No Stock Impact)
- **Purpose Changed**: Equipment Usage now only tracks consumption for analysis, does NOT deduct diesel stock
- **Diesel Issue Flow**: Diesel should be issued via Material Issues only (single source of truth)
- **Consumption Tracking**: Equipment Usage still calculates expected diesel, actual consumption, variance for analysis
- **Tank Level Tracking**: Opening diesel, diesel issued, closing diesel fields remain for tank balance tracking per equipment
- **No Duplication**: Eliminates previous issue of diesel being deducted both in Material Issues AND Equipment Usage

### Party-Based Stock Management (Plant Common Removal)
- **Design Change**: Removed "Plant Common" stock concept entirely - all stock now party-based
- **HLC Party**: HLC (High Lane Constructions) is the primary party for common plant stock (id=4)
- **Migration Applied**: Existing plant-common stock balances and ledger entries migrated to HLC party
- **UI Changes**:
  - Material Receipts: Removed "Plant Common Stock" toggle - party selection always required
  - Material Issues: Removed "Plant Common Stock" toggle - party selection always required
  - Opening Stocks: Simplified to party-only selection (no "Plant Common" option)
  - Stock Summary: Shows HLC party instead of "Plant Common" label
- **Equipment Usage Diesel**: Automatically uses HLC party for diesel stock operations
- **Benefits**: Simplified data model, consistent party attribution, no NULL partyId values

### Diesel Efficiency Improvements (January 2026)
- **Site Reports Simplified**: Removed diesel norm/efficiency from site equipment logs (efficiency tracking only meaningful for plant equipment with stored norms)
- **Expand/Collapse Reports**: Site Reports now have expand/collapse feature showing Progress, Equipment, Labour, Materials inline
- **Excel Export Enhanced**: Multi-sheet export (Summary, Progress, Equipment, Labour, Materials) with all DPR details
- **Reading Source Labels**: Equipment tables now show "Meter: X - Y" or "Time: HH:MM - HH:MM" to clarify calculation source
- **Plant Equipment Efficiency**: Added efficiency column (L/hr or L/km) with color-coded comparison to equipment norm
- **Actual vs Expected Diesel**:
  - Primary: Actual consumed = openingDiesel + dieselIssued - closingDiesel (from tank levels)
  - Fallback: expectedDiesel (norm-based) only if closing tank level not tracked
  - Applied consistently in Dashboard KPI and Equipment Usage display