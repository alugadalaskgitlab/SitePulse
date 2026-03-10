# SiteLog - Construction Daily Progress Report System

## Overview

SiteLog is a web application for construction management, focusing on Daily Progress Reports (DPRs) and Plant Production logs. It enables site personnel to record and track daily activities like work progress, equipment usage, labor, and material consumption. The system features role-based access control with PIN authentication. SiteLog aims to streamline reporting, provide real-time insights, and improve operational efficiency in construction.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter
- **State Management**: TanStack React Query for server state, React Hook Form for form state
- **UI Components**: shadcn/ui (Radix UI + Tailwind CSS, industrial color palette with amber/orange primary)
- **Build Tool**: Vite

### Backend
- **Runtime**: Node.js with Express (ESM)
- **Language**: TypeScript
- **API Pattern**: RESTful API with Zod validation
- **Route Definitions**: Centralized with typed schemas (`shared/routes.ts`)

### Data Storage
- **Database**: PostgreSQL
- **ORM**: Drizzle ORM with `drizzle-zod`
- **Schema Management**: `shared/schema.ts`, migrations via `drizzle-kit push`

### Key Data Models
- Daily Progress Reports (DPRs) covering progress, equipment, labor, and material.
- Plant Production Reports.
- DPR versioning with `isSuperseded` flag for audit trails.
- Personnel Master for tracking roles per activity.

### Authentication & Access Control
- **Role-Based**: Engineer (view), Manager (add + edit), Admin (full control including delete + export).
- **PIN-Based**: Client-side PIN authentication for elevated access.
- **Admin PINs**: Stored in `app_settings` table.
- **Masters Access**: Manager can view, add, and edit entries in all master sections. Delete and export require Admin PIN.

### Build System
- **Development**: `tsx` and Vite dev server.
- **Production**: esbuild for server, Vite for client.

### Plant Module (Stock & Production Accounting)
- Manages material receipts, mix templates, truck dispatches, and stock deductions.
- **Party-Based Stock**: All stock is attributed to a party, with HLC as primary for common stock.
- **Equipment Master**: Enhanced with ownership status, vendor details, and active status.
- **Equipment Entry Types**: Supports `time_meter`, `hourly`, `daily`, `trip_based`, and `monthly` entry modes for equipment logs in both DPRs and Plant. Entry type is a billing label — all types keep time/meter/diesel fields visible for consumption tracking. Trip-based additionally shows trip count and distance fields.
- **Diesel Flow**: Diesel stock deduction from HLC stock can originate from both Plant Equipment Usage and DPR equipment logs, with overlap detection.
- **Fuel Stock Tracking**: Includes Bitumen Stock Tracker (tank dip chart with linear interpolation), LDO Flow Meter Tracker (meter readings for consumption), and Consumption Variance Report (actual vs. template).
- **Material Returns**: System for returning issued materials back to plant stock, linked to original issues.

### Procurement & Finance Module
- **Purchase Indents**: Multi-item purchase request system with partial quantity approval workflow. Indent number format: `HLC/PI/YYYY/NNNN`. Statuses: pending → approved → completed (auto when all items have terminal status) or rejected. Features: proposedBy/raisedBy fields, per-item approval with adjustable quantities, purchase tracking (vendor, bill, rate, amount per item).
  - **Edit/Delete (All non-completed)**: Manager/Admin can edit pending indents (PIN-gated). Admin can edit non-pending (approved/rejected) indents (admin PIN required, auto-reverts to pending, clears approval/rejection fields and item history). Admin can delete any non-completed indent (PIN-gated, confirmation dialog). Completed indents cannot be edited/deleted.
  - **Item Cancellation**: Individual items can be cancelled (PIN-gated manager/admin) with mandatory reason. Cancelled items show grey badge with who/when/why.
  - **Force Close**: Admin can force-close an indent, cancelling all remaining unfulfilled items at once (PIN-gated admin only).
  - **Item History**: `purchase_indent_item_history` table tracks every status change (PURCHASED, PARTIAL, NOT_PURCHASED, CANCELLED) with who, when, vendor, qty, amount, and notes. Expandable timeline UI per item.
  - **Auto-Complete Logic**: Indent auto-completes when ALL items have terminal status (PURCHASED, PARTIAL, NOT_PURCHASED, or CANCELLED).
  - **Procurement Report**: Filterable report view showing all items across indents with summary cards (Total Items, Fulfilled %, Total Spend, Pending). Filters: date range, status, purpose, vendor. Clickable rows navigate to indent detail.
  - Tables: `purchase_indents`, `purchase_indent_items`, `purchase_indent_item_history`
  - Routes: `/api/purchase-indents`, `/api/purchase-indents/report`, `/api/purchase-indent-items/:id/cancel`, `/api/purchase-indent-items/:id/history`, `/api/purchase-indents/:id/force-close`, `PUT /api/purchase-indents/:id`, `DELETE /api/purchase-indents/:id`, `/plant/purchase-indents`
- **Daily Diesel Requirements**: Per-equipment diesel planning and procurement tool (does NOT affect stock). Features: equipment dropdown from master (shows owner info), estimated hours/norm/planned qty (rounded UP to whole numbers via Math.ceil), editable approval qty per equipment, purchase tracking, comparison report (planned vs purchased vs actual issued from equipment_logs/equipment_usage).
  - **Edit/Delete (All statuses)**: Manager/Admin can edit pending requirements (PIN-gated). Admin can edit non-pending requirements (admin PIN required, auto-reverts to pending, clears approval/purchase fields). Admin can delete any requirement (PIN-gated, confirmation dialog).
  - Tables: `diesel_requirements`, `diesel_requirement_items`
  - Routes: `/api/diesel-requirements`, `PUT /api/diesel-requirements/:id`, `DELETE /api/diesel-requirements/:id`, `/plant/diesel-requirements`
- **Vendor Bills**: Comprehensive date-wise billing system with 4-step workflow (Draft → Verified → Approved → Paid). Bill number format: `HLC/VB/YYYY/NNNN`. Bill types: equipment / material / transport / all / other. Auto-pulls date-wise line items from ALL vendor data sources for a given vendor+period. Each line item has date, category badge (EQUIP/MATL/TRNS), description with entry type/hours/diesel info, qty, unit, rate (editable), and auto-calculated amount. PIN-gated status advancement (manager or admin). Transport billing uses per-trip distance-based calculation: amount = leadDistance × 2 (round trip) × rate per km.
  - **Data Sources**: Site DPR equipment_logs (hired equipment + unlinked equipment matched by vendor name in machine text), Plant equipment_usage (hired), Site DPR material_logs (type=Received), site_material_trips, plant material_receipts, truck_dispatches (transport)
  - **Vendor Alias System**: `vendor_aliases` table maps alternate vendor name spellings to canonical names (e.g., NARSIMULU = NARASIMHULU). Auto-pull uses all name variants when matching. Vendor names list is deduplicated via aliases. PIN-gated (admin) management UI via settings button on list page.
  - **Entry Type Sub-Filtering**: Equipment bills can be filtered by entry type category (Daily & Hourly, Trip Based, Monthly) via `entryTypeFilter` query param.
  - **Enhanced Descriptions**: Equipment items show entry type label (HOURLY HIRE, DAILY HIRE, etc.), actual hours worked, and diesel issued in description text.
  - **Diesel Indicator**: Amber badge with fuel icon shown on equipment rows that have diesel issued, in both form and detail views.
  - **Rate Shortcuts**: "Apply Rate to Similar" button copies rate to matching equipment rows (same equipmentId + entry type) that have rate = 0.
  - **Vendor Names API**: Aggregated from equipment_master.vendor_name, material sources' supplier fields, truck_dispatches.owner_name, deduplicated via vendor aliases.
  - **Vendor Discovery**: `GET /api/vendor-bills/discover-vendors` shows available vendors for a bill type + period with record counts, category badges, and existing bill status indicator. Replaces blind vendor selection.
  - **Transport Billing**: Transport items use distance-based billing. `leadDistance` column on `vendor_bill_items` stores one-way KM. Amount = leadDistance × 2 × rate (₹/km). Auto-items from truck_dispatches set qty=1, unit=TRIP. Label: "TRANSPORT" (not "MIX TRANSPORT").
  - **PDF Export**: `GET /api/vendor-bills/:id/pdf` generates downloadable PDF (pdfkit) with company header, bill details table, line items, summary totals (items count, qty, amount), and signature blocks (company + vendor). Only for verified/approved/paid bills. Dynamic column widths with description text wrapping.
  - **Enhanced Print**: Professional print layout with company header, structured bill details, styled table, summary totals, signature blocks, and footer. Print-optimized font sizes and dark colors for legibility on paper.
  - **Edit/Delete for Verified/Approved**: Admin can edit or delete verified/approved bills (PIN-gated). Editing auto-reverts status to draft. Paid bills cannot be edited/deleted.
  - **Filter Clear Buttons**: Individual (x) clear buttons for each filter + "CLEAR FILTERS" button to reset all.
  - Tables: `vendor_bills`, `vendor_bill_items` (with `date`, `category`, `leadDistance` columns), `vendor_aliases`
  - Routes: `/api/vendor-bills`, `/api/vendor-bills/vendor-names`, `/api/vendor-bills/auto-items`, `/api/vendor-bills/discover-vendors`, `/api/vendor-bills/:id/pdf`, `/api/vendor-aliases`, `/plant/vendor-bills`

### Data Management
- **Data Export/Import**: Admin-only tool for transferring data between development and production environments. Export selected tables as JSON file, import back with upsert logic (update existing by ID, insert new). Available from Management tab (admin only).
  - Exportable tables: equipment_master, vendor_aliases, parties, plant_materials, mix_templates, equipment_usage, truck_dispatches, material_receipts, material_issues, dprs (with sub-tables), stock_ledger, stock_balances, vendor_bills, purchase_indents, diesel_requirements, sites
  - Routes: `/api/admin/exportable-tables`, `/api/admin/export-data`, `/api/admin/import-data`, `/plant/data-sync`

### Plant Module Tab Structure
- **Operations**: Material receipts, issues, returns, dispatches, equipment usage, Purchase Indents, Diesel Requirements
- **Management** (PIN-gated): Stock & ledger cards + Vendor Bills + Admin tools (Data Export/Import)
- **Masters** (PIN-gated): Parties, materials, mix templates, equipment master, sites, personnel

### UI/UX & Features
- **UI Enhancements**: Responsive design using shadcn/ui.
- **Site Reports**: Advanced filtering (date range, site, engineer, etc.) and Admin-only export options (Excel, PDF, Print).
- **Equipment Tracking**: Time entry and hour meter readings with efficiency calculations. Equipment dropdowns show vendor/owner info (HIRED: {vendor} or HLC OWN) in both DPR and Plant forms.
- **Equipment Master**: Enhanced with ownership status, vendor details, and active status.
- **Per-Row "No Site Work"**: Allows free-text descriptions for individual activity progress rows.
- **Personnel Tracking**: Link personnel from a master list to specific activity rows in DPRs, with PIN-gated inline addition.
- **DPR Version Deduplication**: Uses `isSuperseded` flag to manage versions, ensuring only the latest is active.
- **Uppercase Convention**: All text inputs are automatically converted to uppercase.
- **Admin Notifications**: In-app notification system with bell icon, sound alerts, and auto-refresh.
- **Push Notifications**: VAPID-based Web Push for real-time OS-level notifications, PIN-gated subscription.

## External Dependencies

### Database
- PostgreSQL (`pg`, `drizzle-orm/node-postgres`)

### Export Functionality
- `xlsx` (Excel generation)
- `pdfkit` (PDF generation for vendor bills)

### UI Libraries
- Radix UI
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
- `web-push`

### Date Utilities
- `date-fns`