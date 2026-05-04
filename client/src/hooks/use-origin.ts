import { useSearch } from "wouter";

export type PlantTab = "operations" | "stock" | "reports" | "masters";

const PLANT_TAB_VALUES: ReadonlySet<string> = new Set([
  "operations",
  "stock",
  "reports",
  "masters",
]);

export function useOrigin() {
  const searchString = useSearch();
  const browserSearch = typeof window !== "undefined" ? window.location.search : "";
  const effectiveSearch = searchString || browserSearch;
  const sp = new URLSearchParams(effectiveSearch);
  const isFromPortal = sp.get("origin") === "portal";
  const urlTab = sp.get("tab");
  const urlRole = sp.get("role");

  const getBackLink = (defaultPath: string) => {
    return isFromPortal ? "/" : defaultPath;
  };

  const appendOrigin = (path: string) => {
    if (!isFromPortal) return path;
    const separator = path.includes("?") ? "&" : "?";
    return `${path}${separator}origin=portal`;
  };

  const getPlantBackLink = (
    opts: { defaultTab?: PlantTab; forceTab?: PlantTab; role?: string | null } = {},
  ): string => {
    if (isFromPortal) return "/";
    const tab = opts.forceTab
      ?? (urlTab && PLANT_TAB_VALUES.has(urlTab)
        ? urlTab
        : opts.defaultTab || "operations");
    const role = opts.role !== undefined ? opts.role : urlRole;
    const params = new URLSearchParams();
    params.set("tab", tab);
    if (role) params.set("role", role);
    return `/plant/dashboard?${params.toString()}`;
  };

  // Forwards the inbound `tab` (and `role`) onto a deeper-page URL so its
  // own Back link can read them and round-trip back to the same tab. If the
  // URL has no `tab`, falls back to `defaultTab` (the page's own home tab).
  const appendPlantContext = (
    path: string,
    opts: { defaultTab?: PlantTab; forceTab?: PlantTab } = {},
  ) => {
    const withOrigin = appendOrigin(path);
    const tab = opts.forceTab
      ?? (urlTab && PLANT_TAB_VALUES.has(urlTab) ? urlTab : opts.defaultTab);
    const extras: string[] = [];
    if (tab) extras.push(`tab=${tab}`);
    if (urlRole) extras.push(`role=${urlRole}`);
    if (extras.length === 0) return withOrigin;
    const sep = withOrigin.includes("?") ? "&" : "?";
    return `${withOrigin}${sep}${extras.join("&")}`;
  };

  return {
    isFromPortal,
    getBackLink,
    appendOrigin,
    getPlantBackLink,
    appendPlantContext,
  };
}
