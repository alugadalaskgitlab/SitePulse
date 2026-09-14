# WP-01 Schedule Revision browser evidence

Status: **PASS** (isolated browser fixture)

The verifier mounts the exported production `ScheduleRevisionActions` component
directly. It does not reimplement the component, call React handlers directly,
or connect to the application/database. The fixture's `fetch` adapter handles
only the two schedule-revision endpoints in memory; no customer/API writes were
made.

## A–E results

- **A — PASS:** Jan 1 → Jan 3 (3 calendar days), changing Start to Jan 10
  automatically displayed Finish Jan 12.
- **B — PASS:** After the Jan 10 suggestion, manually changing Finish to Jan 15
  was accepted and remained Jan 15.
- **C — PASS:** Editing Finish directly to Jan 8 left Start at Jan 1.
- **D — PASS:** Preview and commit both used the field overrides
  `startDate=2026-01-10`, `endDate=2026-01-15`, `cascade=true`. Commit used the
  exact preview token `fixture-preview-104-1`.
- **E — PASS:** Started activity showed actual Start Jan 5 as locked. Changing
  Finish to Jan 12 left it unchanged, and both preview and commit omitted
  `startDate`.

## Screenshots

- A: `tests/fixtures/schedule-revision/evidence/wp01-A-start-jan10-suggests-finish-jan12.png`
- B: `tests/fixtures/schedule-revision/evidence/wp01-B-finish-override-jan15.png`
- C: `tests/fixtures/schedule-revision/evidence/wp01-C-direct-finish-keeps-start.png`
- D: `tests/fixtures/schedule-revision/evidence/wp01-D-preview-override-cascade.png`
- E: `tests/fixtures/schedule-revision/evidence/wp01-E-started-actual-start-locked.png`

## Controlled payload evidence

Preview payloads:

```json
[
  {
    "barId": 104,
    "payload": {
      "startDate": "2026-01-10",
      "endDate": "2026-01-15",
      "reason": "Access handover delayed",
      "cascade": true
    }
  },
  {
    "barId": 105,
    "payload": {
      "endDate": "2026-01-12",
      "reason": "Started activity finish adjustment",
      "cascade": true
    }
  }
]
```

Commit payloads:

```json
[
  {
    "barId": 104,
    "payload": {
      "startDate": "2026-01-10",
      "endDate": "2026-01-15",
      "reason": "Access handover delayed",
      "cascade": true,
      "previewToken": "fixture-preview-104-1"
    }
  },
  {
    "barId": 105,
    "payload": {
      "endDate": "2026-01-12",
      "reason": "Started activity finish adjustment",
      "cascade": true,
      "previewToken": "fixture-preview-105-2"
    }
  }
]
```

Fixture files:

- `tests/fixtures/schedule-revision/main.tsx`
- `tests/fixtures/schedule-revision/vite.config.ts`
- `tests/fixtures/schedule-revision/verify.mjs`

Run with the fixture on port 4179 and Chromium CDP on port 9222:

```sh
npx vite --config tests/fixtures/schedule-revision/vite.config.ts \
  --host 127.0.0.1 --port 4179 --strictPort
node tests/fixtures/schedule-revision/verify.mjs
```