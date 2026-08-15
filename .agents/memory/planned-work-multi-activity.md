---
name: Planned Work multi-activity shape
description: Tomorrow's Plan plannedWork dual shape (top-level mirror + activities array) — 06N
---

# Planned Work multi-activity (06N)

`site_requirements.planned_work` stays a single JSONB object. Multi-activity plans add an `activities: [...]` array of the same per-activity shape; **activity #1 is always mirrored onto the top-level fields**.

**Rule:** `shared/plannedWork.ts` is the ONLY reader/writer of this dual shape — `getPlannedActivities()`, `buildPlannedWork()`, `isMeaningfulActivity()`, `applyCarryToPlannedWork()`. Never read `plannedWork.activities` directly anywhere else (architect flagged planOutcome doing so; it now calls `applyCarryToPlannedWork`).

**Why:** every pre-06N consumer (06J outcome/carry comparison, fulfilment context, arrangement warning, routes reading `boqItemId`/`programmeBarId`) dereferences object properties. Mirroring keeps them all unchanged; only forms/views iterate activities.

**How to apply:**
- Single activity saves as a plain legacy-shaped object (no nested `activities`).
- Carry-forward must keep `activities[0]` in lockstep with the top-level carry qty/note, or views (which read the array) show stale qty.
- Legacy free-text `chainage` ("5+200 to 5+800") must never enter numeric chainage inputs or `parseFloat` — the entry form keeps it in a separate `legacyChainage` field and re-emits it verbatim when no numeric endpoints are entered. Reopen-and-save of an old plan must not alter chainage.
- 06F programmeBarId rule applies to activity #1 only (?barId= / pre-existing value); extra rows keep only a bar id they were loaded with.
- Only activity #1's auto-calculated qty seeds empty material qtys.
- Entry form: per-activity logic (BOQ profile, exec-state badge, chainage→L, L/W/T→qty) lives in `PlannedActivityCard`; arrangement queries stay plan-level, cards report `arrangement_required` up for the submit banner.
