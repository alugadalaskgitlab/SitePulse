// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import RateCards from "@/pages/RateCards";

vi.mock("wouter", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useSearch: () => "",
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({
    user: { id: 1, isOwner: true },
    featureCan: (_feature: string, _action: string) => true,
  }),
}));
vi.mock("@/components/ui/select", async () => {
  const React = await import("react");
  return {
    Select: ({ value, onValueChange, children }: any) => {
      const parts = React.Children.toArray(children) as any[];
      return <select value={value} onChange={event => onValueChange(event.target.value)}>{parts[1]}</select>;
    },
    SelectTrigger: () => null,
    SelectValue: () => null,
    SelectContent: ({ children }: any) => <>{children}</>,
    SelectItem: ({ value, children }: any) => <option value={value}>{children}</option>,
  };
});

const conflictKey = "vendor:2:MATERIAL:SOIL:TRIP";
const tidyPreview = {
  previewVersion: "test-version",
  sameRateGroups: [{
    key: "vendor:2:MATERIAL:20MM:MT",
    vendorId: 2,
    vendorName: "VENDOR ALPHA",
    identity: "MATERIAL:20MM:MT",
    category: "material",
    itemKey: "MAT_20MM_MT",
    itemLabel: "20 MM",
    unit: "MT",
    sameRate: true,
    keeperId: 11,
    rows: [
      { id: 11, vendorName: "VENDOR ALPHA", vendorId: 2, category: "material", itemKey: "MAT_20MM_MT", itemLabel: "20 MM", unit: "MT", rate: 390 },
      { id: 12, vendorName: "ALPHA OLD", vendorId: 2, category: "material", itemKey: "MAT_20_MM_MT", itemLabel: "20 MM", unit: "MT", rate: 390 },
    ],
  }],
  conflictingGroups: [{
    key: conflictKey,
    vendorId: 2,
    vendorName: "VENDOR ALPHA",
    identity: "MATERIAL:SOIL:TRIP",
    category: "material",
    itemKey: "MAT_SOIL_TRIP",
    itemLabel: "SOIL",
    unit: "TRIP",
    sameRate: false,
    keeperId: 20,
    rows: [
      { id: 20, vendorName: "VENDOR ALPHA", vendorId: 2, category: "material", itemKey: "MAT_SOIL_TRIP", itemLabel: "SOIL", unit: "TRIP", rate: 800 },
      { id: 21, vendorName: "VENDOR ALPHA", vendorId: 2, category: "material", itemKey: "MAT_SOIL_TRIP", itemLabel: "SOIL", unit: "TRIP", rate: 1450 },
    ],
  }],
  unlinkedGroups: [{
    key: "OLD SUPPLIER",
    savedName: "OLD SUPPLIER",
    savedNames: ["OLD SUPPLIER"],
    rows: [{ id: 31, vendorName: "OLD SUPPLIER", vendorId: null, category: "material", itemKey: "MAT_SAND_CFT", itemLabel: "SAND", unit: "CFT", rate: 100 }],
  }],
  possibleMatches: {
    11: { billNo: "HLC/VB/2026/0030", billDate: "2026-05-13", description: "20 MM", unit: "MT", rate: 390 },
  },
};

function createClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        queryFn: async ({ queryKey }) => {
          const response = await fetch(queryKey.join("/"), { credentials: "include" });
          if (!response.ok) throw new Error("query failed");
          return response.json();
        },
      },
      mutations: { retry: false },
    },
  });
}

beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: vi.fn() });
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === "/api/vendor-rate-cards/tidy-preview") return new Response(JSON.stringify(tidyPreview));
    if (url === "/api/vendor-master") return new Response(JSON.stringify([{ id: 2, name: "VENDOR ALPHA", isActive: true }]));
    if (url === "/api/vendor-aliases") return new Response(JSON.stringify([]));
    if (url === "/api/vendor-bills/vendor-names") return new Response(JSON.stringify(["OLD SUPPLIER"]));
    if (url.startsWith("/api/vendor-rate-cards?")) return new Response(JSON.stringify([]));
    if (url === "/api/equipment-master/canonical-types") return new Response(JSON.stringify([]));
    if (url === "/api/plant-module/materials") return new Response(JSON.stringify([]));
    if (url === "/api/vendor-rate-cards/link-name" && init?.method === "POST") return new Response(JSON.stringify({ linkedRows: 1, vendorName: "VENDOR ALPHA" }));
    if (url === "/api/vendor-rate-cards/tidy-apply" && init?.method === "POST") return new Response(JSON.stringify({ mergedRows: 1, deferredConflicts: 1 }));
    throw new Error(`Unexpected request ${url}`);
  }));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Owner Rate Cards tidy preview", () => {
  it("shows same-rate merges, no default conflict choice, and keeps possible bill matches as hints", async () => {
    render(<QueryClientProvider client={createClient()}><RateCards /></QueryClientProvider>);
    expect(await screen.findByTestId("unlinked-rate-name-OLD SUPPLIER")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Add as new vendor" })).toHaveAttribute(
      "href",
      "/masters/vendors?create=1&name=OLD%20SUPPLIER",
    );
    fireEvent.click(screen.getByRole("button", { name: "Preview Tidy" }));

    expect(await screen.findByText(/Same rate — will be merged/)).toBeInTheDocument();
    expect(screen.getByText(/Hint only; not proof of usage and not a default/)).toBeInTheDocument();
    const decision = await screen.findByTestId(`select-tidy-decision-${conflictKey}`);
    expect(decision).toHaveValue("");
    expect(screen.getByRole("button", { name: "Apply Tidy" })).toBeDisabled();

    fireEvent.change(decision, { target: { value: "defer" } });
    fireEvent.change(screen.getByTestId("input-rate-tidy-reason"), { target: { value: "Owner reviewed duplicates" } });
    expect(screen.getByRole("button", { name: "Apply Tidy" })).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: "Apply Tidy" }));
    await waitFor(() => expect(fetch).toHaveBeenCalledWith("/api/vendor-rate-cards/tidy-apply", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({
        previewVersion: "test-version",
        reason: "Owner reviewed duplicates",
        decisions: [{ key: conflictKey, action: "defer" }],
      }),
    })));
  });

  it("does not link an unlinked vendor name until an Owner selects a master and gives a reason", async () => {
    render(<QueryClientProvider client={createClient()}><RateCards /></QueryClientProvider>);
    const group = await screen.findByTestId("unlinked-rate-name-OLD SUPPLIER");
    const link = within(group).getByRole("button", { name: "Link to vendor" });
    expect(link).toBeDisabled();
    const vendorSelect = within(group).getByTestId("select-link-rate-vendor-OLD SUPPLIER");
    await waitFor(() => expect(vendorSelect.querySelector('option[value="2"]')).not.toBeNull());
    fireEvent.change(vendorSelect, { target: { value: "2" } });
    expect(link).toBeDisabled();
    fireEvent.change(within(group).getByTestId("input-link-rate-reason-OLD SUPPLIER"), { target: { value: "Verified supplier identity" } });
    expect(link).toBeEnabled();
    fireEvent.click(link);
    await waitFor(() => expect(fetch).toHaveBeenCalledWith("/api/vendor-rate-cards/link-name", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ nameKey: "OLD SUPPLIER", vendorId: 2, reason: "Verified supplier identity" }),
    })));
  });

  it("keeps Apply disabled for a custom choice until a positive new rate is entered", async () => {
    render(<QueryClientProvider client={createClient()}><RateCards /></QueryClientProvider>);
    fireEvent.click(screen.getByRole("button", { name: "Preview Tidy" }));
    const decision = await screen.findByTestId(`select-tidy-decision-${conflictKey}`);
    fireEvent.change(decision, { target: { value: "custom" } });
    fireEvent.change(screen.getByTestId("input-rate-tidy-reason"), { target: { value: "Owner set corrected rate" } });
    const apply = screen.getByRole("button", { name: "Apply Tidy" });
    expect(apply).toBeDisabled();
    fireEvent.change(screen.getByTestId(`input-tidy-custom-rate-${conflictKey}`), { target: { value: "975" } });
    expect(apply).toBeEnabled();
    fireEvent.click(apply);
    await waitFor(() => expect(fetch).toHaveBeenCalledWith("/api/vendor-rate-cards/tidy-apply", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({
        previewVersion: "test-version",
        reason: "Owner set corrected rate",
        decisions: [{ key: conflictKey, action: "custom", rate: 975 }],
      }),
    })));
  });
});
