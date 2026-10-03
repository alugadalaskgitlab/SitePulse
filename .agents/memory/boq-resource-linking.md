---
name: Conservative DPR resource attribution
description: User's safety boundary for resource defaults and historical BOQ linking.
---

Treat ambiguous resource attribution as unassigned, not as permission to guess. General means deliberately not item-specific, not a default for missing information.

**Why:** The user explicitly states that a wrong BOQ link is worse than no link. Equipment can serve several activities in one shift.

**How to apply:** Entry-default work must not silently become historical backfill or resource-report recalculation. Historical linking requires a separate human-review batch; report-math changes require their own batch. Preserve operational readings and partial attribution.