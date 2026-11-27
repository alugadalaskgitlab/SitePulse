// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { EditUserDialog } from "@/pages/UserManagement";
import { getQueryFn } from "@/lib/queryClient";

vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({
  user: { id: 1, isOwner: true }, refresh: vi.fn(), featureCan: () => true,
}) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it.each([390, 768, 1366])("keeps Edit person actions outside the scrolling form at %ipx", async width => {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
  vi.spyOn(window, "confirm").mockReturnValue(true);
  const requests: any[] = [];
  vi.stubGlobal("fetch", vi.fn(async (input, init) => {
    requests.push({ path: String(input), method: init?.method ?? "GET" });
    return new Response(JSON.stringify(String(input).endsWith("/feature-access")
      ? { roleIds: [], roles: [], rolesConfigured: true }
      : String(input).endsWith("/site-access") ? { siteIds: [], allSites: false } : []));
  }));
  const onClose = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, queryFn: getQueryFn({ on401: "throw" }) } } });
  render(<QueryClientProvider client={client}><EditUserDialog userId={41} users={[{
    id: 41, fullName: "Fixture person", email: "fixture@example.invalid", phone: null,
    isAdmin: false, isFieldEngineer: false, isActive: true, notificationsEnabled: true,
    sessionPolicy: "strict", canManagePermissions: false, permissionManagerScope: null, entryScope: "own", reportsToUserId: null,
  }]} onClose={onClose} /></QueryClientProvider>);
  const dialog = screen.getByRole("dialog");
  expect(dialog.className).toContain("max-h-[calc(100dvh-1rem)]");
  expect(dialog.className).toContain("flex-col");
  const form = screen.getByTestId("edit-person-scroll-area");
  expect(form.className).toContain("overflow-y-auto");
  expect(form.className).toContain("min-h-0");
  const cancel = screen.getByTestId("button-edit-cancel");
  const save = screen.getByTestId("button-edit-save");
  expect(form.contains(save)).toBe(false);
  expect(form.contains(cancel)).toBe(false);
  expect(save.parentElement?.className).toContain("shrink-0");
  fireEvent.change(screen.getByTestId("input-edit-fullname"), { target: { value: "Changed fixture" } });
  await waitFor(() => expect((save as HTMLButtonElement).disabled).toBe(false));
  fireEvent.change(screen.getByTestId("input-edit-fullname"), { target: { value: "Fixture person" } });
  fireEvent.click(cancel);
  expect(onClose).toHaveBeenCalledOnce();
  expect(requests.every(request => request.method === "GET")).toBe(true);
  client.clear();
});
