// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RequirementCard } from "@/pages/SiteRequirementsList";

let actor: any;
vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ user: actor }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
afterEach(cleanup);
function open(actorInput: any, creator: number | null, revision = "original", authority = true) {
  actor = actorInput;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><RequirementCard
    req={{ id: 11, date: "2026-10-09", submittedBy: creator, submittedByName: "Fixture",
      status: "approved", revisionStatus: revision, materials: [], equipment: [], labour: [] }}
    canReview={false} canApproveRequirements={authority}
    canUpdateMaterials={false} canUpdateEquipment={false} canUpdateLabour={false} canUpdateImmediate={false}
    filterContext="site" allReqs={[]}
  /></QueryClientProvider>);
  fireEvent.click(screen.getByTestId("toggle-requirement-11"));
}
describe("PERM-REQ-01 actual requirement card", () => {
  it("explains and disables self approval for an Administrator", () => {
    open({ id: 7, isAdmin: true, isOwner: false }, 7);
    expect(screen.getByTestId("approval-block-11").textContent).toBe("You cannot approve or reject a requirement you created.");
    fireEvent.click(screen.getByTestId("button-review-11"));
    expect((screen.getByTestId("button-save-status-11") as HTMLButtonElement).disabled).toBe(true);
  });
  it.each([
    [{ id: 7, isOwner: false }, 7, true],
    [{ id: 7, isAdmin: true, isOwner: false }, 7, true],
    [{ id: 7, isOwner: true }, 7, false],
    [{ id: 8, isOwner: false }, 7, false],
    [{ id: 7, isOwner: true }, null, true],
  ])("revision buttons respect actual Owner and known creator: %j %s", (user, creator, blocked) => {
    open(user, creator as number | null, "revision_requested");
    expect((screen.getByTestId("button-approve-revision-11") as HTMLButtonElement).disabled).toBe(blocked);
    expect((screen.getByTestId("button-reject-revision-11") as HTMLButtonElement).disabled).toBe(blocked);
    expect(screen.queryByTestId("button-set-alloc-11")).toBeNull();
  });
  it("does not expose approval controls without authority", () => {
    open({ id: 8 }, 7, "revision_requested", false);
    expect(screen.queryByTestId("button-approve-revision-11")).toBeNull();
    expect(screen.queryByTestId("button-review-11")).toBeNull();
  });
  it("explains unknown historical creators even to Owner", () => {
    open({ id: 7, isOwner: true }, null);
    expect(screen.getByTestId("approval-block-11").textContent).toContain("creator is unknown");
  });
});
