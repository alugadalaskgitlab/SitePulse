---
name: Flex-wrap layout traps & visual verification
description: Why wide flex-shrink-0 button blocks collapse sibling columns, why flex-wrap breaks lines on max-content, and how to visually verify layout in this repo.
---

## Flex layout rules that bit us (BOQ project header)

1. **A `flex-shrink-0` block wider than the container starves its `flex-1 min-w-0` siblings to ~0px.** Symptom set: title ellipses to one character, `flex-wrap` span rows wrap one word per line ("·" separators alone on a line), looks like a data bug but is pure CSS. Check button-row intrinsic width vs laptop content area (~1000-1100px with sidebar) before blaming data.
2. **`flex-wrap` collects lines using each child's *hypothetical* main size (flex-basis:auto = max-content), not its shrunk size.** A wrappable, shrinkable child (`flex-wrap` + `min-w-0`) still gets bumped to the next line if its max-content doesn't fit — it never gets a chance to shrink first. To keep two blocks side-by-side on desktop, give the wide block a **bounded basis or min-width floor**, e.g. `flex-[3_1_0%] min-w-[min(420px,100%)]`: hypothetical size becomes 420px, it wraps its own children internally, and only drops below the sibling when the row < sum of the two minimums (true mobile).
3. `min-w-[min(Xpx,100%)]` (not plain `min-w-[Xpx]`) so the floor never overflows narrow containers.

**Why:** architect review caught that the first fix (plain `flex-wrap` + `min-w-0` on the actions block) still dropped it below the title at laptop widths; the bounded-basis version was verified in a real browser.

## How to visually verify layout in this repo

- The Screenshot tool only reaches **registered workflow ports** (main app 5000); ad-hoc `python -m http.server` ports get ERR_CONNECTION_REFUSED, and the mockup-sandbox vite 404s loose files in its public/ (its plugin restricts serving).
- Cheap method: write a self-contained HTML page (Tailwind CDN + the exact classes, multiple fixed-width containers e.g. 1050/800/375px) into `client/public/`, screenshot `/{file}.html` on port 5000, then delete the file.
- `pkill -f "<pattern>"` inside a ShellExec kills the shell itself if the pattern appears in the command line — bracket a char (`http[.]server`).
