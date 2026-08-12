---
name: Tomorrow's Requirement daily fulfilment (06F)
description: lineKey + fulfilment stored in site_requirements JSONB; no schema change; index-fallback traps
---

Daily "arranged through whom" for Tomorrow's Requirements lives inside the EXISTING
`allocationStatus` JSONB per-line entries on `site_requirements` — no new tables/columns.

Rules & traps:
- `shared/requirementFulfilment.ts` is the ONLY seam: `newLineKey`, `findAllocationEntry`
  (lineKey-first; a keyed entry is NEVER claimable by index by a different line; legacy
  unkeyed records keep pure index matching), `validateFulfilment`, `resolveRequirementArrangements`
  (exact persisted programmeBarId → reach overlap → item → HLC default), receipt suggestion.
- **Why:** requirement lines are arrays reordered by the Engineer; index-keyed allocations
  silently jump lines. lineKey is generated once client-side and never derived from position.
- Server PATCH /item-status re-validates identity against the requirement's OWN lines
  (rejects unknown lineKeys / out-of-range indexes, adopts the line's key for legacy callers)
  and validates arrangement compatibility (exists, operational status, covers plannedWork
  boqItemId) — client-supplied IDs are never trusted. Agency name is snapshotted from the
  arrangement row, not the client.
- Hard invariants: Engineer entry UI has NO fulfilment selectors; no arrangement = normal
  HLC default (never an error); other_agency requires agency name and arrangementId forced
  null; on_hold arrangements listed + flagged but never suggested; daily choice never writes
  to earthwork_arrangements / programme allocations / BOM; next-day receipt gets suggestion
  chips only (explicit apply; never auto-created).
- programmeBarId in plannedWork is persisted ONLY when genuinely known (?barId= creation
  path or already on the record) — never inferred from text/chainage.

**How to apply:** any future feature touching requirement line identity or daily allocation
must go through this seam; never re-introduce index-only matching or client-trusted arrangement IDs.
