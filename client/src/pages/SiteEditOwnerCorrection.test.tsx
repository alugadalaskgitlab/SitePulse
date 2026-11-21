// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import SiteEdit from "./SiteEdit";

const fixture = vi.hoisted(() => ({
  dpr: null as any,
  items: [] as any[],
}));

vi.mock("wouter", async (importOriginal) => {
  const actual = await importOriginal<typeof import("wouter")>();
  return {
    ...actual,
    useRoute: () => [true, { id: "413" }],
    useLocation: () => ["/site/edit/413", vi.fn()],
  };
});

vi.mock("@/hooks/use-dprs", () => ({
  useDpr: () => ({ data: fixture.dpr, isLoading: false }),
}));

vi.mock("@/hooks/use-dpr-boq-items", () => ({
  useDprBoqItems: () => ({
    projectId: 12,
    siteResolutionError: null,
    items: fixture.items,
    catalogueItems: [],
    projectsLoaded: true,
    projectsLoading: false,
    projectsError: null,
    itemsLoaded: true,
    itemsLoading: false,
    itemsError: null,
    evidenceProjectId: null,
    requestEvidenceRecovery: vi.fn(),
  }),
}));

vi.mock("@/hooks/use-dpr-corrections", () => ({
  useDprCorrections: () => ({
    history: { data: [], isLoading: false, error: null, refetch: vi.fn() },
    preview: { data: null, isPending: false, mutateAsync: vi.fn() },
    save: { isPending: false, mutateAsync: vi.fn() },
    decide: { isPending: false, mutateAsync: vi.fn() },
    withdraw: { isPending: false, mutateAsync: vi.fn() },
  }),
}));

vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({
    user: { id: 9001, isOwner: true, isAdmin: true, fullName: "Development Test Owner" },
    featureCan: () => true,
  }),
}));

vi.mock("@/lib/featureFlags", () => ({
  useFeatureFlags: () => ({ companyShortName: "HLC" }),
}));

vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/hooks/use-upload", () => ({ useUpload: () => ({ uploadFile: vi.fn(), isUploading: false }) }));
vi.mock("@/hooks/use-resource-suggestions", () => ({ useResourceSuggestions: () => undefined }));

vi.mock("@/components/ChainageOverlapGuard", () => ({
  useChainageOverlapContext: () => ({ priors: [] }),
  useChainageOverlapHits: () => new Map(),
  ChainageOverlapWarning: () => null,
}));

vi.mock("@/components/ui/select", async (importOriginal) => {
  const React = await import("react");
  const actual = await importOriginal<typeof import("@/components/ui/select")>();
  return {
    ...actual,
    Select: ({ children }: any) => React.createElement("div", null, children),
    SelectTrigger: ({ children, ...props }: any) => React.createElement("button", { type: "button", ...props }, children),
    SelectValue: ({ placeholder, children }: any) => React.createElement("span", null, children ?? placeholder),
    SelectContent: ({ children }: any) => React.createElement("div", { role: "listbox" }, children),
    SelectItem: ({ value, children }: any) => React.createElement("div", { role: "option", "data-value": value }, children),
  };
});

function response(body: unknown) {
  return { ok: true, status: 200, json: async () => body } as Response;
}

function dprFixture(boqItemId: number | null) {
  return {
    id: 413,
    date: "2026-11-20",
    site: "TEST SITE",
    engineer: "Fixture Engineer",
    workType: "road",
    dprStatus: "submitted",
    boqProjectId: 12,
    progress: [{
      id: 4101,
      entryKey: "tests-edit-progress-4101",
      activity: "Wet mix macadam",
      side: "LHS",
      chainageFrom: "0+000",
      chainageTo: "0+100",
      quantity: 100,
      uom: "SQM",
      boqItemId,
      personnelIds: [],
    }],
    equipment: [],
    labour: [],
    materials: [],
    sitePurchases: [],
    siteActivities: [],
    structureItems: [],
  };
}

describe("SiteEdit Owner correction item list", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    sessionStorage.clear();
  });

  it.each([
    ["an unlinked saved progress line", null],
    ["a saved line that is already linked", 501],
  ])("renders BOQ item names for %s without crashing", async (_description, savedItemId) => {
    fixture.dpr = dprFixture(savedItemId);
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn().mockImplementation((media: string) => ({
        matches: false,
        media,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
    const boqItem = {
      id: 501,
      itemCode: "WMM-01",
      itemName: "Wet mix macadam",
      displayName: "Wet mix macadam",
      description: "Providing and laying wet mix macadam",
      unit: "cum",
      isActive: true,
    };
    fixture.items = [boqItem];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/sites") return response([{ id: 7, name: "TEST SITE", isActive: 1 }]);
      if (url.startsWith("/api/boq/projects?siteId=7")) {
        return response([{ id: 12, name: "TEST BOQ PROJECT", siteId: 7, itemCount: 1 }]);
      }
      if (url === "/api/boq/projects/12/items") return response([boqItem]);
      return response([]);
    }));

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><SiteEdit /></QueryClientProvider>);

    const itemSelect = await screen.findByTestId("select-owner-correction-item-4101");
    expect(screen.getByTestId("owner-dpr-project-item-correction")).toBeTruthy();
    if (savedItemId == null) expect(screen.getByText("Not linked")).toBeTruthy();

    fireEvent.click(itemSelect);
    await waitFor(() => expect(screen.getByRole("option", { name: /WMM-01.*Wet mix macadam/ })).toBeTruthy());
  });
});
