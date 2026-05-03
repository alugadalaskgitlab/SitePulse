import { useEffect, useRef, useCallback, useState } from "react";

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
 *   clearDraft  — call this on successful submit to remove the stored draft
 *   wasRestored — true if a draft was found and `onRestore` was called for the CURRENT key;
 *                 automatically reset to false when enabled/key changes (e.g. on navigation)
 */
export function useFormDraft<T>(
  key: string,
  data: T,
  onRestore: (data: T) => void,
  options: { enabled?: boolean; initialized?: boolean } = {}
): { clearDraft: () => void; wasRestored: boolean } {
  const { enabled = true, initialized = true } = options;
  const [wasRestored, setWasRestored] = useState(false);

  // selfInitializedRef: true once the restore check has finished for the current key.
  const selfInitializedRef = useRef(false);
  // justRestoredRef: true during the same effect flush that called onRestore.
  // Prevents the autosave effect from writing the pre-restore (stale) `data`
  // snapshot back to localStorage in the same commit.
  const justRestoredRef = useRef(false);

  const onRestoreRef = useRef(onRestore);
  onRestoreRef.current = onRestore;

  // Restore on mount, and whenever key or enabled changes.
  // Always resets wasRestored first so stale true values never carry across
  // navigation to a different date/record/key.
  useEffect(() => {
    // Reset everything for the new key / disabled state.
    justRestoredRef.current = false;
    selfInitializedRef.current = false;
    setWasRestored(false);

    if (!enabled || !key) return;

    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw) as T;
        onRestoreRef.current(parsed);
        justRestoredRef.current = true;
        setWasRestored(true);
      }
    } catch {}
    selfInitializedRef.current = true;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, key]);

  // Auto-save whenever `data` changes. Guarded until:
  //   • the restore check has run (selfInitializedRef)
  //   • any external initialization gate has cleared (initialized prop)
  //   • this is not the same render flush that just called onRestore
  //     (justRestoredRef prevents writing pre-restore stale data back over a good draft)
  useEffect(() => {
    if (!enabled || !key || !selfInitializedRef.current || !initialized) return;
    if (justRestoredRef.current) {
      // Same flush as restore — skip. Clear the flag so the next render
      // (which will carry the restored data) saves correctly.
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
    selfInitializedRef.current = false;
    justRestoredRef.current = false;
    setWasRestored(false);
  }, [key]);

  return { clearDraft, wasRestored };
}
