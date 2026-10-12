---
name: Bill-specific hire terms
description: Historical bill-specific terms must survive recovery; new bills return to the earlier Master-based workflow.
---
## Current recovery direction

New Vendor Bills return to the earlier Master-based hire workflow. The user
replaced the newer bill-specific composer and Material Trip-to-daily-hire
integration with selective Vendor Bills recovery. The rules below describe the
superseded composer, not authorization to reintroduce it.

**Why:** The user explicitly requested the compatible pre-integration workflow,
while requiring all existing saved bills and evidence to survive unchanged.

**How to apply:** Keep frozen saved terms and historical readers compatible.
Do not use recovery as permission to recalculate historical amounts, change
Production, backfill records, or roll back unrelated operational trip features.

## Historical composer requirements

Equipment Master basis, rate and hire dates are suggestions only for the integrated
Vendor Bill composer. Each selected equipment has agreed bill-specific terms;
confirmed vehicle/vendor identity is independent of basis. Never rewrite master
defaults or operational evidence to make a bill eligible.

**Why:** The user bills the same hired equipment on different bases and rates for
different assignments, and explicitly requires preserving historical records.

**How to apply:** Use the selected terms on both client preview and server save.
Freeze them in the existing statement snapshot. Reopening saved bills must not
substitute mutable master defaults. Deliberate draft term changes require renewed
activity review. Preserve cross-basis duplicate guards and never derive hours
from trips. This supersedes earlier compulsory Master monthly/daily billing rules
for the integrated Vendor Bill workflow, not the separate hire register.

Do not introduce Hire Type into Material Trip entry or linking.

**Why:** The user clarified that trips record actual activity; only Vendor Bill
terms decide whether the same confirmed evidence is charged per trip or per day.

**How to apply:** Keep evidence discovery independent of the Equipment Master
default and selected bill basis. Daily billing reviews one vehicle/date with
Full/Half/Excluded decisions; trip billing reviews individual eligible trips.

Verify the vendor-discovery stage as well as the hire-activity feed and save path.

**Why:** A Daily-only Master filter in vendor discovery hid confirmed trip-only
tippers with Trip defaults before users could choose Daily terms, even though
the activity feed and calculators already supported those trips.

**How to apply:** Regression fixtures must have zero DPR/equipment usage and go
through discovery, activity retrieval, draft save and reload. Confirmed owner IDs
must survive differing legacy owner spellings; business labels must not replace
canonical request values.
