// @vitest-environment jsdom
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { BetweenSheetsTab } from "../client/src/components/level-sheets/BetweenSheetsTab";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("compares without saving, defaults to overlap and prints metadata, quantities and signature lines", async () => {
  const fetcher = vi.fn(async () => new Response(JSON.stringify({
    lower: { layerName: "OGL", sheetDate: "2026-11-01", basis: "Own levels" },
    upper: { layerName: "WMM", sheetDate: "2026-11-02", basis: "Assumed or agreed" },
    rows: [{ chainageOursKm: 0.75, widthUsedM: 10, fillSqm: 3, cutSqm: 0, reason: null }],
    fillCum: 30, cutCum: 0, segments: 1, skipped: [0.76], gaps: [{ fromKm: 0.75, toKm: 0.85, distanceM: 100 }],
  }), { status: 200 }));
  vi.stubGlobal("fetch", fetcher);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><BetweenSheetsTab siteId={1} siteName="Fixture site"
    sheets={[1, 2].map(id => ({ id, layerName: id === 1 ? "OGL" : "WMM", sheetDate: "2026-11-01", status: "saved", readings: [{ chainageOursKm: 0.75 }, { chainageOursKm: 0.85 }] }))}
    settings={{ bookChainageSystem: "ours", consultantOffsetM: 250 }} projects={[]} /></QueryClientProvider>);
  fireEvent.change(screen.getByLabelText("Lower sheet"), { target: { value: "1" } });
  fireEvent.change(screen.getByLabelText("Upper sheet"), { target: { value: "2" } });
  expect(screen.getByPlaceholderText("0+750")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Compare sheets" }));
  expect(await screen.findByText("Fill: 30.0 cum · Cut: 0.0 cum")).toBeTruthy();
  expect(fetcher.mock.calls[0][0]).toBe("/api/level-sheets/quantities?lowerId=1&upperId=2&fromKm=0.75&toKm=0.85");
  expect(screen.getByText("0+760 — Not in both sheets — skipped")).toBeTruthy();
  expect(screen.getByText(/Gap of 100 m/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Print preview" }));
  expect(screen.getByText("Quantities print preview")).toBeTruthy();
  expect(screen.getByText("HLC signature / date")).toBeTruthy();
  expect(screen.getByText("Department signature / date")).toBeTruthy();
  expect(screen.getByText(/Assumed or agreed/)).toBeTruthy();
  expect(fetcher.mock.calls.every(call => call[1]?.method == null)).toBe(true);
});
