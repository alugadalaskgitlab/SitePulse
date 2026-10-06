---
name: Permission preservation
description: Scope and access-preservation rules for permission-matrix changes
---
Keep the full permission matrix, not a simplified role model. Tightening page gates requires checking existing access first and preserving it through additive View grants only; do not reapply templates to existing users or change their account flags.

**Why:** The owner explicitly requires individual control over every action without locking out current users.

**How to apply:** Verify the target database before permission writes. Development access-preservation evidence never proves production is migrated; production needs separately authorized checks before a rollout.
