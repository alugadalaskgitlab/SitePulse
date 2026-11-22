// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";

const mocks = vi.hoisted(() => ({
  dispatches: [] as any[],
  parties: [
    { id: 3, name: "Test Party", dispatchProSiteId: "site-12" },
    { id: 5, name: "One-off Party", dispatchProSiteId: null },
  ],
  templates: [
    { id: 4, name: "BC Mix", mixType: "BC", bitumenPercent: 5.2, partyId: 3 },
    { id: 6, name: "WMM Mix", mixType: "WMM", bitumenPercent: 0, partyId: 5 },
  ],
  empty: [] as any[],
  featureCan: vi.fn((_feature: string, action: string) => action !== "verify"),
  toast: vi.fn(),
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: (options: { queryKey?: unknown[] }) => {
    const key = options.queryKey?.[0];
    if (key === "/api/plant-module/dispatches") return { data: mocks.dispatches, isLoading: false };
    if (key === "/api/plant-module/parties") return { data: mocks.parties, isLoading: false };
    if (key === "/api/plant-module/mix-templates") return { data: mocks.templates, isLoading: false };
    return { data: mocks.empty, isLoading: false };
  },
  useMutation: (options: any) => ({
    isPending: false,
    mutate: vi.fn((variables: any) => {
      if (options.onSuccess) {
        void options.onSuccess({ dispatch: { id: 900, ...variables } }, variables);
      }
    }),
    mutateAsync: vi.fn(),
  }),
}));

vi.mock("wouter", () => ({
  Link: ({ href, children }: any) => <a href={href}>{children}</a>,
  useLocation: () => ["/plant/dispatches", vi.fn()],
  useSearch: () => "",
}));
vi.mock("@/lib/queryClient", () => ({
  apiRequest: vi.fn(),
  queryClient: { invalidateQueries: vi.fn() },
}));
vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({
    featureCan: mocks.featureCan,
    sectionCan: () => false,
    user: { id: 901, fullName: "Plant operator", isOwner: false, isAdmin: false },
  }),
}));
vi.mock("@/lib/featureFlags", () => ({
  useFeatureFlags: () => ({ companyName: "Test Company", companyShortName: "Test", logoFile: "" }),
}));
vi.mock("@/hooks/use-origin", () => ({ useOrigin: () => ({ getPlantBackLink: () => "/plant" }) }));
vi.mock("@/hooks/use-before-unload", () => ({ useBeforeUnload: () => ({ confirmLeave: vi.fn() }) }));
vi.mock("@/hooks/use-persisted-filters", () => ({
  usePersistedFilters: (_key: string, initial: any) => [initial, vi.fn(), vi.fn()],
}));
vi.mock("@/hooks/use-autosave", () => ({
  useAutosave: () => ({
    hasDraft: false,
    draftAge: null,
    lastSavedAt: null,
    isDirty: false,
    restoreDraft: vi.fn(),
    discardDraft: vi.fn(),
    clearDraft: vi.fn(),
  }),
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock("@/components/EditPermissionButton", () => ({ EditPermissionButton: () => null }));
vi.mock("@/components/AutoSaveIndicator", () => ({ AutoSaveIndicator: () => null }));
vi.mock("@/components/DraftRestoreBanner", () => ({ DraftRestoreBanner: () => null }));
vi.mock("@/components/InsufficientPlantStockDialog", () => ({ InsufficientPlantStockDialog: () => null }));

import PlantDispatches from "../client/src/pages/PlantDispatches";

describe("PLANT-01 operator dispatch entry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.dispatches.length = 0;
    mocks.featureCan.mockImplementation((_feature, action) => action !== "verify");
    window.history.replaceState({}, "", "/plant/dispatches");
    Object.defineProperties(HTMLElement.prototype, {
      hasPointerCapture: { configurable: true, value: vi.fn(() => false) },
      setPointerCapture: { configurable: true, value: vi.fn() },
      releasePointerCapture: { configurable: true, value: vi.fn() },
      scrollIntoView: { configurable: true, value: vi.fn() },
    });
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as any;
  });

  afterEach(() => cleanup());

  it("keeps actual consumption fields off and does not confirm the first truck", async () => {
    render(<PlantDispatches />);
    fireEvent.click(screen.getByTestId("button-add-dispatch"));

    expect(screen.getByTestId("input-truck-number")).toBeTruthy();
    expect(screen.getByTestId("input-load-weight")).toBeTruthy();
    expect(screen.getByTestId("section-dispatch-party-mix")).toBeTruthy();
    expect(screen.getByTestId("select-dispatch-party").getAttribute("aria-required")).toBe("true");
    expect(screen.getByTestId("select-mix-template").getAttribute("aria-required")).toBe("true");
    expect(screen.getByTestId("button-save-dispatch").hasAttribute("disabled")).toBe(true);
    expect(screen.queryByTestId("input-actual-bitumen")).toBeNull();
    expect(screen.queryByTestId("input-actual-ldo")).toBeNull();
    expect(screen.getByTestId("button-dispatch-more-details")).toBeTruthy();
    fireEvent.click(screen.getByTestId("select-dispatch-party"));
    fireEvent.click(await screen.findByRole("option", { name: /Test Party/ }));
    expect(screen.queryByTestId("dialog-party-change-confirmation")).toBeNull();
  });

  it("defaults party, mix and bitumen tank from today's latest dispatch", () => {
    const today = new Date().toISOString().slice(0, 10);
    mocks.dispatches.push({
      id: 77,
      date: today,
      time: "16:20",
      plantName: "HMP Plant",
      partyId: 3,
      mixTemplateId: 4,
      truckNumber: "TG12UH4799",
      loadWeight: 18,
      bitumenTankNumber: 2,
      ldoTankNumber: 1,
    });
    render(<PlantDispatches />);
    fireEvent.click(screen.getByTestId("button-add-dispatch"));

    expect(screen.getByTestId("text-dispatch-defaults").textContent).toContain("Test Party");
    expect(screen.getByTestId("text-dispatch-defaults").textContent).toContain("BC Mix");
    expect(screen.getByTestId("text-dispatch-defaults").textContent).toContain("Bitumen tank 2");
    expect(screen.getByTestId("text-dispatch-party-name")).toHaveClass("font-bold");
    expect(screen.getByTestId("text-dispatch-party-name").textContent).toBe("Test Party");
    expect(screen.getByTestId("text-party-alert-status").textContent).toBe("Alerts to site: on");
    expect(screen.queryByTestId("select-dispatch-party")).toBeNull();
    fireEvent.click(screen.getByTestId("button-change-dispatch-party-mix"));
    expect(screen.getByTestId("select-dispatch-party")).toBeTruthy();
    expect(screen.getByTestId("select-mix-template")).toBeTruthy();
  });

  it("asks before changing from the previous truck's party and restores it on Go back", async () => {
    const today = new Date().toISOString().slice(0, 10);
    mocks.dispatches.push({
      id: 77,
      date: today,
      time: "16:20",
      plantName: "HMP Plant",
      partyId: 3,
      mixTemplateId: 4,
      truckNumber: "TG12UH4799",
      loadWeight: 18,
    });
    render(<PlantDispatches />);
    fireEvent.click(screen.getByTestId("button-add-dispatch"));
    fireEvent.click(screen.getByTestId("button-change-dispatch-party-mix"));
    fireEvent.click(screen.getByTestId("select-dispatch-party"));
    fireEvent.click(await screen.findByRole("option", { name: /One-off Party/ }));

    expect(screen.getByTestId("dialog-party-change-confirmation")).toBeInTheDocument();
    expect(screen.getByTestId("text-party-change-confirmation").textContent)
      .toContain("This truck is for One-off Party, the last truck was for Test Party. Continue?");

    fireEvent.click(screen.getByTestId("button-party-change-go-back"));
    expect(screen.queryByTestId("dialog-party-change-confirmation")).toBeNull();
    expect(screen.getByTestId("text-dispatch-party-name").textContent).toBe("Test Party");
  });

  it("does not ask again when the selected party matches the previous truck and shows link status", async () => {
    const today = new Date().toISOString().slice(0, 10);
    mocks.dispatches.push({
      id: 78,
      date: today,
      time: "16:20",
      plantName: "HMP Plant",
      partyId: 3,
      mixTemplateId: 4,
      truckNumber: "TG12UH4799",
      loadWeight: 18,
    });
    render(<PlantDispatches />);
    fireEvent.click(screen.getByTestId("button-add-dispatch"));
    expect(screen.getByTestId("text-party-alert-status").textContent).toBe("Alerts to site: on");
    fireEvent.click(screen.getByTestId("button-change-dispatch-party-mix"));
    fireEvent.click(screen.getByTestId("select-dispatch-party"));
    fireEvent.click(await screen.findByRole("option", { name: /Test Party/ }));
    expect(screen.queryByTestId("dialog-party-change-confirmation")).toBeNull();

    fireEvent.click(screen.getByTestId("select-dispatch-party"));
    expect(await screen.findByText("Not linked — no site alert")).toBeInTheDocument();
  });

  it("uses a confirmed one-off party for the next truck without asking again", async () => {
    const today = new Date().toISOString().slice(0, 10);
    mocks.dispatches.push({
      id: 79,
      date: today,
      time: "16:20",
      plantName: "HMP Plant",
      partyId: 3,
      mixTemplateId: 4,
      truckNumber: "TG12UH4799",
      loadWeight: 18,
    });
    render(<PlantDispatches />);
    fireEvent.click(screen.getByTestId("button-add-dispatch"));
    fireEvent.click(screen.getByTestId("button-change-dispatch-party-mix"));
    fireEvent.click(screen.getByTestId("select-dispatch-party"));
    fireEvent.click(await screen.findByRole("option", { name: /One-off Party/ }));
    fireEvent.click(screen.getByTestId("button-party-change-confirm"));
    fireEvent.click(screen.getByTestId("select-mix-template"));
    fireEvent.click(await screen.findByRole("option", { name: /WMM Mix/ }));
    fireEvent.click(screen.getByTestId("input-truck-number"));
    fireEvent.change(screen.getByTestId("input-truck-search"), { target: { value: "TEMPTRUCK01" } });
    fireEvent.click(await screen.findByTestId("button-use-custom-truck"));
    fireEvent.change(screen.getByTestId("input-load-weight"), { target: { value: "10" } });
    fireEvent.click(screen.getByTestId("button-save-dispatch"));

    await waitFor(() => expect(screen.getByTestId("text-dispatch-party-name").textContent).toBe("One-off Party"));
    expect(screen.getByTestId("text-dispatch-mix-tank").textContent).toContain("WMM Mix");
    fireEvent.click(screen.getByTestId("button-change-dispatch-party-mix"));
    fireEvent.click(screen.getByTestId("select-dispatch-party"));
    fireEvent.click(await screen.findByRole("option", { name: /One-off Party/ }));
    expect(screen.queryByTestId("dialog-party-change-confirmation")).toBeNull();
  });
});
