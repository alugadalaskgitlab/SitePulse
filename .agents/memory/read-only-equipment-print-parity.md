---
name: Read-only equipment print parity
description: Management-page scope, historical quantity display, actual PDF checks, and safe development verification.
---

Site Report policy is superseded by DPR-PAGE-01: the user says "THE SITE REPORT IS A MANAGEMENT PAGE, NOT AN AUDIT DUMP." DPR-VIEW-01 is not approved and must not be published as it stands. Revise it in place, preserving its useful helper, compact-row concept and print support; remove Site Report per-row audit expansions, technical legend and three-decimal totals. Audit data and other pages must remain intact.

**Why:** The user explicitly replaced the earlier layout and print requirements.

**How to apply:** Follow the DPR-PAGE-01 instruction over older audit-parity rules for Site Report. Require signed-in development verification, not fixtures alone. Do not publish automatically. The historical notes below explain earlier work, not current Site Report acceptance criteria.

Historically, read-only equipment consolidation retained the old cards' audit details in table cells; preserving column headings alone did not establish parity.

**Why:** The approved consolidation retained the table's structure and Send onward controls, but the former cards exposed additional tank, work-allocation and attachment evidence.

**How to apply:** Compare rendered values and interactive attachment behavior, not just source labels. Do not equate issued-minus-expected with consumed-minus-expected or replace historical saved quantities with recalculated values.

Verify actual generated PDFs, including multi-page machine rows, rather than only checking print-mode DOM visibility.

**Why:** Print DOM checks passed while the actual PDF clipped the right-hand audit columns. Removing the separately printable cards exposed the loss.

**How to apply:** Check every printable column and long remarks/attachment names in extracted PDF text and rendered pages. Scope wrapping/overflow/page-fragmentation rules to this table; do not change unrelated print layouts or expose lifecycle actions in print.

Read-only consumption deliberately falls back from an available canonical measurement to confirmed row-level tank consumption, then issued diesel per recorded usage. Vehicles display km/L; unusually better-than-norm consumption is an amber check, not a green reward.

**Why:** The user approved a useful row-level figure for site-restricted viewers without relaxing canonical access checks or changing operational calculations.

**How to apply:** Use existing historical runtime and fuel facts; never manufacture missing quantities. The older expandable-audit design is superseded for Site Report by DPR-PAGE-01.

For signed-in print checks, test the actual application shell and injected development banner, not just an isolated component.

**Why:** Global print rules hid the report's own header, while shell minimum heights and named-page transitions produced an extra PDF page despite a compact report. A screenshot of print media alone did not establish the page count.

**How to apply:** Render the generated PDF and check its header, page count, totals, and final remarks. Keep report-specific print overrides scoped so other pages retain their layout.

Persisted development test rows can trigger startup backfills even when the feature being tested is display-only.

**Why:** Plant Stock equipment fixtures were automatically posted to the Diesel ledger on application restart.

**How to apply:** Track every new test ID, clean up generated ledger references as well as source rows, restore their exact balance effect transactionally, and compare pre-existing business-row fingerprints. Revoke test sessions/devices and disable the isolated account after capture.