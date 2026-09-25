import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "../../../client/src/lib/auth-context";
import { queryClient } from "../../../client/src/lib/queryClient";
import { PermissionsDialog } from "../../../client/src/pages/UserManagement";
import { emptyMatrix } from "../../../shared/permissions";
import "../../../client/src/index.css";

// Isolated synthetic API fixture: renders the production PermissionsDialog,
// never contacts or changes a live user's account.
const caseId = new URLSearchParams(location.search).get("case") ?? "A";
const matrix = emptyMatrix();
matrix.site_hub.export = true; // legacy alias; Access must show checked
matrix.dashboard.create = true; // hidden historical field must survive save
matrix.reports.view = true; // standalone compatibility report access
matrix.rmc_operations.view = true; // legacy RMC route compatibility
if (caseId === "E" && sessionStorage.getItem("perm01-fixture-save")) {
  Object.assign(matrix, JSON.parse(sessionStorage.getItem("perm01-fixture-save")!));
}
const user = {
  id: 41, fullName: "Matrix Fixture", email: "fixture@example.invalid", phone: null,
  isAdmin: false, isOwner: false, isFieldEngineer: false, isActive: true,
  notificationsEnabled: true, sessionPolicy: "sticky" as const,
  canManagePermissions: false, permissionManagerScope: null,
};
const admin = { ...user, id: 42, fullName: "Fixture Administrator", isAdmin: true };
const fixtureState = { writes: 0, saved: null as typeof matrix | null };
(window as Window & { perm01Fixture: typeof fixtureState }).perm01Fixture = fixtureState;
const originalFetch = window.fetch.bind(window);
window.fetch = async (input, init) => {
  const url = String(input);
  if (url === "/api/auth/me") return new Response(JSON.stringify({ user: admin, permissions: emptyMatrix() }));
  if (url === "/api/auth/users/41/permissions") {
    if (init?.method === "PUT") {
      const saved = JSON.parse(String(init.body));
      Object.assign(matrix, saved);
      sessionStorage.setItem("perm01-fixture-save", JSON.stringify(saved));
      fixtureState.writes += 1;
      fixtureState.saved = saved;
      return new Response(JSON.stringify({ ok: true, matrix }));
    }
    return new Response(JSON.stringify({ matrix, isAdmin: false }));
  }
  if (url === "/api/auth/users/41/site-access") return new Response(JSON.stringify({ siteIds: [], allSites: false }));
  if (url === "/api/sites") return new Response(JSON.stringify([]));
  return originalFetch(input, init);
};

createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <div className="min-h-screen bg-background p-8">
        <div className="mx-auto max-w-5xl text-sm text-muted-foreground">Isolated permissions UI fixture · state {caseId}</div>
        <PermissionsDialog userId={41} users={[user]} onClose={() => {}} />
      </div>
    </AuthProvider>
  </QueryClientProvider>,
);
if (caseId === "C" || caseId === "D" || caseId === "E") {
  const observer = new MutationObserver(() => {
    if (caseId === "E") {
      const access = document.querySelector<HTMLButtonElement>('[data-testid="checkbox-site_hub-access"]');
      const save = document.querySelector<HTMLButtonElement>('[data-testid="button-save-perms"]');
      if (access?.getAttribute("data-state") === "checked" && save) {
        access.click();
        setTimeout(() => save.click(), 20);
        observer.disconnect();
      }
      return;
    }
    const trigger = [...document.querySelectorAll("button")].find((b) => b.textContent?.includes("Legacy / Broad Keys"));
    if (trigger && trigger.getAttribute("data-state") === "closed") {
      trigger.click();
      observer.disconnect();
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
}