---
name: Commercial Strategy
description: Deployment model, customer approach, and multi-project architecture decisions for selling SiteLog to other construction companies.
---

# SiteLog Commercial Strategy

## Deployment Model Decision: Option A — Separate App Per Customer

**Chosen approach:** One independent deployment per customer. Each customer gets their own URL, their own database, their own codebase fork.

**Why Option A (not multi-tenant):**
- Construction companies each have different internal workflows, equipment names, report formats, DPR fields, approval chains, and plant configurations.
- Customer-specific customisations are the primary driver — multi-tenant would require complex feature-flag systems for per-customer differences.
- Data isolation is complete; no risk of one customer seeing another's data.
- Works comfortably up to 10–15 customers.

**The update trade-off acknowledged:** Bug fixes and core features must be pushed to each customer's deployment separately. Mitigation: keep the master codebase (this Replit) clean and generic — no HLC-specific hardcoding. When onboarding a new customer: fork master → set name/logo → import master data (equipment, sites, users) → deploy.

**When to revisit:** If customers exceed ~10–15, or if the manual update burden becomes unacceptable, migrate to Option B (multi-tenant with `company_id` on every table).

## Customer Pipeline

- HLC (High Lane Constructions) = current live app, also used as the demo.
- 3+ customers already in sight as of May 2026.
- Sales approach: show HLC live app as demo, take order/deposit, then deploy a fresh instance for the paying customer.
- App was published/deployed to production in May 2026.

## Multi-Project Architecture (Discussed, Not Yet Built)

Canvas mockups created (y≈7800 row on the canvas):
- **Multi-Project Home** — company dashboard listing all projects with progress bars
- **Project Detail** — roads/sections on the left, plant stats and plant linkage on the right
- **Sidebar Navigation** — project switcher at top, roads expand inline under "Site", plant shows "shared" label

**Architecture concept:**
- `companies` table → `projects` table → `sites` (roads) table (current "sites" = roads)
- One plant/establishment serves multiple projects; dispatches carry a project tag
- Management Report can filter by project to show per-project cost, fuel, material

**Status:** Mockup only. No code written. Decision to build this should be driven by customer feedback once HLC is in daily production use.

## Navigation Issues (Found May 2026)

- Bitumen Stock (`/plant/bitumen-stock`) and LDO Flow Meter (`/plant/ldo-flow-meter`) were only linked from old `Plant.tsx` — orphaned after hub reorganisation. Fixed by adding tiles to HMP hub.
- Several pages (DieselRequirements, PurchaseIndents, VendorBills, PlantDispatches, etc.) use `getPlantBackLink()` which was pointing to old `/plant` page. Fixed to point to correct new hub routes.
- Duplicate "Stores Dashboard" tile in StoresHub pointed to old `/stores?tab=bulk` — removed.
