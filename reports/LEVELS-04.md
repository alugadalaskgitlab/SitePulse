# LEVELS-04

## Part 1
- RL mode now has an optional active-site TBM picker/manual entry, with no BS, FS or closing check. Existing saved metadata is not rewritten.
- Design levels appear under empty and filled boxes in both modes, with differences when a reading exists and a short reason outside the design/width.
- New sheets generate From–To rows (10 m default interval), CL and chosen left/right points in the site's book chainages. Individual rows remain removable; replacing entered readings asks first.
- Filled RL-to-staff conversion requests the missing TBM setup instead of reinterpreting existing numbers.
- Focused tests: **32 passed in 4 files**. Build passed. No schema change, production access, real-record changes or publish.
