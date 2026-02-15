# SiteLog - Construction Daily Progress Report System

## Overview

SiteLog is a web application designed for construction management, focusing on Daily Progress Reports (DPRs) and Plant Production logs. It enables site engineers, project managers, and administrators to efficiently record and track daily activities including work progress, equipment usage, labor deployment, and material consumption. The system incorporates role-based access control with PIN authentication for enhanced security and privilege management. SiteLog aims to streamline construction site reporting, provide real-time insights into project progress, and improve operational efficiency for construction companies.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter
- **State Management**: TanStack React Query for server state, React Hook Form for form state
- **UI Components**: shadcn/ui built on Radix UI, styled with Tailwind CSS (industrial/construction palette with amber/orange primary)
- **Build Tool**: Vite

### Backend
- **Runtime**: Node.js with Express (ESM modules)
- **Language**: TypeScript
- **API Pattern**: RESTful API with Zod schema validation
- **Route Definitions**: Centralized in `shared/routes.ts` with typed schemas

### Data Storage
- **Database**: PostgreSQL
- **ORM**: Drizzle ORM with `drizzle-zod` for schema validation
- **Schema Management**: `shared/schema.ts` defines all tables, migrations via `drizzle-kit push`

### Key Data Models
- Daily Progress Reports (DPRs) including progress, equipment, labor, and material logs.
- Plant Production Reports.
- Versioning for DPRs for audit trails.

### Authentication & Access Control
- **Role-Based**: Engineer (view), Manager (edit), Admin (full control).
- **PIN-Based**: Client-side PIN authentication for elevated access.
- **Admin PINs**: Stored in `app_settings` table (default Manager: 1234, Admin: 5678).

### Build System
- **Development**: `tsx` and Vite dev server.
- **Production**: esbuild for server, Vite for client, Express serves static files.

### Plant Module (Stock & Production Accounting)
- **Data Flow**: Manages material receipts, mix templates, truck dispatches, and stock deductions.
- **Stock Deduction Priority**: All stock is party-based with HLC as the primary party for common stock.
- **Material Issues Register**: Tracks materials issued from central plant to sites, deducting from party stock and creating ledger entries. Used for non-equipment material transfers.
- **Material Opening Stocks**: Allows entry of initial material balances with party attribution.
- **Party-Based Stock Management**: All stock is party-based. Startup migration automatically reassigns any orphan NULL-party ledger/balance entries to HLC. Dispatch deductions always fall back to HLC party (never null). The `migrateOrphanStockToHLC()` method runs on every server start.
- **Equipment Master**: Enhanced with ownership status (Owned/Hired), vendor names, registration numbers, and active status.

#### Equipment Usage & Diesel Flow
- **Equipment Usage** is the SINGLE source of truth for equipment diesel:
  - Records runtime (meter readings OR time entry OR trip-based)
  - When diesel is issued and "Provided by Contractor" is NOT checked → diesel is deducted from HLC stock and included in consumption analysis
  - When "Provided by Contractor" IS checked → no stock deduction, excluded from consumption analysis (contractor's scope)
- **Diesel Consumption Calculation**:
  - Expected diesel = Runtime × Consumption Norm (L/hr for hour_meter, L/km for odometer)
  - For trip-based entry: L/hr norms are converted to L/km using 25 km/hr average speed
  - For odometer equipment using time entry: hours are converted to km using 25 km/hr average speed
- **Diesel Efficiency**: Plant equipment efficiency (L/hr or L/km) is tracked and compared against norms, with actual vs. expected diesel calculations.
- **Material Issues for Diesel**: Only used for non-equipment diesel transfers (issuing to sites, generators, etc.). These still deduct from HLC stock but are NOT linked to equipment consumption.
- **DPR Equipment Log Diesel Tracking**: When DPR equipment logs record `direct_purchase` diesel, a stock_ledger entry is created for procurement reporting (quantityIn=quantityOut, balanceAfter=null, no stock impact). `plant_stock` diesel from DPRs is NOT tracked in the ledger (Plant Equipment Usage is the single source of truth for stock deductions). Uses negative referenceId convention (-equipmentLogId) to distinguish from Plant module entries (positive IDs). Ledger entries are automatically cleaned up on DPR edit/delete.
- **Diesel Source Preservation**: CRITICAL - when loading equipment data for editing, use `??` (nullish coalescing) instead of `||` (logical OR) for dieselSource, fuelStation, billNumber, amountPaid fields. Using `||` would silently overwrite valid values like empty strings to defaults, potentially changing `direct_purchase` to `plant_stock` and losing fuel station details.
- **Startup Repair - repairLostDieselSource**: Scans DPR version chains for cases where original had `direct_purchase` diesel but later edits changed it to `plant_stock`. Restores the diesel source and related fields, and recreates stock ledger entries. Matches by machine name + diesel amount + operator + task. Idempotent via cleanup-before-insert pattern.

#### Fuel Stock Tracking
- **Bitumen Stock Tracker** (`/plant/bitumen-stock`): Uses a pre-calibrated horizontal cylindrical tank dip chart (250cm diameter x 1060cm length, 52,032L capacity) to track actual bitumen stock across 2 tanks. User enters dip depth (cm) and system looks up volume from the chart with linear interpolation for fractional depths. Shows total/dead/usable stock in both liters and kg (1.02 kg/L). Dead stock depth = 12.5cm (outlet pipe at 125mm). Includes daily consumption summary (Opening - Closing + Receipts = Consumption), visual tank level indicators, and per-tank + combined stock views. Chart data in `shared/bitumen-dip-chart.ts`.
- **LDO Flow Meter Tracker** (`/plant/ldo-flow-meter`): Records flow meter readings (opening/closing/receipt) to track LDO consumption. Daily consumption = closing reading - opening reading. LDO density: 0.84 kg/L. Shows latest meter reading, average daily consumption, receipt totals, and daily summary table.
- **Material Returns** (`/plant/material-returns`): Returns issued materials back to plant stock with mandatory linking to original issue (originalIssueId). Cascading dropdowns (material → issue entries), validation prevents over-returning, stock ledger uses "return" transaction type.

### UI/UX & Features
- **UI Enhancements**: shadcn/ui components, responsive design.
- **Site Reports**: Enhanced filtering (date range, site, engineer, activity, equipment, diesel usage, material) and Admin-only export features (Excel, PDF, Print) with multi-sheet Excel export.
- **Equipment Tracking**: Supports both time entry and hour meter readings for equipment usage, with live efficiency calculation and visual indicators.
- **Admin Notifications**: In-app notification system (info, warning, success, error) with bell icon, sound alerts, and auto-refresh, triggered by key actions like DPR submissions or material movements.

## External Dependencies

### Database
- PostgreSQL (via `DATABASE_URL`)
- `pg` driver
- `drizzle-orm/node-postgres`

### Export Functionality
- `xlsx` (for Excel file generation)

### UI Libraries
- Radix UI (primitives)
- `embla-carousel-react`
- `react-day-picker`
- `cmdk`
- `vaul`
- `recharts`

### Form & Validation
- `react-hook-form`
- `@hookform/resolvers` (for Zod)
- `zod`
- `drizzle-zod`

### Date Utilities
- `date-fns`