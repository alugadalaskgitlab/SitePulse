---
name: MoRTH SDB workbook parsing
description: Context-sensitive resource sections and review safeguards for the MoRTH SDB workbook.
---

**Rule:** Parse Labour, Machinery, and Material sections from their headings rather than fixed column order, while retaining chapter, item, and case context. Numeric `a x b` quantities are products; “or” equipment is an alternative note on the primary row; tonne.km remains carrying-by-lead and never enters equipment-hour demand. Empty grading children inherit missing resource categories from their method parent.

**Why:** The workbook repeats codes and labels across cases, and section order can vary. Treating alternatives or transport coefficients as machine hours inflates equipment demand, while ignoring grading inheritance leaves valid work items incomplete.

**How to apply:** Keep WBM 4.9-A/B, 12.8 C–H Cases I/II, 4.12, 3.16, and grading children in 4.1, 5.6, and 5.8 as parser regressions. Verify equipment, labour, and material rows, then review the development-only diff before applying a source reload. A large diff against a differently versioned existing book requires review, not automatic application.
