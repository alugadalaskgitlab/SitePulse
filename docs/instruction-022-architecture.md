# Instruction 022 — Architecture Report
## Execution Responsibility, Progress Reforecasting and Daily Diesel

**Prepared:** 2 August 2026  
**Status:** Discovery complete — ready for phased implementation approval  
**No code was written. No schema was changed.**

---

## 1. Existing-Feature Inventory

### A. Work Programme

| What exists | Location | Notes |
|---|---|---|
| `work_program_bars` table | `shared/schema.ts` lines 2595–2644 | Stores start/end dates, planned_qty, reach, chainage, planning_mode |
| `boq_items` table | `shared/schema.ts` lines 2520–2572 | Holds contract qty, current_qty, planning_work_type, dpr_measurement_method |
| `boq_revisions` / `boq_revision_items` | `shared/schema.ts` lines 2574–2593 | BOQ quantity revisions: draft → active → superseded |
| `calculateAutoDurationFull` | `shared/planningEngine.ts` line 154 | Computes activity duration from productivity norms |
| `calculateMonthlyDistribution` | `shared/planningEngine.ts` line 290 | Time-phases quantity across months |
| Gantt UI | `client/src/pages/WorkProgramme.tsx` | Reads bars; has Plan vs Actual tab |
| PATCH `/api/boq/programme/bars/:id` | `server/routes.ts` line 10994 | Edits bars in place — **no versioning gate** |

**Critical gap:** Programme bars are edited in place. There is no baseline snapshot, no forecast version, no "before/after" protection. Once a bar is patched, the original schedule is lost.

---

### B. Actual Progress

| What exists | Location | Notes |
|---|---|---|
| `progress_entries` table | `shared/schema.ts` lines 93–109 | Links to `boq_item_id`; stores chainage, dimensions, quantity |
| `dpr_structure_items` | `shared/schema.ts` lines 112–126 | Structure-specific DPR lines |
| `dprs` header | `shared/schema.ts` lines 61–90 | Site, date, engineer, boq_project_id |
| `getPlanVsActual(boqProjectId, asOfDate)` | `server/storage.ts` lines 22609–22650 | Aggregates cumulative DPR qty per BOQ item; applies `dpr_conversion_factor` |
| `GET /api/boq/projects/:id/plan-vs-actual` | `server/routes.ts` line 11123 | Returns plan vs actual per BOQ item |
| `PlanVsActualTable` component | `client/src/pages/WorkProgramme.tsx` lines 1976–1980 | Displays plan vs actual |
| `SiteEntry.tsx` | `client/src/pages/SiteEntry.tsx` | Live DPR entry form |
| `dprCalculations.ts` | `client/src/lib/dprCalculations.ts` | Client-side quantity formulae |

**Critical gap:** `getPlanVsActual` exists and works, but its output is **never fed back into the shortage-check** or planning engine. Actuals do not reduce remaining demand anywhere. No "% complete" or "remaining quantity" is computed.

---

### C. Tomorrow's Plan

| What exists | Location | Notes |
|---|---|---|
| `site_requirements` table | `shared/schema.ts` lines 3184–3229 | plannedWork, materials, equipment, labour as JSONB; status and readiness fields |
| `SiteRequirementNew.tsx` | `client/src/pages/SiteRequirementNew.tsx` | Create/edit form |
| `SiteRequirementsList.tsx` | `client/src/pages/SiteRequirementsList.tsx` | Hub page |
| Status flow | `server/routes.ts` lines 14813, 14900 | submitted → reviewed; readiness: not_confirmed → confirmed_ok / confirmed_with_shortage |
| `material_requirements.sourceType` | `shared/schema.ts` line 3341 | Supports "tomorrow_plan" — already in schema, not wired to shortage-check |
| PI/IRN prefill | `PurchaseIndents.tsx` line 675; `IrnRaisePage.tsx` line 49 | Links procurement back to requirement record |

**Critical gap:** Tomorrow's Plan is disconnected from the diesel calculator (`diesel_requirements`). The `equipment` JSONB on `site_requirements` lists planned equipment but does not drive `diesel_requirement_items`. A PM must create both independently — duplicate data entry.

---

### D. Diesel

| What exists | Location | Notes |
|---|---|---|
| `diesel_requirements` table | `shared/schema.ts` lines 1799–1826 | Per-day, per-site header; status: pending → approved → purchased |
| `diesel_requirement_items` | `shared/schema.ts` lines 1828–1839 | Per-equipment lines: est_hours, norm, norm_type, planned_qty, approved_qty |
| `equipment_master.consumption_norm` | `shared/schema.ts` line 383 | Liters/hour or liters/km |
| `equipment_usage.diesel_included` | `shared/schema.ts` line 490 | True = contractor provides fuel (hired) |
| `equipment_usage.diesel_source` | `shared/schema.ts` line ~486 | plant_stock / direct_purchase / contractor |
| `DieselRequirements.tsx` calc | `client/src/pages/DieselRequirements.tsx` lines 310–351 | `Math.ceil(estHours × norm)`; manual override available |
| `getDieselComparisonReport` | `server/storage.ts` line 12647 | Planned vs actual diesel across date range |
| Approval route | `server/routes.ts` lines 7238–7270 | pending → approved → purchased |

**Gaps:**
- Opening diesel balance for "net daily requirement" is tracked in `equipment_usage.opening_diesel` per equipment, but the diesel calculator UI does not currently compute "gross requirement − opening balance = net to arrange".
- No explicit PI foreign key on `diesel_requirements` — bulk diesel PI is linked only through `material_requirements` indirectly.
- Diesel is entirely standalone — not pre-populated from Tomorrow's Plan equipment entries.

---

### E. Outsourcing / Subcontracting

| What exists | Location | Notes |
|---|---|---|
| `vendor_bills` table | `shared/schema.ts` lines 1874–1906 | billType: equipment / material / transport / labour / all / other |
| `vendor_bill_items` | `shared/schema.ts` line 1907 | Line items: qty, rate, unit, site_name, supplied_to |
| `vendor_rate_cards` | `shared/schema.ts` line 2027 | item_key, category, rate |
| `VendorBills.tsx` | `client/src/pages/VendorBills.tsx` | Equipment hire, material supply, transport billing |
| `equipment_logs.diesel_source = 'contractor'` | `shared/schema.ts` line 156 | The only existing "vendor provides fuel" flag |

**Critical gaps:**
- **No execution_arrangement field** exists anywhere on `boq_items`, `work_program_bars`, or any programme table.
- No "who provides material / equipment / diesel" model exists.
- No composite-rate or piece-rate field on BOQ items.
- No subcontract work measurement table — vendor bills capture cost, not BOQ-item quantity executed.
- HLC material/equipment demand is **not filtered** by outsource status anywhere in the planning engine.

---

### F. Procurement and Work Demand

| What exists | Location | Notes |
|---|---|---|
| `GET /api/boq/projects/:id/shortage-check` | `server/routes.ts` lines 11808–12268 | Full BOM-to-shortage pipeline |
| `computeShortageRow` | `shared/planningEngine.ts` line 2134 | Rolling available balance; actionable shortfall |
| `calculateBomDemand` | `shared/planningEngine.ts` line 908 | Uses plannedQty from bars, or currentQty if no bars |
| `horizonMode` parameter | Routes line ~11820 | current_month / next_30_days / next_programme_month / custom / entire_programme |
| `boq_material_mappings` | `shared/schema.ts` lines 3414–3471 | Material identity + UOM conversion per project |
| `procurementStatus` 8-value type | `shared/planningEngine.ts` line 2201 | covered_by_stock → action_required etc. |
| HLC stock vs party stock split | `shared/planningEngine.ts` line 2042 | `hlcRecordedStock` vs `stockWithOtherParties` |

**Critical gaps:**
- Demand is never reduced by actual DPR progress — `calculateBomDemand` uses `plannedQty` from bars, not remaining quantity.
- All overdue quantity is bundled into `demandUpToSelectedDate` — there is no backlog vs executable split.
- `material_requirements.sourceType = "tomorrow_plan"` exists in the schema but is never queried in shortage-check to refine near-term demand.

---

## 2. Reuse vs New-Development Matrix

| Capability | Existing asset | Action |
|---|---|---|
| Cumulative actual progress by BOQ item | `getPlanVsActual` in storage.ts | **Reuse directly** — extend shortage-check to call this and subtract actuals |
| Monthly demand phasing | `calculateMonthlyDistribution` in planningEngine.ts | **Reuse** — add a "remainingQty" input path |
| Shortage calculation engine | `computeShortageRow` in planningEngine.ts | **Extend** — add actual_progress_offset and backlog/executable split |
| BOQ version history pattern | `boq_revisions` / `boq_revision_items` | **Reuse pattern** — create `programme_forecasts` table using same draft→active→superseded lifecycle |
| Daily diesel calculation | `diesel_requirements` + `diesel_requirement_items` | **Reuse entirely** — add a "derive from Tomorrow's Plan" prefill flow; do NOT build a second calculator |
| Equipment consumption norms | `equipment_master.consumption_norm` | **Reuse directly** |
| Hired equipment fuel flag | `equipment_usage.diesel_included` | **Reuse** — map to new execution_responsibility model |
| Material requirement origin tracking | `material_requirements.sourceType` | **Reuse** — wire "tomorrow_plan" source into shortage-check horizon |
| Vendor billing | `vendor_bills` + `vendor_bill_items` | **Reuse** — extend to link bill lines to BOQ items for subcontract quantity tracking |
| Audit log | `audit_logs` table | **Reuse for all audit requirements** |
| Plan vs Actual tab | `PlanVsActualTable` in WorkProgramme.tsx | **Reuse and extend** to show baseline / actual / current forecast |
| PI/IRN prefill from requirement | `PurchaseIndents.tsx` line 675 | **Reuse** — diesel daily requirement can raise an IRN using same pattern |
| HLC vs party stock distinction | `computeShortageRow` | **Reuse** — basis for HLC-only demand calculation |
| Baseline preservation | **None** | **Must build** |
| Execution responsibility model | **None** | **Must build** |
| Programme forecast versioning | **None** | **Must build** |
| Backlog vs executable demand split | **None** | **Must build** |
| Programme drift detection | **None** | **Must build** |
| Recovery planning | **None** | **Must build** |
| Daily diesel prefill from Tomorrow's Plan | **None (gap)** | **Must build** |
| Net daily diesel (gross − opening balance) | **Partial** (opening_diesel exists) | **Must wire** |

---

## 3. Current-State Process Diagram

```
BOQ Contract Quantities (boq_items.boq_qty)
    │
    ├─ BOQ Revision workflow (boq_revisions) → updates current_qty in-place
    │
    ▼
Work Programme Bars (work_program_bars)
    │  EDITABLE IN-PLACE — no baseline snapshot
    │  planningEngine: auto-duration, monthly distribution
    │
    ▼
BOM Demand (calculateBomDemand)
    │  Uses planned_qty from bars OR current_qty if no bars
    │  DOES NOT SUBTRACT ACTUALS
    │
    ▼
Shortage Check (computeShortageRow)
    │  Horizon modes: current_month / next_30_days / etc.
    │  Overdue = everything ≤ horizon (no backlog split)
    │  HLC stock vs party stock distinction exists
    │
    ▼
Work Demand page → PI / IRN raised


PARALLEL (disconnected):

DPR Entry (SiteEntry.tsx)
    → progress_entries linked to boq_item_id
    → getPlanVsActual works but output NOT used in demand calculation

Tomorrow's Plan (site_requirements)
    → equipment JSONB field exists
    → NOT connected to diesel_requirements
    → sourceType="tomorrow_plan" on material_requirements exists but not wired

Diesel Calculator (diesel_requirements)
    → Standalone: PM fills equipment list manually
    → Pending → approved → purchased
    → NO link to Tomorrow's Plan equipment
    → NO "opening balance − gross" net calculation in UI
    → NO explicit PI foreign key

Vendor Bills (vendor_bills)
    → Cost tracking only
    → NO link to BOQ item execution quantity
    → NO outsource/in-house flag on BOQ items
```

---

## 4. Proposed Future Process Diagram

```
BOQ Contract Quantities (unchanged)
    │
    ├─ BOQ Revision workflow (unchanged)
    │
    ▼
BASELINE Programme (work_program_bars — LOCKED SNAPSHOT)
    │  Version tagged as "baseline" — never editable after approval
    │  Used only for delay/performance comparison
    │
    ├──────────────────────────────────────────────┐
    ▼                                              ▼
Execution Responsibility                   Current Forecast (programme_forecasts)
(boq_execution_responsibility)              Version N — draft → approved
    │                                              │  Stores revised dates/quantities
    │  per BOQ item, per component:                │  References baseline
    │  HLC / vendor / client / N/A                 │
    │                                              │
    ▼                                              ▼
HLC-Only BOM Demand                       Monthly Phasing from Forecast
(calculateBomDemand + responsibility       (reuse calculateMonthlyDistribution
 filter — exclude outsourced components)    with forecast bars as input)
    │                                              │
    ▼                                              ▼
Actual Progress                           Backlog vs Executable Demand
(getPlanVsActual — existing)               backlog = overdue - actuals
    │                                      executable = forecast horizon qty
    ├─ Remaining Qty per BOQ item          future_balance = post-horizon qty
    │   (currentQty − cumulative actual)          │
    │                                             ▼
    └────────────────────────────────►  Shortage Check (extended)
                                         horizonDemand = executable only
                                         backlogWarning shown separately


Tomorrow's Plan (site_requirements)
    │  Equipment JSONB → derives diesel items
    ▼
Daily Diesel Requirement
(diesel_requirements — REUSED)
    │  Pre-populated from Tomorrow's Plan equipment
    │  Gross requirement − opening balance = net to arrange
    │  Hired equipment with diesel_included=true → excluded
    │  Approved → raise IRN from store or raise daily PI
    ▼
Diesel arranged / issued


Vendor Bills (extended)
    │  vendor_bill_items linked to boq_item_id
    │  Outsourced quantity tracked
    ▼
Subcontract progress = vendor bill quantities
    │
    └─ Feeds back to "actual progress" for outsourced components


Programme Drift Detection
    │  compares actual vs current forecast
    │  status: on_track / watch / behind / critically_delayed / blocked
    ▼
PM Dashboard
    │  Drift alerts + recovery options
    ▼
Recovery Planning (forecast revision → new programme_forecast version)
```

---

## 5. Proposed Data-Model Changes

> No migrations in this batch. These are the schema additions needed for implementation phases.

### 5A. Baseline Programme Snapshot (Phase B)

```sql
-- Mark baseline snapshot; work_program_bars gets a new column
ALTER TABLE work_program_bars ADD COLUMN is_baseline BOOLEAN DEFAULT false;
ALTER TABLE work_program_bars ADD COLUMN baseline_locked_at TIMESTAMPTZ;
```

Or preferably: a separate `programme_baselines` table cloning bar data when baseline is locked, preserving the original immutably.

Recommended: a new `programme_versions` table:
```
programme_versions(
  id, boq_project_id,
  version_type TEXT ('baseline' | 'forecast'),
  version_number INTEGER,
  status TEXT ('draft' | 'approved' | 'superseded'),
  reason TEXT, prepared_by INTEGER, approved_by INTEGER,
  effective_date DATE, approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ
)

programme_version_bars(
  id, version_id, boq_item_id,
  reach_label, chainage_from, chainage_to,
  start_date DATE, end_date DATE,
  planned_qty NUMERIC, notes TEXT
)
```

The first approved version is the baseline. Subsequent versions are forecasts. Baseline is never superseded — only archived.

### 5B. Execution Responsibility (Phase A)

```
boq_execution_responsibility(
  id, boq_project_id, boq_item_id,
  reach_label TEXT,                    -- null = applies to whole item
  arrangement TEXT NOT NULL,           -- fully_in_house | fully_outsourced_composite |
                                       --   partly_outsourced | vendor_material_supply_only |
                                       --   hlc_material_outsourced_execution |
                                       --   client_supplied_material |
                                       --   hired_equipment_fuel_by_hlc |
                                       --   hired_equipment_fuel_by_vendor |
                                       --   not_decided
  components JSONB,                    -- per-component: {excavation:'hlc', fuel:'vendor', ...}
  set_by INTEGER, set_at TIMESTAMPTZ,
  approved_by INTEGER, approved_at TIMESTAMPTZ,
  version INTEGER DEFAULT 1,
  notes TEXT
)
```

### 5C. Actual Progress Summary (extend existing, Phase C)

No new table needed. `getPlanVsActual` already produces this. Add a computed view or materialised cache:

```
boq_actual_progress_cache(
  boq_project_id, boq_item_id,
  as_of_date DATE,
  cumulative_actual_qty NUMERIC,
  last_updated TIMESTAMPTZ
)
```

Updated on DPR approval. Used by shortage-check to compute remaining quantity.

### 5D. Delay Records (Phase C)

```
programme_delays(
  id, boq_project_id, boq_item_id,
  version_id INTEGER,                -- which forecast version this was recorded against
  delay_reason TEXT,                 -- rain | client_instruction | plant_breakdown | ...
  days_lost INTEGER,
  recorded_by INTEGER, recorded_at TIMESTAMPTZ,
  notes TEXT
)
```

### 5E. Diesel — link to Tomorrow's Plan and opening balance (Phase E)

Extend `diesel_requirements`:
```sql
ALTER TABLE diesel_requirements ADD COLUMN site_requirement_id INTEGER REFERENCES site_requirements(id);
ALTER TABLE diesel_requirements ADD COLUMN opening_balance_litres NUMERIC DEFAULT 0;
ALTER TABLE diesel_requirements ADD COLUMN net_requirement_litres NUMERIC GENERATED ALWAYS AS
  (GREATEST(0, total_planned - opening_balance_litres)) STORED;
```

### 5F. Vendor bill → BOQ item linkage (Phase A prerequisite for outsource tracking)

Extend `vendor_bill_items`:
```sql
ALTER TABLE vendor_bill_items ADD COLUMN boq_item_id INTEGER REFERENCES boq_items(id);
ALTER TABLE vendor_bill_items ADD COLUMN boq_project_id INTEGER REFERENCES boq_projects(id);
ALTER TABLE vendor_bill_items ADD COLUMN measurement_qty NUMERIC;  -- quantity executed for that BOQ item
ALTER TABLE vendor_bill_items ADD COLUMN measurement_uom TEXT;
```

---

## 6. Proposed UI/Page Changes

### Work Programme page (WorkProgramme.tsx) — Phase B

Add tabs:
- **Baseline** — read-only snapshot of approved baseline bars; locked badge
- **Current Forecast** — editable forecast bars (creating a new version on first edit)
- **Actual** — existing PlanVsActualTable (unchanged)
- **Variance** — auto-computed: baseline vs forecast, actual vs forecast, delay days, % complete

Add toolbar actions:
- **Lock Baseline** (one-time, PM/Admin only)
- **Create New Forecast** (creates version N+1 draft; requires reason)
- **Approve Forecast** (PM/Admin)

### Work Demand page (WorkDemand.tsx) — Phase D

Add columns to demand rows:
- **Overdue Backlog** — quantity that should have been executed by today but is not yet done
- **Executable (Horizon)** — quantity planned in the current forecast for the selected horizon
- **Future Balance** — post-horizon remaining
- **Forecast Version** — which forecast version is driving this demand

Add banner when no approved forecast exists:
> "Reforecast required — near-term demand is based on the latest approved short-term plan."

### Diesel action — Phase E

On "HSD/Diesel" action button, show a two-option modal:
1. **Prepare Daily Diesel Requirement** → opens existing DieselRequirements form, pre-populated from Tomorrow's Plan equipment
2. **Raise Bulk Purchase PI** → existing PI flow with material = Diesel/HSD

The Daily Diesel Requirement form adds:
- Opening balance field (pre-filled from previous day's closing or stock_ledger)
- Auto-computed net requirement row
- Exclude rows where `diesel_included = true`

### PM Dashboard — Phase F (new page or section in existing dashboard)

Cards:
- Activities behind schedule (from drift detection)
- Reforecast required warnings
- Recovery rate required vs current achieved rate
- Expected finish vs baseline for each critical activity

---

## 7. Proposed Permission Matrix

| Action | Site Engineer | PM | Stores | Equipment | Purchaser | Admin | Owner |
|---|---|---|---|---|---|---|---|
| Assign execution responsibility | — | ✓ | — | — | — | ✓ | ✓ |
| Revise component responsibility | — | ✓ | — | — | — | ✓ | ✓ |
| Lock baseline | — | ✓ | — | — | — | ✓ | ✓ |
| Prepare forecast | ✓ | ✓ | — | — | — | ✓ | — |
| Approve forecast | — | ✓ | — | — | — | ✓ | ✓ |
| Prepare Tomorrow's Plan | ✓ | ✓ | — | — | — | ✓ | — |
| Prepare Daily Diesel Req. | ✓ | ✓ | — | ✓ | — | ✓ | — |
| Approve Daily Diesel Req. | — | ✓ | — | — | — | ✓ | ✓ |
| Revise diesel quantity | — | ✓ | — | — | — | ✓ | — |
| Raise Bulk Diesel PI | — | — | — | — | ✓ | ✓ | — |
| Record delay reason | ✓ | ✓ | — | — | — | ✓ | — |
| Approve recovery plan | — | ✓ | — | — | — | ✓ | ✓ |

> Permissions are not implemented in this batch. Will be added to the existing 85-section permission key system in Phase A/B.

---

## 8. Risks and Dependencies

### Data risks

| Risk | Severity | Mitigation |
|---|---|---|
| No baseline currently saved — existing projects have no immutable starting point | High | Phase B creates baseline from current bars before any freeze; users prompted to "Lock Baseline" on first use |
| Actuals in `progress_entries` may not cover all BOQ items (some items entered without `boq_item_id`) | High | Audit before Phase C; backfill or report missing linkages |
| `equipment_usage.opening_diesel` is per-equipment, not per-site aggregate | Medium | Phase E opens balance from previous `diesel_requirement` closing balance or stock_ledger, not equipment_usage |
| `boq_material_mappings` UOM conversion is project-scoped; forecast versions inherit same mappings | Low | No change needed; mappings are by project |
| Forecast version bars must not break existing BOM calculation when bars are the input | High | `calculateBomDemand` must accept `versionId` parameter; default to current approved forecast |

### Workflow risks

| Risk | Severity | Mitigation |
|---|---|---|
| PM may approve a forecast before locking the baseline — diff becomes impossible | High | Block "Approve Forecast" until baseline is locked |
| Outsource responsibility set after procurement has already been raised — double counting | Medium | Show warning on Work Demand when items have no responsibility set |
| Diesel pre-population from Tomorrow's Plan may not match manual additions | Low | Pre-populate as suggestion; user reviews before saving |
| Two active forecasts at once (if approval workflow has gap) | Medium | Enforce max one active forecast per project; second must supersede the first |
| Tomorrow's Plan equipment JSONB format may not match equipment_master schema exactly | Medium | Write a typed adapter on read; surface validation error in UI before save |

---

## 9. Implementation Phases

### Phase A — Execution & Supply Responsibility foundation
*Smallest safe first step. No impact on existing planning or procurement.*

Deliverables:
- `boq_execution_responsibility` table with arrangement enum and components JSONB
- `vendor_bill_items.boq_item_id` linkage (extend existing)
- UI: responsibility panel on BOQ item detail (inline, not blocking existing flows)
- Work Demand page: flag rows where no responsibility is set
- No change to demand calculation — responsibility is a label only in this phase

### Phase B — Baseline and Forecast Programme versioning
*Creates the foundation for all subsequent comparison and drift work.*

Deliverables:
- `programme_versions` + `programme_version_bars` tables
- "Lock Baseline" action on WorkProgramme.tsx (one-time per project)
- "Create Forecast" action — copies current bars into a new version draft
- WorkProgramme tabs: Baseline | Current Forecast | Actual | Variance
- `calculateBomDemand` extended to accept `versionId` (defaults to approved forecast)
- Migration: existing bars are offered as baseline candidate on first load

### Phase C — DPR progress linkage and drift alerts
*Connects actuals back into the planning engine without touching Tomorrow's Plan or procurement.*

Deliverables:
- `getPlanVsActual` output feeds `boq_actual_progress_cache` (updated on DPR approval)
- `calculateBomDemand` uses `(plannedQty − cumulativeActual)` as remaining quantity
- `programme_delays` table for delay reason recording
- Drift detection: compares actual vs current forecast bar; assigns on_track/watch/behind/critically_delayed
- PM Dashboard: drift alert cards per activity
- No change to shortage-check percentages yet

### Phase D — Backlog vs Executable Demand
*Changes what shortage-check returns; significant but contained to planning engine.*

Deliverables:
- `computeShortageRow` extended: returns `overdue_backlog`, `executable_horizon_qty`, `future_balance_qty`
- Work Demand page: three demand columns + backlog warning banner
- Shortage-check uses `executable_horizon_qty` as the actionable number, not the total
- "Reforecast required" banner when no approved forecast exists
- `material_requirements.sourceType = "tomorrow_plan"` wired into near-term horizon

### Phase E — Tomorrow's Plan and Daily Diesel integration
*Connects the two standalone systems that currently require duplicate data entry.*

Deliverables:
- "Prepare Daily Diesel Requirement" action derives `diesel_requirement_items` from `site_requirements.equipment` JSONB
- `diesel_requirements.site_requirement_id` FK to link them
- Opening balance and net requirement computed in the UI (gross − opening_balance)
- Hired equipment with `diesel_included = true` excluded automatically
- "Raise Bulk Diesel PI" path kept as-is
- Equipment/Diesel responsibility from Phase A filters HLC vs contractor items

### Phase F — Recovery planning and management analytics
*Builds on all prior phases; no schema dependencies beyond Phase C/D.*

Deliverables:
- Recovery planning panel: current rate vs required rate vs target rate
- PM can enter target production rate → system suggests resource uplift
- Respect Execution Responsibility — only suggest HLC resource additions for HLC components
- Forecast revision triggered by recovery plan → new `programme_version` draft
- PM Dashboard complete: baseline vs forecast finish, delay days, backlog, diesel constraints

---

## 10. Acceptance Criteria per Phase

### Phase A
- [ ] A BOQ item can be assigned an execution arrangement (fully_in_house through not_decided)
- [ ] For partly_outsourced, individual components can be assigned HLC / vendor / client
- [ ] Work Demand flags rows with no responsibility assigned
- [ ] Vendor bill line items can be linked to a BOQ item
- [ ] No change to existing demand calculation results

### Phase B
- [ ] Locking a baseline creates an immutable snapshot; subsequent bar edits do not alter it
- [ ] A new forecast version is created when PM edits programme dates after baseline is locked
- [ ] Baseline tab and Current Forecast tab show different data after a programme change
- [ ] Variance tab shows baseline start/end, forecast start/end, delay days, % complete
- [ ] `calculateBomDemand` produces identical results when called with current approved forecast

### Phase C
- [ ] After a DPR is approved, remaining quantity for that BOQ item decreases in demand
- [ ] If actual cumulative qty ≥ planned qty, that item shows 100% complete, demand = 0
- [ ] Drift status updates when actual output falls below forecast rate for ≥ 3 days
- [ ] Delay reason can be recorded against an activity with an associated date range
- [ ] PM Dashboard shows at least: N items on_track, M items behind, K critically_delayed

### Phase D
- [ ] For every Work Demand row: overdue_backlog, executable_horizon_qty, future_balance_qty are shown separately
- [ ] Procurement actions are based on executable_horizon_qty, not total cumulative demand
- [ ] Backlog is visible as a management warning but does not drive immediate procurement
- [ ] "Reforecast required" banner appears when no approved forecast exists for a project

### Phase E
- [ ] Clicking "Prepare Daily Diesel Requirement" on Tomorrow's Plan pre-populates equipment list from site_requirements.equipment
- [ ] Hired equipment marked diesel_included=true is excluded from requirement automatically
- [ ] Net requirement = gross requirement − opening balance, shown in UI
- [ ] After approval, site can raise an IRN from store or a small PI using existing prefill pattern
- [ ] "Raise Bulk Diesel PI" option continues to work unchanged

### Phase F
- [ ] PM can see current achieved daily rate vs rate required to meet baseline
- [ ] PM can enter a realistic recovery target and see required resources
- [ ] If work is fully_outsourced, system does not suggest adding HLC equipment
- [ ] Recovery plan creates a new programme_forecast version draft
- [ ] Dashboard shows forecast finish vs baseline finish for all active BOQ activities

---

## 11. Recommended Build Sequence and First Priority

**Build Phase A first.** Execution Responsibility is the foundation that every subsequent phase depends on:

- Phase B (forecast versioning) needs to know which items are outsourced before computing HLC demand from forecast
- Phase D (backlog/executable split) must filter demand by responsibility
- Phase E (diesel) uses the hired/HLC distinction that comes from the responsibility model
- Phase F (recovery planning) must respect responsibility before suggesting resources

Phase A adds a new table and a UI panel. It does not touch the existing planning engine, shortage-check, DPR, or procurement. It is the safest possible first step with the highest downstream leverage.

**Then Phase B** (baseline locking) — before any real forecast work begins, existing projects need their baseline captured. This is time-sensitive: the longer it waits, the more the original programme is overwritten.

**Then Phase C** (actuals → remaining demand) — this is the most visible improvement for site users and PMs: for the first time, completing work actually reduces the demand shown in Work Demand.

---

## 12. Existing Code That Must Be Reused (Not Duplicated)

| Function / Component | File | Must be reused for |
|---|---|---|
| `getPlanVsActual` | `server/storage.ts` lines 22609–22650 | Actual progress in shortage-check; % complete in Variance tab |
| `calculateBomDemand` | `shared/planningEngine.ts` line 908 | Extend with version_id and remaining_qty; do not replace |
| `computeShortageRow` | `shared/planningEngine.ts` line 2134 | Extend with backlog/executable split; do not replace |
| `calculateMonthlyDistribution` | `shared/planningEngine.ts` line 290 | Re-use for forecast version bars |
| `diesel_requirements` + `diesel_requirement_items` | `shared/schema.ts` lines 1799–1839 | Daily Diesel Requirement — do NOT create a second diesel table |
| `DieselRequirements.tsx` | `client/src/pages/DieselRequirements.tsx` | Extend with pre-population from Tomorrow's Plan; do NOT replace |
| `boq_revisions` lifecycle pattern | `shared/schema.ts` lines 2574–2593 | Mirror for `programme_versions` (same draft→active→superseded states) |
| `PlanVsActualTable` component | `client/src/pages/WorkProgramme.tsx` | Reuse in enhanced Variance tab |
| `material_requirements.sourceType` | `shared/schema.ts` line 3341 | Already supports "tomorrow_plan" — wire into Phase D horizon |
| PI/IRN prefill from `requirement_id` | `PurchaseIndents.tsx` line 675 | Reuse pattern for diesel IRN/PI creation in Phase E |
| `audit_logs` table | `shared/schema.ts` line 3474 | All audit trail requirements in all phases |
| `equipment_usage.diesel_included` | `shared/schema.ts` line 490 | Phase E exclusion of contractor-fuelled equipment |

---

*End of Instruction 022 Architecture Report.*  
*Awaiting approval before any implementation begins.*
