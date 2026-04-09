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
- **Concrete Rate Analysis Calculator** (planned — Task #98): BOQ-based rate analysis for civil structures (drains, box culverts, bridges). Full build spec:
    - **Mix Design**: Structure-type picker (drain / box-culvert / bridge) drives default mix proportions; Grade selector (M20/M25/M30) adjusts cement factor
    - **Coarse Aggregate**: Three tabs — 20mm, 10mm, 6mm (Grit); each tab has its own rate/lead distance/freight entry; combined cost rolled into Materials total
    - **Fine Aggregate**: Robosand/Natural Sand toggle; when Robosand is selected a bulkage slider (0-35%) adjusts effective volume automatically
    - **Batching Equipment**: Editable table of rows (add/remove); each row: equipment name, mode (Own / Hired per-m³ rate / Hired per-hour), ownership-dependent cost fields; final cost = sum of all rows per m³
    - **Formwork & Shuttering**: Structure-type-conditional picker — drain uses flat plank shuttering; box-culvert adds internal void shuttering; bridge supports steel/timber/aluminium form options. Cost applies only when structure type uses that form type. Rate entered as ₹/m² with auto-derived m²/m³ based on structure dimensions
    - **Staging System**: Separate picker from shuttering — options: Conventional (props + ledgers), Cuplock System, Ringlock System; rate entered as ₹/m³ directly; only applicable for elevated/bridge structures (conditional toggle)
    - **Curing**: Three simultaneous sub-modes (any combination active): (1) Water Curing — Mobile Tanker (₹/trip × trips/day × days); (2) Water Curing — Static Tank (₹/fill × fills + labour ₹/day × days); (3) Curing Compound (₹/litre × application rate litre/m²). Combined mode = sum of all active sub-modes
    - **Bar Bending Schedule (BBS)**: Editable table with columns: Bar Mark, Dia (mm), No. of Bars, Cutting Length (m), Shape (Straight/L-Hook/U-Hook/Stirrup); Weight = Dia²/162 × Length × Qty; hook allowances added per shape type; default N (overlap laps) = 2 configurable per row; dia-wise grouped summary for procurement; total steel weight → steel cost = weight × rate/tonne
    - **Wastage & Risk Toggles** (5 independent, each adds % to base cost): (1) Cement Wastage (default 2%); (2) Aggregate Wastage (default 3%); (3) Steel Wastage/Scrap (default 5%); (4) Formwork Damage/Loss (default 8%); (5) Miscellaneous Site Risk (default 2%). Each toggle shows the ₹/m³ impact when enabled
    - **Price Impact tab**: 12 ranked variables by 10%-sensitivity (Cement, Admixture, CA 20mm, CA 10mm, CA 6mm, Fine Agg, Steel 8mm, Steel 12mm+, Batching Mode, Staging System, Curing, Contractor Margin); BOQ Margin Impact 3-card section (contract rate, base margin %, revised margin %); inline Save-as-Scenario naming panel
    - **Compare Scenarios tab**: Base + up to 3 named scenarios (hard cap MAX=3; "Save Current as Scenario" button hidden when cap reached); grouped cost table (Materials / Plant+Formwork / Labour / Margin); Grand Total ₹/m³ row with delta colouring; BOQ Margin % row = (contract_rate − cost)/contract_rate × 100 with colour-coded badges (≥10% green, 5-10% amber, <5% red) and %-point delta vs base; savings summary cards; inline naming UX (text input + Enter/Escape keyboard)
    - **UI mockups complete**: 5 canvas screens registered in mockup sandbox component registry — LoginHub (`cc-login-hub`), EstimatesList (`cc-estimates-list`), CalcTop (`cc-calc-top`), CalcBottom (`cc-calc-bottom`), Scenarios (`cc-scenarios`, implemented in `ConcreteScenarios.tsx`). Canvas shapes are placed via the platform canvas API (external to the repo) at coordinates documented in `.local/canvas-shapes.md`
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