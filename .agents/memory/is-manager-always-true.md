---
name: isManager is always true for non-admins
description: auth-context's isManager flag is not a real role check — never gate features on it
---

`useAuth().isManager` in `client/src/lib/auth-context.tsx` is defined as `!!u && !u.isAdmin` — it is `true`
for every authenticated non-admin user (engineers, field staff, everyone). It is not a "manager role" flag.

**Why:** Two separate bugs traced back to this in the same session: (1) FieldHome/guided-DPR mobile defaults
never activated for anyone because the code checked `!isManager`, which was only true when logged out; (2)
`HubShell.tsx`'s `canSeeEstimator = isAdmin || isManager` exposed the Estimator/mix/concrete/QTO/rate-card
modules to every logged-in user regardless of actual permissions, since `isManager` was always true.

**How to apply:** Never use `isManager` to gate role-specific UI, navigation, or defaults. Use the explicit
`isFieldEngineer` boolean for "is this a field/mobile engineer" checks, or `sectionVisible(sectionKey)` /
`sectionCan(sectionKey, action)` from the permission matrix for "does this user have access to module X"
checks. Server-side routes should mirror this — check `loadUserPermissionsMatrix` per section key, not a
manager/admin binary.
