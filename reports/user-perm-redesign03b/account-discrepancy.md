# Account discrepancy — read-only checks, 9 October 2026

Production was queried through the production SQL service. Development was queried
only after asserting `current_database() = sitelog_dev`.

| User ID 3 flag | Production | Development |
|---|---|---|
| is_active | true | true |
| is_admin | true | false |
| is_owner | false | false |
| is_field_engineer | false | true |
| can_manage_permissions | false | true |

These environments currently contain different flags for numeric user ID 3.
The earlier non-admin development verification and the 03A production
Administrator observation are therefore compatible, not evidence by themselves
that an account was promoted during verification. Numeric IDs alone do not
establish cross-environment identity.

No account flags were changed by this check. This does not establish when or why
the environments diverged, nor prove a historical identity match. Do not “repair”
either environment based on the other.

Production query:

```sql
SELECT id,is_active,is_admin,is_owner,is_field_engineer,can_unlock_records,
       can_manage_permissions,permission_manager_scope
FROM users WHERE id = 3;
```

Additional production values: can_unlock_records=true,
permission_manager_scope=partial.

Development query:

```sql
SELECT id,is_active,is_admin,is_owner,is_field_engineer,can_manage_permissions
FROM users WHERE id = 3;
```

Development output is preserved in `development-user3-flags.json`.
