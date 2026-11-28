// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
const fx = vi.hoisted(() => ({ owner: true, edit: false, api: vi.fn(), toast: vi.fn(), invalidate: vi.fn() }));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ user: { isOwner: fx.owner }, sectionCan: (_s: string, action: string) => action === "edit" && fx.edit }) }));
vi.mock("@/lib/queryClient", () => ({ apiRequest: fx.api, queryClient: { invalidateQueries: fx.invalidate } }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: fx.toast }) }));
vi.mock("@/components/AttachmentViewer", () => ({ AttachmentViewer: () => null, getSafeAttachmentObjectPath: (path: string) => path }));
import { AttachmentGrid } from "../client/src/components/AttachmentGallery";
afterEach(() => { cleanup(); vi.resetAllMocks(); fx.owner = true; fx.edit = false; });
function show() { render(<QueryClientProvider client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}>
  <AttachmentGrid items={[{ id: 17, moduleType: "diesel_purchase", fileName: "wrong.pdf", objectPath: "/objects/fixture.pdf", isLinked: true } as any]} moduleType="diesel_purchase" linkedRecordId={501} />
</QueryClientProvider>); }
it("confirms shared deletion once, naming its other places, then resends explicitly", async () => {
  fx.api.mockRejectedValueOnce(new Error('409: {"code":"ATTACHMENT_REFERENCED","message":"Confirm deletion","places":[{"label":"Receipt RECV/DSL/26-27/0066"}]}')).mockResolvedValue({});
  show(); fireEvent.click(screen.getByTestId("button-delete-attachment-17"));
  expect(await screen.findByText("This file is also shown on Receipt RECV/DSL/26-27/0066. Delete it from all of them?")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Delete", exact: true }));
  await waitFor(() => expect(fx.api).toHaveBeenCalledWith("DELETE", "/api/attachments/17?confirmShared=true"));
  expect(fx.toast).not.toHaveBeenCalled();
});
it("shows plain server messages, never raw JSON", async () => {
  fx.api.mockRejectedValue(new Error('403: {"message":"Edit permission required"}'));
  show(); fireEvent.click(screen.getByTestId("button-delete-attachment-17"));
  await waitFor(() => expect(fx.toast).toHaveBeenCalledWith(expect.objectContaining({ description: "Edit permission required" })));
});
it("hides the bin without Edit and shows it for an editor without Delete", () => {
  fx.owner = false; show(); expect(screen.queryByTestId("button-delete-attachment-17")).toBeNull();
  cleanup(); fx.edit = true; show(); expect(screen.getByTestId("button-delete-attachment-17")).toBeTruthy();
});
