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
- **Plant Module**: Features detailed operations (shift logs, heating sessions), management (stock, variance, audit), reports (daily plant reports, heating trends), and master data. Includes contractor-aware manpower tracking, automated LDO meter readings, and bulk PDF export for daily reports. It also includes an LDO Meter Backfill tool and an LDO Book-vs-Physical Reconciliation Report.
- **Boiler/Heating Management**: Tracks heating sessions and provides trend analysis, including monitoring hot-oil supply vs. return temperatures. Inline Diesel Generator (DG) runs are integrated with heating sessions and equipment usage.
- **Plant Production Module**: Manages material receipts, mix templates, truck dispatches with owner-first stock routing and borrowing logic, and detailed equipment usage including fuel stock tracking. Includes a stock ledger reassignment tool and an inter-party stock transfer tool (for returning borrowed material between parties).
- **Procurement & Finance Module**: Handles Purchase Indents, Daily Diesel Requirements with approval workflows, and Vendor Bills with duplicate billing detection and rate card integration, supporting equipment, material, transport, and labor categories.
- **Rate Calculators**:
    - **Bituminous Mix Rate Calculator**: Interactive tool for calculating rates for bituminous road layers, supporting multiple mix types, configurable equipment modes, scenario analysis, and estimation saving.
    - **Concrete Rate Analysis Calculator (v1 & v2)**: Provides BOQ-based analysis for civil structures with detailed cost parameters, material blending, and rebar design.
- **QTO & BOQ Tab**: Provides structure dimensions, volume summary, per-meter rate card, earthwork, ancillary rates, and a BOQ Estimator with Excel import.
- **Estimator Portal**: A unified portal (`/estimator-hub`) with server-side cookie authentication and role-based access for all rate calculators.
- **Push Notifications**: Per-user push notification control with admin toggles and session-gated subscriptions.
- **Authentication & Access Control**: Role-Based Access Control (Engineer, Manager, Admin) with PIN authentication for critical actions. Features a robust cross-user login mechanism to preserve device approvals.
- **Reporting**: Includes Materials Received and Site Purchases reports.
- **Data Export/Import**: Admin-only tools for selected table data transfer.

### Permission Gating
All POST endpoints mapping to permission-managed sections use `assertCreate` for authorization. PATCH and DELETE operations on master data endpoints are protected by `assertEdit` and `assertAdmin` respectively.

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