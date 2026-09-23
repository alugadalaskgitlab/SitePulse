import { useState } from "react";

export function usePersistedFilters<T extends Record<string, unknown>>(_key: string, initial: T) {
  const [value, setValue] = useState(initial);
  return [value, setValue, () => setValue(initial)] as const;
}