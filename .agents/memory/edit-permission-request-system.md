---
name: Edit Permission Request System
description: How the locked-record edit permission request flow is designed and where it is wired.
---

# Edit Permission Request System

## Key design decisions

- `edit_permission_requests` table lives in `shared/schema.ts` but must be created manually via psql (drizzle-kit push is not run on every deploy). Always create with `CREATE TABLE IF NOT EXISTS` after adding to schema.
- `EditPermissionButton` renders a plain "Edit" for `isAdmin || isOwner` users (bypass); for everyone else it shows "Request Edit" with a reason dialog.
- Approving a request sets `expiresAt = now + 2 hours`. The `consumeEditPermission` route sets `usedAt` and `status = "used"`, giving a single-use window.
- Self-approval prevention enforced on both approve and deny routes (server-side: `req.authUser.id !== request.requestedBy`).

## Pages wired (as of July 2026)
- PlantShiftLog — near Finalized badge
- PlantHeatingSessions — finalized session cards
- PlantMaterialReceipts — submitted receipts
- DieselRequirements — purchased/rejected status (replaces regular Edit button)
- PurchaseIndents — completed status, non-admin only
- StoresGrn — finalized GRNs in detail panel
- PlantEquipmentUsage — next to edit button (backend returns HTTP 423 for locked entries)
- PlantDispatches — next to edit button

## Navigation
- Route `/edit-requests` → approver panel (pending + approve/deny)
- Route `/edit-requests/mine` → requester's own request history
- HubShell nav item with live pending count badge (polls `/api/edit-requests/pending`)

**Why:** Managers/Admins need oversight before engineers can alter locked records; the 2-hour window prevents indefinite open permissions.
