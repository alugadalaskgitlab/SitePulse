import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "../../../client/src/lib/auth-context";
import Home from "../../../client/src/pages/Home";
import "../../../client/src/index.css";

// Fully synthetic, read-only fixture of the production Home component.
// Browser-local time is frozen per scenario; no requests reach the app API.
const evening = new URLSearchParams(location.search).get("time") === "late";
const fixedTime = new Date(evening ? "2026-09-26T19:30:00" : "2026-09-26T09:30:00");
const NativeDate = Date;
class FixtureDate extends NativeDate {
  constructor(...args: any[]) {
    super(0);
    return Reflect.construct(NativeDate, args.length ? args : [fixedTime.getTime()], new.target);
  }
  static now() { return fixedTime.getTime(); }
}
globalThis.Date = FixtureDate as DateConstructor;
localStorage.setItem("sitelog.workspaceMode.u901", "classic");

const sites = [
  { id: 11, name: "SYNTHETIC FILED SITE", isActive: 1 },
  { id: 12, name: "SYNTHETIC DRAFT SITE", isActive: 1 },
  { id: 13, name: "SYNTHETIC WAITING SITE", isActive: 1 },
  { id: 14, name: "SYNTHETIC INACTIVE SITE", isActive: 0 },
];
const todayDprs = [
  { id: 101, date: "2026-09-26", site: "SYNTHETIC FILED SITE", engineer: "Demo Engineer", dprStatus: "submitted" },
  { id: 102, date: "2026-09-26", site: "SYNTHETIC FILED SITE", engineer: "Demo Engineer", dprStatus: "draft" },
  { id: 103, date: "2026-09-26", site: "SYNTHETIC DRAFT SITE", engineer: "Demo Engineer", dprStatus: "draft" },
];
const originalFetch = window.fetch.bind(window);
window.fetch = async (input, init) => {
  const url = new URL(typeof input === "string" ? input : input.url, location.origin);
  if (url.pathname === "/api/auth/me") return Response.json({
    user: { id: 901, email: "home-fixture@example.invalid", fullName: "Synthetic Manager", isAdmin: false, isOwner: false, isActive: true, isFieldEngineer: false, sessionPolicy: "sticky" },
    permissions: { site_dprs: { view: true }, site_hub: { view: true } },
  });
  if (url.pathname === "/api/sites") return Response.json(sites);
  if (url.pathname === "/api/dprs") return Response.json(todayDprs);
  if (url.pathname === "/api/dprs/with-details") return Response.json(todayDprs.filter((d) => d.dprStatus === "submitted"));
  if (url.pathname === "/api/config") return Response.json({ rmcEnabled: false, licensedModules: [] });
  if (url.pathname.startsWith("/api/")) return Response.json([]);
  return originalFetch(input, init);
};
const client = new QueryClient({ defaultOptions: { queries: {
  retry: false,
  queryFn: async ({ queryKey }) => {
    const response = await fetch(queryKey[0] as string);
    if (!response.ok) throw new Error(`Fixture API failed: ${response.status}`);
    return response.json();
  },
} } });
createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={client}>
    <AuthProvider>
      <div className="p-3 bg-amber-100 text-amber-950 font-bold">
        HOME-01 Part A · SYNTHETIC DATA · production Home component · {evening ? "19:30 local" : "09:30 local"} · no live API
      </div>
      <Home />
    </AuthProvider>
  </QueryClientProvider>,
);