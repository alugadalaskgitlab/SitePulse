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
- **Diesel Stock Deduction Sources**: Both Plant Equipment Usage AND DPR equipment logs can deduct diesel from stock:
  - **Plant Equipment Usage**: Records runtime (meter readings OR time entry OR trip-based). When diesel is issued with `plant_stock` source → deducts from HLC stock and included in consumption/efficiency analysis.
  - **DPR Equipment Logs**: When diesel source is `plant_stock` → also deducts from HLC stock via `dpr_equipment_usage` ledger entries. No need to re-enter equipment in Plant module for diesel tracking.
  - **Overlap Detection**: Historical migration checks for matching entries (substring name matching + date + diesel amount within 0.5L) between both sources to prevent double-counting.
  - When "Provided by Contractor" IS checked → no stock deduction, excluded from consumption analysis (contractor's scope)
- **Diesel Consumption Calculation**:
  - Expected diesel = Runtime × Consumption Norm (L/hr for hour_meter, L/km for odometer)
  - For trip-based entry: L/hr norms are converted to L/km using 25 km/hr average speed
  - For odometer equipment using time entry: hours are converted to km using 25 km/hr average speed
- **Diesel Efficiency**: Plant equipment efficiency (L/hr or L/km) is tracked and compared against norms, with actual vs. expected diesel calculations.
- **Material Issues for Diesel**: Only used for non-equipment diesel transfers (issuing to sites, generators, etc.). These still deduct from HLC stock but are NOT linked to equipment consumption.
- **DPR Equipment Log Diesel Tracking**: DPR equipment diesel is tracked in the stock ledger based on diesel source. **CUTOFF DATE: Feb 1, 2026** - only DPR dates on or after 2026-02-01 create stock ledger entries (before this date, diesel was tracked exclusively via Plant Equipment Usage module):
  - `plant_stock`: Creates a `dpr_equipment_usage` ledger entry that deducts diesel from HLC stock (quantityOut, balanceAfter updated). This eliminates the need to re-enter equipment in Plant Equipment Usage just for diesel tracking.
  - `direct_purchase`: Creates a `direct_purchase` ledger entry for procurement reporting (quantityIn=quantityOut, balanceAfter=null, no stock impact).
  - `contractor`: No ledger entry (contractor provides diesel).
  - Uses negative referenceId convention (-equipmentLogId) to distinguish from Plant module entries (positive IDs). Ledger entries are automatically cleaned up (with stock balance reversal for plant_stock) on DPR edit/delete.
- **Startup Migration - migrateDprPlantStockDieselToLedger**: Retroactively creates stock ledger deduction entries for DPR equipment logs with `plant_stock` diesel on or after Feb 1, 2026 only. Uses clean-slate approach (deletes all existing dpr_equipment_usage entries, recreates valid ones). Skips superseded DPR versions. Idempotent (safe to run multiple times). No overlap detection needed thanks to date-based separation.
- **Diesel Source Preservation**: CRITICAL - when loading equipment data for editing, use `??` (nullish coalescing) instead of `||` (logical OR) for dieselSource, fuelStation, billNumber, amountPaid fields. Using `||` would silently overwrite valid values like empty strings to defaults, potentially changing `direct_purchase` to `plant_stock` and losing fuel station details.
- **Startup Repair - repairLostDieselSource**: Scans DPR version chains for cases where original had `direct_purchase` diesel but later edits changed it to `plant_stock`. Restores the diesel source and related fields, and recreates stock ledger entries. Matches by machine name + diesel amount + operator + task. Idempotent via cleanup-before-insert pattern.

#### Fuel Stock Tracking
- **Bitumen Stock Tracker** (`/plant/bitumen-stock`): Uses a pre-calibrated horizontal cylindrical tank dip chart (250cm diameter x 1060cm length, 52,032L capacity) to track actual bitumen stock across 2 tanks. User enters dip depth (cm) and system looks up volume from the chart with linear interpolation for fractional depths. Shows total/dead/usable stock in both liters and kg (1.02 kg/L). Dead stock depth = 12.5cm (outlet pipe at 125mm). Includes daily consumption summary (Opening - Closing + Receipts = Consumption), visual tank level indicators, and per-tank + combined stock views. Chart data in `shared/bitumen-dip-chart.ts`.
- **LDO Flow Meter Tracker** (`/plant/ldo-flow-meter`): Records flow meter readings (opening/closing/receipt/stock) to track LDO consumption. Daily consumption = closing reading - opening reading. LDO density: 0.84 kg/L. Shows latest meter reading, average daily consumption, receipt totals, daily summary table, per-tank flow meter stock (running balance from latest stock entry ± receipts − consumption), and LDO consumption variance analysis (actual vs norm L/ton with daily breakdown). Stock Details tab shows live LDO tank stock summary.
- **Material Receipt Tank Assignment**: Receipt form shows "Receiving Tank" selector (Tank 1/Tank 2) for materials with category "Bitumen" OR name "LDO". The LDO material has category "Utility" in the database, so the check uses both category and name matching.
- **Consumption Variance Report** (`/plant/variance-report`): Per-dispatch comparison of actual vs template consumption. Shows template bitumen %, actual bitumen %, variance %, and saved/excess quantity in Kg. Similarly for LDO: norm L, actual L, L/ton, variance %, saved/excess L. Includes totals row with weighted averages. Summary cards show count of loads over/under template.
- **Material Returns** (`/plant/material-returns`): Returns issued materials back to plant stock with mandatory linking to original issue (originalIssueId). Cascading dropdowns (material → issue entries), validation prevents over-returning, stock ledger uses "return" transaction type.

### UI/UX & Features
- **UI Enhancements**: shadcn/ui components, responsive design.
- **Site Reports**: Enhanced filtering (date range, site, engineer, activity, equipment, diesel usage, material) and Admin-only export features (Excel, PDF, Print) with multi-sheet Excel export.
- **Equipment Tracking**: Supports both time entry and hour meter readings for equipment usage, with live efficiency calculation and visual indicators. Diesel balance tracking (informational, no stock adjustment) with `dieselBalanceInTank` and `dieselBalanceConfirmed` fields — shows net consumed when balance is entered.
- **Equipment Master**: Active/Inactive toggle via `PATCH /api/plant-module/equipment/:id/toggle-active`. "Show Inactive" checkbox in Equipment Master UI. `getEquipmentMaster(includeInactive?)` accepts optional param. Inactive equipment shown with dimmed styling and "Inactive" badge. DPR forms and usage dropdowns only show active equipment.
- **Admin Notifications**: In-app notification system (info, warning, success, error) with bell icon, sound alerts, and auto-refresh, triggered by key actions like DPR submissions or material movements.
- **Push Notifications**: Web Push (VAPID-based) for real-time OS-level notifications on iPhone/iPad/Android/Desktop. Requires PWA install on iOS. PIN-gated (Manager or Admin PIN required to subscribe). All data entry events trigger push to all subscribed devices. Stale subscriptions (410 Gone) auto-cleaned. Components: `server/push.ts` (sendPushToAll helper), `client/src/components/PushNotificationSetup.tsx` (UI), `client/public/service-worker.js` (push/notificationclick handlers), `push_subscriptions` DB table. VAPID keys stored as env vars (VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY).

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

### Push Notifications
- `web-push` (VAPID-based Web Push protocol)

### Date Utilities
- `date-fns`