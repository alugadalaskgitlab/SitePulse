# SiteLog - Construction Daily Progress Report System

## Overview

SiteLog is a web application designed to digitalize and streamline construction management, primarily focusing on Daily Progress Reports (DPRs) and Plant Production logs. It aims to provide real-time insights into site activities, equipment usage, labor, and material consumption. The system includes robust role-based access control with PIN authentication and comprehensive modules for plant operations, procurement, and finance. Its core purpose is to enhance operational efficiency, provide a centralized platform for project oversight, and support data-driven decision-making in construction projects.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### UI/UX and Frontend
The application utilizes React 18 with TypeScript, employing Wouter for routing and a combination of TanStack React Query for server state management and React Hook Form for form handling. UI components are built with shadcn/ui (Radix UI + Tailwind CSS) featuring an industrial color palette. Vite is used as the build tool.

### Backend and API
The backend is built with Node.js and Express (ESM) using TypeScript. It exposes a RESTful API with Zod for robust request validation. Route definitions are centralized and strongly typed.

### Data Management
PostgreSQL serves as the primary database, managed with Drizzle ORM and `drizzle-zod` for schema derivation. Schema management is handled via `drizzle-kit push`.

### Core Features and Modules
- **Daily Progress Reports (DPRs)**: Comprehensive logging of daily activities, including work progress, equipment, labor, and materials, with versioning for audit trails. Water tanker tracking is integrated, capturing quantity and trips.
- **Plant Production Module**: Manages material receipts, mix templates, truck dispatches, stock deductions, and detailed equipment usage, including fuel stock tracking and consumption variance.
- **Procurement & Finance Module**:
    - **Purchase Indents**: Multi-item request system with partial approval, adjustable quantities, and status-driven workflows. Features a Material Picker and optional linking to plant materials.
    - **Daily Diesel Requirements**: Manages diesel planning and procurement for equipment with an approval workflow.
    - **Vendor Bills**: A four-step workflow (Draft → Verified → Approved → Paid) for managing vendor invoices. It supports automatic line item population from various sources, vendor aliases, grouped line items by category, distance-based transport billing, and structured adjustments (GST, Advance Deduction, IT TDS). Includes duplicate billing detection and Vendor Rate Cards for automated rate application. Bill numbers follow a `HLC/VB/{YEAR}/{SEQUENCE}` format.
- **Bituminous Mix Rate Calculator**: An interactive tool for calculating rates for bituminous road layers, supporting multiple mix types, configurable equipment modes, and detailed costing for fuel, laying, compaction, and transport. It includes Job Estimator, Contractor Summary, and Procurement Summary functionalities. The calculator supports database-backed saving of estimates, price impact analysis via scenarios, and side-by-side scenario comparisons. It also features a Contractor Comparative Rate Statement for comparing rates across contractors.
- **Concrete Rate Analysis Calculator** (planned — Task #98): BOQ-based rate analysis for civil structures (drains, box culverts, bridges, retaining walls). Full build spec:
    - **Project Info (①)**: estimate name, prepared-by, date, structure type (Drain/Box Culvert/Bridge/Retaining Wall), concrete grade (M10–M40), total volume m³
    - **Mix Design (②)**: IS:456/IS:10262 auto-fill per grade (M20: 320kg cement, M25: 380kg, M30: 420kg, M35: 450kg, M40: 480kg; with matching CA/FA/W-C/admix%); all values editable
    - **Raw Materials (③)**:
        - Cement: price/bag (50 kg) → auto ₹/m³
        - Coarse Aggregate: three tabbed panels (20mm / 10mm / 6mm); each: proportion %, purchase rate ₹/MT, lead km, freight ₹/MT/km, payload MT; landed rate = purchase_rate + (lead × 2 × freight / payload); merged CA ₹/m³ = Σ(proportion_i × ca_kg_total/1000 × landed_i)
        - Fine Aggregate: toggle Natural River Sand vs Robosand/M-Sand; Natural Sand: bulkage slider 0–30% (default 12%) active, effective ₹/m³ includes bulkage; Robosand: no bulkage slider
        - Admixture: product name, dosage L/m³, rate ₹/L → ₹/m³
    - **Batching Equipment (④)**: editable add/remove rows; each row: type (Ajax Self-Loader/Drum Mixer/Pan Mixer/Transit Mixer/RMC), model (free text), mode (Own/Hired); Own: depreciation+fuel+operator ₹/hr, output m³/hr → ₹/m³; Hired: rate ₹/day or ₹/m³; total = sum of rows
    - **Placement (⑤)**: three modes — Own Pump (operating cost ₹/day), Hired Pump (hire rate ₹/day), Transit Mixer (hire per trip × trips/day ÷ output m³/day → ₹/m³)
    - **Formwork & Staging (⑥)**: two separate pickers:
        - Shuttering system: Steel Plates | Steel-Timber | Modular Aluminium | I-beam+Plywood; inputs: m²/m³ (structure-type-aware default), cost ₹/m²/use, reuse cycles
        - Staging system: Cuplock Scaffolding | Prop & Beam | Timber Cribs | I-beam Spans; inputs: soffit area m²/m³, height m (informational), hire rate ₹/m²/month, months in use; formula: soffit area × hire rate × months → ₹/m³; applies only to horizontal/soffit areas
    - **Curing (⑦)**: two separate sub-modes:
        - Water Curing: Mobile Tanker (capacity KL, trips/day, hire rate ₹/trip, curing days) OR Static Tank (pump kW, electricity ₹/kWh, daily water KL/day, water cost ₹/KL, curing days) — mutually exclusive; static uses own daily water volume, not tanker fields
        - Curing Compound: rate ₹/L, coverage m²/L, surface area per m³ → litres + ₹/m³
    - **Overhead & Margin (⑧)**: overhead %, margin % on (direct + overhead), optional escalation provision %
    - **BBS — Bar Bending Schedule (⑨)**: table columns: bar mark, dia (8/10/12/16/20/25mm dropdown), shape (Straight/U-bar/L-bar/Ring/Stirrup), count, cut length m, hook allowance (auto by shape), overlap splice (N×dia, default N=50, editable per row), total length m, weight kg/m = dia²/162, weight kg; hook allowances: Straight=0, U-bar=2×9d, L-bar=1×9d, Ring/Stirrup=2×9d+10d; steel rates per dia (editable ₹/MT); summary: total MT, weighted avg ₹/MT, total ₹, steel ₹/m³
    - **Wastage & Risk Allowances (⑩)**: five toggle-able factors with enable/disable switch:
        1. Sand Bulkage — auto-derived from Section ③ bulkage slider
        2. Cement Wastage — % (default 2%) × cement ₹/m³
        3. Steel Cutting Waste — % (default 4%) × steel ₹/m³
        4. Formwork Early Damage — reduces effective reuse cycles by 10%
        5. Curing Water Loss — evaporation % adjustment
    - **Contract Profitability (⑪)**: contractor's offered BOQ rates per item; revenue = offered rate × m³; cost = calculated ₹/m³ × m³; profit per item + margin % colour-coded (≥10% green, 5-10% amber, <5% red)
    - **Price Impact tab (⑫)**: 12 variables ranked by 10%-sensitivity (Cement, Admixture, CA 20mm, CA 10mm, CA 6mm, Fine Agg, Steel 8mm, Steel 12mm+, Batching, Formwork+Staging, Labour, Contractor Margin); BOQ Margin Impact 3-card section (contract rate, base BOQ margin %, revised BOQ margin %); inline Save-as-Scenario naming panel
    - **Compare Scenarios tab (⑬)**: Base + up to 3 named scenarios (hard cap; "Save Current as Scenario" button hidden when cap reached); grouped cost table (Materials / Plant+Formwork / Labour / Margin); Grand Total ₹/m³ row; BOQ Margin % row = (contract_rate − cost)/contract_rate × 100 with colour-coded badges (≥10% green, 5-10% amber, <5% red) and %-point delta vs base; savings cards; inline naming UX (text input + Enter/Escape)
    - **Multi-Location Rate Blender (Task #101)**: Location Variants card between Raw Materials and Batching sections; each location overrides CA+FA sourcing rates with per-location lead distances; UoM selectors on CA tabs and FA (per_mt/per_cft/per_m3) with normalized ₹/MT computation; Rate Blender tab (3rd analysis tab) shows length-weighted blended cost, min/max range, per-location breakdown table, and Quote Rate Builder with markup % → quoted rate → BOQ margin. Also added: Labour Only placement mode (direct ₹/m³), monthly hire mode for batching equipment (₹/month with m³/month output).
    - **UI mockups complete**: 5 canvas screens registered in mockup sandbox component registry — LoginHub (`cc-login-hub`), EstimatesList (`cc-estimates-list`), CalcTop (`cc-calc-top`), CalcBottom (`cc-calc-bottom`), Scenarios (`cc-scenarios` → `ConcreteScenarios.tsx`). Canvas shapes placed via platform canvas API (external to repo); component registry at `artifacts/mockup-sandbox/src/.generated/mockup-components.ts`
    - **QTO & BOQ Tab (Task #104)**: New top-level tab "QTO & BOQ" (between BBS and Analysis). Features: Structure Dimensions card with Height Zones table (Drain/Box Culvert) or stem+footing dimensions (Bridge/Retaining Wall); Volume Summary card with per-zone breakdown (walls/invert/top slab/PCC) and Apply-to-Calculator button; Per-Metre Rate Card showing RCC+PCC cost per linear metre per zone with offered-rate margin analysis (colour-coded ≥10%/5-10%/<5%); Earthwork & Ancillary Rates card; BOQ Estimator with "Load Standard Drain BOQ" (auto-generates 9-item BOQ from QTO quantities + calculator rates), Excel import (xlsx, column mapping, preview), and Add Item; ⑪ Contract Profitability (moved here from BBS tab). The old "BOQ & BBS" tab is renamed to "BBS & Wastage" (BBS + Wastage sections only). New interfaces: `HeightZone`, `QtoState` (in `CalcState`). New pure functions: `calcDrainQTO`, `calcBridgeRWQTO`. New icons: `Building2`, `FileUp`, `ChevronDown`, `ChevronUp`.
- **Estimator Portal (Task #102)**: Unified access portal for all rate calculators. New React pages: `EstimatorLogin` (`/estimator-login`) and `EstimatorHub` (`/estimator-hub`). Server-side cookie auth via `POST/GET/DELETE /api/estimator/session` using HMAC-signed cookies (`hlc_est_role`). Home page "Estimate Manager" button → `/estimator-login`. All React estimator pages and the standalone bituminous calculator HTML now use cookie-based auth (no more localStorage). Manager access control: delete buttons hidden in ConcreteCalculator for managers; Save/Reset hidden in bituminous calculator for managers (via existing `admin-only` CSS class). The `/mix-calculator/login` route now redirects to `/estimator-login`. Auth helper: `client/src/lib/estimatorAuth.ts`.
- **Authentication & Access Control**: Role-Based Access Control (Engineer, Manager, Admin) with PIN-based authentication for critical actions.
- **Reporting**: Includes Materials Received Report (combining site material trips, DPR material logs, and water tanker entries) and Site Purchases Report (merging DPR site purchases and direct diesel purchases).
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