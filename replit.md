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
- **Plant Production Module**: Manages material receipts, mix templates, truck dispatches, stock deductions, and detailed equipment usage, including fuel stock tracking. Truck dispatches use **owner-first stock routing**: each dispatch deducts only from its own `partyId` (owner). When the owner's stock is insufficient, the API returns HTTP 409 with a structured shortage payload and the dispatch form shows a confirmation modal; only on explicit operator approval is the shortfall borrowed from HLC and tagged "(Borrowed from HLC)" in the ledger. Bitumen and LDO trackers display a red banner whenever any party balance goes negative. An admin-only **Stock Ledger Reassignment** tool (`/plant/stock-reassign`, PIN 0808) previews and bulk-moves past ledger rows from one party to another (filterable by material, date range, and transaction type), then re-runs balance reconciliation.
- **Procurement & Finance Module**: Includes Purchase Indents with multi-item requests and approval workflows, Daily Diesel Requirements with approval workflows, and Vendor Bills with a four-step workflow, duplicate billing detection, and Vendor Rate Cards.
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