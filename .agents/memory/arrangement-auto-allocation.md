---
name: Arrangement auto-allocation
description: How arrangement→programme-bar allocations stay in sync, and the locking/reconciliation rules any new write path must follow
---

- Approved arrangements are auto-linked to overlapping programme stretches by a pure planner (shared) wrapped in a server transaction; it runs on every transition into an operational status, on scope/quantity/split/chainage changes, on revision approval and apply-now, plus a startup backfill for arrangements with no links yet.
- **Lock-order rule:** every allocation write path must lock the arrangement row first, then the bar rows (bars in id order, FOR UPDATE). **Why:** two arrangements sharing a bar can otherwise both read the same remaining capacity and over-book it (caught in review).
- **Auto vs manual rows:** allocation rows carry a source marker. Auto rows may be moved/removed/shrunk when the arrangement's scope is revised; manual rows are never touched by reconciliation, even when stale.
- Planner's distributable total = min(arrangement quantity, sum of per-item budgets) — malformed splits must never over-distribute.
- Arrangements are created/edited only in the Execution Arrangements register page; demand screens show a compact summary + link instead of inline editors.
- Planned-work arrangement warnings on the site requirement form and its review list are informational only — they must NEVER gate submission.
