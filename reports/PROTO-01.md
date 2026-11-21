# PROTO-01 — Site records prototype

## File and serving checks

- `client/public/prototypes/site-records.html` is present and byte-identical to the uploaded file (SHA-256: `c104916e7aca7366435cec715779ac14619025249caa3daf80848e608ac8a43e`).
- Development URL checked: `https://38c7ea14-bfd7-450d-9ff9-db514905afac-00-2jxsvdxptzmhz.janeway.replit.dev:5000/prototypes/site-records.html`. It returned `200 text/html`; the response hash matched the file. It loads without login and is not the React index page.
- `npm run build` passed. The file exists at `dist/public/prototypes/site-records.html` with the same hash.
- Production static serving calls `express.static(dist/public)` before the `index.html` fallback. Development serves the public file through Vite before the SPA fallback.

## Browser checks

- Opened at phone width (402 × 874). A service worker controlled the page, but while online the navigation returned the exact prototype file, not the app shell.
- No `/api/` requests were made by the prototype. The browser did request Google Fonts and the site favicon.
- Changing a lab reading from `3720` to `5000` recalculated the displayed compaction result from `98.7%` to `132.7%`.
- **The four tabs do not fully switch visually.** Their selected state changes, but the supplied CSS forces every iframe to `display: block`, overriding the `hidden` state. The other prototype screens remain visible below the selected one. The source was kept unchanged as instructed.
- The existing service worker uses a network-first navigation request. If offline, its existing fallback may return `/`; this check confirmed the correct file only while online.

## Supplied-file metadata

The uploaded HTML does **not** contain `og:title`, `og:image`, or a robots/noindex meta tag. Its document title is `SitePulse – Site records prototypes`. The requested `SitePulse · Site records prototypes` Open Graph title, published-domain `/sitepulse-logo.png` image, and noindex setting therefore could not be confirmed. I did not add or alter metadata because the instruction was to place the file unchanged.

## Screenshots

- [Phone-width prototype page](evidence/proto01-site-records-phone.jpg)
- [Phone-width Lab test sheets view](evidence/proto01-lab-test-sheets-phone.png)

No application code, routes, permissions, or data were changed, and nothing was published.

## Follow-up — corrected prototype

- Replaced the prototype with the corrected upload unchanged (SHA-256: `3e8fb42abb1513475fbe1183e676145d67e5612d9b3de59b612954f6148a3ba0`).
- The head contains `og:title` = `SitePulse · Site records prototypes`, `og:image` = `https://site-reporter--8shmmcw622.replit.app/sitepulse-logo.png`, and `robots` = `noindex`.
- At 402 × 874, each tab showed exactly its own screen: Site day home, Lab test sheets, Level sheet, and RFIs.
- `npm run build` passed. The uploaded file, `client/public/prototypes/site-records.html`, and `dist/public/prototypes/site-records.html` have matching hashes.
- No other source file was changed. Nothing was published.
