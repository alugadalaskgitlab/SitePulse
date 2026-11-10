# DATA-COPY-01 — Production data copy report

**Date:** 2026-11-10
**Status:** Completed in development. Production was queried read-only; no production write or publish was performed.

## Part A — access, inventory, and backup

The only available production read path was Replit's `executeSql` callback with `environment: "production"`, which accepts read-only queries. No consistent full dump was available, so the approved copy used paged read-only `SELECT` queries. The pre-copy inventory was **146 public tables and 30,564 rows**; the public table-and-index relation size was 18,243,584 bytes (about 17.4 MiB), not the full physical database size.

The current development database was backed up and the dump was restored into a separate test database before replacement:

- Backup: `.local/backups/sitelog_dev_pre_copy_20261110T142314Z.dump` — **946,484 bytes**.
- Test restore: `sitelog_dev_backupcheck_20261110T142314Z` — **146 tables, 25,036 rows**, matching the original database by per-table counts.
- The existing development database was preserved as `sitelog_dev_before_copy_20261110` — **146 tables, 25,036 rows**.
- The prior test-restore database and dump remain present.

### Schema comparison

The empty candidate was built from the current `sitelog_dev` schema. Production and development each had **146 tables and 2,123 columns**. Table/column names, data types, precision/scale, and nullability matched. The user accepted the following non-semantic differences:

- Physical column order differs in `boq_items`, `hire_statements`, and `progress_entries`.
- Default-expression text differs for `stock_balances.balance` and `stock_ledger.quantity_in` / `quantity_out` (`'0'::numeric` in production versus `0` in development); types and nullability match.

No columns were copied by position. The import used explicit column names.

## Copy method and count verification

A schema-only candidate was created with **146 tables, 2,123 columns, and 0 rows**. Production was copied using read-only keyset pages ordered by the table's primary key: `id` for 145 tables and `key` for `_migration_markers`. Both the cursor predicate and `ORDER BY` use the qualified source-table key; each page was inserted into the candidate by explicit column name. The final candidate contained **30,564 rows** across 146 tables, with no keyset anomalies.

A preliminary staging copy was discarded after validation caught an ordering issue; the final candidate was rebuilt and recopied with source-qualified primary-key ordering. The final per-table check had **zero mismatches** against both the initial and final production counts. Production's final recount was **30,564 rows**, unchanged from the copy-start total; **no table changed count during the copy**.

| Table | Production start | Candidate before overlays | Production end |
|---|---:|---:|---:|
| _migration_markers | 2 | 2 | 2 |
| activity_personnel | 7 | 7 | 7 |
| admin_notifications | 569 | 569 | 569 |
| app_settings | 41 | 41 | 41 |
| attachment_links | 37 | 37 | 37 |
| attachments | 69 | 69 | 69 |
| audit_logs | 3838 | 3838 | 3838 |
| bitumen_dip_readings | 44 | 44 | 44 |
| bitumen_heating_sessions | 18 | 18 | 18 |
| boq_categories | 4 | 4 | 4 |
| boq_item_equipment | 116 | 116 | 116 |
| boq_item_labour | 108 | 108 | 108 |
| boq_item_materials | 103 | 103 | 103 |
| boq_items | 42 | 42 | 42 |
| boq_material_mappings | 0 | 0 | 0 |
| boq_mix_template_links | 4 | 4 | 4 |
| boq_program_settings | 3 | 3 | 3 |
| boq_projects | 3 | 3 | 3 |
| boq_revision_items | 3 | 3 | 3 |
| boq_revisions | 2 | 2 | 2 |
| concrete_estimates | 1 | 1 | 1 |
| concrete_estimates_v2 | 1 | 1 | 1 |
| consumption_audit_log | 99 | 99 | 99 |
| cut_fill_consumptions | 0 | 0 | 0 |
| cut_fill_opening_balances | 1 | 1 | 1 |
| diesel_requirement_items | 209 | 209 | 209 |
| diesel_requirements | 86 | 86 | 86 |
| dpr_draft_stoppages | 0 | 0 | 0 |
| dpr_structure_items | 0 | 0 | 0 |
| dpr_versions | 200 | 200 | 200 |
| dprs | 359 | 359 | 359 |
| earthwork_arrangement_programme_allocations | 6 | 6 | 6 |
| earthwork_arrangements | 3 | 3 | 3 |
| earthwork_baselines | 0 | 0 | 0 |
| earthwork_forecasts | 0 | 0 | 0 |
| edit_permission_requests | 8 | 8 | 8 |
| equipment_activity_allocations | 0 | 0 | 0 |
| equipment_activity_segment_boq_items | 165 | 165 | 165 |
| equipment_activity_segments | 150 | 150 | 150 |
| equipment_logs | 803 | 803 | 803 |
| equipment_maintenance_logs | 2 | 2 | 2 |
| equipment_master | 58 | 58 | 58 |
| equipment_usage | 265 | 265 | 265 |
| generator_logs | 15 | 15 | 15 |
| hire_statement_exceptions | 1 | 1 | 1 |
| hire_statements | 11 | 11 | 11 |
| internal_requisition_items | 8 | 8 | 8 |
| internal_requisitions | 8 | 8 | 8 |
| irn_audit_logs | 22 | 22 | 22 |
| labour_log_workers | 0 | 0 | 0 |
| labour_logs | 177 | 177 | 177 |
| ldo_dip_readings | 23 | 23 | 23 |
| ldo_flow_readings | 84 | 84 | 84 |
| ldo_logs | 0 | 0 | 0 |
| maintenance_parts_used | 0 | 0 | 0 |
| material_issues | 19 | 19 | 19 |
| material_logs | 101 | 101 | 101 |
| material_opening_stocks | 9 | 9 | 9 |
| material_receipts | 196 | 196 | 196 |
| material_requirement_allocations | 0 | 0 | 0 |
| material_requirements | 0 | 0 | 0 |
| material_returns | 2 | 2 | 2 |
| material_uom_conversions | 2 | 2 | 2 |
| mix_estimates | 16 | 16 | 16 |
| mix_template_components | 32 | 32 | 32 |
| mix_templates | 9 | 9 | 9 |
| mix_types | 8 | 8 | 8 |
| parties | 10 | 10 | 10 |
| pending_plant_receipts | 3 | 3 | 3 |
| personnel | 8 | 8 | 8 |
| pi_item_transactions | 10 | 10 | 10 |
| planning_equipment_types | 22 | 22 | 22 |
| planning_labour_types | 13 | 13 | 13 |
| plant_heating_session_versions | 52 | 52 | 52 |
| plant_materials | 19 | 19 | 19 |
| plant_production | 0 | 0 | 0 |
| plant_reports | 0 | 0 | 0 |
| plant_settings | 1 | 1 | 1 |
| plant_shift_log_idle | 3 | 3 | 3 |
| plant_shift_log_manpower | 15 | 15 | 15 |
| plant_shift_log_manpower_alias_activity | 0 | 0 | 0 |
| plant_shift_log_manpower_custom_aliases | 0 | 0 | 0 |
| plant_shift_log_manpower_dismissed_dups | 0 | 0 | 0 |
| plant_shift_log_manpower_dup_activity | 0 | 0 | 0 |
| plant_shift_log_manpower_relabel_batches | 0 | 0 | 0 |
| plant_shift_log_manpower_relabel_snapshots | 0 | 0 | 0 |
| plant_shift_log_versions | 59 | 59 | 59 |
| plant_shift_logs | 15 | 15 | 15 |
| plant_versions | 0 | 0 | 0 |
| price_scenarios | 6 | 6 | 6 |
| programme_bar_outcome_events | 17 | 17 | 17 |
| progress_entries | 475 | 475 | 475 |
| project_scope_segments | 11 | 11 | 11 |
| purchase_indent_item_history | 2 | 2 | 2 |
| purchase_indent_items | 9 | 9 | 9 |
| purchase_indents | 9 | 9 | 9 |
| purchase_orders | 2 | 2 | 2 |
| push_subscriptions | 5 | 5 | 5 |
| record_unlock_log | 8 | 8 | 8 |
| rmc_batch_records | 0 | 0 | 0 |
| rmc_cube_tests | 0 | 0 | 0 |
| rmc_mix_designs | 0 | 0 | 0 |
| rmc_raw_material_receipts | 0 | 0 | 0 |
| road_geometry_profiles | 2 | 2 | 2 |
| role_ticks | 409 | 409 | 409 |
| roles | 17 | 17 | 17 |
| service_completions | 0 | 0 | 0 |
| site_material_trips | 735 | 735 | 735 |
| site_purchases | 24 | 24 | 24 |
| site_requirements | 15 | 15 | 15 |
| sites | 11 | 11 | 11 |
| snl_boq_mappings | 38 | 38 | 38 |
| snl_composite_components | 2 | 2 | 2 |
| snl_import_log | 1 | 1 | 1 |
| snl_item_equipment | 3518 | 3518 | 3518 |
| snl_item_labour | 5448 | 5448 | 5448 |
| snl_item_materials | 4357 | 4357 | 4357 |
| snl_item_productivity | 1494 | 1494 | 1494 |
| snl_items | 1464 | 1464 | 1464 |
| snl_mix_override_materials | 0 | 0 | 0 |
| snl_mix_overrides | 0 | 0 | 0 |
| snl_remembered_links | 9 | 9 | 9 |
| snl_sources | 5 | 5 | 5 |
| stock_balances | 30 | 30 | 30 |
| stock_ledger | 848 | 848 | 848 |
| stock_reconciliation_items | 15 | 15 | 15 |
| stock_reconciliation_sessions | 3 | 3 | 3 |
| store_grn_items | 1 | 1 | 1 |
| store_grns | 1 | 1 | 1 |
| store_issue_items | 0 | 0 | 0 |
| store_issues | 0 | 0 | 0 |
| store_items | 3 | 3 | 3 |
| truck_dispatches | 65 | 65 | 65 |
| user_devices | 67 | 67 | 67 |
| user_permissions | 546 | 546 | 546 |
| user_roles | 8 | 8 | 8 |
| user_sessions | 1474 | 1474 | 1474 |
| user_site_access | 7 | 7 | 7 |
| user_tick_changes | 308 | 308 | 308 |
| users | 6 | 6 | 6 |
| vendor_aliases | 15 | 15 | 15 |
| vendor_bill_items | 411 | 411 | 411 |
| vendor_bills | 58 | 58 | 58 |
| vendor_rate_cards | 102 | 102 | 102 |
| vendors | 14 | 14 | 14 |
| work_program_bars | 87 | 87 | 87 |

## Approved candidate overlays and promotion

Before promotion, the candidate's serial sequences were reset (**145 sequences**). The approved overlays removed only:

- `user_sessions`: **1,474** rows deleted; final candidate count **0**.
- `push_subscriptions`: **5** rows deleted; final candidate count **0**.

The candidate was promoted to `sitelog_dev`; the previous database was renamed and retained. The active database now has **146 tables and 29,085 rows** (30,564 minus the 1,474 sessions and 5 push subscriptions). After overlays, all other table counts still match the production snapshot; only the two named overlay tables differ.

## Startup and safety checks

The `Start application` workflow is configured to run the TypeScript server directly with `NODE_ENV=test` and `DATABASE_URL` set from `DEV_DATABASE_URL`. It unsets the VAPID public/private keys, Object Storage private/public paths, and default Object Storage bucket. Running `npm run dev` was avoided because its script forces `NODE_ENV=development`.

Verified:

- Workflow log printed `NODE_ENV=test`.
- Read-only startup readiness reported `ready: true`, `checkedColumns: 2123`.
- Push log reported VAPID keys not configured; push is disabled.
- The application served on port 5000; `GET /login` returned HTTP 200.
- The active `sitelog_dev` has 0 session rows and 0 push subscriptions after startup.
- Full post-promotion per-table counts matched expectations; the prior database and backup restore remain available.

The `test` workflow was not run as part of the copy; it remains in its prior failed state. No app code or database schema was changed. The runtime configuration change is the `Start application` workflow command required to launch in the requested test environment; this report is the other tracked change.

## Production safety

All production operations in this batch were read-only `SELECT` queries. No production database or replica was modified, no user/session/permission data was written there, and the app was not published.

## Per-table verification summary

Tables checked: 146. Production at copy start: 30564. Candidate before overlays: 30564. Production at final recount: 30564. Changed production tables by count: 0.
Candidate count mismatches: 0.