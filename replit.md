# SiteLog - Construction Daily Progress Report System

## Overview

SiteLog is a construction management web application for tracking Daily Progress Reports (DPRs) and Plant Production logs. It enables construction site engineers, project managers, and administrators to record daily activities including work progress, equipment usage, labour deployment, and material consumption. The system supports role-based access control with PIN authentication for elevated privileges.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter (lightweight React router)
- **State Management**: TanStack React Query for server state, React Hook Form for form state
- **UI Components**: shadcn/ui component library built on Radix UI primitives
- **Styling**: Tailwind CSS with CSS variables for theming (industrial/construction color palette with amber/orange primary)
- **Build Tool**: Vite with path aliases (@/, @shared/, @assets/)

### Backend Architecture
- **Runtime**: Node.js with Express
- **Language**: TypeScript (ESM modules)
- **API Pattern**: RESTful API with Zod schema validation
- **Route Definitions**: Centralized in `shared/routes.ts` with typed request/response schemas

### Data Storage
- **Database**: PostgreSQL
- **ORM**: Drizzle ORM with drizzle-zod for schema-to-validation generation
- **Schema Location**: `shared/schema.ts` contains all table definitions
- **Migrations**: Managed via `drizzle-kit push` command

### Data Models
- **DPRs (Daily Progress Reports)**: Header with date, site, engineer, role
- **Progress Entries**: Activity tracking with chainage, dimensions, quantities
- **Equipment Logs**: Machine usage with operator, time, diesel consumption
- **Labour Logs**: Worker categories by skill level and gender
- **Material Logs**: Material consumption tracking
- **Plant Reports**: Plant production with production entries
- **DPR Versions**: Version history for audit trails

### Authentication Pattern
- Role-based access: engineer (view), manager (edit), admin (full control)
- PIN-based authentication for elevated access (client-side demonstration)
- No session management currently implemented

### Build System
- **Development**: `tsx` for TypeScript execution with Vite dev server
- **Production**: esbuild bundles server with selective dependency bundling, Vite builds client to `dist/public`
- **Static Serving**: Express serves built client files in production

## External Dependencies

### Database
- PostgreSQL via `DATABASE_URL` environment variable
- `pg` driver with `drizzle-orm/node-postgres` adapter
- `connect-pg-simple` for potential session storage

### Export Functionality
- `xlsx` library for Excel file generation (binary export endpoint)

### UI Libraries
- Full Radix UI primitive suite for accessible components
- `embla-carousel-react` for carousels
- `react-day-picker` for calendar components
- `cmdk` for command palette
- `vaul` for drawer components
- `recharts` for charts (via chart.tsx)

### Form & Validation
- `react-hook-form` with `@hookform/resolvers` for Zod integration
- `zod` for runtime validation across client and server
- `drizzle-zod` for generating Zod schemas from Drizzle tables

### Date Utilities
- `date-fns` for date formatting and manipulation