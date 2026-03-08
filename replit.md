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
- **Role-Based**: Engineer (view), Manager (edit), Admin (full control).
- **PIN-Based**: Client-side PIN authentication for elevated access.
- **Admin PINs**: Stored in `app_settings` table.

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

### UI/UX & Features
- **UI Enhancements**: Responsive design using shadcn/ui.
- **Site Reports**: Advanced filtering (date range, site, engineer, etc.) and Admin-only export options (Excel, PDF, Print).
- **Equipment Tracking**: Time entry and hour meter readings with efficiency calculations.
- **Equipment Master**: Active/Inactive toggle for equipment, affecting availability in forms.
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