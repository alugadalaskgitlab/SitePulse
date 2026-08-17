---
name: Guided DPR Integrity Chain (06T)
description: Chainage→Length→Bar→Arrangement→Trips consistency rules; arrangement persistence + reconciliation patterns
---

**Rules established in 06T:**
- `earthworkArrangementId` on progress rows is a **historical fact**: persisted at resolution time via `ActivityReceiptStrip` props `persistedArrangementId`/`onArrangementResolved`; persisted id wins over live re-resolution. Callers clear it to null on deliberate BOQ-item or bar change (all three DPR screens) so it re-resolves; yesterday-copy never copies it.
- Bar reconciliation in `ProgrammeBarPicker`: in-session chip/dropdown picks are manual overrides (`manualPickRef`, exempt); DB-loaded/auto links are reconciled on chainage/side change via `autoMatchBar` — single match re-links silently, none/multiple clears the stale link with one amber message. Never leave a stale bar link standing.
- No-arrangement is **not** implicit HLC responsibility: PI lookup and "Supply responsibility" line render only when an arrangement or daily override resolved; otherwise ONE message ("configure in Work Programme" or "awaiting approval" when a covering arrangement exists in a pre-approval status). `APPLICABLE_ARRANGEMENT_STATUSES` deliberately excludes `submitted` — don't widen it; detect-and-message instead.
- `relevance:"none"` (e.g. reused_excavated) renders execution-only line **unconditionally** — never the receipt grid, even if stray trips exist.
- Material suggestion matching: `materialsLooselyMatch` (token overlap + soil/earth/murrum alias, stopword-guarded) applies ONLY to the SUGGESTED tier; LINKED stays strict ID equality. `materialHints` carries BOQ item name from callers.
- Guided draft equipment loss root cause: the payload filter `equipment.filter(e => e.machine)` dropped machine-less rows, then draft PATCH replace-semantics deleted them from DB. Drafts now keep any row with content (machine "" is fine — column is notNull, not non-empty); submits still require machine.
- Guided sends chainage-derived `length` in payload now (was `length: null`, causing NULL lengths in DB).

**Why:** prod DPR #281 had stale bar links + NULL arrangement/length; 24 soil trips never matched because "Soil" ≠ "Soil / Earth" ≠ "Embankment - Borrow earth" exact-equality; `submitted` arrangements silently invisible produced false PI warnings.
