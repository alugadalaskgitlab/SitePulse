import { useState } from "react";

export function usePersistedFilters<T extends Record<string, unknown>>(_key: string, defaults: T) {
  const [filters, setFilters] = useState(defaults);
  return [filters, setFilters, async () => setFilters(defaults)] as const;
}