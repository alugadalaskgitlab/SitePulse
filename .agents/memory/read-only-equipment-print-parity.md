---
name: Read-only equipment print parity
description: Equipment consolidation must preserve card-only audit detail and verify actual paginated PDF output.
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