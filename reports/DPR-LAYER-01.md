# DPR-LAYER-01

## What changed

- Added the Owner-only **Assign layers** tool from the Earthwork page. The Owner can select a project, a group of BOQ items, layer thickness and layer count, preview submitted lines and drafts, review flags, and override proposed layers.
- Apply requires a reason and an on-page confirmation. It updates only `progress_entries.layer_no` and, when selected, `progress_entries.uom` to the linked BOQ item's exact unit. Each changed line gets an audit entry with before/after values and the reason.
- Owner direct DPR corrections can now save layer and unit after review. A corrected unit must exactly match the linked BOQ item's unit in the same project. Non-Owner corrections still require approval.
- No schema or data changes were made.

## Read-only check — project 1, Takkadpally

The check used `sitelog_dev` (`current_database() = sitelog_dev`) with a read-only database connection. No Apply was run.

| Group | Submitted lines | Drafts shown, not counted | Proposed layers |
|---|---:|---:|---|
| Embankment, items 4 + 5; 250 mm × 3 | 30 | 16 | Layer 1: 15; layer 2: 8; layer 3: 6; layer 4: 1 |
| Subgrade, item 6; 250 mm × 2 | 10 | 0 | Layer 1: 8; layer 2: 2 |

- One embankment line exceeds the configured count: DPR 314, line 453, proposed layer 4.
- Three lines have a unit flag: DPR 320 lines 461, 462 and 463 are SQM while their BOQ item unit is Cum. The preview offers to correct each to its linked item's unit.
- One line is outside the 3.8 km corridor: DPR 241, line 280, chainage 3.140–4.00.
- Quantity mismatches: none.

## Tests and build

- Focused tests: 44 passed across the layer assignment, DPR correction, and permission-inventory test files.
- Full suite: 5,801 passed, 6 failed, 3 skipped across 473 files. The six failures are the known failures in `arrangementProcurementCorrection.test.ts` (1), `materialReceiptReversal06mD.test.ts` (1), `purchase-indent-pi01.test.ts` (1), and `unscheduledReportCredit.test.ts` (3). No layer-assignment, DPR-correction, or permission-inventory test failed.
- `npm run build`: passed.
- The development app restarted with read-only startup readiness successful. The preview requires authentication; no development Owner account was used or created, so the signed-in Owner screen was not visually verified.
- No production database was queried or changed. No development data was changed. No publish was performed.
