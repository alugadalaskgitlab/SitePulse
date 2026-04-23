# SiteLog - Construction Daily Progress Report System

## Overview

SiteLog is a web application designed to digitalize and streamline construction management, primarily focusing on Daily Progress Reports (DPRs) and Plant Production logs. It aims to provide real-time insights into site activities, equipment usage, labor, and material consumption. The system includes robust role-based access control with PIN authentication and comprehensive modules for plant operations, procurement, and finance. Its core purpose is to enhance operational efficiency, provide a centralized platform for project oversight, and support data-driven decision-making in construction projects.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### UI/UX and Frontend
The application utilizes React 18 with TypeScript, Wouter for routing, TanStack React Query for server state management, and React Hook Form for form handling. UI components are built with shadcn/ui (Radix UI + Tailwind CSS) featuring an industrial color palette. Vite is used as the build tool.

### Backend and API
The backend is built with Node.js and Express (ESM) using TypeScript. It exposes a RESTful API with Zod for robust request validation.

### Data Management
PostgreSQL serves as the primary database, managed with Drizzle ORM and `drizzle-zod` for schema derivation. Schema management is handled via `drizzle-kit push`.

### Core Features and Modules
- **Daily Progress Reports (DPRs)**: Comprehensive logging of daily activities, including work progress, equipment, labor, materials, and water tanker tracking, with versioning for audit trails.
- **Plant Tab Layout (4 tabs)**: **Operations** (operator entry — no PIN; today's Shift Log, Heating Sessions, etc.; duplicate Shift Log + Historical Daily Reports tiles removed), **Management** (PIN-gated stock, variance, audit, bitumen/LDO trackers, etc.), **Reports** (PIN-gated, dedicated reports tab — Today's Daily Plant Report, Historical Daily Reports, Boiler/Heating Trends), and **Masters**. Back buttons on Shift Log, Heating Sessions, and Daily Plant Report preserve the originating `tab`/`role` query params (now including `tab=reports`) so users return to the correct tab.
- **Plant Shift Log Manpower (contractor-aware)**: `plant_shift_log_manpower` rows now carry `contractorName`, `category` (one of `LABOUR_CATEGORIES`: MASON, HELPER, MAZDOOR, CARPENTER, BARBENDER, FITTER, ELECTRICIAN, WELDER, OPERATOR, DRIVER, SUPERVISOR, OTHER), and `gender` (`MALE`/`FEMALE`). All values are uppercased & trimmed at the storage layer. The Plant Shift Log page renders manpower in a summary table with an Add/Edit modal that captures Name, Role/Trade, Contractor, Category, Gender and shows a live rate-card key hint (`LAB_{CATEGORY}_{GENDER}` or `LAB_{CATEGORY}`) so Vendor Bills (Labour) auto-pull works consistently. Idle events also moved to a modal (Start, End, Reason, Remarks) with computed duration in the summary table. A startup migration (`migrateLegacyPlantShiftLogManpower`) backfills any legacy rows that still have null `contractorName`/`category`/`gender` — it tries to extract a contractor from the worker name (parentheses or trailing dash/slash separator) and canonicalises it via `vendor_aliases`, infers category from name+role keywords, and defaults gender to `MALE` (unknown contractor → `UNKNOWN CONTRACTOR`, unknown category → `OTHER`). An admin cleanup screen (`/plant/shift-log-manpower-review`, PIN 0808 — also reachable via the "Review UNKNOWN Workers" button on the Plant Shift Log page) lists workers still tagged `UNKNOWN CONTRACTOR` or `OTHER`, grouped by name with row count, date range and current values; admin picks the real contractor (free-text + datalist of canonical vendor names) / category / gender and "Apply" updates every shift-log row of that worker name in one go (via `POST /api/plant-module/shift-log-manpower/bulk-relabel`, contractor name canonicalised through `vendor_aliases`, audit-logged with operator name).
- **Plant Generators dropdown**: `GET /api/plant-module/generators` returns the union of distinct `generatorName`s from `generator_logs` plus the defaults "600 KVA" and "40-30 KVA", sorted. Bitumen Heating Sessions inline-DG generator dropdown reads from this endpoint so newly added generators appear automatically.
- **Historical Daily Plant Reports** (`/plant/daily-reports`): Index page listing every past date (per plant) that has any source data — dispatches, equipment, shift log, bitumen dips, LDO meter, or heating sessions — grouped by month with section badges and quick stats (loads, MT, sessions count). Backed by `/api/plant-module/daily-reports-index?from&to&plant`, which aggregates per-section flags + counts via per-table `GROUP BY date, plant_name` queries (bitumen dip and LDO flow tables, which lack `plant_name`, are attributed to the requested plant or "Main Plant"). Date-range and plant filters with 7/30/90/365-day quick buttons. Each row has Open (links to `/plant/daily-report/:date`) and PDF buttons. A "Bulk Export PDFs (ZIP)" button sends ALL visible rows in a single POST to `/api/plant-module/daily-reports/bulk-zip` (accepts an `entries: [{date, plant}]` array; old `{plant, dates}` shape kept for back-compat). The server builds every PDF (shared `renderDailyPlantPdfBody` helper) into ONE STORE-mode ZIP across plants using a built-in encoder (no extra dependencies), embeds a `manifest.json` with per-entry status, and returns response headers `X-Bulk-Total`/`X-Bulk-Succeeded`/`X-Bulk-Failed`/`X-Bulk-Status` (base64 JSON) so the page renders a "Last bulk export" panel listing each date as OK or Failed. Capped at 200 entries per request. The existing per-date Daily Plant Report page also shows a "Browse all dates" link in its header.
- **Plant Shift Log & Daily Plant Report**: Operator-facing **Plant Shift Log** (`/plant/shift-log`, `/plant/shift-log/:date`) captures plant start/stop, weather, operator/supervisor, bitumen tank temps & opening/closing dips, LDO Tank-1/Tank-2 opening/closing flow-meter readings, manpower roster, and idle events (start/end/reason from a fixed enum: Material Shortage, Mechanical, Electrical, Motor Tripping, No Demand, Power Failure, Rain, Other). Save = operator draft; Finalize requires manager or admin PIN; delete requires admin PIN. On save, bitumen dip and LDO flow rows are written through to `bitumen_dip_readings` and `ldo_flow_readings` idempotently via `sourceShiftLogId`. Versioned in `plant_shift_log_versions`. New shift logs **auto-fill LDO Tank-1/Tank-2 opening meters** from the latest closing reading (heating session or shift log) via `/api/plant-module/ldo-meter/last`; manual edits clear the auto-fill hint. The **Daily Plant Report** (`/plant/daily-report`, `/plant/daily-report/:date`) is a read-only consolidated view aggregating dispatches (loads, MT, theoretical bitumen & LDO), the shift log, equipment-usage diesel (l/hr), idle minutes by reason, manpower, shift-meter LDO consumption (Tank-1 boiler vs Tank-2 dryer + L/hr + L/MT mix), and a **Boiler / Heating Sessions** block with per-session totals + reconciliation badge when sessions LDO differs from shift-meter Tank-1 by > 5 L. PDF export via `/api/plant-module/daily-reports/:date/pdf` includes the Boiler/Heating section.
- **Boiler Heating Trends** (`/plant/heating-trends`): Date-range trend report (default last 30 days, 7/30/90 quick-range buttons) over `/api/plant-module/heating-trends`. Aggregates heating sessions per day split by night pre-heat vs daytime maintenance: heating hours, LDO Tank-1 L, L/Hour, L/MT (using daily mix MT from truck dispatches), plus combined totals and DG diesel. Recharts `LineChart` shows L/MT over time with night/day split lines and a 1.5 L/MT target reference line; daily breakdown table flags over-target days in red and drills into `/plant/heating-sessions/:date`. Excel export at `/api/plant-module/heating-trends/excel` produces a Summary + Daily workbook. "View Trends" button added to the Heating Sessions header.
- **Boiler / Heating Alerts**: After every heating session save, the server checks three thresholds and fires both a web-push notification (`sendPushToAll`) and an inbox entry (`admin_notifications`): hot-oil end temp below floor, boiler LDO L/hour above limit, and same-day sessions vs shift-meter Tank-1 mismatch above tolerance. Thresholds are stored in `app_settings` under key `plant_alert_thresholds` (defaults: 200 °C / 25 L per hr / ±5 L) and managed via `GET /api/plant-module/alert-thresholds` (read) and `PUT /api/plant-module/alert-thresholds` (admin PIN). Alerts are fire-and-forget so they never break a save.
- **Bitumen Heating Sessions** (`/plant/heating-sessions`, `/plant/heating-sessions/:date`): Per-session boiler/heating runs with start/end time, staff name & role, hot-oil temps (start/end + optional supply/return), bitumen Tank-1/Tank-2 temps (start/end), LDO Tank-1 (boiler) opening/closing flow-meter, and a DG mode of `none` | `inline` | `link`. Inline DG capture (start/end, opening/issued/closing diesel, generator name) auto-creates or upserts a row in `generator_logs` keyed by `sourceHeatingSessionId` (unique index) so the DG hours/diesel are never double-counted. Link mode picks an existing same-date generator log and stores `generatorLogId`. Tank-1 opening meter auto-fills from the most recent closing (previous heating session or shift log) with a "Auto-filled from …" hint. Save = operator draft; Finalize = manager/admin PIN; Delete = admin PIN. Versioned in `plant_heating_session_versions`. Tile lives on the Plant Operations dashboard (orange flame icon) next to Today's Daily Plant Report.
- **Plant Production Module**: Manages material receipts, mix templates, truck dispatches, stock deductions, and detailed equipment usage, including fuel stock tracking. Truck dispatches use **owner-first stock routing**: each dispatch deducts only from its own `partyId` (owner). When the owner's stock is insufficient, the API returns HTTP 409 with a structured shortage payload and the dispatch form shows a confirmation modal; only on explicit operator approval is the shortfall borrowed from HLC and tagged "(Borrowed from HLC)" in the ledger. Bitumen and LDO trackers display a red banner whenever any party balance goes negative. An admin-only **Stock Ledger Reassignment** tool (`/plant/stock-reassign`, PIN 0808) previews and bulk-moves past ledger rows from one party to another (filterable by material, date range, and transaction type), then re-runs balance reconciliation. Execute requires both the admin PIN and an operator name; both are written to a console audit log line (actor, ISO timestamp, criteria JSON, moved+totals).
- **Procurement & Finance Module**: Includes Purchase Indents with multi-item requests and approval workflows, Daily Diesel Requirements with approval workflows, and Vendor Bills with a four-step workflow, duplicate billing detection, and Vendor Rate Cards. Vendor Bills support four billable categories — Equipment, Material, Transport, and Labour. Labour bills are contractor-wise: auto-pull groups DPR `labour_logs` rows by (date, site, category, gender) into HEAD-DAY line items, with rate-card keys `LAB_{CATEGORY}` or `LAB_{CATEGORY}_{GENDER}`. Labour contractor names are normalised to upper-case at startup so vendor canonicalisation matches consistently across DPRs and bills.
- **Bituminous Mix Rate Calculator**: An interactive tool for calculating rates for bituminous road layers, supporting multiple mix types, configurable equipment modes, and detailed costing. It includes Job Estimator, Contractor Summary, Procurement Summary, database-backed saving of estimates, price impact analysis via scenarios, and side-by-side scenario comparisons.
- **Concrete Rate Analysis Calculator (v1 and v2)**:
    - **v1**: BOQ-based rate analysis for civil structures with modules for Project Info, Mix Design, Raw Materials, Batching Equipment, Placement, Formwork & Staging, Curing, Overhead & Margin, Bar Bending Schedule (BBS), Wastage & Risk Allowances, Contract Profitability, Price Impact, and Scenario Comparison. Supports Petty Labour Contract mode and Multi-Location Rate Blending. Recent cleanup: Calculator tab uses single-column `space-y-5` layout (Rate Breakdown card removed); Reports tab redesigned with multi-select amber filter bar (5 sections: Concrete Rates, Steel Rates, Cost Breakdown, Per Metre, BOQ), grade filter, Print All button, and all selected sections shown simultaneously. `effectiveVolume` (prefers QTO RCC volume over manual input) used for steel cost calculations.
    - **v2**: A location-centric rebuild (`/concrete-calculator-v2`) with a new database table, featuring detailed location-specific dimensions, aggregate sourcing, rebar design, fixtures, and cost parameters. It provides a Rate Analysis Sheet with combined length-weighted costs and an updated EstimatorHub.
- **QTO & BOQ Tab**: Provides Structure Dimensions, Volume Summary, Per-Metre Rate Card, Earthwork & Ancillary Rates, and a BOQ Estimator with Excel import capabilities.
- **Estimator Portal**: A unified access portal (`/estimator-hub`) with server-side cookie authentication for all rate calculators, implementing role-based access control for managers.
- **Authentication & Access Control**: Role-Based Access Control (Engineer, Manager, Admin) with PIN-based authentication for critical actions.
- **Reporting**: Includes Materials Received Report and Site Purchases Report.
- **Data Export/Import**: Admin-only tools for selected table data transfer.

### Build System
Development uses `tsx` and Vite dev server. Production builds are handled by esbuild for the server and Vite for the client.

## External Dependencies

### Database
- `pg`
- `drizzle-orm/node-postgres`

### Data Export & Reporting
- `xlsx`
- `pdfkit`

### UI Libraries
- Radix UI
- `embla-carousel-react`
- `react-day-picker`
- `cmdk`
- `vaul`
- `recharts`

### Form Handling & Validation
- `react-hook-form`
- `@hookform/resolvers`
- `zod`
- `drizzle-zod`

### Push Notifications
- `web-push`

### Date Manipulation
- `date-fns`