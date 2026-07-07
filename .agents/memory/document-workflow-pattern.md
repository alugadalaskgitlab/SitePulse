---
name: Draft/Pending Document/Final Submit workflow pattern
description: Reusable pattern for document-completeness tracking and post-submit edit locking, implemented for Material Receipts and Site Purchases.
---

Pattern: a record has a persisted `documentStatus` enum (`draft` | `submitted`) plus `finalSubmittedAt`/`finalSubmittedBy`. "Pending Document" is NOT a third stored value — it's a derived UI/API state computed as `documentStatus === 'draft' && !hasRequiredDoc`.

`hasRequiredDoc` is computed server-side per record by checking the `attachments` table for at least one row with a `docType` in that module's required-doc list (e.g. material_receipts: challan/dc/invoice/receipt; site_purchases: bill/invoice/receipt), batch-queried with `inArray` to avoid N+1s in list endpoints.

**Why:** avoids a fragile third enum value that could drift out of sync with actual attachment state, and keeps the compute cheap via one batched attachments query per list call.

**How to apply when extending to a new module:**
1. Add `documentStatus`/`finalSubmittedAt`/`finalSubmittedBy` columns + a `POST /:id/final-submit` route that 400s if already submitted and checks required docs exist.
2. In the list/get storage methods, batch-fetch attachments by `moduleType` (singular, e.g. `"material_receipt"` not `"material_receipts"` — matches `attachmentModuleTypes` enum) and attach computed `hasRequiredDoc`.
3. PUT/PATCH edit routes must 403 when `documentStatus === 'submitted'` unless the actor is Owner/Admin (Owner/Admin always bypass lock for edit/delete/cancel/history).
4. Frontend: badge order is Final Submitted (locked icon) > Pending Document (warning icon, doc missing) > Draft (default); gate edit/cancel/delete buttons on `canEdit && documentStatus !== 'submitted'` OR `isOwnerOrAdmin`; Final Submit button disabled until `hasRequiredDoc`.
