---
name: DPR equipment canonicalization
description: Durable rules for keeping DPR equipment logs and standalone equipment usage consistent without duplicate operational effects.
---

DPR equipment rows are input/snapshot records, while submitted operations have one canonical equipment-usage record. All entry surfaces must use the same meter-type calculation: valid meter delta first, then the permitted fallback; hour meters persist hours and odometers/trips persist kilometres.

Actual fuel consumption is a physical-tank fact: opening tank plus issued fuel minus closing tank. It stays unavailable unless all three inputs are present; expected fuel and issued fuel must never be displayed as actual consumption. Default the usage start time only when a user explicitly creates a row, never during hydration, restoration, or editing of history.

**Why:** Independent formulas caused persisted DPR values, standalone usage, and historical reports to disagree. Copies of the same physical event could also repost Diesel or create another operational record.

**How to apply:** Recompute editable writes on the server, but render historical reports from persisted snapshot values. A manager/admin DPR clone represents the same physical event: preserve or establish one canonical usage link and never post the Diesel effect again. Physical tank continuity may use only confirmed readings within the caller's site scope and must not overwrite an entered opening value. Keep creation-time defaults behind explicit new-row helpers so reused hydration factories stay deterministic.

Independent section saves retain the draft-versus-submission effects boundary, including equipment stoppages. Do not use operational maintenance records, cancellation states, or unrelated JSON fields as hidden draft storage.

**Why:** The approved morning-entry workflow records evidence without posting operational effects. Maintenance and billing readers can observe maintenance rows even if a new, unrecognised status is used to label them as drafts.

**How to apply:** The user approved one normalized draft-stoppage staging table linked to the draft equipment row. Transfer its facts to normal maintenance/attachment records and remove staging within the same final-submission transaction; failure must roll back both. Existing submitted-DPR maintenance semantics remain unchanged. This is not blanket approval for other schema additions: surface any further gap before changing schema.