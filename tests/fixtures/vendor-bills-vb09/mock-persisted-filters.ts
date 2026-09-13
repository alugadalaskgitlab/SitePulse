import { useState, type Dispatch, type SetStateAction } from "react";

export function usePersistedFilters<T>(
  _key: string,
  defaults: T,
  _options?: { shouldHydrate?: boolean },
): [T, Dispatch<SetStateAction<T>>, () => void] {
  const [value, setValue] = useState(defaults);
  return [value, setValue, () => setValue(defaults)];
}