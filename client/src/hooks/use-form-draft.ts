import { useEffect, useRef, useCallback, useState } from "react";

/**
 * useFormDraft<T> — localStorage draft hook for forms that navigate away mid-fill.
 *
 * Handles three lifecycle phases automatically:
 *   1. Restore on mount / key change  — reads localStorage, calls onRestore if found
 *   2. Auto-save on change            — writes localStorage whenever memoised data changes
 *   3. Clear on save                  — call clearDraft() after a successful submit
 *
 * options.enabled      — gate the whole hook (e.g. only in edit mode)
 * options.initialized  — secondary auto-save gate; pass !isLoading to wait for server data
 *
 * Returns { clearDraft, wasRestoredRef, lastSavedAt, draftSavedAt } where wasRestoredRef is a ref (not state)
 * so that dependent effects in the same render flush read the correct synchronously-updated value.
 * This matches the original draftAppliedRef pattern and prevents the draft being overwritten
 * by a cached React Query result that arrives before state updates have applied.
 *
 * lastSavedAt is a Date | null that updates each time a draft is written to localStorage,
 * suitable for passing to <AutoSaveIndicator lastSavedAt={lastSavedAt} />.
 *
 * draftSavedAt is a Date | null set to the timestamp recorded when the draft was originally
 * auto-saved, so the restored-draft banner can show "Draft restored from X minutes ago".
 */

interface DraftEnvelope<T> {
  data: T;
  savedAt: string;
}

export function useFormDraft<T>(
  key: string,
  data: T,
  onRestore: (data: T) => void,
  options: { enabled?: boolean; initialized?: boolean } = {}
): { clearDraft: () => void; wasRestoredRef: React.MutableRefObject<boolean>; lastSavedAt: Date | null; draftSavedAt: Date | null } {
  const { enabled = true, initialized = true } = options;

  const wasRestoredRef = useRef(false);
  const selfInitializedRef = useRef(false);
  // justRestoredRef prevents autosave from writing pre-restore stale data in the same
  // commit that onRestore ran (state updates from onRestore are not yet reflected in data).
  const justRestoredRef = useRef(false);

  const onRestoreRef = useRef(onRestore);
  onRestoreRef.current = onRestore;

  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [draftSavedAt, setDraftSavedAt] = useState<Date | null>(null);

  // Declared before autosave so it runs first in the same flush — wasRestoredRef is then
  // synchronously correct when the population effect (or autosave) reads it.
  useEffect(() => {
    wasRestoredRef.current = false;
    justRestoredRef.current = false;
    selfInitializedRef.current = false;
    setDraftSavedAt(null);

    if (!enabled || !key) return;

    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw);
        // Support both new envelope format { data, savedAt } and legacy raw format
        if (parsed && typeof parsed === "object" && "data" in parsed && "savedAt" in parsed) {
          const envelope = parsed as DraftEnvelope<T>;
          onRestoreRef.current(envelope.data);
          const ts = new Date(envelope.savedAt);
          setDraftSavedAt(isNaN(ts.getTime()) ? null : ts);
        } else {
          // Legacy: raw data stored without envelope
          onRestoreRef.current(parsed as T);
        }
        wasRestoredRef.current = true;
        justRestoredRef.current = true;
      }
    } catch {}
    selfInitializedRef.current = true;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, key]);

  useEffect(() => {
    if (!enabled || !key || !selfInitializedRef.current || !initialized) return;
    if (justRestoredRef.current) {
      justRestoredRef.current = false;
      return;
    }
    try {
      const now = new Date();
      const envelope: DraftEnvelope<T> = { data, savedAt: now.toISOString() };
      localStorage.setItem(key, JSON.stringify(envelope));
      setLastSavedAt(now);
    } catch {}
  }, [enabled, key, data, initialized]);

  const clearDraft = useCallback(() => {
    if (!key) return;
    try { localStorage.removeItem(key); } catch {}
    wasRestoredRef.current = false;
    selfInitializedRef.current = false;
    justRestoredRef.current = false;
    setLastSavedAt(null);
    setDraftSavedAt(null);
  }, [key]);

  return { clearDraft, wasRestoredRef, lastSavedAt, draftSavedAt };
}
