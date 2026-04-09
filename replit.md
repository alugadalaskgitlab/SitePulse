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
- **Concrete Rate Analysis Calculator** (planned — Task #98): BOQ-based rate analysis for civil structures (drains, box culverts, bridges). Planned modules:
    - Multi-size coarse aggregate tabs (20mm / 10mm / 6mm), Robosand/Natural Sand toggle with bulkage slider
    - Row-based batching equipment table (own/hired modes), dual Shuttering + Staging System pickers
    - Split curing modes: water curing (mobile tanker vs static tank) + curing compound
    - Bar Bending Schedule (BBS) with dia²/162 formula and hook allowances by bar shape
    - Five wastage and risk toggles (cement/aggregate/steel/formwork/misc)
    - Price Impact tab: 12 ranked sensitivity variables, BOQ Margin Impact section (contract rate vs base cost %, colour-coded ≥10%/5-10%/<5%), inline Save-as-Scenario from price impact view
    - Compare Scenarios tab: Base + up to 3 named scenarios (hard cap), grouped cost breakdown, Grand Total and BOQ Margin % rows (colour-coded badges, %-point delta vs base), savings summary cards
    - UI mockups complete (5 canvas screens: LoginHub, EstimatesList, CalcTop, CalcBottom, Scenarios)
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