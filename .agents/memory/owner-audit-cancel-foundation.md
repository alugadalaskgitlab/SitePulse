---
name: Owner role + audit trail + cancel-vs-delete foundation
description: Cross-module pattern for Owner bypass, generic audit log, and soft-cancel vs hard-delete on transaction modules
---

Owner/Admin transaction-control spec implemented as a reusable pattern rather than per-module one-offs.

- `isOwner` on users is an unconditional bypass baked into `userHasPermission` (auth.ts) and every `assert*` helper (auth-routes.ts), not just checked at the route level. Any new permission-gated route automatically respects Owner as long as it uses the shared assert helpers.
- Delete vs Cancel is a deliberate split: DELETE routes stay admin-only hard deletes (existing behavior); new `.../:id/cancel` POST routes are soft-cancels requiring a `reason` in the body, gated by `assertDeleteOrCancel` (currently == assertEdit, so non-admin editors can also cancel). This lets stock-affecting records be reversed for audit without destroying history.
- Generic `auditLogs` table + `storage.logAudit()` is used for every module instead of per-module audit tables — `module` + `transactionId` is the join key. Frontend `HistoryDialog` fetches via `GET /api/audit-logs?module=X&transactionId=Y` and is reused unmodified across all 5 modules.
- List/report queries (`getDprs`, `getMaterialReceipts`, `getSiteMaterialTrips`, `getMaintenanceLogs`, `getAllSitePurchases`) exclude cancelled+deleted by default via an `includeCancelled` filter param — reports never need their own cancel-filtering logic.
- **Why:** the spec required identical Owner/Cancel/History behavior across DPRs, Plant Material Receipts, Site Purchases, Site Material Trips, and Equipment Maintenance Logs; building one generic mechanism instead of 5 bespoke ones avoids drift and makes it trivial to extend to future modules.
- **How to apply:** when adding transaction controls to a new module, reuse `CancelDialog`/`HistoryDialog` (client/src/components/) as-is, add a `.../:id/cancel` route gated by `assertDeleteOrCancel`, call `storage.logAudit()` on create/update/delete/cancel, and make sure the list query defaults to excluding cancelled/deleted records.
