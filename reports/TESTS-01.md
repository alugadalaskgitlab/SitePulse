# TESTS-01 — Soil tests

## What changed

Added the soil test module for FDD, Proctor, CBR, moisture, Atterberg and other quality tests. It includes draft and submit flows, staff and file attachments, retests and correction history, calibration and benchmark setup, quality specifications, the layer register and frequency check. Submitted results also appear in the DPR view and print.

The Tests permission is a separate permission key and is off for saved roles by default; Owners retain access. The BOQ project can store the client and consultant names used on test printouts.

## Schema and development startup

Migrations `0056_lab_tests_soil.sql` and `0057_lab_test_layer_label.sql` were applied to both development databases:

- `sitelog_dev`
- Publish-facing development database `heliumdb`

The first migration adds nullable `client_name` and `consultant_name` to `boq_projects`, and creates `lab_tests`, `lab_test_attachments`, `lab_calibrations`, `material_benchmarks` and `boq_item_quality_specs`. The second adds nullable `lab_tests.layer`. No production database was queried or changed.

After restarting the app, startup readiness passed: `ready: true`, 2,261 columns checked. The app served on port 5000.

## Verification

- Focused checks: **106 tests passed across 8 files**, covering formulas and results, route save/restore/submit and correction history, the DPR tests block, permissions and the lab-test layer field.
- `npm run build`: passed. Vite printed its existing large-chunk warning.
- `npm run check`: exits with 492 project-wide TypeScript diagnostics; none refer to the changed lab-test UI, routes, calculations or permission review.
- Full `npm test`: **463 files passed, 2 skipped, 15 failed**; **5,803 tests passed, 3 skipped, 59 failed**. The lab-test and focused permission tests passed. Failing files:

| Test file | Failed tests |
| --- | ---: |
| `tests/purchase-indent-pi01.test.ts` | 1 |
| `tests/materialReceiptReversal06mD.test.ts` | 1 |
| `tests/dpr314Correction.test.ts` | 10 |
| `tests/dieselStockGuard06mB.test.ts` | 1 |
| `tests/dpr20B4MaterialsClarity.test.tsx` | 4 |
| `tests/programmeBarLinkage030A.test.ts` | 8 |
| `tests/guidedDprReliability.test.ts` | 14 |
| `tests/dpr07VersionValidation.test.ts` | 3 |
| `tests/dpr04Fix2.test.ts` | 5 |
| `tests/arrangementProcurementCorrection.test.ts` | 1 |
| `tests/equipmentConsistencyRuntime.test.ts` | 1 |
| `tests/dprBatch05.test.ts` | 1 |
| `tests/programmeScopeAlignmentApply.test.ts` | 4 |
| `tests/unscheduledReportCredit.test.ts` | 3 |
| `tests/dpr13FrontendTokens.test.ts` | 2 |

The broad schema assertion in `multiLayerLift06p.test.ts` was narrowed so it still checks that DPR structure rows have no layer field while allowing the separately requested lab-test layer label. The permission review also now safely handles an older stored permission key with no action-metadata entry.

## Phone-width screenshots

All screenshots are 402 × 874 px and use only the temporary development fixture:

1. Add FDD test and benchmark box — [open](TESTS-01/add-test-fdd-benchmark.jpg)
2. Proctor graph — [open](TESTS-01/proctor-graph.jpg)
3. CBR graph — [open](TESTS-01/cbr-graph.jpg)
4. Failed test and retest — [open](TESTS-01/test-list-failed-retest.jpg)
5. Layer register — [open](TESTS-01/layer-register.jpg)
6. Frequency check — [open](TESTS-01/frequency-check.jpg)
7. Tests on the DPR report — [open](TESTS-01/dpr-tests-block.jpg)
8. FDD print preview — [open](TESTS-01/fdd-print-view.jpg)

The temporary development Owner account, its session/device, the synthetic project and DPR, and all associated test fixtures were deleted after verification. A final query confirmed zero remaining fixture users, sessions, devices, project, tests, benchmarks or calibration rows. No production data or real project records were changed. Nothing was published.
