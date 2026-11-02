---
name: Permission System v2
description: Architecture decisions for the expanded 85-key permission matrix with approve action and Permission Manager flag (May 2026)
---

## Key decisions

**7 actions**: view, create, edit, delete, view_reports, export, approve. The `approve` column is stored in `user_permissions` as `can_approve` (boolean, per-section row in DB).

**PERMISSION_GROUPS** exported from `shared/permissions.ts` — 17 groups used by UserManagement.tsx accordion. Legacy group exists but hidden from partial managers.

**Permission Manager flag** (`canManagePermissions` / `permissionManagerScope`): stored on the `users` table (not permissions matrix). Full scope = same as admin for user management. Partial scope = can only edit non-admin users + grants capped to own permissions.

**Self-approval prevention**: PI approve/reject, DR approve/reject, and VendorBills verify/approve all check `authorUserId !== req.authUser.id`. Returns 403 if same. Uses existing `authorUserId` column on each table — no new columns needed.

**Backward compat in App.tsx**: Routes migrated from broad keys to granular keys use `gatedEither(Component, newKey, oldKey)` so existing users with old key set still have access. Never break old key access unilaterally.

**Why:** Existing users have broad keys (site_procurement, site_diesel, vendor_bills, etc.) already set in DB. Switching routes to new granular keys without fallback would lock them out.

**How to apply:** When adding a new granular key for a route that previously used a broad key, always use `gatedEither` with both new + old key. Only drop the old fallback once all users have been re-permissioned by the admin.

Granular Raise rows retain separate Create and Edit actions; never use the granular Create checkbox to enable an Edit-only server action.

**Why:** A client-only OR against Create can expose an edit button while the server correctly requires Edit. Supporting list/detail reads must also allow the raiser, or an additive write gate alone still leaves the form unusable.

**How to apply:** Verify client and server action parity, supporting reads, and successful mocked-storage create/edit requests for both legacy-only and granular-only users. Preserve approval and site restrictions independently.

Do not interpret the legacy Admin Settings "plants" scope as permission to configure physical plants.

**Why:** The requested split referred to legacy-gated plant reports; physical plant settings are separately admin-only. Broadening those would exceed the intended additive split.

**How to apply:** Keep plant-report management and physical plant configuration distinct when refining permission labels or controls.

Legacy Reports and RMC Operations must not be labelled inert merely because their checks occur in OR expressions.

**Why:** Either key can independently grant page entry; Reports also grants server report access. Hiding their working controls would misrepresent existing access.

**How to apply:** Audit actual callers before marking legacy keys unused. Preserve hidden saved bits on ordinary matrix saves; hub visibility can originate from any of seven historical action bits.

## assertApprove

Exported from `server/auth-routes.ts`. Works identically to `assertEdit` but checks `m[section].approve`. Admins always pass. Use on approval/rejection endpoints.

## Permission UI

`UserManagement.tsx` uses shadcn Accordion (one item per PERMISSION_GROUPS entry + one for Site Access). Each group has a "Grant all" checkbox. Partial managers see disabled checkboxes for actions they don't have themselves. Legacy group hidden from partial managers.

## Staged access-rule rollout

Replacement access checks are gated by the single `access_rules_v2` setting in `app_settings`; a missing or invalid value means OFF. The client and server use the shared decision rules. Admins/Owners can inspect a read-only per-user preview, while only Owners can switch the setting; each actual transition is audited. The switch must not rewrite saved permissions, site access, or user flags.

**Why:** The user requires access changes to remain inert until explicitly enabled and reviewed, without migrating existing grants.

**How to apply:** Keep every replacement check behind this setting, compare legacy and proposed results in preview, verify OFF behavior and client/server parity with ON, and audit only actual state transitions.

For legacy OFF behavior, preserve the user's actual legacy `role` value; an absent role remains `null` and must never be inferred from Admin/Manager flags. Preview users have no role column, so role-based current results use `null`. The stale-GRN current audience is the exception: derive it from active push subscriptions' stored manager/admin roles, matching the existing delivery audience.

**Why:** Inferring a legacy role from admin status changes what role-gated controls show when the rollout setting is OFF, and stale-GRN delivery historically follows subscription roles rather than user flags.

**How to apply:** Keep legacy-role fallback exact on the client and server; when previewing push audiences, use the same active-subscription records and role filter as delivery.
