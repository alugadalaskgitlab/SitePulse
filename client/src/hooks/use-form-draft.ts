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
 *   wasRestored — true if a draft was found and `onRestore` was called; lets the component
 *                 know it should not overwrite the restored state with fresh server data
 */
export function useFormDraft<T>(
  key: string,
  data: T,
  onRestore: (data: T) => void,
  options: { enabled?: boolean; initialized?: boolean } = {}
): { clearDraft: () => void; wasRestored: boolean } {
  const { enabled = true, initialized = true } = options;
  const [wasRestored, setWasRestored] = useState(false);
  const selfInitializedRef = useRef(false);

  const onRestoreRef = useRef(onRestore);
  onRestoreRef.current = onRestore;

  // Restore on mount, and whenever key or enabled changes.
  // Runs before the auto-save effect (declared first = earlier in the commit).
  useEffect(() => {
    if (!enabled || !key) {
      selfInitializedRef.current = false;
      return;
    }
    selfInitializedRef.current = false;
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw) as T;
        onRestoreRef.current(parsed);
        setWasRestored(true);
      }
    } catch {}
    selfInitializedRef.current = true;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, key]);

  // Auto-save whenever `data` changes. Guarded until:
  //   • the restore check has run (selfInitializedRef)
  //   • any external initialization gate has cleared (initialized prop)
  useEffect(() => {
    if (!enabled || !key || !selfInitializedRef.current || !initialized) return;
    try {
      localStorage.setItem(key, JSON.stringify(data));
    } catch {}
  }, [enabled, key, data, initialized]);

  const clearDraft = useCallback(() => {
    if (!key) return;
    try { localStorage.removeItem(key); } catch {}
    selfInitializedRef.current = false;
    setWasRestored(false);
  }, [key]);

  return { clearDraft, wasRestored };
}
