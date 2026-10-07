---
name: Test suite verification
description: Avoid misleading full-suite comparisons and setup-related skips in this project's heavy test suite.
---

Use `--maxWorkers` without `--minWorkers` for bounded runs on Vitest 4.

**Why:** The installed Vitest CLI rejects `--minWorkers` before collecting any tests.

**How to apply:** Do not copy older Vitest worker flags into verification commands.

Compare test-file inventories as well as pass/fail/skip totals. The historical "full suite" evidence included frontend component tests that the default npm test discovery did not include.

**Why:** A permission-gating verification appeared to lose passing tests: it omitted an entire frontend test directory, while concurrent builds and memory-heavy route/PGlite fixtures also produced setup failures reported as skipped tests.

**How to apply:** Preserve the normal suite's frontend and server discovery together. Save per-file JSON evidence. Do not run a production build concurrently with the full suite. Use bounded test workers, and distinguish explicit opt-in skips from setup failures; neither missing files nor failed hooks prove a regression was fixed.

Run a pre-change baseline from an immutable source snapshot if implementation will continue while the suite runs.

**Why:** Tests import files throughout a long run. Editing the same checkout contaminated a purported baseline with new permission behavior; an isolated source snapshot reproduced the actual prior failures.

**How to apply:** Either finish the baseline before editing, or run it from a separate snapshot with the same test-file inventory. Avoid overlapping heavy test runs as well as overlapping builds.

Browser-only API fixtures must bypass service workers as well as disabling cache.

**Why:** A registered worker bypassed CDP request interception and sent fixture-authenticated browser requests to the real server, producing 401s and misleading login redirects.

**How to apply:** Set CDP Network.setBypassServiceWorker before navigating fixture-based browser tests; do not mistake those tests for an authenticated HTTP authorization check.

Archive browser downloads per scenario before testing another scenario with the same suggested filename.

**Why:** In development verification, Chromium's CDP-configured download directory silently replaced an earlier workbook with a later single-type workbook using the identical vendor/period/status filename.

**How to apply:** Copy each completed download into a scenario-specific evidence directory immediately. Verify its sheet inventory before moving to the next case.

Vitest's JSON failure stack can say only `STACK_TRACE_ERROR` when a test exceeds its timeout.

**Why:** This runner version substitutes the test-registration stack into timeout errors. The JSON failure stack can hide the actual timeout message, making timing failures look like unexplained exceptions.

**How to apply:** Compare durations to the configured test timeout and inspect the runner's timeout serialization before diagnosing a functional regression. Preserve the original failed run and unchanged rerun evidence.

The documented testing-subagent kind is not always available in this runtime.

**Why:** A launch using the documented `config.$kind: "testing"` was rejected as `Unknown config kind: testing`.

**How to apply:** Use available browser tooling instead where feasible. Do not equate mocked component tests with signed-in development verification or bypass device approval to complete acceptance evidence.