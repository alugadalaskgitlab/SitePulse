# SiteLog - Construction Daily Progress Report System

## Overview
SiteLog is a web application designed to digitalize and streamline construction management, primarily focusing on Daily Progress Reports (DPRs) and Plant Production logs. It provides real-time insights into site activities, equipment usage, labor, and material consumption. The system aims to enhance operational efficiency, offer a centralized platform for project oversight, and support data-driven decision-making in construction projects. Key capabilities include robust role-based access control, comprehensive modules for plant operations, procurement, and finance, and advanced reporting features.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### UI/UX and Frontend
The application uses React 18 with TypeScript, Wouter for routing, TanStack React Query for server state management, and React Hook Form for form handling. UI components are built with shadcn/ui (Radix UI + Tailwind CSS) featuring an industrial color palette. Vite is used as the build tool.

### Backend and API
The backend is built with Node.js and Express (ESM) using TypeScript, exposing a RESTful API with Zod for request validation.

### Data Management
PostgreSQL is the primary database, managed with Drizzle ORM and `drizzle-zod` for schema derivation. Schema management is handled via `drizzle-kit push`.

### Core Features
- **Daily Progress Reports (DPRs)**: Comprehensive logging of daily activities, equipment, labor, materials, and water tanker tracking, with versioning.
- **Plant Module**: Features detailed operations (shift logs, heating sessions), management (stock, variance, audit), reports (daily plant reports, heating trends), and master data. Includes contractor-aware manpower tracking, automated LDO meter readings, and bulk PDF export for daily reports. Admins can also enter historical Tank-1 / Tank-2 LDO flow-meter readings via the **LDO Meter Backfill** tool at `/plant/ldo-backfill` (date-range + plant filters, editable grid, optional auto-chain, CSV paste). The tool is gated by the admin role (`assertAdmin`); rows are written into `ldo_flow_readings` tagged with a `[BACKFILL by <actor>]` marker in `notes` so re-saves are idempotent and existing shift-log / heating-session rows are never overwritten.
- **Boiler/Heating Management**: Tracks heating sessions, provides trend analysis, and generates alerts based on configurable thresholds for temperature, fuel consumption, and discrepancies. Heating sessions are surfaced inline inside the Plant Shift Log edit view, and inline-DG runs tagged with `generator_logs.source_heating_session_id` are badged on the heating-sessions list and the Plant Daily Report generator table so the link is always visible. The "Link Existing Generator Log" DG mode now draws from a unified candidates endpoint (`/api/plant-module/generator-candidates`) that merges `generator_logs` rows with DG entries from `equipment_usage` (for equipment_master rows typed `generator`); selecting an equipment_usage candidate materializes a mirror `generator_logs` row (`/api/plant-module/generator-logs/from-equipment-usage`) before linking. Inline-DG entries from the heating session also auto-create a mirrored `equipment_usage` row tagged with `equipment_usage.source_heating_session_id`, so a single inline entry feeds both the generator log ledger and the equipment usage / fuel-stock reports without operator double-entry. The mirrored row is updated on every save and deleted when the session switches to link/none mode or is deleted.
- **Plant Production Module**: Manages material receipts, mix templates, truck dispatches with owner-first stock routing and borrowing logic, and detailed equipment usage including fuel stock tracking. Includes a stock ledger reassignment tool.
- **Procurement & Finance Module**: Handles Purchase Indents, Daily Diesel Requirements with approval workflows, and Vendor Bills with duplicate billing detection and rate card integration, supporting equipment, material, transport, and labor categories.
- **Rate Calculators**:
    - **Bituminous Mix Rate Calculator**: Interactive tool for calculating rates for bituminous road layers, supporting multiple mix types, configurable equipment modes, scenario analysis, and estimation saving.
    - **Concrete Rate Analysis Calculator (v1 & v2)**:
        - **v1**: BOQ-based analysis for civil structures covering project info, mix design, materials, equipment, formwork, curing, overheads, BBS, wastage, and profitability. Features multi-location blending and a redesigned reporting tab.
        - **v2**: Location-centric rebuild with detailed dimensions, aggregate sourcing, rebar design, and cost parameters, providing a rate analysis sheet and updated EstimatorHub.
- **QTO & BOQ Tab**: Provides structure dimensions, volume summary, per-meter rate card, earthwork, ancillary rates, and a BOQ Estimator with Excel import.
- **Estimator Portal**: A unified portal (`/estimator-hub`) with server-side cookie authentication and role-based access for all rate calculators.
- **Authentication & Access Control**: Role-Based Access Control (Engineer, Manager, Admin) with PIN authentication for critical actions. Cross-user login on a shared browser preserves the original user's approved-device cookie until the new device is actually approved: when login lands on `device_pending` and the cookie pointed to an approved device for a different user, the server returns a signed `pendingDeviceToken` instead of rotating the cookie. The Login page polls `/api/auth/device-status?token=…` and, on approval, calls `POST /api/auth/claim-device { token }` — the only path that rotates the cookie to the newly-approved device. This prevents the "everyone-locked-out" failure mode where attempting to log in as a new user from an admin's browser would otherwise overwrite the admin's cookie. Device matching in `ensureDeviceForUser` now resolves in this order: (1) reuse the device the cookie already points to if it belongs to this user; (2) **only when the browser cookie is APPROVED for some other user (i.e. this physical browser was already trusted by an admin) AND the request is not a bootstrap auto-approve**, reuse an existing **approved** device for `(userId, userAgent)` and rotate the cookie to it (this lets a returning user whose device was already approved log straight in instead of being trapped in a pending loop); (3) under the same trusted-browser + non-bootstrap guard, reuse a **recently-pending** device (within the last 24h) for `(userId, userAgent)` so repeated retries don't pile up duplicate pending rows; (4) otherwise mint a fresh device. The "browser already trusted" guard is critical security: pending or revoked cookies don't count, otherwise an attacker who knew a password could bypass device approval simply by holding any prior cookie and spoofing the User-Agent of a known-approved browser. Bootstrap recovery (BOOTSTRAP_ADMIN_EMAIL when zero approved devices exist) also skips steps 2/3 to guarantee a fresh approved device row even if a stale pending row already exists. The `preserveExistingCookie` guard in the login handler still suppresses cookie rotation in the cross-user pending case but never fires when step 2 returns an approved device.
- **Reporting**: Includes Materials Received and Site Purchases reports.
- **Data Export/Import**: Admin-only tools for selected table data transfer.

### Build System
Development uses `tsx` and Vite; production builds use esbuild for the server and Vite for the client.

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