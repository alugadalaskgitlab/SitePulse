---
name: Role-conflict scope
description: Keep role-conflict visibility changes separate from account correction and unrelated field-user restrictions.
---

The approved admin/owner override is scoped to whole-bill exports, not every field-engineer restriction. Conflict warnings are informational, not authority to normalize accounts automatically.

**Why:** The user explicitly separated the export/UI batch from account flag corrections requiring separate approval, and requested investigation only for empty rate-row deletion.

**How to apply:** Do not extend the override to Payables Preview, Home, or DPR rules without authorization. Do not infer permission to change stored roles from a request to fix export visibility.
