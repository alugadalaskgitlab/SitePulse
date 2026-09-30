---
name: Port configuration preservation
description: Preserve explicitly restored localhost exposure settings and distinguish observed drift from an unproven cause.
---

Check the actual port configuration against the user's requested settings, not only the current Git diff, when closing a verification batch.

**Why:** A user-requested localhost-exposure restoration disappeared again in a later deployment checkpoint before the next implementation batch. It also disappeared during a temporary browser-server session after its presence was explicitly verified at the start. A clean implementation diff cannot establish that the requested setting is present. These observations narrow the timing, not the responsible process; automatic port normalization remains unproven.

**How to apply:** Preserve `exposeLocalhost = true` on the 4178 → 6000 mapping unless explicitly authorized otherwise. Verify its presence before and after temporary browser servers and at final delivery. Restore through the validated configuration tool when requested. Do not attribute a config change to automatic tooling without evidence.