---
name: IRN Feature
description: Internal Requisition Note — fully built and live as of June 2026
---

## IRN Number Format
`HLC/IRN/{YEAR}/{FROM_CODE}-{USER_INITIALS}-{MAT3}/{SEQ:04d}`
- FROM_CODE: SITE / HMP / EQP (derived from raisedFrom)
- USER_INITIALS: initials of full name (e.g. "Sunil Kumar" → "SK")
- MAT3: first 3 alpha chars of first item's material name

## Workflow
`pending_stores` → stores verification → `stores_verified` (with per-item action: issue / procure / split) → `closed`

Stores verify (`PATCH /api/irn/:id/stores-verify`) uses `stores_inventory` permission — NOT `irn_approve`.
`irn_approve` key exists in permissions.ts but the approve endpoint is not yet built (reserved for future manager sign-off layer).

## Key Files
- `shared/schema.ts` — `internalRequisitions` + `internalRequisitionItems` tables, `createIrnRequestSchema`, `storesVerifyIrnSchema`
- `server/storage.ts` — `getInternalRequisitions`, `getInternalRequisition`, `createInternalRequisition`, `storesVerifyIrn` in DatabaseStorage class
- `server/routes.ts` — 4 endpoints after the PI stores-bypass block (~line 4973)
- `client/src/pages/irn/IrnListPage.tsx` — list with status tabs + row click
- `client/src/pages/irn/IrnRaisePage.tsx` — raise form with localStorage material combobox, per-item needByDate + urgency
- `client/src/pages/irn/IrnDetailPage.tsx` — detail + inline stores verification form (stock check → issue/procure/split per item)
- `client/src/App.tsx` — routes gated via `gatedEither(irn_view, irn_raise)`
- `client/src/components/HubShell.tsx` — nav item between Equipment and Stores

## Self-approval
No self-approval check yet (stores-verify path doesn't involve the raiser). If a manager-approve step is added later, raiser_id != approver check will be needed.
