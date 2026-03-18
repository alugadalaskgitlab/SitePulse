# SiteLog - Construction Daily Progress Report System

## Overview

SiteLog is a web application designed for construction management, primarily focusing on Daily Progress Reports (DPRs) and Plant Production logs. It aims to digitalize and streamline the reporting of daily site activities, including work progress, equipment usage, labor, and material consumption. Key capabilities include real-time insights, role-based access control with PIN authentication, and comprehensive modules for plant operations, procurement, and finance. The system's goal is to enhance operational efficiency and provide a centralized platform for construction project oversight.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter
- **State Management**: TanStack React Query for server state, React Hook Form for form state
- **UI Components**: shadcn/ui (Radix UI + Tailwind CSS) with an industrial color palette (amber/orange primary).
- **Build Tool**: Vite

### Backend
- **Runtime**: Node.js with Express (ESM)
- **Language**: TypeScript
- **API Pattern**: RESTful API with Zod validation
- **Route Definitions**: Centralized and typed (`shared/routes.ts`)

### Data Storage
- **Database**: PostgreSQL
- **ORM**: Drizzle ORM with `drizzle-zod`
- **Schema Management**: Defined in `shared/schema.ts`, with migrations handled by `drizzle-kit push`.

### Core Modules & Features
- **Daily Progress Reports (DPRs)**: Comprehensive logging of progress, equipment, labor, and materials. Includes versioning with an `isSuperseded` flag for audit trails.
- **Plant Production Module**: Manages material receipts, mix templates, truck dispatches, stock deductions, and detailed equipment usage (time_meter, hourly, daily, trip_based, monthly, shifting). Features party-based stock, enhanced equipment master, and fuel stock tracking (Bitumen, LDO, consumption variance).
- **Procurement & Finance Module**:
    - **Purchase Indents**: Multi-item request system with partial approval, adjustable quantities, and status-driven workflow (pending, approved, completed, rejected). Includes item cancellation, force-close, and detailed history. Features a **Material Picker** — items can be selected from the plant materials master (auto-fills description + UOM) or entered as free text via "Other" option. Optional `materialId` FK column on `purchase_indent_items` links to `plant_materials`.
    - **Daily Diesel Requirements**: Tool for planning and procuring diesel per equipment, with approval workflow and comparison reports.
    - **Vendor Bills**: Date-wise billing system with a 4-step workflow (Draft → Verified → Approved → Paid). Automatically pulls line items from various vendor data sources, supports vendor aliases, grouped line items by category, distance-based transport billing, and structured adjustments (GST per category group with % rate auto-calculation, Advance Deduction as fixed amount, IT TDS with % rate auto-calculation). For ALL-type grouped bills, each category (Equipment/Material/Transport) has its own optional GST rate shown after the group subtotal; total GST is summed at the bottom. IT TDS is applied on base total (not on GST). Schema columns: `gst_rate_equipment`, `gst_rate_material`, `gst_rate_transport`, `tds_rate` (all nullable real). Legacy `adjustment_label`/`adjustment_amount` kept for backward compat (advance deduction). Enhanced with PDF export and print layouts. Features **Vendor Rate Cards** (`vendor_rate_cards` table) for persistent per-vendor per-item rates that auto-apply during bill creation and are saved back when SET RATES is used. Includes **duplicate billing detection** — items already billed in other vendor bills are flagged with a red BILLED badge showing the bill reference and status. **Line item clarity**: Auto-populated equipment items include machine name + task/activity from DPR (e.g., "JCB - SURFACE CLEANING (SITE) - DAILY HIRE | 8 HRS") with a `siteName` column on `vendor_bill_items` storing source info ("SITE: {site_name}", "PLANT", "SITE*: {site_name}"). Colour-coded source badges (blue SITE, green PLANT, orange SITE*) display in detail view, edit form, print layout, and PDF export. Bill numbers use format `HLC/VB/{YEAR}/{SEQUENCE}` auto-incrementing per calendar year. Rate Card management UI at `/plant/rate-cards` with three sections (Equipment, Materials, Transport) each with ADD ROW capability. **Machine name canonicalization** strips deployment/vendor suffixes (e.g. "JCB-PLANT", "TIPPER-RAMESH", "TIPPER-2 SUNDAR" → "JCB", "TIPPER") so rate cards group by machine type, not individual registration. Rate card keys: equipment `EQ_{CANONICAL_NAME}_{UNIT}` (e.g. `EQ_TIPPER_HRS`), materials `MAT_{NAME}_{UNIT}` (e.g. `MAT_20MM_CFT`). Transport section shows machine type + billing mode only (no individual trip entries). ADD ROW: Equipment/Transport pick from canonical types dropdown + billing mode; Materials pick from plant_materials master + unit. `GET /api/equipment-master/canonical-types` endpoint provides canonical machine type names. Dual-key lookup: new format first, fallback to legacy `{equipmentId}_{ENTRY_TYPE}` / `MAT_{NAME}` keys.
- **Authentication & Access Control**: Role-Based (Engineer, Manager, Admin) with PIN-based authentication for elevated actions. Admin PINs are stored in `app_settings`.
- **Water Tanker Tracking**: When a Water Tanker is selected in the DPR equipment log (detected by machine name containing "WATER" or "TANKER"), additional fields appear for Water Quantity (Liters) and No. of Trips. The `waterQuantity` (real, nullable) column in `equipment_logs` stores this data. Water tanker entries with quantity/trips data are included in the Materials Received report as source="equipment".
- **Materials Received Report**: Combined view on Site Dashboard merging `site_material_trips` (quick trip entries), DPR `material_logs` (type='Received'), and water tanker `equipment_logs` entries. API: `GET /api/materials-received`. Filters: date range, site, material name. Source badges: TRIP (blue) / DPR (amber) / EQUIP (green). Water entries only appear when waterQuantity or numberOfTrips is set (avoids false positives from name matching alone).
- **Site Purchases Report**: Combined view at `/site/purchases` merging DPR `site_purchases` and direct diesel purchases from `equipment_logs` (dieselSource='direct_purchase'). Source badges: PURCHASE (teal) / DIESEL (orange). Diesel entries are read-only (not editable from this report).
- **Bituminous Mix Rate Calculator**: Interactive tool at `/mix-calculator` (vanilla HTML/JS), also accessible as a tab inside Admin Reports. Calculates ₹/MT, ₹/CUM, ₹/SQM rates for bituminous road layers (BC, DBM, SDBC, custom). Features: 2–4 configurable mix types with aggregate proportions, owned vs hired equipment modes, fuel & energy (HSD, LDO dryer, boiler), laying & compaction, transport, prime & tack coat costing. Job Estimator supports multiple mix types per job with full cost column breakdown (Plant ₹/MT, Plant Amt, Trans ₹/MT, Trans Amt, Lay ₹/MT, Lay Amt, Prime ₹, Tack ₹). Contractor Summary groups by contractor → mix type. Procurement Summary with per-material quantities. Scroll-wheel prevention on number inputs. Live recalculation on every input change with sticky rate summary panel. File: `client/public/mix-calculator.html`, route: `GET /mix-calculator` in `server/routes.ts`. **Database-backed Saved Estimates**: 💾 Save button in calculator top bar POSTs/PUTs state JSON to `mix_estimates` table via `/api/mix-estimates` CRUD. 📂 Saved button shows modal list with Load and Delete actions. `currentEstimateId` tracked in-page + persisted via localStorage for cross-reload continuity. React list page at `/admin/mix-estimates` shows all saved estimates grouped by contractor with Load-in-Calculator, Delete, Price Impact, and New Site actions. "Saved Estimates" link appears on the Mix Calculator tab in Admin Reports. Contractor groups support inline rename (pencil icon) with case-insensitive bulk update via `PATCH /api/mix-estimates/rename-contractor`. Startup migration auto-fixes NULL contractor values from saved state JSON. **Price Impact Analysis** (`/admin/mix-impact`): React page for scenario-based cost impact analysis. Users select a saved estimate, create named scenarios (each opening the Mix Calculator in "Scenario Edit Mode"), and compare full calculator states side-by-side. `price_scenarios` DB table: `estimateId`, `name`, `revisedPrices` (legacy default `{}`), `state` (full JSON, nullable), `updatedAt` (nullable timestamp), `createdAt`. API: `GET/POST /api/price-scenarios`, `GET/PATCH/DELETE /api/price-scenarios/:id`. `diffCalcInputs(base, revised)` in `mixCalc.ts` generates a diff of all changed input keys. ScenarioComparison shows three tables: changed inputs, mix-type rates, and job-wise cost impact. Scenarios with full `state` use `calcMixRatesAndJobs(scState)` directly; legacy scenarios fall back to `revisedPrices` overrides. Timestamps shown as "Saved 15 Mar 26, 10:42 AM · Edited 17 Mar 26, 3:15 PM". **Scenario Edit Mode** in calculator: URL param `?scenarioId=<id>&estimateId=<eid>` triggers a blue banner with "Save Scenario & Return" button; state is PATCHed to `/api/price-scenarios/:id`; `saveState()` skips localStorage during scenario sessions. Print button available. **Contractor Comparative Rate Statement** (`/admin/mix-comparison`): React page comparing all contractors' mix rates and jobs in one view. Section 1: rate grid showing Final Laid ₹/MT per mix type per contractor with green (lowest) / red (highest) highlighting. Section 2: job ledger grouped by contractor with subtotals and grand total (columns: Contractor, Estimate/Job, MT, Plant ₹/MT, Trans ₹/MT, Lay ₹/MT, Total ₹/MT, Amount). Export to Excel (two sheets: Rate Comparison + Job Ledger). Print-ready. "Comparative Report" button in MixEstimates header navigates to this page.
- **Data Management**: Admin-only export/import tool for selected tables, facilitating data transfer between environments.
- **UI/UX**: Responsive design, uppercase conversion for text inputs, in-app and Web Push notifications. Equipment dropdowns show detailed vendor/owner information.

### Build System
- **Development**: `tsx` and Vite dev server.
- **Production**: esbuild for server, Vite for client.

## External Dependencies

### Database
- `pg` (PostgreSQL client)
- `drizzle-orm/node-postgres`

### Data Export & Reporting
- `xlsx` (for Excel generation)
- `pdfkit` (for PDF generation, specifically for vendor bills)

### UI Libraries
- Radix UI (core for shadcn/ui)
- `embla-carousel-react`
- `react-day-picker`
- `cmdk`
- `vaul`
- `recharts`

### Form Handling & Validation
- `react-hook-form`
- `@hookform/resolvers` (for Zod integration)
- `zod`
- `drizzle-zod` (for schema derivation)

### Push Notifications
- `web-push`

### Date Manipulation
- `date-fns`