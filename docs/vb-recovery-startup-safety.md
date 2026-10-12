# Vendor Bills recovery — startup safety

Review date: 2026-10-13. Production inspection was SELECT-only. No Production
restart, DDL, data mutation, migration or publication was performed.

## Decision

**Automatic business-data repair has been removed from startup. Publication is
not unconditionally cleared under a strict “no Production records change” rule.**

The actual publishing schema preview returned `hasDiff: false`,
`statementsToExecute: []`, no destructive changes and no warnings. No Production
SQL or index migration is required by this change. The preview is a point-in-time
result, not permission to accept a different future preview.

The surviving operational GRN reminder can send push notifications and delete
expired `push_subscriptions` on provider HTTP 404/410. Its behaviour was preserved,
not silently disabled. No stale draft GRNs qualified at the default 48-hour
threshold during inspection; future eligibility and external provider responses
cannot be proved through a database snapshot. Production's configured threshold
was not inspected. This is the remaining zero-record-change blocker.

## Implemented treatment

`server/index.ts` now runs `verifyStartupReadiness` from
`server/startupReadiness.ts` before registering routes. It uses a PostgreSQL
READ ONLY transaction to check:

- Every table/column declared in the shared schema.
- The hire-period, equipment-successor and stock-dispatch unique indexes.
- The hire-period index is the required unconditional btree definition.
- The existing permission-preservation completion marker.
- An existing administrator.

Missing prerequisites stop the process with a specific error, rather than
altering schema, seeding data or promoting users. Earthwork readiness is enabled
only after these checks succeed. Authentication, permission enforcement, API
handlers and the operational reminder remain in place.

The automatic initializer at the end of `registerRoutes` was removed. Historical
functions in storage/auth/routes remain available as source for a separately
reviewed migration. There is no restart flag or environment-variable shortcut
that enables them. No broad “apply all legacy migrations” command was added.
Provisioning a new/empty database now requires explicit schema/account setup.

No Vendor Bills calculation, saved-data projection, status/payment handler,
DPR write path, Master, permission matrix, or financial record was changed.

## Inventory and Production evidence

Locations below identify the original routines, which remain in their indicated
files unless noted. `S` = `server/storage.ts`; `R` = `server/routes.ts`;
`A` = `server/auth.ts`. Function names are searchable locations.

Classifications:
- **Ready**: required startup prerequisite; retained as a SELECT-only check.
- **Completed**: inspected condition already satisfied; automatic migration unnecessary.
- **Review**: historical data transformation or unproven exact candidate set;
  explicit review/approval required before running it manually.

Every historical operation below has **zero automatic invocations on the next
startup**. The Production evidence column describes the old operation's
eligibility, not permission to run it. Some semantic repairs require matching
logic beyond a simple count; these are explicitly unproven, not reported as zero.

### Schema initialization

These are provisioning/migration operations, not necessary writes on each
startup. Production has every currently declared application column (verified
by comparing the complete shared-schema column list through a SELECT).
All public index definitions matched managed development; the three runtime
guard indexes exist and the restored hire-period index is unconditional.
Full historical DDL execution was deliberately not used as a verification method.

| Original routine/location | Tables potentially modified | Classification / treatment |
|---|---|---|
| S `ensureBulkDensityColumn` | plant_materials | Ready schema; validate only |
| S `ensureEquipmentUsageAuditColumns` | equipment_usage, equipment_logs; successor index/check | Ready schema; validate only |
| S `ensureStockReconciliationTables` | stock_reconciliation_sessions/items | Ready schema; validate only |
| S `ensureUserAccessColumns` | users | Ready schema; never backfill flags |
| S `ensureSiteMaterialTripsLinkageColumns` | site_material_trips | Ready schema; validate only |
| S `ensureOrderColumns` | purchase_indent_items | Ready schema; validate only |
| S `ensureMaterialRequirementsTable` | material_requirements, material_requirement_allocations, purchase_indents/items, internal_requisitions | Ready schema; validate only |
| S `ensureVendorBillAdditionalAdjustmentsColumn` | vendor_bills | Ready schema; validate only |
| S `ensureTransportPricingColumn` | vendor_bill_items | Ready schema; validate only |
| S `ensureMaterialReceiptDieselLinkColumn` | material_receipts | Ready schema; validate only |
| S `ensureMaintenanceTables` | equipment_maintenance_logs, maintenance_parts_used | Ready schema; validate only |
| S `ensureStructureBarColumns` | work_program_bars | Ready schema; validate only |
| S `ensureHeatingSessionDipColumns` | bitumen_heating_sessions | Ready schema; validate only |
| S `ensureMaterialOpeningStockTankNumber` | material_opening_stock | Ready schema; validate only |
| S `ensureSiteIdColumns` | diesel_requirements, purchase_indents | Ready schema; validate only |
| S `ensureSiteEnabledModulesColumn` | sites | Ready schema; validate only |
| S `ensureServiceCompletionsTable` | service_completions | Ready schema; validate only |
| S `ensurePendingPlantReceiptsTable` | pending_plant_receipts | Ready schema; validate only |
| S `ensurePendingStoreReceiptColumns` | store_grns and purchase linkage columns | Ready schema; validate only |
| S `ensureStoreCancellationColumns` | store_grns | Ready schema; validate only |
| S `ensureRmcTables` | rmc_mix_designs, rmc_batch_records, rmc_cube_tests, rmc_raw_material_receipts, plant_settings | Ready schema; validate only |
| S `ensureProjectScopeSchema` | project_scope_segments, boq_projects, progress_entries | Ready schema; validate only |
| S `ensureProgrammeBarOutcomeEventsTable` | programme_bar_outcome_events | Ready schema; validate only |
| S `ensureSiteRequirementsTable` | site_requirements | Ready schema; validate only |
| S `ensureMaterialUomConversionsTable` | material_uom_conversions, boq_material_mappings | Ready schema; validate only |
| R `ensureBoqDprConversionFactor` | boq_items | Ready schema; validate only |
| R `ensureDprEntryKeyColumns` | progress_entries, attachments | Ready schema; validate only |
| R `ensureProgressLayerNoColumn` | progress_entries | Ready schema; validate only |
| Former background stock-dispatch index ensure in `server/index.ts` | stock_ledger index | Completed; validate existing index only |

### Mixed schema/data routines and historical repairs

| Routine/location | Possible writes | Read-only Production evidence / classification |
|---|---|---|
| S `ensureVendorBillPaymentColumns` | vendor_bills/diesel_requirements DDL; app_settings company accounts insert | Required columns and company-account setting present. Completed |
| S `ensureWorkProgrammeRevisionColumns` | work_program_bars baselines/history plus DDL | 0 missing baseline candidates in prior read-only check; 0 invalid histories. Completed |
| S `ensureBoqMaterialMappings` | mapping schema plus plant_materials alias merges | Schema present; exact alias-merge delta not computed. Review |
| S `ensureBoqProgramSettingsTables` | settings conversions, work_program_bars source tags; conditional DROP/recreate boq_mix_template_links | 0 invalid productivity modes; obsolete `boq_item_id` column absent. Other data predicates not fully quantified. Review |
| S `ensureBoqCanonicalUnit` | boq_items units/categories | 0 missing canonical units/categories; raw-unit cleanup candidate delta unproven. Review |
| S `ensureEarthworkTables` | earthwork/cut-fill schema; fill work_category | Schema present; 0 null categories. Completed |
| S `repairLegacyCutFillArrangementSources` | earthwork_arrangements source links/timestamps | Semantic source matching; exact affected set unproven. Review |
| S `backfillUppercaseBusinessText` | boq_projects name/client/contractor | 0 candidates in prior read-only check. Completed |
| S `backfillMaterialBulkDensity` | plant_materials density/conversions | 0 default-density candidates in prior read-only check. Completed |
| `server/arrangementAllocationSync.ts:backfillArrangementBarAllocations` | arrangement allocation rows/source schema | Exact allocation/shortfall delta unproven. Review |
| S `backfillSiteIdsOnDieselAndIndents` | app_settings marker only; current implementation does not infer/write site IDs | Marker present. Completed |
| S `migrateBulkPlantToMaterial` | purchase_indent_items procurement_route | 0 legacy `bulk_plant` routes. Completed |
| S `migrateLegacyGeneratorNamesToCanonical` | generator_logs, bitumen_heating_sessions names | Master-name matching delta unproven. Review |
| S `deduplicateBitumenDipReadings` | bitumen dip rows; app_settings | Completion marker present; old path skips. Completed |
| S `backfillBoqPlanningInclude` | boq_items, _migration_markers | No missing planning values; marker/pattern exclusion delta not fully audited. Review |
| S `backfillBoqWorkType` | boq_items, _migration_markers | No null work types; one-time classifier delta not fully audited. Review |
| R `ensureDprBoqProjectColumn` | dprs project links; hard-coded progress_entries 25→13 repair; FK DDL | 0 orphan-remap candidates; 0 project-link candidates. Completed data repair |
| R `ensureBoqItemNameColumn` | boq_items item_name | 0 unnamed eligible items. Completed |
| S `seedSitesFromDprs` | sites | Normalized-name missing-site set unproven. Review |
| S `migrateSupersededDprs` | dprs.is_superseded | Edited-version branch targets 156 existing originals, all already true; old UPDATE still executes. Second duplicate-group branch unproven. Review |
| S `migrateEngineerNamesToPersonnelFormat` | dprs.engineer | Personnel-match delta unproven. Review |
| S `migrateLegacyPlantShiftLogManpower` | plant_shift_log_manpower contractor/category/gender | 0 eligible nonblank-name rows. Completed |
| S `backfillShiftLogLockStatus` | plant_shift_logs; unlocks every locked row | 0 currently locked rows; future locks would be reset. Review; never startup |
| S `backfillWorkProgramBarCalendarDates` | work_program_bars dates | 0 undated bars. Completed |
| S `fixNullContractorLabels` | mix_estimates contractor inferred from state | JSON semantic eligibility not queried. Review |
| S `fixLabourContractorCasing` | labour_logs contractor | 0 candidates. Completed |

### Seeds, access and external effects

| Routine/location | Possible writes | Evidence / classification / treatment |
|---|---|---|
| R `seedDatabase` | Example DPR and children on empty DB; invokes repairs above | Existing Production DPRs; sample seed unnecessary. Nested repairs reviewed above; removed startup call |
| R `seedPlantMasterData` | plant materials and other default Masters | 19 material rows; full per-master seed branch qualification not completed. Review; no automatic seed |
| R `seedPlanningMasters`; S `seedPlanningMorthDefaults` | planning equipment/labour Masters | 20 equipment types; outer empty-equipment startup condition false. Completed / unnecessary |
| R `seedSnlItems`; S `seedSnlMorthSdb` | SNL source/items/components/import log; app_settings version | Version setting exists; exact version content/seed delta not assessed. Review |
| R `seedSnlFromBundles` | SNL tables/import log from bundled files | File/source-code eligibility not fully quantified. Review |
| `server/snlAutoMapper.ts:autoMapAllUnmappedItems` | BOQ/SNL mappings and derived recipes | 0 unmapped/needs-review candidates. Completed at inspection; not a startup repair |
| `server/snlAutoMapper.ts:backfillCompositeDetection` | BOQ composite flags/mappings/recipes | 42 raw mapped/non-composite candidates before manual exclusions and classifier matching; exact write set unproven. Review |
| `server/permissionAccessMigration.ts:runPermissionAccessMigration` | user_permissions and durable app_settings audit/marker | Completion marker present. Ready prerequisite now checked, migration never automatically applied |
| A `backfillSplitPermissions` | None in current implementation | Retired no-op; unnecessary startup call removed |
| A `backfillPlantSubPermissions` | user_permissions, app_settings | Completion marker present. Completed |
| A `migrateEmailPhoneSchema` | app_settings marker only | Completion marker present. Completed |
| A `ensureBootstrapAdmin` | users/password/flags/permissions | 3 admins exist. Ready prerequisite checked; no automatic account creation/promotion |
| `server/push.ts:initPush` | None; in-memory provider configuration | Required operational setup retained |
| `server/index.ts:startStaleGrnNotifications`; S `getStaleGrns`; `server/push.ts:sendPushToAudience` | Read GRNs, external push; may DELETE expired push_subscriptions | Recurring operational feature, not migration. Preserved; external effects cannot be proven no-op |

## Verification

- Actual schema preview: empty SQL list; no destructive or compatibility warnings.
- Production shared-schema comparison: **zero missing declared columns**.
  All three required indexes exist; permission marker and administrators exist.
- Focused startup + restored Vendor Bills suites: **9/9 passed**.
  PGlite fixtures include locked/DPR/bill evidence and compare all table counts
  and hashes; missing schema, marker, administrator and indexes fail closed.
- Additional permission/calendar/equipment suites: **60 passed, 3 failed**.
  The three equipment-consistency failures concern recovery mocks/concurrency
  expectations in unchanged storage code. They were not fixed or independently
  re-baselined in this task. No full-suite-green claim is made.
- **Exactly one production build passed** after application edits.
- `scripts/verification/startup-isolated.mjs` created a disposable development
  PostgreSQL database, copied schema only, added synthetic account/DPR/bill
  fixtures, ran the real production bundle and waited past the first timer tick.
  It then used ordinary password/device login and read Vendor Bills through the
  real API. Startup/read checks passed, 138 protected table fingerprints/counts
  stayed unchanged; the synthetic bill remained draft for 1234.
- Only authentication/session/device/audit records and the synthetic user's
  normal last-login timestamp are excluded from the post-login comparison.
  The stricter pre-login startup comparison includes the entire users table.
  No live business data or credentials were copied into fixtures. The temporary
  database was dropped and the isolated process stopped.
- Existing development workflow restarted once: readiness succeeded with 2,061
  catalog columns. Across 141 table fingerprints, only user_devices and
  user_sessions differed while the already-open browser made authenticated
  requests; all other tables matched.
- Browser-only live signed-in Vendor Bills rendering was not repeated; normal
  authentication and bill reading were verified through the isolated server API.
- External push delivery was deliberately disabled in the isolated harness.
  Therefore the test is not proof that Production push delivery/pruning is inert.

## Remaining boundaries

The startup hardening is implemented and tested; **strict zero-Production-record-
change publication remains blocked by the preserved reminder's subscription
cleanup and external effects**. Do not conflate a zero-SQL publish preview with
zero subsequent runtime writes. Three additional regression failures and the
unquantified historical repair candidate sets are disclosed above.

No automatic publication or follow-up tasks. No Production changes. STOP.
