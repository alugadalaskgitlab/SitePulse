---
name: DPR equipment canonicalization
description: Durable rules for keeping DPR equipment logs and standalone equipment usage consistent without duplicate operational effects.
---

DPR equipment rows are input/snapshot records, while submitted operations have one canonical equipment-usage record. All entry surfaces must use the same meter-type calculation: valid meter delta first, then the permitted fallback; hour meters persist hours and odometers/trips persist kilometres.

Actual fuel consumption is a physical-tank fact: opening tank plus issued fuel minus closing tank. It stays unavailable unless all three inputs are present; expected fuel and issued fuel must never be displayed as actual consumption. Default the usage start time only when a user explicitly creates a row, never during hydration, restoration, or editing of history.

**Why:** Independent formulas caused persisted DPR values, standalone usage, and historical reports to disagree. Copies of the same physical event could also repost Diesel or create another operational record.

**How to apply:** Recompute editable writes on the server, but render historical reports from persisted snapshot values. A manager/admin DPR clone represents the same physical event: preserve or establish one canonical usage link and never post the Diesel effect again. Physical tank continuity may use only confirmed readings within the caller's site scope and must not overwrite an entered opening value. Keep creation-time defaults behind explicit new-row helpers so reused hydration factories stay deterministic.