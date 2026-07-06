---
name: Common attachment system
description: Shared attachments table/API/components for photos and documents across DPR, receipts, purchases, and equipment logs.
---

One shared `attachments` table + generic `/api/attachments` REST routes + `AttachmentUploader`/`AttachmentGallery` React components back every file-upload need (DPR photos, material receipts, site purchases, IRN/PI/vendor bills, equipment breakdown/maintenance). Do not build per-module upload UIs or tables — extend `moduleType` on the shared system instead.

**Why:** keeps storage, permission gating (`requireAuth` on `/objects` and `/api/uploads`), file-type/size validation (15MB, image/PDF) in one place instead of duplicated per module.

**How to apply:** for any new attachable record type, add a `moduleType` enum value in `shared/schema.ts` and drop in `<AttachmentUploader moduleType=... linkedRecordId=... />` + `<AttachmentGallery .../>` wherever the record is edited.

**DPR-specific pattern:** the DPR only gets a DB id after it's saved (`createMutation` in `SiteEntry.tsx`), so there's no id to link photos to during the guided-flow capture step. Solution: stage picked photos as local `File[]` state, preview via `URL.createObjectURL`, and only call `uploadFile` + `POST /api/attachments` inside the mutation's `onSuccess` once `data.id` exists. This pattern (stage-then-upload-on-save) applies to any other "create new record with photos in one flow" case.

**Environment quirk:** `drizzle-kit push`'s interactive TUI prompt can't be answered via piped stdin (echo/printf into the pipe exits 0 but doesn't apply the change) — use a raw `CREATE TABLE`/`ALTER TABLE` via `psql` as a workaround for schema changes that hit this prompt.

**Common regression pattern:** `<AttachmentUploader>`/`<AttachmentGallery>` are easy to accidentally gate behind an `editing<X> &&` condition, which silently blocks attachments during initial record creation (only works after reopening in edit mode) — this was the root cause of a real "no photo option on Material Receipt" bug. When adding attachments to a create+edit form, always apply the DPR stage-then-upload pattern for the create path, not just the edit path. Also check the record's list/report view separately — a working uploader doesn't guarantee the saved photos are ever displayed back to the user outside the edit dialog (add a read-only `<AttachmentGallery allowDelete={false}>` to list rows / report detail pages too).

**Similarly-named-module trap:** SiteLog has several distinct modules with confusingly similar names — e.g. plant-level "Material Receipt" vs. site-level "Materials Received" (aggregate report blending `site_material_trips`, DPR material logs, and equipment logs by a `source` field). When a user asks "did you add photos to X", confirm which underlying table/page they mean by name and check each one individually — don't assume coverage transfers between similarly-named screens. The attachment system also supports uploader name/upload date metadata display out of the box via `AttachmentGallery` (renders automatically if `getAttachments()` returns `uploadedByName`/`uploadedAt`).
