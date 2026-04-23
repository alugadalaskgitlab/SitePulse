import { useEffect, useRef, useState } from "react";

export interface UsePersistedFiltersOptions {
  /**
   * If false, the hook will skip hydrating from localStorage on mount and
   * keep the supplied `initial` value instead. Use this so URL parameters
   * (or any other authoritative source) can win over the saved set, e.g.
   * pass `shouldHydrate: !urlHasFilterParams`.
   *
   * Subsequent value changes are still persisted regardless, so the next
   * URL-param-less visit can restore the latest set.
   */
  shouldHydrate?: boolean;
}

/**
 * Persist a piece of filter state in localStorage so the page can re-open
 * with the user's last-used filter values. The storage key carries an
 * explicit schema version (callers should bump the suffix, e.g.
 * `":v1"` -> `":v2"`, whenever the shape of T changes incompatibly).
 *
 * Behaviour:
 *  - On first render returns `initial`.
 *  - After mount, if a stored value exists and `shouldHydrate` is not
 *    false, hydrates state by merging the stored object onto `initial`
 *    (so newly added optional keys keep their defaults).
 *  - On every state change after that, writes the new value back to
 *    localStorage.
 *  - All storage interactions are wrapped in try/catch so quota errors,
 *    disabled storage and corrupt JSON degrade gracefully.
 */
export function usePersistedFilters<T extends Record<string, unknown>>(
  storageKey: string,
  initial: T,
  options: UsePersistedFiltersOptions = {},
) {
  const { shouldHydrate = true } = options;
  const [value, setValue] = useState<T>(initial);
  const hydratedRef = useRef(false);

  useEffect(() => {
    if (hydratedRef.current) return;
    hydratedRef.current = true;
    if (typeof window === "undefined") return;
    if (!shouldHydrate) return;
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<T>;
      if (parsed && typeof parsed === "object") {
        setValue((prev) => ({ ...prev, ...parsed }));
      }
    } catch {
      /* corrupt storage — ignore and keep defaults */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!hydratedRef.current) return;
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(value));
    } catch {
      /* storage full / disabled — ignore */
    }
  }, [storageKey, value]);

  const reset = () => {
    try {
      if (typeof window !== "undefined") {
        window.localStorage.removeItem(storageKey);
      }
    } catch {
      /* ignore */
    }
    setValue(initial);
  };

  return [value, setValue, reset] as const;
}
