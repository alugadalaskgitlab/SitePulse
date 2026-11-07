---
name: MoRTH SDB workbook parsing
description: Context-sensitive resource sections and review safeguards for the MoRTH SDB workbook.
---

**Rule:** Parse Labour, Machinery, and Material sections from their headings rather than fixed column order, while retaining chapter, item, and case context. Keep WBM 4.9-A/B and 12.8 C–H Cases I/II as parser regressions before any reload.

**Why:** The workbook repeats codes and labels across cases, and section order can vary; generic row matching can assign resources to the wrong item or omit child material rows.

**How to apply:** Verify parsed equipment, labour, and material rows for those blocks, then review the development-only diff before applying a source reload. A large diff against a differently versioned existing book requires review, not automatic application.
