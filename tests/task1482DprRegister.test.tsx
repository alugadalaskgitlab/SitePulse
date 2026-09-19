// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import SiteDashboard from "@/pages/SiteDashboard";
import {
  dprMatchesReference,
  formatDprReference,
} from "@/lib/dprReference";

vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({
    isAdmin: false,
    sectionCan: () => true,
  }),
}));
vi.mock("@/lib/featureFlags", () => ({
  useFeatureFlags: () => ({ companyName: "Task 1482", logoFile: "" }),
}));
vi.mock("@/hooks/use-origin", () => ({
  useOrigin: () => ({
    getBackLink: () => "/site/hub",
    appendOrigin: (path: string) => path,
  }),
}));
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));
vi.mock("@/components/AttachmentGallery", () => ({
  AttachmentGallery: () => null,
}));

const rows = [
  {
    id: 41,
    originalDprId: 7,
    versionNumber: 2,
    site: "Draft Site",
    engineer: "Engineer One",
    date: "2026-08-01",
    dprStatus: "draft",
    workType: "road",
    isCancelled: false,
    isDeleted: false,
    progress: [],
    equipment: [],
    labour: [],
    materials: [],
  },
  {
    id: 42,
    originalDprId: 8,
    versionNumber: 3,
    isCurrentVersion: true,
    site: "Submitted Site",
    engineer: "Engineer Two",
    date: "2026-08-02",
    dprStatus: "submitted",
    workType: "structure",
    isCancelled: false,
    isDeleted: false,
    progress: [],
    structureItems: [],
    equipment: [],
    labour: [],
    materials: [],
  },
];

function renderDashboard() {
  const client = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        queryFn: async ({ queryKey }) => {
          const url = String(queryKey[0]);
          if (url === "/api/materials/suppliers") return [];
          throw new Error(`Unexpected query: ${url}`);
        },
      },
    },
  });
  const view = render(
    <QueryClientProvider client={client}>
      <SiteDashboard />
    </QueryClientProvider>,
  );
  return { ...view, client };
}

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  window.history.replaceState({}, "", "/site/reports");
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.startsWith("/api/dprs/with-details")) {
      return new Response(JSON.stringify(rows), { status: 200 });
    }
    if (url.startsWith("/api/plant-module/equipment")) {
      return new Response(JSON.stringify([]), { status: 200 });
    }
    if (url.startsWith("/api/attachments/counts")) {
      return new Response(JSON.stringify({}), { status: 200 });
    }
    throw new Error(`Unexpected fetch: ${url}`);
  }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("task 1482 DPR register references", () => {
  it("formats and matches only an exact saved record id", () => {
    expect(formatDprReference(41)).toBe("DPR-41");
    expect(dprMatchesReference(41, "DPR-41")).toBe(true);
    expect(dprMatchesReference(41, " 41 ")).toBe(true);
    expect(dprMatchesReference(41, "dpr - 41")).toBe(true);
    expect(dprMatchesReference(41, "DPR-4")).toBe(false);
    expect(dprMatchesReference(41, "not-a-reference")).toBe(false);
  });

  it("shows the exact saved id on draft, submitted, and current-version cards", async () => {
    renderDashboard();

    expect((await screen.findByTestId("reference-dpr-41")).textContent).toContain("DPR-41");
    expect(screen.getByTestId("badge-draft-41")).toBeTruthy();
    expect(screen.getByTestId("reference-dpr-42").textContent).toContain("DPR-42");
    expect(screen.getByTestId("card-report-42")).toBeTruthy();
    expect(screen.queryByText("DPR-7")).toBeNull();
    expect(screen.queryByText("DPR-8")).toBeNull();
  });

  it("filters by prefixed or bare id, persists it, and resets through the filter pipeline", async () => {
    renderDashboard();
    await screen.findByTestId("card-report-41");
    const input = screen.getByTestId("input-dpr-reference") as HTMLInputElement;

    fireEvent.change(input, { target: { value: "DPR-42" } });
    await waitFor(() => {
      expect(screen.queryByTestId("card-report-41")).toBeNull();
      expect(screen.getByTestId("card-report-42")).toBeTruthy();
    });
    await waitFor(() => {
      const saved = JSON.parse(window.localStorage.getItem("site-dashboard:dpr-filters:v2") || "{}");
      expect(saved.reference).toBe("DPR-42");
    });

    fireEvent.change(input, { target: { value: "41" } });
    await waitFor(() => {
      expect(screen.getByTestId("card-report-41")).toBeTruthy();
      expect(screen.queryByTestId("card-report-42")).toBeNull();
    });

    fireEvent.click(screen.getByTestId("button-reset-filters"));
    await waitFor(() => {
      expect(input.value).toBe("");
      expect(screen.getByTestId("card-report-41")).toBeTruthy();
      expect(screen.getByTestId("card-report-42")).toBeTruthy();
    });
  });

  it("lets the reference URL parameter override a persisted search", async () => {
    window.localStorage.setItem(
      "site-dashboard:dpr-filters:v2",
      JSON.stringify({ reference: "DPR-42" }),
    );
    window.history.replaceState({}, "", "/site/reports?reference=DPR-41");

    renderDashboard();

    expect(await screen.findByTestId("card-report-41")).toBeTruthy();
    expect(screen.queryByTestId("card-report-42")).toBeNull();
    expect((screen.getByTestId("input-dpr-reference") as HTMLInputElement).value).toBe("DPR-41");
  });
});