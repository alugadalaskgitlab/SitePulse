// @vitest-environment jsdom
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({ toast: vi.fn() }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: fixture.toast }) }));
vi.mock("@/lib/queryClient", () => ({ apiRequest: vi.fn() }));

import { LevelSheetEditor } from "@/components/level-sheets/LevelSheetEditor";

const bootstrap = {
  sites: [{ id: 1, name: "ALLADURG PWD ROAD TO PAMPAD" }],
  siteId: 1,
  projects: [{ id: 2, name: "FIXTURE PROJECT", siteId: 1, status: "active" }],
  boqProjectId: 2,
  items: [{ id: 3, itemCode: "GSB-01", displayName: "GSB", itemName: "Granular Sub-base", description: "WMM fixture", unit: "cum", layerConfig: {} }],
  personnel: [{ id: 4, name: "FIXTURE SURVEYOR", role: "Surveyor", isActive: 1 }],
  layerOptions: ["GSB", "WMM"],
  settings: { bookChainageSystem: "ours" as const, consultantOffsetM: 0 },
};

function renderEditor() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>
    <LevelSheetEditor
      siteId={1} bootstrap={bootstrap} sheetId={null} sheet={null}
      loadingSheet={false} sheetError={null} canCreate canEdit
      onBack={vi.fn()} onSave={vi.fn()} saving={false}
    />
  </QueryClientProvider>);
}

beforeEach(() => {
  fixture.toast.mockReset();
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/design?")) {
      return new Response(JSON.stringify({ rows: [
        { id: 1, chainageOursKm: 0, centreLevel: 100, crossfallLeftPct: 0, crossfallRightPct: 0, topWidthLeftM: 3, topWidthRightM: 3, source: "TYPED" },
        { id: 2, chainageOursKm: 0.01, centreLevel: 100, crossfallLeftPct: 0, crossfallRightPct: 0, topWidthLeftM: 3, topWidthRightM: 3, source: "TYPED" },
      ] }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    if (url.includes("/bootstrap")) return new Response(JSON.stringify(bootstrap), { status: 200, headers: { "Content-Type": "application/json" } });
    return new Response(JSON.stringify([]), { status: 200, headers: { "Content-Type": "application/json" } });
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("Level sheets screen", () => {
  it("shows the design/readings/results tabs and keeps editable point columns aligned", async () => {
    renderEditor();
    await screen.findByText("Design levels · GSB");
    fireEvent.mouseDown(screen.getByRole("tab", { name: "2. Readings" }), { button: 0 });
    const chainage = await screen.findByRole("textbox", { name: "Reading chainage 1" });
    expect((chainage as HTMLInputElement).value).toBe("0+000");

    fireEvent.click(screen.getByRole("button", { name: "Add point left of centre" }));
    fireEvent.click(screen.getByRole("button", { name: "Add point right of centre" }));
    const leftDistance = screen.getByRole("textbox", { name: /L point distance/ });
    const rightDistance = screen.getByRole("textbox", { name: /R point distance/ });
    fireEvent.change(leftDistance, { target: { value: "2,5" } });
    fireEvent.change(rightDistance, { target: { value: "2.5" } });
    expect((leftDistance as HTMLInputElement).value).toBe("2.5");
    expect((rightDistance as HTMLInputElement).value).toBe("2.5");

    fireEvent.change(screen.getByRole("textbox", { name: "Reading 1 L 2.5" }), { target: { value: "100,2" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Reading 1 CL 0" }), { target: { value: "100,1" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Reading 1 R 2.5" }), { target: { value: "100,2" } });

    fireEvent.mouseDown(screen.getByRole("tab", { name: "3. Results & quantities" }), { button: 0 });
    await screen.findByText("Results and quantities");
    expect(screen.getByText("Ours 0+000 · Consultant 0+000")).toBeTruthy();
    expect(screen.getByText("Cut:")).toBeTruthy();
  });

  it("requires TBM and back sight before converting filled RLs to staff readings", async () => {
    renderEditor();
    fireEvent.mouseDown(await screen.findByRole("tab", { name: "2. Readings" }), { button: 0 });
    fireEvent.change(await screen.findByRole("textbox", { name: "Reading 1 CL 0" }), { target: { value: "100" } });
    fireEvent.click(screen.getByRole("button", { name: "Enter staff readings" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Enter the TBM level and back sight");
    fireEvent.change(screen.getByRole("textbox", { name: "Known TBM RL" }), { target: { value: "99" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Back sight on TBM" }), { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: "Enter staff readings" }));
    await waitFor(() => expect((screen.getByRole("textbox", { name: "Reading 1 CL 0" }) as HTMLInputElement).value).toBe("0"));
  });
});
