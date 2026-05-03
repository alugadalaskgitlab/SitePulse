import { useEffect, useRef, useCallback } from "react";

/**
 * useFormDraft — lightweight localStorage-based form draft hook.
 *
 * Encapsulates three lifecycle behaviours so individual forms don't need to
 * duplicate the ~80-line effect pattern:
 *   1. Restore on mount / key change   — reads localStorage and applies data
 *   2. Auto-save on change             — writes localStorage whenever `data` changes
 *   3. Clear on save                   — call `clearDraft()` after a successful submit
 *
 * @param key        localStorage key (may be dynamic, e.g. `"sl-draft:${date}:${plant}"`)
 * @param data       Memoised snapshot of the current form state (only changes when fields change)
 * @param onRestore  Callback invoked with the restored data object to re-hydrate the form
 * @param options.enabled      Gate the entire hook (e.g. only in edit mode). Defaults to true.
 * @param options.initialized  Secondary gate for auto-save — use to wait for server data to
 *                             load before saving starts (e.g. pass `!isLoading`). Defaults to true.
 *
 * Returns:
 *   clearDraft     — call on successful submit to remove the stored draft
 *   wasRestoredRef — ref whose .current is synchronously true if a draft was restored for
 *                    the current key; automatically reset when enabled/key changes so that
 *                    dependent effects (e.g. server-data population) always read the correct
 *                    value even when React Query has already cached data (isLoading=false).
 *                    Using a ref (not state) is intentional: it must be readable synchronously
 *                    by other effects in the same render flush, which state cannot guarantee.
 */
export function useFormDraft<T>(
  key: string,
  data: T,
  onRestore: (data: T) => void,
  options: { enabled?: boolean; initialized?: boolean } = {}
): { clearDraft: () => void; wasRestoredRef: React.MutableRefObject<boolean> } {
  const { enabled = true, initialized = true } = options;

  // wasRestoredRef: persistent across renders until clearDraft or enabled/key change.
  // Read synchronously by dependent effects (e.g. server-data population).
  const wasRestoredRef = useRef(false);
  // selfInitializedRef: true once the restore check has completed for the current key.
  const selfInitializedRef = useRef(false);
  // justRestoredRef: transient — set true by the restore effect, cleared by the autosave
  // effect on its first run after restore. Prevents writing pre-restore stale `data`
  // (state updates from onRestore are not yet applied) over a valid draft.
  const justRestoredRef = useRef(false);

  const onRestoreRef = useRef(onRestore);
  onRestoreRef.current = onRestore;

  // Restore on mount, and whenever key or enabled changes.
  // Declared BEFORE the autosave effect so it runs first in the same flush,
  // meaning wasRestoredRef.current is synchronously correct when other effects read it.
  useEffect(() => {
    // Reset all flags for the new key / disabled state.
    wasRestoredRef.current = false;
    justRestoredRef.current = false;
    selfInitializedRef.current = false;

    if (!enabled || !key) return;

    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw) as T;
        onRestoreRef.current(parsed);
        wasRestoredRef.current = true;
        justRestoredRef.current = true;
      }
    } catch {}
    selfInitializedRef.current = true;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, key]);

  // Auto-save whenever `data` changes. Guarded until:
  //   • restore check has run (selfInitializedRef)
  //   • any external initialization gate has cleared (initialized prop)
  //   • not the same render cycle that just called onRestore (justRestoredRef),
  //     because `data` still reflects the pre-restore state at that point
  useEffect(() => {
    if (!enabled || !key || !selfInitializedRef.current || !initialized) return;
    if (justRestoredRef.current) {
      // Same commit as restore — pre-restore data is still in `data`. Skip this
      // write and clear the flag so the next render (which carries restored data) saves.
      justRestoredRef.current = false;
      return;
    }
    try {
      localStorage.setItem(key, JSON.stringify(data));
    } catch {}
  }, [enabled, key, data, initialized]);

  const clearDraft = useCallback(() => {
    if (!key) return;
    try { localStorage.removeItem(key); } catch {}
    wasRestoredRef.current = false;
    selfInitializedRef.current = false;
    justRestoredRef.current = false;
  }, [key]);

  return { clearDraft, wasRestoredRef };
}
