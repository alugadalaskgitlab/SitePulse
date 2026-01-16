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
- **Stock Deduction Priority**: Party-specific stock first, then plant common stock.
- **Diesel Consumption**: Calculated from opening/closing tank levels or hours run × norm.
- **Material Issues Register**: Tracks materials issued from central plant to sites, deducting from party stock and creating ledger entries.
- **Material Opening Stocks**: Allows entry of initial material balances with party attribution.
- **Party-Based Stock Management**: All stock is now party-based; "Plant Common" stock concept removed and migrated to HLC party (id=4).
- **Equipment Master**: Enhanced with ownership status (Owned/Hired), vendor names, registration numbers, and active status.
- **Equipment Usage**: Primarily for consumption analysis; diesel stock deductions are handled via Material Issues for a single source of truth.
- **Diesel Efficiency**: Plant equipment efficiency (L/hr or L/km) is tracked and compared against norms, with actual vs. expected diesel calculations.

### UI/UX & Features
- **UI Enhancements**: shadcn/ui components, responsive design.
- **Site Reports**: Enhanced filtering (date range, site, engineer, activity, equipment, diesel usage, material) and Admin-only export features (Excel, PDF, Print) with multi-sheet Excel export.
- **Equipment Tracking**: Supports both time entry and hour meter readings for equipment usage, with live efficiency calculation and visual indicators.
- **Admin Notifications**: In-app notification system (info, warning, success, error) with bell icon, sound alerts, and auto-refresh, triggered by key actions like DPR submissions or material movements.

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

### Date Utilities
- `date-fns`