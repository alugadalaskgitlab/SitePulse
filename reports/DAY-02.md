# DAY-02

## Part 1
- Edit person now has a viewport-height limit, an internally scrolling form and fixed Cancel/Save footer. The older create-user and password windows received the same containment; permission-loading/error windows can scroll.
- Focused tests: **36 passed in 3 files**. Rendered checks at 390/768/1366px verify that the footer is outside the scrolling form and buttons remain usable; no browser checks or screenshots were taken.
- `npm run build`: **passed**. No user records, settings or permissions changed.
