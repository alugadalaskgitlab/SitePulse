# SitePulse — User Creation and Permissions Redesign

## Phase 1: read-only investigation and proposed design

**Instruction:** USER-PERM-REDESIGN-01. **Status:** investigation only; approval required before implementation.

The repository, not the instruction's examples, defines the inventory. No application source, users, account flags, role templates, permission records, site grants, databases or production configuration were changed. No application restart, migration, publish, permission mutation, login test or notification send was performed. The earlier Owner correction remains unexecuted.

## Reading this report

The narrative and the detailed inventories are one deliverable. The narrative explains the design and important limitations; the inventories retain the individual routes, controls, permission references and API operations rather than collapsing them into a short list of modules.

### Discovery coverage

| Source inventory | Count | Meaning |
|---|---:|---|
| Application TypeScript/TSX files examined structurally | 479 | Client, server and shared source; tests excluded |
| Explicit frontend route declarations | 130 | Includes alternate paths and parameterized routes |
| Backend HTTP operation declarations | 643 | 281 GET, 191 POST, 89 PATCH, 27 PUT, 55 DELETE |
| Additional backend middleware declarations | 6 | Authentication, object access, RMC availability and terminal handlers |
| Page source files | 125 | 123 import-reachable from App; two legacy page files are not |
| HubActionTile declarations | 92 | Individual tiles, including conditional and cross-hub duplicates |
| Labelled navigation configuration objects | 43 | Includes sidebar and field-user navigation; overlaps are deliberate |
| UI control declarations | 2,995 | Buttons, tabs, dialog titles, menu entries, forms and choices; NOT 2,995 distinct permissions |
| Existing permission sections | 92 | Complete SECTION_KEYS catalog |
| Existing standard-action cells | 736 | 92 sections × eight standard actions |
| Cells with observed permission references | 239 | A reference is not proof of consistent enforcement on every operation |
| Retained unwired visible cells | 3 | Legacy controls with no implemented controlled page |
| Other unavailable/unwired cells | 494 | Do not present these as working switches |
| Startup/maintenance/timer call sites | 106 | Includes schema/setup/backfill routines; not ordinary user capabilities |
| Notification-related call sites | 191 | Includes record CRUD, helpers and emissions; not 191 notification topics |

### Evidence and limits

- `navigation-routes.csv`: every explicit route, component, enclosing conditions and route gate.
- `hub-tiles.csv`, `navigation-configurations.csv`, `navigation-links.csv`: sidebar, tiles, configuration-driven and JSX links with source references.
- `page-reachability.csv`: routed, embedded and import-unreachable pages.
- `frontend-controls.csv`: nested tabs/dialogs/actions, handler expressions, disabled conditions and enclosing conditional expressions.
- `frontend-api-calls.csv`: client query, mutation, fetch, export and print call sites.
- `function-action-matrix.csv`: every backend operation, actual permission evidence, local guard expressions, registration context and candidate frontend callers.
- `hierarchical-function-matrix.csv`: route/page-level Hub → Module → Function mapping, actual tile names where present, related operations, frontend checks, legacy alternatives and proposed action limitations.
- `permission-evidence.csv`: all 736 existing cells, their client/server references and current editor availability.
- `background-actions.csv`, `notification-actions.csv`: non-navigation operations.
- The self-contained HTML version embeds these tables for searching.

This is a **source-level inventory**, not an authenticated runtime penetration test or a production-data audit. Availability controlled by environment flags, licensing, record status, site scope and account flags is recorded, not assumed enabled in production. Literal URL matching identifies candidate callers for 571 operations; the other 72 require dynamic/helper, external or legacy caller tracing before removal or restriction. A matched URL is not a complete call-graph proof. Shared page components may call more APIs than a specific route state renders.

The generator reports no unresolved *recognized permission expressions*. That does not prove there are no missing guards: authentication-only routes, legacy role checks and omitted action distinctions are separately assessed below. Exact branch behavior must become acceptance tests before enforcement changes.

## A. Application navigation and function inventory

### Top-level navigation

Current `HubShell` navigation contains Dashboard, Site Operations, HMP Operations, RMC Operations, Equipment & Fleet, Stores & Inventory, Procurement & Billing, Requisitions, Work Program & BOQ, Norms Library, Reports and Edit Requests. Its tool area contains Estimator, Masters and Settings.

Additional navigation surfaces are the field-user Home, Site Home, DPR Work Hub, Estimator Hub, account/notification pages, linked detail screens, and administrative/deep routes. A hub prefix is not a security boundary: Equipment and Finance workflows frequently use `/plant/...` URLs.

| Proposed editor hub → tile/module | Actual functions and nested operations discovered | Principal page/route evidence and current keys |
|---|---|---|
| Dashboard → Home / Field Home | General dashboard; today's work; continue draft; today's report; material trip; IRN; tomorrow's plan; immediate requirement; My Plans; Profile | `Home`, embedded `FieldHome`, `/`, `/my-plans`; `dashboard` plus destination grants |
| Site Operations → Road / Structure DPR | Guided and detailed entry; draft save/resume; progress/BOQ links; chainage, geometry, layers and quantities; material receipts; equipment/diesel; labour details; photos; preview; submit; version/correct; clone; cancel/delete | `/site/new`, `/site/guided`, report/detail/edit/work screens; `site_dprs`, operational child permissions and record rules |
| Site Operations → DPR History / Progress | Search/filter/view reports, work detail, chronological progress, report exports | `/site/dashboard`, `/reports/progress`; `site_dprs` |
| Site Operations → Tomorrow's Planning / My Plans | Planned activities, immediate requirements, carry-forward, work outcome, readiness confirmation, revision request and decisions | `MyPlans`, `SiteRequirementNew`, `SiteRequirementsList`; `/site/requirements...`, `/my-plans`; shared grants and legacy role conditions |
| Site Operations → Site Requirements | Raise/edit, approve/reject, request/decide revisions, material/equipment/labour allocation, overall allocation/status, outcomes and carry-forward | `/api/site-requirements...`; `site_dprs.approve`, `stores_inventory.create`, `plant_equipment.create`, `labour_management.create`; legacy session-role paths also remain |
| Site Operations → Material Entry / Trips | Receive material; repeat recent trip; supplier/vehicle selection; arrangement link/relink; PI matching and finalization; source and delivery evidence; edit/cancel/delete; attachments | `SiteMaterialTrips`; `/api/site-material-trips...`, procurement lookup APIs; `site_materials` and guarded supporting lookups |
| Site Operations → Materials Received / Site Stock / Purchases | Receipt comparison, site stock, purchase records, direct corrections, cancellation/final submission and exports | `SiteMaterialsReceived`, `SiteMaterialStock`, `SitePurchasesReport`; `site_materials`, `site_procurement`, `report_site_purchases` |
| Procurement & Billing → Purchase Indents | Raise, edit, review/approve/reject, order, print/export, item splits/routing corrections, delivery progress, GRN/plant receipt handover and service completion | `PurchaseIndents`; `/api/purchase-indents...`, `/api/purchase-indent-items...`, `/api/service-completions...`; `purchase_indents_*` OR `site_procurement` |
| Procurement & Billing → Diesel Requirements | Request, review/approve/reject, purchase/evidence, receipt status, equipment links, daily/comparison reports and exports | `DieselRequirements`; `/api/diesel-requirements...`; `diesel_req_*` OR `site_diesel` |
| Requisitions → IRN | Raise, view/detail, approve/reject, stock lookup, procurement queue and linked procurement | `/irn`, `/irn/new`, `/irn/:id`; `/api/irn...`; `irn_view`, `irn_raise`, `irn_approve`; older internal-requisition APIs retained in inventory |
| Procurement & Billing → Vendor Bills | Discover operational candidates; preview payables; billing parties; rate setup; tax/GST; create/save; verify/approve; payment recording; paid transition; delete; exports; source-log/evidence display; vendor alias dialog | `VendorBills`; `/api/vendor-bills...`, `/api/vendor-aliases...`; `vendor_bills_*` OR `vendor_bills`; field-user and sensitive-data constraints |
| Procurement & Billing → Rate Cards | Discover suppliers, manual rates, trip-size/basis choices, bulk upsert, removal and billing-related rate saves | `RateCards`, rate dialogs in `VendorBills`; `/api/vendor-rate-cards...`; `rate_cards`, `vendor_masters_manage`, `admin_settings`, bill authority depending on endpoint |
| Equipment & Fleet → Usage | Equipment-day entry, meter opening/closing, status/idle evidence, activity allocations, diesel source and receipts, movement/handover/lifecycle | `PlantEquipmentUsage`, DPR embedded equipment; `/api/plant-module/equipment-usage...`, `/api/equipment-usage...`; `plant_equipment`, operational parent grants |
| Equipment & Fleet → Fleet Status / Performance | Fleet overview, equipment history, hire-window analysis, performance review/confirmation and exports | `EquipmentStatus`, `EquipmentPerformanceReport`; `/equipment/status`, `/reports/equipment-performance`; `plant_equipment`, `equipment_performance_report`, Admin/Owner review paths |
| Equipment & Fleet → Hire Billing | Operational statement preview, rate/exceptions, billing periods, bill generation and statement exports | `/equipment/hire-billing`, `/api/equipment-hire/statements...`; currently tied to `plant_equipment` and billing safeguards |
| Equipment & Fleet → Maintenance / Breakdowns | Maintenance entries, parts, health/open counts, corrective status, related machine evidence | `PlantMaintenance`; `/api/maintenance...`; `plant_maintenance`, navigation overlap with equipment |
| Equipment & Fleet → Generator / DG Logs | Generator logs, candidate equipment, fuel/meter evidence and edits | `PlantGeneratorLogs`; `/api/plant-module/generator...`; `plant_generator_logs` |
| Equipment & Fleet → Shared queues | Diesel request, PI, IRN and equipment allocation queue | Shared procurement and requirement pages; single canonical function, multiple entry locations |
| Stores & Inventory → Item Catalogue | Item view/create/edit/delete and operational lookups | `/stores/items`; `/api/stores/items...`; `stores_inventory` |
| Stores & Inventory → GRNs | List/detail, receipt entry, linked PI receipt, edit/cancel/other implemented transitions and evidence | `/stores/grns...`; `/api/stores/grns...`; `stores_inventory` |
| Stores & Inventory → Issues | List/detail, issue stock, adjustments and implemented reversal/cancel paths | `/stores/issues...`; `/api/stores/issues...`; `stores_inventory` |
| Stores & Inventory → Ledger / Diesel Register | Stock balance, ledger, summary, diesel register, document numbers and fulfilment lookups | `/stores/ledger/:itemId`, `/stores/diesel-register`; `stores_inventory`, diesel keys |
| Stores & Inventory → Pending Plant Receipts | Review incoming procurement, finalize/handover into plant receipt workflow | `/stores/pending-plant-receipts`; `/api/pending-plant-receipts...`; `plant_materials`, PI/receipt guards |
| HMP → Heating | Heating sessions, readings, mismatch views, trends, LDO meter links | `PlantHeatingSessions`, `PlantHeatingMismatch`, `PlantLdoMismatch`, `PlantHeatingTrends`; `plant_heating`, `plant_heating_trends` |
| HMP → Shift Logs / Manpower | Shift entry, review/corrections, manpower review and linked consumption | `PlantShiftLog`, `PlantShiftLogManpowerReview`; `plant_shift_logs`, `plant_manpower_review` |
| HMP → Production & Dispatches | Dispatch entry/edit/delete, consumption evidence, mix usage, dispatch summaries | `PlantDispatches`, `PlantProjectReport`; `plant_production`, `plant_daily_reports` |
| HMP → Materials | Receipts, issues, returns, opening stocks, pending receipts and diesel receipts | `PlantMaterialReceipts`, `PlantMaterialIssues`, `PlantMaterialReturns`, embedded Plant masters; `plant_materials`, diesel receipt alternatives |
| HMP → Bitumen / LDO | Bitumen stock, tank dips/calibration, LDO flow/dips, book-vs-physical, reconciliation and procurement report | `PlantBitumenStock`, `PlantLdoFlowMeter`, `PlantLdoReconciliation`, `PlantDieselProcurementReport`; `plant_bitumen`, `plant_ldo`, `plant_stock`, report subkeys |
| HMP → Stock / Reconciliation | Ledger, as-of balances, physical count drafts/submission, approve/reject/post, correction/rebuild, party statements, borrow reconciliation, transfer and reassignment | `PlantStock`, `PlantStockReconciliation`, `PlantStockTransfer`, `PlantStockReassign`, `PlantLedgerRebuild`; `plant_stock`, `stock_reconciliation`, `admin_ledger_tools` |
| HMP → Daily Reports / Audit | Daily report entry/list/detail/export; variance/audit reports; dispatch summary | `PlantDailyReport`, `PlantDailyReports`, `PlantVarianceReport`, `PlantAuditReport`; report-specific keys and legacy alternatives |
| RMC → Batch / Mix / Cube / Raw Materials / Challans / Daily Report | Batch CRUD, mix designs, cube testing, raw receipts/stock, delivery challans, summary/daily report and exports | `/plant/rmc/...`, `/api/rmc/...`; frontend `rmc_*`, legacy `rmc_operations`, backend often `plant_production`; ENABLE_RMC and licensed-module availability |
| Work Program & BOQ → Projects / BOQ | Project/category/item CRUD, import, zero-quantity cleanup, revisions/activation, planning inclusion/classification, mapping and item components | `BoqProjects`, `BoqProjectDetail`; `/api/boq/projects...`, `/api/boq/items...`; `qto_boq` |
| Work Program & BOQ → Programme | Gantt, Monthly Plan, Plan vs Actual; stretches/bars, side/layer allocation, auto-sequence, structure schedule parsing/import, baseline publication, schedule revision/history/restore | `WorkProgramme`, `BoqProgramSettings`; programme/auto-sequence APIs; `work_programme` |
| Work Program & BOQ → Demand / Review | BOM/material demand, mapping/UOM profiles, resource and item review, procurement linkage, material-requirement allocations | `WorkDemand`, `ResourceReview`, `BoqItemReview`; demand/material-requirement APIs; `work_programme_review` and supporting operational keys |
| Work Program & BOQ → Arrangements / Earthwork | Execution arrangements and categories, bar allocation, revisions/approval, effective status/history, outcomes/evidence, earthwork baseline/forecast, cut/fill | `ExecutionArrangements`, `EarthworkControl`; arrangement/programme/earthwork APIs; `work_programme`, `work_programme_review`, `qto_boq`, explicit role gates on some status operations |
| Work Program & BOQ → Scope / Geometry | Working reaches and scope segments, confirm/revise/withdraw, applicability; road geometry and planning preview | `ScopeSetup`, `RoadGeometry`; `project_scope` and OR-based planning/BOQ access |
| Work Program & BOQ → Planning Masters / Recipes | Equipment/labour outputs, planning parameters, mix-template components, work-type recipes and auto-build | `PlanningMasters`, embedded `BoqItemRecipes`; planning and BOQ APIs; `planning_masters`, parent BOQ/programme grants |
| Norms Library → SNL | Source/item browse, search, import/template, seed, mapping, auto-map and review | `NormsLibrary`; `/api/snl...`, BOQ SNL APIs; `norms_library` and BOQ mapping authority |
| Estimator → Mix / Concrete / Scenarios | Calculator inputs and calculations, save/load estimates, rename projects/contractors, estimate registers, impact/comparison, price scenarios and concrete v2 | `EstimatorHub`, MixCalculator component, concrete pages, mix/concrete/scenario registers; `estimator_portal`, `mix_calculator`, `concrete_calculator`, legacy estimator session |
| Reports → Cross-domain reports | DPR/progress/materials/purchases/management/equipment/HMP/RMC/procurement/vendor report links and exports | `ReportsHub`, `ManagementReport`, `AdminReports`; report-specific OR legacy `reports`/operational keys |
| Masters → Parties / Sites / Vendors | Parties/jobs, site master, reviewed vendor identities and commercial/transport associations | `PlantMasters`, `VendorMaster`; `master_parties`, `sites_plants_manage`, `site_management`, `vendor_masters_manage`, Admin/Owner-only vendor mutations |
| Masters → Materials / Mix Templates / Equipment / Personnel / Plant Configuration | Shared master CRUD, templates/components, machine rates/planning data, operators, plant settings/tanks/openings and site assignments | `PlantMasters`, embedded `Plant`, master APIs; `master_materials`, `master_equipment`, `master_personnel`, configuration/system gates |
| Administration → Users / Permissions / Devices | Guided creation, setup retry, existing-user profile/status, roles, matrix save/copy, site grants, password reset, device review/revoke and session controls | `/admin/users`, `/admin/devices`; `/api/auth/...`; `user_management`, `permission_manager`, `device_approval`, privileged flags and delegation ceilings |
| Administration → System / Data Tools | Branding/licensed modules/settings, PIN maintenance, notification records, sync/export/import/reset sequences, site backfill, LDO backfills, ledger repair, permission-migration audit and manuals | Admin routes and tool pages; `admin_settings`, `data_sync`, `admin_ldo_tools`, `admin_ledger_tools`, other split admin keys and hard Admin/Owner gates |
| Administration → Edit Requests / Record Unlock | Request own edit access, review queue, approve/reject, unlock lifecycle and audit history | `/edit-requests`, `/edit-requests/mine`; `edit_requests_review`, `canUnlockRecords`, underlying edit permission |
| Shared → Account / Notifications / Attachments | Own profile/preferences/session devices; push subscription; read notifications; attachment upload/download/delete and evidence viewers | `/account`, `/notifications/preferences`, auth/push/notification/attachment/object APIs; self-service, parent-resource checks and system policies |
| System → Background operations | Bootstrap, schema/setup guards, data backfills/rebuilds, stale-GRN timer, derived stock/audit calculations and notification fan-out | `server/index.ts`, storage/push call sites; never fake per-user “background execution” checkboxes |

### Hidden, embedded, conditional and legacy locations

- `BoqItemRecipes`, `DprWorkHub`, `FieldHome`, `SiteEdit` and `SitePreview` are import-reachable embedded/page variants, not missing modules simply because they have no direct component route.
- `DprDetails.tsx` and `NewDpr.tsx` are not reachable through App's static/dynamic import graph. Inventory them as legacy source, not active grants. The live detailed DPR form is `SiteEntry`.
- `/admin/permission-migration-audit`, site/LDO backfill, ledger tools, estimator comparisons, programme detail/review screens and account utilities are retained even when absent from ordinary hub tiles.
- Work Programme routes depend on WP_ENABLED. RMC has both configuration/navigation conditions and a backend ENABLE_RMC middleware. Licensed-module visibility is independent of per-user grants.
- Query parameters such as `context`, `returnTo`, field entry mode and plant/site selection change presentation, not the identity of the capability.
- Body-driven lifecycle operations are not necessarily separate URLs. The matrix must split status choices within one endpoint where they represent different authority, e.g. approve versus allocate.

## B. Function/action permission matrix and proposed control model

### Three layers, not one flat grid

1. **Function access:** open the actual function and read its scoped data.
2. **Operational action:** create, edit, submit, approve, verify, receive, issue, allocate, assign, transfer, cancel, revise, reconcile, import, export or another evidenced operation.
3. **Non-negotiable constraints:** authentication, device approval, deployment availability/licensing, site scope, record ownership, self-approval separation, state locks and accounting invariants.

The 643-operation matrix is the backend cross-check; the 2,995-control ledger exposes tabs, dialogs and secondary actions. The 736-cell matrix records current permission wiring. These are complementary, not interchangeable. Do not infer a Create checkbox from POST alone: calculation, validation, submission, handover and import may all use POST.

### Standard checkbox rules

| Control | Proposed meaning |
|---|---|
| View | Open the function and retrieve its scoped records. Supporting lookup access is narrowly attached to the caller, not a grant to the entire master. |
| Create | Create a new record only, where implemented. Not a substitute for approve, receive, allocate or post stock. |
| Edit | Change eligible records without overriding lifecycle locks. Submitted correction/revision remains separately controlled where implemented. |
| Delete | Delete only where the workflow supports deletion. Cancellation/reversal is a separate action when commercially distinct. |
| Approve | Approve/reject the relevant workflow. Keep creator separation and required authority; expose split Reject only if Owner approves that distinction. |
| View Reports | Show an implemented report/preview independently from register View. Currently only specific vendor payables-preview uses are wired; do not enable this everywhere. |
| Export | Server downloads plus browser-generated print/PDF/Excel exports. Read access alone is not export authority. |
| Receive Notifications | Eligibility for actual events, subject to active account preferences/subscription and event scope. Never means Send/Broadcast. |
| Unavailable | Label “Not implemented / not applicable”; no interactive checkbox and no stored grant fabricated. |

### Required function-level distinctions supported by existing operations

| Function | Existing limitation | Smallest proposed independent controls |
|---|---|---|
| DPR entry | Several transitions share ordinary create/edit authority | Draft/Create, Edit, Submit, Revise/Correct, Clone, Cancel, Delete, Export; keep normal draft validation lenient and submission strict |
| Site Requirements | Approval uses DPR Approve; allocations use Stores/Equipment/Labour Create; readiness and some actions have legacy/auth-only rules | Requirement View/Create/Edit; Approve/reject; Request Revision; Decide Revision; material/equipment/labour allocation; readiness confirmation; outcome/carry-forward, without changing the workflow itself |
| PI / IRN / Diesel | View/Raise/Approve section split still overlaps broad keys; operational follow-through shares grants | Raise, edit, submit where implemented, approve/reject, order/purchase, receive/handover and export by workflow |
| Vendor bills | Broad keys and stage-specific keys overlap; rate changes and payment have different risk from ordinary editing | Create/Edit, Verify, Approve, Record Payment, Mark Paid, sensitive preview, rate maintenance, Delete/Cancel where implemented, Export |
| Stores / plant materials | Receiving, issuing, returns and stock-impacting transitions bundled | Receive, Issue, Return, Cancel/Reverse, Transfer and stock adjustment, with stock sufficiency and idempotency untouched |
| Physical stock reconciliation | View currently permits draft/submitted-session save; Create authorizes review/posting paths | Prepare Count, Submit Count, Review/Reject and Post Reconciliation; report view separate |
| Equipment | Usage edits, lifecycle, diesel and bill preparation share broad module grants | Usage Create/Edit, Assign/Handover/Close Movement, performance review, prepare hire statement/generate bill; no multiplication of physical facts |
| BOQ / Programme | Project CRUD, imports, mapping, baseline publication and schedule changes share broad grants | Import, edit BOQ, activate revision, map resources, plan bars, auto-sequence, publish baseline, revise/restore schedule, scope confirmation/correction as implemented |
| Arrangements | Generic edit and legacy role names influence approval/status changes | Create/Edit, Approve/revise, allocate/link bars, record effective status/outcome; preserve date history and material/procurement responsibilities |
| Vendor master | Admin/Owner-only writes cannot be delegated with a nominal Parties Edit switch | Explain restriction immediately; only introduce delegated review/link/update actions if separately approved |
| Administration | System tools may appear as ordinary CRUD switches | Separate supported delegable actions from privileged-only settings, data imports, rebuild/backfill, user privilege changes and device administration |

A final leaf capability identifier should be stable and independent of navigation labels, for example `site_requirements.allocate_labour`. This is a **proposed capability**, not an existing database column. Exact identifiers and migration expressions require approval; do not rename existing stored keys in Phase 1.

## C. Missing, overlapping and misleading controls

| Finding | Evidence | Design consequence |
|---|---|---|
| Current View semantics differ from old audit prose | `auth-context.tsx`: sectionVisible checks `row.view` only | Use current code. Do not repeat the historical claim that Create/Edit automatically grants entry. |
| Sidebar and destination rules differ | `HubShell`: HMP/RMC links use module/config flags; Masters link uses master keys; destination hubs use hub keys | NAV-01 must evaluate actual reachable child functions plus availability, not merely a link's label or role. |
| Landing can be a dead end | Login routes to `/`; `/` is gated by dashboard; nested navigation has hard-coded Dashboard/Hub returns | Resolve a safe authorized landing and fallback, including no operational grants. Never secretly grant dashboard access. |
| Tile hiding partly already works | `HubActionTile` returns null when disabled | Retain this behavior; correct its input predicates rather than claim all tiles are currently visible. |
| Hub variable predicates may not match destinations | Finance Rate Cards tile checks admin/vendor management whereas route also accepts rate_cards; HMP IRN tile follows procurement predicate; Reports RMC links use production-derived predicate | One capability resolver should power both tile and route, while retaining legacy effective access during migration. |
| Legacy OR grants prevent real revocation | `site_procurement`, `site_diesel`, `vendor_bills`, `reports`, `admin_settings`, RMC/plant overlaps and helper-level OR checks | Unticking a specific bit must say “Still allowed via …” until alternatives are explicitly resolved. |
| RMC-specific switches do not define all API authority | RMC page keys vs `/api/rmc` handlers using `plant_production` | Reconcile both sides; do not silently convert HMP production access into a new RMC grant or remove current access. |
| IRN approval UI/API use different action bits | Generated source evidence identifies `irn_approve.create` for showing the action and separate approval enforcement | One semantic Approve action must govern control, mutation and explanation. |
| Labour Create is allocation status, not labour-master creation | Existing tooltip and Site Requirements handler | Display “Allocate / update labour status” at the actual function; do not enable nonexistent Edit/Approve actions. |
| Site Requirements approval is not DPR approval | `site_dprs.approve` now controls requirement/revision decisions in workspace source | Propose independent capability with explicit preservation mapping, not a misleading DPR checkbox. |
| Some Site Requirements paths still use legacy session roles | Overall allocation/outcome/carry-forward and related branches in `registerSiteRequirementRoutes` | Treat as explicit gaps, not authority implied by a modern business-role designation. Separate review required before replacing them. |
| View can currently authorize mutation in particular workflows | Reconciliation draft/submission save checks `stock_reconciliation.view` OR `plant_stock.view` | Show actual effect now; splitting Prepare/Submit from View needs a preservation decision. |
| Three retained controls have no wired page | `vendor_bill_aliases.view`, `admin_notifications_manage.view`, `push_notifications.view` | Mark retained legacy/unwired; do not promise a page or infer absence of all underlying alias/notification operations. |
| Broad Admin/Owner bypass defeats ordinary revocation | Standard permission helpers and client section checks | Prominent privileged-access banner; normal checkbox changes cannot restrict these accounts. |
| Delegation and privileged-account rules are separate | `requireUserMgmt`, `requireDeviceMgmt`, permission-manager caps and user edit checks | Explain effective authority and limitations; do not broaden Owner/Admin/delegated-manager parity by redesign alone. |
| Estimator has a separate authorization path | Optional-auth calculator APIs and signed estimator role cookie | Preserve it and surface its effect separately. Do not redesign authentication or promise matrix-only revocation there. |
| Attachments need parent-resource security | Object prefix/upload routes require authentication; this is not by itself evidence of authorization to the linked record | Keep parent record/site checks explicit. Do not offer “View every attachment” as an accidental side effect of upload capability. |
| Some operations have no independently configurable permission | Authentication-only branches, explicit Admin-only functions and legacy roles in operation ledger | Classify as self-service, privileged/system-only, or a missing action gate before adding any checkbox. |
| BOQ project operations lack a local action gate | Current `GET /api/boq/projects` and `POST /api/boq/projects` handlers use storage directly after global authentication, without local View/Create assertions | A frontend QTO checkbox alone does not enforce these operations. Add explicit scoped guards in a separately approved implementation; do not mislabel them as currently protected by QTO Create. |
| Administrative notification records are not broadcasts | Current notification API/tooltips and push plumbing | Separate notification record administration from receiving event notifications; do not invent a broadcast feature. |
| “IRN — coming soon” remains in permission-group wording despite implemented routes | `PERMISSION_GROUPS` versus `/irn...` pages and APIs | Correct the eventual presentation from actual availability, without changing grants. |
| Automated audit narrative has stale hard-coded descriptions | Existing audit script's prose versus current source | Raw line references and regenerated matrices support this report; old narrative is not the authority. |

### Proposed effective-access calculation

Show these separately for every action:

1. **Requested:** explicit individual choice, if present.
2. **Legacy sources:** all current keys/actions that authorize it, with exact OR/AND semantics.
3. **Privileged bypass:** Admin/Owner/system authority, where the actual handler accepts it.
4. **Effective:** Allowed / Denied / Privileged / Unavailable / Conditional.
5. **Conditions:** site assignments, record status, creator separation, licenses and device/auth requirements.

Example: “Approve requirement — allowed via Site DPRs / Approve; creator cannot decide own record; Owner exception applies only to the authenticated Owner; unknown creator blocks everyone.” A site or lifecycle restriction is not an unchecked permission.

### Migration-compatible independent revocation

**Recommended proposal:** a sparse, per-user canonical action override: `inherit`, `allow`, `deny`. Absence inherits existing behavior unchanged. Explicit deny closes legacy OR paths for that **ordinary-user capability**, while preserved system-level rules/privileged bypass remain separately explained.

Do not implement deny only in the editor or one handler. Every route, UI control, client export and legacy alias for the capability must consult the same resolver before the editor can claim independent revocation.

Alternative requiring explicit approval: expand legacy grants into canonical grants and retire their authority in a reviewed migration. This is a larger initial risk. Merely adding more Boolean keys while leaving every old OR bypass untouched does not solve the requirement.

## D. Proposed User Creation and Permissions Editor

This is a written interface design, not an implemented screen or approved change to display behavior.

### New-user flow

1. **Details:** name, email/phone, account active state and existing account settings.
2. **Starting role:** one of the ten current templates, Custom, or a separately privileged Administrator path. Explain that templates fill an initial draft; they do not continuously control permissions.
3. **Sites:** explicit selected sites / all sites where authorized / no sites with setup-incomplete explanation. Never infer scope from a role.
4. **Functions and actions:** expandable Hub → Tile/Module → Function → action controls.
5. **Review:** exact account, site and effective-capability changes; sensitive warnings and conflicts.
6. **Save:** deliberate submission, resulting-state read-back, and visible retry/reconciliation on partial failure.

Existing templates discovered: Operations Director / Project Head, Site Engineer, Project Manager, Stores, Procurement, Site Supervisor, Stores & Procurement, Equipment & Fleet, Accounts & Commercial, and Viewer / Read Only. Administrator and Owner remain account privileges, not ordinary role templates.

### Existing-user flow

Use the same editor populated from saved data. Opening it must not apply a role or normalize old grants. Preserve hidden aliases and unrelated flags. Choosing a different role opens an explicit Merge/Replace comparison; existing individual edits must not disappear without review.

### Proposed screen structure

```text
User: [name]       Active [ ]       Unsaved changes: N
Account privileges: Administrator [existing authorized control]
                    Owner [read-only status; no promotion control]
Role designation / starting template [select] [Preview application]
Sites [Selected sites | All sites | No sites] [Edit scope]

Search functions/actions…   [All] [Allowed] [Changes] [Conflicts]
Left: Hub tree                Right: selected function and actions

▾ Site Operations
  ▾ Site Requirements
    ▾ Decisions
       View              [ ]  Effective: …
       Approve/reject    [ ]  Legacy source: Site DPRs / Approve
       Decide revision  [ ]  Conditional: self-approval safeguards
    ▾ Allocation
       Materials        [ ]  Legacy source: Stores / Create
       Equipment        [ ]  Legacy source: Equipment / Create
       Labour           [ ]  Legacy source: Labour / Create
    Reports             —    Not implemented for this function

[Grant available actions…] [Revoke actions…] [Restore inherited]
Effective-access explanation / retained legacy sources / scope

Sticky footer: [Discard] [Review N changes] [Save after review]
```

The same function reached through multiple hubs is one canonical record. Editing it in Equipment must immediately show the same pending state in Site Operations; there must not be independent, contradictory copies of the grant.

### Bulk and sensitive-action safeguards

- Bulk operations are draft-only and scoped to visible named nodes, not silent global writes.
- No meaningful checkbox for a nonexistent operation.
- Preserve the existing conservative handling of Delete, Export and Receive Notifications; bulk Grant All must not silently enable them. Approve, Verify, stock posting, payment, import, rebuild and privileged administration need explicit review.
- Bulk Revoke must enumerate effective losses and remaining alternative grants.
- Preserve minimum self-service account access and anti-lockout rules.
- Administrator/Owner bypass is disclosed, not simulated as revocable checkboxes.
- A partial permission manager cannot grant beyond their actual delegation ceiling or manipulate protected accounts.
- Show “Changed”, “Inherited”, “Explicitly allowed/denied”, “Still allowed via …” and “Unavailable” distinctly and accessibly.
- Cancellation discards only the draft. Concurrent edits require conflict handling, not last-write-wins loss.

## E. Minimum necessary backend changes — proposal only

1. **Capability registry:** identity, display hierarchy, actual operations, current legacy expressions, caller lookup requirements, availability and sensitivity. Keep existing section/action keys intact.
2. **Shared resolver:** evaluate canonical action overrides plus current legacy authority, privileged checks and structured reasons. Site/business constraints stay downstream and cannot be bypassed.
3. **Read-only effective-access projection:** current and proposed-draft access, alternative sources and warnings for authorized user managers; do not expose other users' sensitive details to ordinary users.
4. **Deliberate save contract:** versioned/transactional validation of permitted account/site/capability edits; audit old/new state; refuse privilege escalation and stale concurrent saves; return saved state for read-back.
5. **Action gates at existing operations:** only split authority where implemented operations currently share it. No new operational functionality. Cover body-driven transitions, exports, uploads and indirect caller paths.
6. **Navigation/route integration:** use the same function-access result for sidebar, hubs, tiles, routes and landing. Enforce data and action authority on the server independently.
7. **Compatibility:** absent overrides preserve existing access exactly. No automatic template reapplication, bootstrap grant changes, Owner promotion, recurring startup conversion or historical data repair.

A database representation for sparse overrides would be necessary only if that option is approved; its schema/migration must be separately designed and reviewed. A standalone editor redesign cannot safely promise action independence without these backend changes.

## F. Preservation and migration-risk assessment

| Risk | Required control |
|---|---|
| Silent loss of legacy access | Before/after effective-access comparison per existing user and operation; no writes in this phase |
| New access accidentally granted | Compare both gains and losses; unchanged users must have zero unapproved deltas |
| “Deny” still bypassed through another route | Table-driven route/action tests covering every alias and body transition |
| Broad read exposes unrelated sites/masters | Preserve deny-all zero-site rule, all-sites explicit grant and resource-level scope; narrow lookup projection |
| Admin/Owner expectations differ | Retain current bypass semantics and show them honestly; changing these is separate approval |
| Partial user-save failure | Atomic final save where feasible; explicit recoverable setup state and read-back, no synthetic success |
| Existing role/customization overwritten | Store designation separately; role application only by explicit draft operation |
| Notification grants cause real messages | Permission editing must not emit operational events; acceptance uses isolated fixtures and approved delivery testing only |
| Existing workflows lose integrity | Preserve creator IDs, revisions, stock locks, idempotency, immutable bills, audit history and source links |
| Startup backfills mutate data during verification | No restarts for this investigation; isolate future acceptance from startup repair side effects |
| Report and browser export disagree | Verify backend downloads and in-browser PDF/Excel/print independently |
| Dormant modules activated by granting access | Availability/licensing remains separate; grants do not enable RMC or alter deployment configuration |
| Authentication/estimator/device paths altered | Explicitly out of scope; document compatibility paths without rewriting them |
| Two user accounts accidentally linked | Per-account identity only; no cross-account Owner or self-approval inference |

The inventory reflects current repository code, including un-published changes. It is not proof of production rollout. No production migration or grant preservation was executed or inferred here.

## G. Phased implementation plan and acceptance tests

These are proposed phases within this report, not created project tasks.

### Phase 2A — Approve semantics and capability mapping

Approve the hierarchy, independent actions, override precedence, privileged boundaries and sensitive bulk behavior. Resolve each unmatched/dynamic caller before altering its endpoint.

Acceptance: all 130 route declarations and 643 HTTP operations remain accounted for; every action is identified as delegable, privileged/system, self-service, unavailable, or requiring explicit design resolution. No checkbox lacks an implemented operation or an explicit navigation purpose.

### Phase 2B — Read-only editor and effective-access preview

Build tree/search and explanation views first, without changing enforcement or grants.

Acceptance: ten templates displayed as starting configurations; existing users and hidden legacy grants retained; alternate paths visible; shared functions synchronized; disabled/nonexistent actions inert; keyboard/mobile tree behavior; no write on open/cancel/template preview.

### Phase 2C — Reviewed persistence and authority checks

Implement the approved storage and save contract, audit and read-back.

Acceptance: ordinary users cannot edit grants; delegation cannot exceed scope; protected users/flags cannot be escalated; concurrent save rejected safely; partial failure explicit; save/reload exactly reproduces intended changes; unchanged settings/passwords/sites/aliases preserved.

### Phase 2D — Action-specific enforcement, one reviewed domain at a time

Wire the agreed actions at real existing endpoints and controls. Preserve compatibility by default.

Acceptance: for every capability, allowed and denied API cases; frontend action matches server; alias grants and explicit revocation; cross-site denial; record lifecycle/ownership restrictions; correct status-specific checks within shared endpoints; lookup access without master access; direct URL and attachment access; Owner self-approval exception only where defined.

### Phase 2E — NAV-01 / NAV-02 and landing

Derive hub visibility from accessible children and availability using the approved hub-key policy. Hide unauthorized tiles/actions; prevent inaccessible links and unusable landing pages.

Acceptance: no-hub-bit/allowed-child, hub-bit/no-child, action-without-View, notification-only, reports-only, field-user, estimator and no-operational-access accounts; safe return paths; direct routes/APIs still guarded; RMC/license flags honored.

### Phase 2F — Preservation, regression and controlled release proposal

Run account-by-account access diff and regression coverage before any separately approved rollout.

Acceptance: zero unapproved existing-user gains/losses; permission records and identities preserved outside explicit changes; full-suite failure identities compared with baseline; no missing test files; authentic browser/network checks rather than mocked success; schema preview reviewed; no production write or publish without separate approval.

## H. Decisions requiring Owner approval

1. **Revocation semantics:** sparse inherit/allow/deny overrides (recommended) versus a larger reviewed legacy-grant migration.
2. **Privileged boundary:** retain current Admin/Owner bypass (recommended for this redesign), or separately redesign how Administrators can be restricted. Ordinary checkboxes cannot currently restrict them.
3. **Hub entry policy:** derive hub visibility from accessible children while retaining old hub keys as compatibility metadata, or keep explicit hub-entry gates and automatically propose—but never silently save—required navigation grants.
4. **View dependency:** require explicit View alongside actions, with the editor proposing it, versus scoped action-only entry. Current frontend section visibility uses View.
5. **Decision granularity:** separate Approve from Reject and Request Revision from Decide Revision, or pair decisions where the workflow treats them as one authority.
6. **Allocation/billing/stock capabilities:** approve separation of currently bundled allocation, receiving, stock posting, payment and rate-setting authority.
7. **Sensitive bulk behavior:** which additional actions beyond Delete/Export/Notify always require individual confirmation; what protected self-service minimum remains.
8. **System-only functions:** which vendor/master, configuration, import, rebuild/backfill and device/user actions may be delegated at all.
9. **Legacy estimator access:** keep it explicitly outside matrix-only revocation, or commission a separate authentication/compatibility review. This instruction does not authorize redesigning it.
10. **Default landing preference:** field-first, first authorized function, or an access-aware launcher; never require an otherwise unauthorized Dashboard.
11. **Existing grants in reviewed migrations:** approve exact gains/losses per user only after the effective-access comparison; no blanket role replacement.

## Completion boundary

Source discovery, navigation/API cross-checking, detailed inventories and the proposed interface/migration design are delivered. Runtime security verification and final canonical action identifiers belong to the separately approved implementation phases. No Phase 2 work, Owner promotion, production changes or publishing has been performed.
