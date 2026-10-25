---
name: Hire-bill tax display
description: Scope rules for correcting saved equipment-hire bill tax presentation.
---

# Rule
For equipment-hire tax-base display corrections, calculate draft bill-detail GST/TDS from gross hire minus breakdown. Keep any net-payable change limited to the GST/TDS delta. Preserve approved or frozen amounts, and leave shared report and export snapshot paths unchanged unless the user explicitly expands scope.

**Why:** The user explicitly confined this correction to bill display, excluding stored records, monthly summary figures, PDF/Excel exports, and approved bills.

**How to apply:** Use a screen-only presentation projection; do not change shared report or export builders. Cover draft, no-advance, and frozen-bill cases in tests.
