---
name: DPR daily received totals
description: Complete-group requirement for secondary BOQ-unit receipt totals.
---
Only show a material summary's BOQ-unit total when every entry in that material/native-unit group has a resolved conversion into the same BOQ unit.

**Why:** Summing only convertible trips would misrepresent a partial quantity as the whole day's total, especially when consolidated results include DPR/equipment entries without conversions.

**How to apply:** Reuse the server's existing conversion results without guessing missing densities or units. Omit the secondary total for incomplete or mixed-unit groups; retain all recorded native quantities.