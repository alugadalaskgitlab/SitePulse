---
name: Route logic testability
description: How to make Express route calculation logic unit-testable in this codebase
---

Express route handlers in `server/routes.ts` often mix DB fetches with pure
calculation logic inline (loops, running balances, classification rules).
That inline logic cannot be unit-tested without spinning up the DB/app.

**Rule:** before writing tests for a route's business logic, extract the pure
computation (no `storage.*` calls, no `req`/`res`) into an exported function
in `shared/planningEngine.ts` (or a similarly-shared module), have the route
call that function, and test the function directly with `vitest`.

**Why:** this was needed for the time-phased procurement shortage-check
(`GET /api/boq/projects/:id/shortage-check`) — the month-by-month running
balance and suggestion classification (`adequate`/`monitor`/`raise_irn`/`raise_pi`)
was inline in the route until extracted as `computeShortageRow()` in
`shared/planningEngine.ts`, which let tests hit ~10 edge cases (stock-only
coverage, pending PI/IRN netting, chronological drawdown, near-term vs
aggregate shortfall) without touching the database.

**How to apply:** whenever a task says "must add/verify tests" and the
relevant logic lives in `server/routes.ts`, check first whether it's already
extracted; if not, extract it as a first step rather than trying to test the
route handler directly.
