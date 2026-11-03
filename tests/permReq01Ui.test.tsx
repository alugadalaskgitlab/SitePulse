// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RequirementCard } from "@/pages/SiteRequirementsList";

let actor: any;
let featureCheck: (feature: string, action: string) => boolean = () => false;
vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ user: actor, featureCan: (feature: string, action: string) => featureCheck(feature, action) }),
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
afterEach(() => { cleanup(); featureCheck = () => false; });
function open(
  actorInput: any,
  creator: number | null,
  revision = "original",
  authority = true,
  grants: (feature: string, action: string) => boolean = () => false,
  reqOverride: Record<string, any> = {},
) {
  actor = actorInput;
  featureCheck = grants;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><RequirementCard
    req={{ id: 11, date: "2026-10-09", submittedBy: creator, submittedByName: "Fixture",
      status: "approved", revisionStatus: revision, materials: [], equipment: [], labour: [], ...reqOverride }}
    canReview={false} canApproveRequirements={authority}
    canUpdateMaterials={grants("requirement_allocation_material", "allocate")}
    canUpdateEquipment={grants("requirement_allocation_equipment", "allocate")}
    canUpdateLabour={grants("requirement_allocation_labour", "allocate")}
    canUpdateImmediate={grants("site_requirements", "edit")}
    canViewMaterials={grants("requirement_allocation_material", "view")}
    canViewEquipment={grants("requirement_allocation_equipment", "view")}
    canViewLabour={grants("requirement_allocation_labour", "view")}
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

  it.each([
    ["materials", "requirement_allocation_material", "materialItems", "materials", "button-update-mat-11-0"],
    ["equipment", "requirement_allocation_equipment", "equipmentItems", "equipment", "button-update-eq-11-0"],
    ["labour", "requirement_allocation_labour", "labourItems", "labour", "button-update-lab-11-0"],
  ])("shows only the %s allocation status and edit control granted by its row", (category, feature, itemsKey, dataKey, buttonId) => {
    const line = category === "materials" ? { lineKey: "line-1", materialName: "WMM", qty: 5, uom: "MT" }
      : category === "equipment" ? { lineKey: "line-1", equipmentType: "Roller", numberRequired: 1 }
      : { lineKey: "line-1", labourType: "Mason", count: 2 };
    const requirement = {
      [dataKey]: [line],
      allocationStatus: { [itemsKey]: [{ lineKey: "line-1", status: "arranged", remarks: `${category}-allocation-secret` }] },
    };
    const grants = (checkedFeature: string, action: string) =>
      checkedFeature === feature && ((action === "view") || (action === "allocate"));

    open({ id: 8, isOwner: false }, 7, "original", false, grants, requirement);
    expect(screen.getByText(`${category}-allocation-secret`)).toBeTruthy();
    expect(screen.getByTestId(buttonId)).toBeTruthy();

    cleanup();
    open(
      { id: 8, isOwner: false },
      7,
      "original",
      false,
      (checkedFeature, action) => checkedFeature === feature && action === "view",
      requirement,
    );
    expect(screen.getByText(`${category}-allocation-secret`)).toBeTruthy();
    expect(screen.queryByTestId(buttonId)).toBeNull();

    cleanup();
    open({ id: 8, isOwner: false }, 7, "original", false, () => false, requirement);
    expect(screen.queryByText(`${category}-allocation-secret`)).toBeNull();
    expect(screen.queryByTestId(buttonId)).toBeNull();
  });
});
