---
name: Permission preservation
description: Scope and access-preservation rules for permission-matrix changes
---
Keep the full permission matrix, not a simplified role model. Tightening page gates requires checking existing access first and preserving it through additive View grants only; do not reapply templates to existing users or change their account flags.

**Why:** The owner explicitly requires individual control over every action without locking out current users.

**How to apply:** Verify the target database before permission writes. Development access-preservation evidence never proves production is migrated; production needs separately authorized checks before a rollout.

## Delegable switches and split sections

The owner explicitly authorized clearing existing Delete, Export and Notify grants for non-admin/non-owner users. Preserve admin/owner accounts and clear nothing else. These switches must not be granted automatically by templates, defaults or Grant all.

When carving new sections from an old key, preserve existing View access additively: qto_boq View transfers to each planning/programme/review and Norms key; admin_settings OR user_management View transfers to Edit Requests. Other users start unticked. Delete, Export and Notify on new keys remain unticked.

**Why:** The matrix models the contractor's individual responsibilities and temporary delegation, not fixed roles. Notifications are activity-specific noise control.

**How to apply:** List every changed permission row. Parked modules are included in permission coverage and admin-route inventory, but only guards/mappings may change; do not alter or investigate business behavior. Verification may grant these actions only to purpose-created temporary development accounts, after asserting the database name. Never send test pushes to real users; remove and verify cleanup of accounts, devices, permissions and test records.
