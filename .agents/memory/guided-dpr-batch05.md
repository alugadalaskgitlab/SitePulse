---
name: Guided DPR workflow rules
description: Durable rules for Guided DPR draft routing, autosave suppression, entry-mode default, and site-scoped plant-usage linking.
---

- **Entry-mode default changes only via the explicit "Set … as my default" control.** View-switch buttons are navigation-only. **Why:** silent default changes were a release blocker. **How to apply:** never add `setDprEntryMode` to a mount effect or switch button.
- **Field Home completeness must derive from the shared submit-readiness validator** — never a row-counting shortcut, never a third validator.
- **Autosave suppression:** clear a "new DPR" local blob only when it matches the server draft by draftId or normalized site+date; never globally. The autosave hook's debounced write can race a clear — defend by keying autosave off the server draft id once it exists AND running a delayed reconcile sweep. **Why:** a pending 1s debounce re-created the cleared blob and caused stale "restore draft?" nags.
- **Plant-usage discovery/closure must be site-authorized:** discovery without equipment ids requires a site param, must pass the shared permitted-sites check (same helper as DPR routes), and filters by normalized site; closure only touches usage open on the DPR's own date/site (fail closed). **Why:** unscoped discovery leaked cross-site data and let clients close arbitrary usage ids.
- Site labels: DPR `site` may carry " – Edited by …" suffixes; plant usage stores plain names — always compare via the strip-suffix normalizer / `getBaseSiteName`.
- Guided equipment readings/times are edited through the passthrough bag (blank input deletes the key — never fabricate ""/null) so the shared guided-equipment contract stays untouched. Duplicate machine entries are advisory-only, never a hard block.
