---
name: Material receipt date semantics
description: Durable distinction between receipt entry timestamps and purchase chronology.
---

Material Receipt date/time are entry-audit facts. Invoice date is the purchase date and therefore drives receipt grouping/filtering, stock-ledger chronology, linked fuel-flow dates, and transaction reports.

**Why:** A receipt can be keyed days after the supplier purchase. Using the entry date as the stock date misstates day-level inventory and can leave running ledger balances in the wrong sequence.

**How to apply:** Default linked receipts from their purchase source and standalone receipts from today, but keep invoice date editable. New writes must store an effective non-blank invoice date; historical nulls use entry date only as a read-time fallback and must not be bulk backfilled. Physical stock counts retain their independent count date.