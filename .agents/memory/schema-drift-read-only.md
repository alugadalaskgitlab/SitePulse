---
name: Read-only schema drift checks
description: User restriction on database drift verification
---
Database drift checks must be read-only. Never add a temporary test column.

**Why:** The user explicitly restricted drift-check scope.

**How to apply:** Compare existing schema metadata only; do not perform schema-sync writes or test DDL.

For the transport rate-card expansion, do not start Part C or run any migration until the user has seen and approved the schema preview SQL for its three new nullable columns. Leave the whole-bill export and equipment-log detail (A+B) together unchanged.

**Why:** The user explicitly repeated this approval requirement.

**How to apply:** Keep preview/reporting read-only. An empty schema preview does not establish that the current application contains only the requested feature; disclose other application changes already present.

The approved transport rate-card additions are development-only. Production receives them through the user's publish, with the actual Publish diff shown again beforehand. Existing rate-card rows must retain NULL in all three new columns and keep working; verify NARASIMHULU's rate-card screen before and after.

**Why:** These are the user's explicit conditions on approval of the three nullable columns.

**How to apply:** Do not write production DDL or populate existing rate bases. Capture the real development screen before changing it, and preserve existing stored values for the comparison.