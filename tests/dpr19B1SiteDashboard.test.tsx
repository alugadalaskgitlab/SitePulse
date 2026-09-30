// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import SiteDashboard from "@/pages/SiteDashboard";
import type { DprReadinessIssue } from "@shared/dprSubmitReadiness";

const setLocation = vi.fn();
let editAllowed = true;
let rows: any[] = [];

vi.mock("wouter", async (importOriginal) => {
  const actual = await importOriginal<typeof import("wouter")>();
  return { ...actual, useLocation: () => ["/site/reports", setLocation] };
});
vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({
    isAdmin: false,
    sectionCan: (_section: string, action: string) => action === "edit" ? editAllowed : true,
  }),
}));
vi.mock("@/lib/featureFlags", () => ({
  useFeatureFlags: () => ({ companyName: "DPR", logoFile: "" }),
}));
vi.mock("@/hooks/use-origin", () => ({
  useOrigin: () => ({
    getBackLink: () => "/site/hub",
    appendOrigin: (path: string) => `${path}${path.includes("?") ? "&" : "?"}from=site-reports&site=Road%20A`,
  }),
}));
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));
vi.mock("@/components/AttachmentGallery", () => ({
  AttachmentGallery: () => null,
}));

const issue = (message: string, section: DprReadinessIssue["section"] = "materials"): DprReadinessIssue =>
  ({ section, label: "Row 1", message });

function row(id: number, overrides: Record<string, unknown> = {}) {
  return {
    id, site: "Road A", engineer: "Engineer", date: "2026-08-01",
    dprStatus: "draft", isCancelled: false, isDeleted: false,
    workType: "road", progress: [], equipment: [], labour: [], materials: [],
    ...overrides,
  };
}

function mount() {
  const client = new QueryClient({
    defaultOptions: { queries: {
      retry: false,
      queryFn: async ({ queryKey }) => {
        if (queryKey[0] === "/api/materials/suppliers") return [];
        throw new Error(`Unexpected query ${queryKey[0]}`);
      },
    } },
  });
  return render(<QueryClientProvider client={client}><SiteDashboard /></QueryClientProvider>);
}

beforeEach(() => {
  editAllowed = true;
  rows = [];
  setLocation.mockReset();
  window.localStorage.clear();
  window.sessionStorage.clear();
  window.history.replaceState({}, "", "/site/reports");
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.startsWith("/api/dprs/with-details")) return new Response(JSON.stringify(rows), { status: 200 });
    if (url.startsWith("/api/plant-module/equipment")) return new Response("[]", { status: 200 });
    if (url.startsWith("/api/attachments/counts")) return new Response("{}", { status: 200 });
    throw new Error(`Unexpected fetch: ${url}`);
  }));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("DPR19 B1 dashboard readiness", () => {
  it("shows Draft badge and material-outcome blocker even with no pending equipment closing", async () => {
    rows = [row(101, { draftReadiness: {
      state: "blocked",
      mandatory: [issue("Select an excavation material outcome"), issue("Provide quantity", "activities")],
      advisories: [],
    } })];
    mount();
    expect((await screen.findByTestId("badge-draft-101")).textContent).toContain("Draft");
    expect(screen.getByTestId("badge-draft-101").textContent).not.toContain("not submitted");
    expect(screen.getByTestId("badge-readiness-101").textContent).toBe("Not ready");
    expect(screen.getByTestId("readiness-reason-101").textContent).toContain("Select an excavation material outcome (+1 more)");
    expect(screen.queryByTestId("badge-pending-closing-101")).toBeNull();
    expect(screen.getByTestId("button-fix-101")).toBeTruthy();
    expect(screen.queryByTestId("button-complete-101")).toBeNull();
  });

  it("stacks the card header and full-width reason/actions on narrow screens", async () => {
    rows = [row(112, { draftReadiness: {
      state: "blocked", mandatory: [issue("Record whether the excavated material is fully reusable, partly reusable, or unusable.")],
      advisories: [],
    } })];
    mount();
    const reason = await screen.findByTestId("readiness-reason-112");
    expect(screen.getByTestId("header-report-112").className).toContain("flex-col md:flex-row");
    expect(screen.getByTestId("actions-report-112").className).toContain("w-full");
    expect(screen.getByTestId("actions-report-112").className).toContain("md:w-auto");
    expect(reason.className).toContain("break-words w-full");
    expect(reason.parentElement?.className).toContain("w-full");
    expect(screen.getByTestId("button-fix-112")).toBeTruthy();
  });

  it("shows pending closing as information and routes Fix through the draft hub, preserving dashboard state", async () => {
    rows = [row(102, {
      equipment: [{ machine: "Roller", openingReading: 10, closingReading: null }],
      draftReadiness: { state: "blocked", mandatory: [issue("Enter closing reading", "equipment")], advisories: [] },
    })];
    mount();
    await screen.findByTestId("button-fix-102");
    expect(screen.getByTestId("badge-pending-closing-102").textContent).toContain("Pending Closing (1)");
    fireEvent.click(screen.getByTestId("button-expand-102"));
    fireEvent.click(screen.getByTestId("button-fix-102"));
    expect(setLocation).toHaveBeenCalledWith("/site/edit/102?from=site-reports&site=Road%20A");
    expect(setLocation.mock.calls[0][0]).not.toContain("complete=true");
    expect(JSON.parse(window.sessionStorage.getItem("siteDashboardState")!)).toEqual({
      expandedReports: [102], scrollY: window.scrollY,
    });
  });

  it("does not show Fix for ready or advisory-only drafts even if closing is pending", async () => {
    rows = [
      row(103, { draftReadiness: { state: "ready", mandatory: [], advisories: [] },
        equipment: [{ machine: "Roller", openingReading: 10, closingReading: null }] }),
      row(104, { draftReadiness: { state: "ready", mandatory: [], advisories: [issue("Check machine usage")] } }),
    ];
    mount();
    await screen.findByTestId("card-report-104");
    expect(screen.getByTestId("badge-pending-closing-103")).toBeTruthy();
    expect(screen.getByTestId("badge-readiness-103").textContent).toBe("No readiness blockers");
    expect(screen.getByTestId("badge-readiness-104").textContent).toBe("No readiness blockers");
    expect(screen.queryByTestId("button-fix-103")).toBeNull();
    expect(screen.queryByTestId("button-fix-104")).toBeNull();
  });

  it("reports missing or unavailable readiness as unavailable, never ready or actionable", async () => {
    rows = [row(105), row(106, { draftReadiness: { state: "unavailable", mandatory: [], advisories: [] } })];
    mount();
    await screen.findByTestId("card-report-106");
    for (const id of [105, 106]) {
      expect(screen.getByTestId(`badge-readiness-${id}`).textContent).toBe("Readiness unavailable");
      expect(screen.queryByTestId(`button-fix-${id}`)).toBeNull();
    }
  });

  it("never applies draft readiness actions to submitted, cancelled or deleted reports", async () => {
    const blocked = { state: "blocked", mandatory: [issue("Enter quantity")], advisories: [] };
    rows = [
      row(107, { dprStatus: "submitted", draftReadiness: blocked }),
      row(108, { isCancelled: true, draftReadiness: blocked }),
      row(109, { isDeleted: true, draftReadiness: blocked }),
    ];
    mount();
    await screen.findByTestId("card-report-109");
    for (const id of [107, 108, 109]) {
      expect(screen.queryByTestId(`badge-draft-${id}`)).toBeNull();
      expect(screen.queryByTestId(`badge-readiness-${id}`)).toBeNull();
      expect(screen.queryByTestId(`button-fix-${id}`)).toBeNull();
    }
  });

  it("retains the Draft badge on a superseded draft but ignores stale readiness and Fix", async () => {
    rows = [row(111, {
      isSuperseded: true,
      draftReadiness: { state: "blocked", mandatory: [issue("Enter quantity")], advisories: [] },
    })];
    mount();
    expect((await screen.findByTestId("badge-draft-111")).textContent).toContain("Draft");
    expect(screen.queryByTestId("badge-readiness-111")).toBeNull();
    expect(screen.queryByTestId("readiness-reason-111")).toBeNull();
    expect(screen.queryByTestId("button-fix-111")).toBeNull();
  });

  it("displays reasons but not the privileged Fix action for view-only users", async () => {
    editAllowed = false;
    rows = [row(110, { draftReadiness: { state: "blocked", mandatory: [issue("Record material outcome")], advisories: [] } })];
    mount();
    await screen.findByTestId("readiness-reason-110");
    expect(screen.getByTestId("readiness-reason-110").textContent).toContain("Record material outcome");
    expect(screen.queryByTestId("button-fix-110")).toBeNull();
  });
});