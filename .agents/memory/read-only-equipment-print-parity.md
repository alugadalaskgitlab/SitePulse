---
name: Read-only equipment print parity
description: Equipment consolidation must preserve card-only audit detail and verify actual paginated PDF output.
---

Read-only equipment consolidation must retain the old cards' audit details in the existing table cells; preserving column headings alone does not establish parity.

**Why:** The approved consolidation retained the table's structure and Send onward controls, but the former cards exposed additional tank, work-allocation and attachment evidence.

**How to apply:** Compare rendered values and interactive attachment behavior, not just source labels. Do not equate issued-minus-expected with consumed-minus-expected or replace historical saved quantities with recalculated values.

Verify actual generated PDFs, including multi-page machine rows, rather than only checking print-mode DOM visibility.

**Why:** Print DOM checks passed while the actual PDF clipped the right-hand audit columns. Removing the separately printable cards exposed the loss.

**How to apply:** Check every printable column and long remarks/attachment names in extracted PDF text and rendered pages. Scope wrapping/overflow/page-fragmentation rules to this table; do not change unrelated print layouts or expose lifecycle actions in print.