---
name: MoRTH SDB workbook parsing
description: Context-sensitive resource sections and review safeguards for the MoRTH SDB workbook.
---

**Rule:** Parse Labour, Machinery, and Material sections from their headings rather than fixed column order, while retaining chapter, item, and case context. Numeric `a x b` quantities are products; “or” equipment is an alternative note on the primary row; tonne.km remains carrying-by-lead and never enters equipment-hour demand. Empty grading children inherit missing resource categories from their method parent.

**Why:** The workbook repeats codes and labels across cases, and section order can vary. Treating alternatives or transport coefficients as machine hours inflates equipment demand, while ignoring grading inheritance leaves valid work items incomplete.

**How to apply:** Keep WBM 4.9-A/B, 12.8 C–H Cases I/II, 4.12, 3.16, and grading children in 4.1, 5.6, and 5.8 as parser regressions. Verify equipment, labour, and material rows, then review the development-only diff before applying a source reload. A large diff against a differently versioned existing book requires review, not automatic application.

**Rule:** Keep uppercase Roman sections distinct from lowercase Roman sub-cases (for example, `I` is not `(i)`) when building nested workbook item paths. A sub-case's unit and output should come from its nearest heading with those values.

**Why:** The same visible Roman numeral can represent different levels in the workbook. Case-folding it flattens the path, loses the leaf's identity, and can prevent reliable validation or matching.

**How to apply:** Preserve the original case of chapter markers when normalizing codes; regression-test multi-level paths, inherited unit/output, and nonzero resource rows before reload.
