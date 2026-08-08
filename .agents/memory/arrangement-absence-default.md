---
name: Arrangement absence = HLC self-execution
description: Frozen business rule — no Execution Arrangement record means default self-execution, never "Arrangement Required"; Procurement is read-only about arrangements.
---

**Rule:** Zero active arrangement records for a BOQ item/bar derive the neutral `self_execution` state (label "HLC / Self-execution"), never `arrangement_required`. `arrangement_required` survives only for deliberate arrangement records that exist but carry no decided quantity, or partial coverage.

**Why:** Frozen business rule (Aug 2026 procurement correction): arrangements are created only deliberately for outsourcing/client-supply/splits. Absence is not an error or missing setup; amber "Execution Arrangement Required" prompts caused users to create unnecessary arrangements.

**How to apply:**
- Procurement/BOM (WorkDemand) must stay READ-ONLY about arrangements: no manage/navigation links, no "not covered by an arrangement" narratives. Arrangements are managed only in Work Program & BOQ → Execution Arrangements.
- Internal procurementStatus `earthwork_arrangement_required` really means "earthwork with unresolved plant-material mapping" — render it as "Material mapping required", never as an arrangement prompt.
- Shortage rows carry `sourceBoqItems` ({id, name}) resolved server-side via saved itemName → shared shortItemName; never invent per-item contributed quantities (engine doesn't provide them).
