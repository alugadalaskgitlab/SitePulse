---
name: Test suite verification
description: Avoid misleading full-suite comparisons and setup-related skips in this project's heavy test suite.
---

Use `--maxWorkers` without `--minWorkers` for bounded runs on Vitest 4.

Route every PostgreSQL integration-test URL to a disposable native server for
whole-suite comparisons; a schema-only development copy is sufficient.

**Why:** Some tests that advertise rollback-only safety insert into public
tables. Rolling back those inserts does not roll back PostgreSQL sequences.
Leaving even one test URL pointed at an application database can change state.

**How to apply:** Override process-local default, development and dedicated
integration-test connection URLs together, and stop the disposable server
after both current and baseline runs. Do not change workspace secrets.

**Why:** The installed Vitest CLI rejects `--minWorkers` before collecting any tests.

**How to apply:** Do not copy older Vitest worker flags into verification commands.

Compare test-file inventories as well as pass/fail/skip totals. The historical "full suite" evidence included frontend component tests that the default npm test discovery did not include.

**Why:** A permission-gating verification appeared to lose passing tests: it omitted an entire frontend test directory, while concurrent builds and memory-heavy route/PGlite fixtures also produced setup failures reported as skipped tests.

**How to apply:** Preserve the normal suite's frontend and server discovery together. Save per-file JSON evidence. Do not run a production build concurrently with the full suite. Use bounded test workers, and distinguish explicit opt-in skips from setup failures; neither missing files nor failed hooks prove a regression was fixed.

Run a pre-change baseline from an immutable source snapshot if implementation will continue while the suite runs.

**Why:** Tests import files throughout a long run. Editing the same checkout contaminated a purported baseline with new permission behavior; an isolated source snapshot reproduced the actual prior failures.

**How to apply:** Either finish the baseline before editing, or run it from a separate snapshot with the same test-file inventory. Avoid overlapping heavy test runs as well as overlapping builds.

Do not restore deliberately removed business features or startup mutations merely
to satisfy older tests.

**Why:** The suite contains both pre-recovery billing expectations and current
recovery tests with intentionally opposite contracts. Failure-count reduction
alone cannot determine which product behaviour is authorized.

**How to apply:** Establish the approved contract first, retain historical saved
data coverage, and report unresolved contradictory tests explicitly. Do not
suppress their discovery or call a partially repaired suite deployment-ready.

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

Test route-supplied semantic validators separately when persistence fixtures
inject a no-op validator. A review-required response proves rejection of the
old request shape, not successful validation of a reviewed correction.

**Why:** Isolated correction-service tests proved transactional saves and
approval rules but could not detect failures in the real route's validation
callback. Simply changing legacy success assertions to the review gate would
lose meaningful coverage.

**How to apply:** Exercise the actual callback alongside the real planner and
isolated persistence/approval tests; keep invalid-data and untouched-history
cases when migrating tests away from retired endpoints.

Keep a disposable native PostgreSQL server and the full-suite command in the
same long-lived background shell, with a server-stop trap on exit.

**Why:** A server started in a separate short-lived shell became unavailable
between calls, causing extra setup-related skips despite unchanged file
discovery. Starting it inside the test shell kept it available for the run.

**How to apply:** Confirm the server accepts connections after the shell starts,
preserve failed setup evidence, and require the expected explicit-skip count
before treating a full run as a comparable release gate.

When retiring a billing input, preserve audit-evidence checks and positive
bill-save coverage separately from the new non-billability checks.

**Why:** Delivery rows can remain as historical or review-only evidence after
they stop supplying daily hire. Assuming non-billability means the rows must
disappear loses audit coverage; replacing every successful save with a rejection
also misses failures in the supported operational billing path.

**How to apply:** Give positive new-bill fixtures actual DPR or equipment usage
and Master-aligned terms. Check retained source identities, operational charges,
duplicate protection and frozen snapshots independently of retired-input
eligibility. Do not restore withdrawn application behavior to satisfy old tests.

Exercise release exports through the production-format server bundle, not only
through test-runner imports of the renderer.

**Why:** External dependency interop caused an export to fail only in the
minified CommonJS server even while its renderer and route tests passed.

**How to apply:** Match the production package boundaries in a bundle regression
test, then request actual files from the built server with normal authenticated
synthetic accounts and disposable persistence. A successful build alone does
not prove that a lazily executed export function works.