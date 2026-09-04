---
name: BOQ Import Continuations
description: Rules for reconstructing logical BOQ items from multi-row Excel descriptions.
---

Rule: A blank item-code row continues the current logical BOQ item; it is not a child item or a new BOQ item. Reconstruct logical items before mapping or classification, allowing later continuation rows to supply missing UOM, quantity, rate, or SNL code.

**Why:** Many BOQ spreadsheets wrap one description across physical rows and place UOM/quantity only on the last row. Treating each row separately creates unusable fragments and loses the complete item.

**How to apply:** An explicit item code or Bill/Schedule marker starts a new item/context. Preserve the first source row, first code, Bill/category, and order; merge continuation descriptions in order. Totals and echoed headers terminate/flush the current item and are skipped.