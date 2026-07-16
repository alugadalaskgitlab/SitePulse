---
name: Roads Pilot Role Templates
description: Pre-built permission templates for Site Engineer and PM roles; key rule is SE gets irn_raise but not purchase_indents_raise.
---

## Rule
`ROLE_TEMPLATES` and `applyRoleTemplate(id)` live in `shared/permissions.ts`.
Two templates: `site_engineer` and `project_manager`.

**Key distinction (from spec §4a):**
- Site Engineer: `irn_raise` create=true, `purchase_indents_raise` stays false. IRN moves company-owned stock; PI commits money with a vendor — different risk levels.
- Project Manager: both `irn_raise` and `purchase_indents_raise` enabled, plus approve on PI/IRN/VendorBills/DPRs.

**Why:** A site engineer on site should be able to request material from the central store (IRN) without needing approval authority for external vendor purchases (PI). The permission system already separates these cleanly so this is purely a role-assignment decision.

**How to apply:** In UserManagement.tsx permission editor, the "Load role template…" Select calls `applyRoleTemplate(val)` and replaces `setMatrix()`. Templates are a starting point — admin fine-tunes after applying.

## §4b: IRN CTA on shortage
- `ReadinessSection` in `FieldHome.tsx` shows an indigo CTA block when `shortage && canRaiseIrn`.
- Navigates to `/irn/new?from=readiness&siteId=X&material=Y&qty=Z&uom=U` — pre-fills first shortage material, site, and quantity.
- `IrnRaisePage` reads `?siteId=N` via `prefillSiteId` and sets form `siteId` default. `from=readiness` maps to "Tomorrow's Plan — Shortage" label.
- Purpose auto-fills as "Tomorrow's Plan — material shortage"; urgency defaults to "urgent" when a material is pre-filled from a shortage link.
