# Part D pre-publish review

No publication performed. No application or test behaviour changed during this review.

## Project-wide type check: completed, FAILED

- Current Part D: `npm run check` (`tsc`), exit 2, 491 TypeScript diagnostics.
- Baseline: `f3cae60` extracted under `/tmp`, same installed dependencies, full tsconfig and imported Vite/Vitest configs; `tsc --project <baseline>/tsconfig.json --incremental false --pretty false`, exit 2, 491 diagnostics.
- No added or removed diagnostic locations/error codes/multiplicities after mapping Part D's line offsets back to baseline. TypeScript prints some inferred object properties in different orders; diagnostic text is not claimed to be byte-identical.
- Full logs: `typecheck-final.log`, `typecheck-f3cae60.log`; process exit codes stored separately.
- Reproducible comparison: `compare-typechecks.mjs`; result: `typecheck-comparison.json`.
- Largest existing groups: storage 175, PlantStock 77, routes 61, ConcreteCalculator 18, schema 14.
- This establishes an unchanged failing type-check baseline, NOT a green type check or permission to publish.

## Permission-dialog failures: timing flakes, not a functional regression

Suite: `PERM-01 C actual permissions dialog`

| Exact test title | Part C full-suite baseline | Part D failed full run | Unchanged rerun 1 | Unchanged rerun 2 |
|---|---:|---:|---:|---:|
| partial manager: owned hub alias can be enabled/revoked without exceeding grant cap | Passed, 1.912s | Failed, 6.812s | Passed, 2.157s | Passed, 2.381s |
| group Grant all uses hub Access and leaves inactive historical fields unchanged | Passed, 2.523s | Failed, 8.009s | Passed, 2.788s | Passed, 2.695s |

Both reruns ran the entire permissions-dialog file: 7 passed / 0 failed each. There was also an earlier successful isolated rerun, preserved in `isolated-checks.log`.

Evidence:

- Original failures preserved in `full-suite.json`; new reruns in `permissions-recheck-1.json` and `permissions-recheck-2.json`.
- Part C baseline: `../transport-setup-review/full-suite.json`.
- `git diff f3cae60 -- tests/perm01MatrixUi.test.tsx client/src/pages/UserManagement.tsx shared/permissions.ts` is empty.
- Vitest's resolved non-browser default timeout is 5,000ms. Project configuration does not override `testTimeout`; its 60,000ms `hookTimeout` applies to hooks, not tests.
- Installed runner's `withTimeout` rejects tests when elapsed time exceeds that limit. `makeTimeoutError` replaces the error stack with the registration stack, which says `STACK_TRACE_ERROR`. The JSON reporter therefore hides the useful timeout message in these failure stacks.
- The original full run overlapped a production build, creating avoidable contention. The unchanged reruns passed even while the type checker was running.

No timeout increases, retry configuration, assertion weakening, or permission implementation changes were made. The original full-suite tally remains 4,438 passed / 50 failed / 3 skipped; reruns do not retroactively turn that run green.

## Publication

The user will decide whether to publish. Fresh Publish diff returned exactly:

```sql
ALTER TABLE "vendor_bill_items" ADD COLUMN "transport_pricing" jsonb;
```

No warnings, structural data loss, drops, truncates, renames, defaults or NOT NULL changes.

Part D was committed locally. Push to origin/main was rejected with "Invalid username or token"; origin remains at f3cae60. No credentials were read or changed. Replit documentation advises reconnecting GitHub under Account settings → Git Providers, after which the push can be retried. No publication was performed.
