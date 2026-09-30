export function useOrigin() {
  // DPR19 B1 renders the actual SiteDashboard, which reads getBackLink and
  // forwards portal origin on Fix. Keep all older fixture routes' no-op origin.
  const dashboard = typeof window !== "undefined" && window.location.pathname === "/site/dashboard"
    && new URLSearchParams(window.location.search).get("dpr19b1") === "1";
  const portal = dashboard && new URLSearchParams(window.location.search).get("origin") === "portal";
  return {
    origin: "field",
    getBackLink: (path: string) => portal ? "/" : path,
    appendOrigin: (path: string) => portal ? `${path}${path.includes("?") ? "&" : "?"}origin=portal` : path,
    getPlantBackLink: () => "/plant",
  };
}