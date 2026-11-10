# DATA-COPY-01 — Production data copy preflight

**Date:** 2026-11-10
**Status:** Stopped at the schema gate. No production rows were copied and no candidate database was created.

## Part A — production access and inventory

The production read path available to the Agent is Replit's `executeSql` callback with `environment: "production"`. It queries a managed read-only replica and rejects writes. It can return catalog information and query results, but it does not expose the full schema-and-data dump needed for a consistent database restore. The shell's development database targets are not production. No production dump or read-only connection suitable for `pg_dump` was available.

The following inventory was collected in the earlier Part A read-only count query. It covers 146 public tables and 30,564 rows. The combined public table-and-index relation size was 18,243,584 bytes (about 17.4 MiB); this is not the entire database's physical size.

```text
_migration_markers=2, activity_personnel=7, admin_notifications=569, app_settings=41, attachment_links=37, attachments=69, audit_logs=3838, bitumen_dip_readings=44, bitumen_heating_sessions=18, boq_categories=4, boq_item_equipment=116, boq_item_labour=108, boq_item_materials=103
boq_material_mappings=0, boq_mix_template_links=4, boq_program_settings=3, boq_projects=3, boq_revision_items=3, boq_revisions=2, concrete_estimates=1, concrete_estimates_v2=1, consumption_audit_log=99, cut_fill_consumptions=0, cut_fill_opening_balances=1, diesel_requirement_items=209, diesel_requirements=86, dpr_draft_stoppages=0
dpr_structure_items=0, dpr_versions=200, dprs=359, earthwork_arrangement_programme_allocations=6, earthwork_arrangements=3, earthwork_baselines=0, earthwork_forecasts=0, edit_permission_requests=8, equipment_activity_allocations=0, equipment_activity_segment_boq_items=165, equipment_activity_segments=150, equipment_logs=803, equipment_maintenance_logs=2, equipment_master=58
equipment_usage=265, generator_logs=15, hire_statement_exceptions=1, hire_statements=11, internal_requisition_items=8, internal_requisitions=8, irn_audit_logs=22, labour_log_workers=0, labour_logs=177, ldo_dip_readings=23, ldo_flow_readings=84, ldo_logs=0, maintenance_parts_used=0, material_issues=19
material_logs=101, material_opening_stocks=9, material_receipts=196, material_requirement_allocations=0, material_requirements=0, material_returns=2, material_uom_conversions=2, mix_estimates=16, mix_template_components=32, mix_templates=9, mix_types=8, parties=10, pending_plant_receipts=3, personnel=8
pi_item_transactions=10, planning_equipment_types=22, planning_labour_types=13, plant_heating_session_versions=52, plant_materials=19, plant_production=0, plant_reports=0, plant_settings=1, plant_shift_log_idle=3, plant_shift_log_manpower=15, plant_shift_log_manpower_alias_activity=0, plant_shift_log_manpower_custom_aliases=0, plant_shift_log_manpower_dismissed_dups=0, plant_shift_log_manpower_dup_activity=0
plant_shift_log_manpower_relabel_batches=0, plant_shift_log_manpower_relabel_snapshots=0, plant_shift_log_versions=59, plant_shift_logs=15, plant_versions=0, price_scenarios=6, programme_bar_outcome_events=17, progress_entries=475, project_scope_segments=11, purchase_indent_item_history=2, purchase_indent_items=9, purchase_indents=9, purchase_orders=2, push_subscriptions=5
record_unlock_log=8, rmc_batch_records=0, rmc_cube_tests=0, rmc_mix_designs=0, rmc_raw_material_receipts=0, road_geometry_profiles=2, role_ticks=409, roles=17, service_completions=0, site_material_trips=735, site_purchases=24, site_requirements=15, sites=11, snl_boq_mappings=38
snl_composite_components=2, snl_import_log=1, snl_item_equipment=3518, snl_item_labour=5448, snl_item_materials=4357, snl_item_productivity=1494, snl_items=1464, snl_mix_override_materials=0, snl_mix_overrides=0, snl_remembered_links=9, snl_sources=5, stock_balances=30, stock_ledger=848, stock_reconciliation_items=15
stock_reconciliation_sessions=3, store_grn_items=1, store_grns=1, store_issue_items=0, store_issues=0, store_items=3, truck_dispatches=65, user_devices=67, user_permissions=546, user_roles=8, user_sessions=1474, user_site_access=7, user_tick_changes=308, users=6
vendor_aliases=15, vendor_bill_items=411, vendor_bills=58, vendor_rate_cards=102, vendors=14, work_program_bars=87
```

At that preflight, `sitelog_dev` was 26 MB with 146 public tables. The workspace had 251 GiB free. The existing `.local/backups/` folder is Git-ignored; its older July snapshots were not used as a current backup.

## Outbound services and startup controls

- **Web Push:** The application initializes push when both VAPID keys are present. The startup stale-GRN reminder checks after 30 seconds and then hourly. Before a future candidate start, remove candidate `push_subscriptions` and run with `VAPID_PUBLIC_KEY=` and `VAPID_PRIVATE_KEY=`; verify the log says push is disabled.
- **WhatsApp:** Site reports and receipt actions open a WhatsApp link only after a user click; there is no automatic WhatsApp sender. Do not click share actions during checks.
- **SMS/email:** No server-side sender or provider dependency was found.
- **Object Storage:** Attachment upload/read routes use Replit Object Storage. Run with `PRIVATE_OBJECT_DIR=` and `PUBLIC_OBJECT_SEARCH_PATHS=` to prevent storage access; copied attachment references remain in the database, but files will not open.
- **Tally:** XML is generated as a local download and does not connect to Tally. Do not run the export during checks.
- **Startup database writes:** `verifyStartupReadiness` is SELECT-only. Development startup also queues SNL review suggestions, which would change the copy. To avoid that without code changes, use `NODE_ENV=test` and set `DATABASE_URL` to the development database; this skips the development-only suggestion path while keeping Vite startup. The scheduled reminder can still query stale GRNs, but disabled push transport and an empty candidate subscription table prevent delivery.
- Old seed/repair helper functions exist in `server/routes.ts`, but are not invoked by the active startup path. No application code or schema was changed in this preflight.

## Copy attempt — backup and schema gate

The application workflow was stopped before the backup and remains stopped.

The current `sitelog_dev` backup and test restore succeeded:

- Backup: `.local/backups/sitelog_dev_pre_copy_20261110T142314Z.dump` — **946,484 bytes**
- Test restore database: `sitelog_dev_backupcheck_20261110T142314Z`
- Source and restored database: **146 public tables, 25,036 rows each; zero per-table count differences**
- The dump and test-restore database are retained. The original `sitelog_dev` was not replaced or modified.

The production and `sitelog_dev` information-schema comparison found:

- **Tables:** 146 on each side; table names match.
- **Columns:** 2,123 on each side; column names match.
- **Physical column order differs** in:
  - `boq_items`: `shoulder_layer_class` is production position 29 / development position 30; `bulk_material_classification` is production 30 / development 29.
  - `hire_statements`: `revision` is production position 28 / development position 20; `vendor_bill_id`, `calculation_snapshot`, `reviewed_by`, `reviewed_at`, `approved_by`, `approved_at`, `billed_at`, and `created_at` are each one position earlier in production than in development (production 20–27; development 21–28).
  - `progress_entries`: `material_outcome` and `reusable_qty` are production positions 34 and 35 / development 32 and 33; `is_incidental` and `incidental_description` are production 32 and 33 / development 34 and 35.
- **Default expression text differs** for `stock_balances.balance`, `stock_ledger.quantity_in`, and `stock_ledger.quantity_out`: production reports `'0'::numeric`, development reports `0`. Their types, precision/scale, and nullability match (`numeric(20,6)`; `balance` is not nullable, the ledger columns are nullable).
- No missing table or column names or data-type/nullability/precision differences were found.

Because the requested gate says to stop if any table or column differs, I stopped here rather than treating the physical-order/default-expression differences as acceptable. **No candidate database was created; no production rows were selected or copied; no sequence reset, overlays, rename, app start on a candidate, or final production recount occurred.** The requested production data checks and end-of-copy recount are therefore not applicable to this stopped attempt.

## Next execution steps (not performed)

After the schema differences are reconciled and the strict comparison passes, the safe sequence is:

1. Obtain a production read-only dump path that supports a consistent full schema/data export; the current replica query callback cannot provide it.
2. Restore the export to a new candidate, compare every table's counts, and stop on any mismatch.
3. Apply only the documented candidate overlays (clear copied push subscriptions and sessions); disable push and Object Storage in the process environment.
4. Rename current `sitelog_dev` to a dated rollback database, then promote the verified candidate; retain the old database.
5. Start in the no-suggestion test mode, verify startup readiness and post-start counts, perform approved checks with temporary development users, and re-count production to identify any changes during the copy.

No production write, publish, or source-code change was performed.
