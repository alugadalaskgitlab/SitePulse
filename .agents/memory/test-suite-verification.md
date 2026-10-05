---
name: Test suite verification
description: Avoid misleading full-suite comparisons and setup-related skips in this project's heavy test suite.
---

Compare test-file inventories as well as pass/fail/skip totals. The historical "full suite" evidence included frontend component tests that the default npm test discovery did not include.

**Why:** A permission-gating verification appeared to lose passing tests: it omitted an entire frontend test directory, while concurrent builds and memory-heavy route/PGlite fixtures also produced setup failures reported as skipped tests.

**How to apply:** Preserve the normal suite's frontend and server discovery together. Save per-file JSON evidence. Do not run a production build concurrently with the full suite. Use bounded test workers, and distinguish explicit opt-in skips from setup failures; neither missing files nor failed hooks prove a regression was fixed.

Browser-only API fixtures must bypass service workers as well as disabling cache.

**Why:** A registered worker bypassed CDP request interception and sent fixture-authenticated browser requests to the real server, producing 401s and misleading login redirects.

**How to apply:** Set CDP Network.setBypassServiceWorker before navigating fixture-based browser tests; do not mistake those tests for an authenticated HTTP authorization check.

Archive browser downloads per scenario before testing another scenario with the same suggested filename.

**Why:** In development verification, Chromium's CDP-configured download directory silently replaced an earlier workbook with a later single-type workbook using the identical vendor/period/status filename.

**How to apply:** Copy each completed download into a scenario-specific evidence directory immediately. Verify its sheet inventory before moving to the next case.