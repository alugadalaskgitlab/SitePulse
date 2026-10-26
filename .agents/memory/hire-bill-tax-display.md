---
name: Hire-bill tax display
description: Scope rules for correcting saved equipment-hire bill tax presentation.
---

# Rule
For draft equipment-hire bill detail, calculate GST/TDS from gross hire minus breakdown and derive the visible NET PAYABLE from the signed rows shown on screen. Do not rely on the saved bill-level net or a tax delta against statement snapshots: snapshots may already contain corrected tax while the saved bill net is stale. Preserve approved or frozen amounts and leave shared report and export snapshot paths unchanged unless the user explicitly expands scope.

For monthly hire, dates classified as Activity Not Recorded are informational; the hire amount is based on calendar-date overlap. Keep the bill-detail note low-key and do not change shared report/export wording.

**Why:** A draft bill showed corrected statement TDS but retained an older saved net, so the snapshot tax delta was zero despite a mismatch in displayed rows. The user also limited the work to screen presentation and specified that missing monthly activity dates do not affect the amount.

**How to apply:** Use screen-only presentation logic; do not write corrected totals to storage or change shared report/export builders. Cover draft, no-advance, approved/frozen, and monthly missing-activity cases in tests.
