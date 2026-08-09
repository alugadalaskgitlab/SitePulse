// @vitest-environment jsdom
/**
 * Batch 03 — Confirmed Working Reach Edit / Revision flow.
 *
 * Spec §11 coverage in this file:
 *  A/B  Edit on a CONFIRMED working reach opens a POPULATED revision form
 *       (heading "Revise confirmed scope record", every field retained).
 *  C/E  Saving the revision issues PATCH on the existing record (the server's
 *       supersede-and-revise path) — never POST (which would create an
 *       unrelated new reach).
 *  F    Cancel fires no mutation; reopening Edit shows the confirmed values.
 *  G    Editing a DRAFT reach stays a plain in-place edit ("Edit draft scope
 *       record" / "Save changes"), populated.
 *  H    No-Scope confirmed revision flow unchanged (same populated revision
 *       form).
 *  D/J/K/L  Source-contract assertions: revision = NEW id + old row kept as
 *       superseded (storage supersede-and-revise branch); confirming a
 *       revision re-points earthworkArrangements.scopeSegmentIds old→new;
 *       the Arrangement register flags (never silently drops) a linked reach
 *       that is no longer confirmed.
 *  I    Reconciliation untouched — no scope formula was modified in this
 *       batch; existing projectScope032 tests remain the guard.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { readFileSync } from "fs";
import ScopeSetup from "../client/src/pages/ScopeSetup";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";

const project = { id: 2, name: "Takkadpally", chainageFrom: "0", chainageTo: "3.8", corridorConfirmed: 1 };

const confirmedReach = {
  id: 13, boqProjectId: 2, segmentType: "working_reach", status: "confirmed",
  chainageFrom: "2.5000", chainageTo: "3.8000", side: "lhs", label: "reach 3",
  applicability: "all_linear", categoryIds: null, itemIds: null,
  reason: "handed over", effectiveFrom: null, deptReference: null,
  withdrawalOrderRef: null, notes: "handover done", revisionOf: 10,
};
const draftReach = {
  ...confirmedReach, id: 14, status: "draft", label: "reach 4",
  chainageFrom: "0.0000", chainageTo: "0.9000", side: null, revisionOf: null,
};
const confirmedNoScope = {
  ...confirmedReach, id: 12, segmentType: "no_scope", label: null,
  chainageFrom: "2.1000", chainageTo: "2.4000", side: null,
  reason: "existing CC road", revisionOf: 11,
};

let fetchCalls: { url: string; method: string; body?: any }[] = [];

function stubFetch(segments: any[], extra: { categories?: any[]; items?: any[] } = {}) {
  fetchCalls = [];
  vi.stubGlobal("fetch", vi.fn(async (url: any, init?: any) => {
    const u = String(url);
    const method = (init?.method ?? "GET").toUpperCase();
    fetchCalls.push({ url: u, method, body: init?.body ? JSON.parse(init.body) : undefined });
    if (method === "PATCH" || method === "POST") {
      return new Response(JSON.stringify({ id: 99, revised: true }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    const body =
      u.endsWith("/scope-segments") ? segments :
      u.endsWith("/scope-reconciliation") ? null :
      u.endsWith("/categories") ? (extra.categories ?? []) :
      u.endsWith("/items") ? (extra.items ?? []) :
      u.endsWith("/projects/2") ? project : null;
    return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
  }));
}

function renderPage() {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false, queryFn: async ({ queryKey }) => (await fetch(queryKey.join("/"))).json() },
      mutations: { retry: false },
    },
  });
  const { hook } = memoryLocation({ path: "/work-program/2/scope" });
  return render(
    <QueryClientProvider client={qc}>
      <Router hook={hook}><ScopeSetup /></Router>
    </QueryClientProvider>,
  );
}

const heading = () => screen.getByTestId("text-scope-form-heading").textContent;
const chainageInputs = () => screen.getAllByPlaceholderText(/e\.g\. 2\./) as HTMLInputElement[];

beforeEach(() => { cleanup(); });

describe("A/B — confirmed working reach Edit opens populated revision form", () => {
  it("loads every saved field, revision heading and note shown", async () => {
    stubFetch([confirmedReach]);
    renderPage();
    await screen.findByText("reach 3");
    fireEvent.click(screen.getByTitle("Edit (creates a revision)"));
    expect(heading()).toBe("Revise confirmed scope record");
    expect(screen.getByTestId("text-revision-note").textContent).toMatch(/kept as superseded history/);
    const [from, to] = chainageInputs();
    expect(from.value).toBe("2.5000");
    expect(to.value).toBe("3.8000");
    expect((screen.getByPlaceholderText("e.g. Reach 2") as HTMLInputElement).value).toBe("reach 3");
    expect((screen.getByPlaceholderText("reason") as HTMLInputElement).value).toBe("handed over");
    // side hydrated (select renders its label)
    expect(screen.getAllByText("LHS").length).toBeGreaterThan(0);
    // save button is the revision action, not "Save as draft"
    expect(screen.getByText("Create revision")).toBeTruthy();
  });
});

describe("C/E — saving a confirmed-reach revision PATCHes the existing record", () => {
  it("issues PATCH /api/boq/scope-segments/13 and never POST", async () => {
    stubFetch([confirmedReach]);
    renderPage();
    await screen.findByText("reach 3");
    fireEvent.click(screen.getByTitle("Edit (creates a revision)"));
    fireEvent.click(screen.getByText("Create revision"));
    await waitFor(() => expect(fetchCalls.some(c => c.method !== "GET")).toBe(true));
    const writes = fetchCalls.filter(c => c.method !== "GET");
    expect(writes).toHaveLength(1);
    expect(writes[0].method).toBe("PATCH");
    expect(writes[0].url).toBe("/api/boq/scope-segments/13");
    // body retains the confirmed record's values (no field loss on revision)
    expect(writes[0].body).toMatchObject({
      segmentType: "working_reach",
      chainageFrom: 2.5, chainageTo: 3.8,
      side: "lhs", label: "reach 3", reason: "handed over",
      applicability: "all_linear", notes: "handover done",
    });
  });
});

describe("B2 — category-restricted reach hydrates applicability controls", () => {
  it("shows 'Only selected categories' with the saved categories ticked, and PATCH retains them", async () => {
    const catReach = { ...confirmedReach, applicability: "categories", categoryIds: "[3,7]" };
    stubFetch([catReach], { categories: [{ id: 3, name: "Earthwork" }, { id: 7, name: "GSB" }, { id: 8, name: "WMM" }] });
    renderPage();
    await screen.findByText("reach 3");
    fireEvent.click(screen.getByTitle("Edit (creates a revision)"));
    // checkboxes hydrated from saved JSON id list
    const earthwork = (await screen.findByText("Earthwork")).querySelector("input") as HTMLInputElement;
    const gsb = screen.getByText("GSB").querySelector("input") as HTMLInputElement;
    const wmm = screen.getByText("WMM").querySelector("input") as HTMLInputElement;
    expect(earthwork.checked).toBe(true);
    expect(gsb.checked).toBe(true);
    expect(wmm.checked).toBe(false);
    fireEvent.click(screen.getByText("Create revision"));
    await waitFor(() => expect(fetchCalls.some(c => c.method === "PATCH")).toBe(true));
    const patch = fetchCalls.find(c => c.method === "PATCH")!;
    expect(patch.body).toMatchObject({ applicability: "categories", categoryIds: [3, 7] });
  });
});

describe("F — cancel makes no data change; reopening shows confirmed values", () => {
  it("no write request on cancel; reopened form repopulated", async () => {
    stubFetch([confirmedReach]);
    renderPage();
    await screen.findByText("reach 3");
    fireEvent.click(screen.getByTitle("Edit (creates a revision)"));
    const [from] = chainageInputs();
    fireEvent.change(from, { target: { value: "9.999" } });
    fireEvent.click(screen.getByText("Cancel"));
    expect(fetchCalls.filter(c => c.method !== "GET")).toHaveLength(0);
    fireEvent.click(screen.getByTitle("Edit (creates a revision)"));
    expect(chainageInputs()[0].value).toBe("2.5000"); // fresh hydration, no leak
  });
});

describe("G — draft working reach editing unchanged (in-place, no revision)", () => {
  it("shows draft heading + Save changes, populated", async () => {
    stubFetch([draftReach]);
    renderPage();
    await screen.findByText("reach 4");
    fireEvent.click(screen.getByTitle("Edit draft"));
    expect(heading()).toBe("Edit draft scope record");
    expect(screen.queryByTestId("text-revision-note")).toBeNull();
    expect(screen.getByText("Save changes")).toBeTruthy();
    expect(chainageInputs()[0].value).toBe("0.0000");
  });
});

describe("H — confirmed No-Scope revision flow unchanged", () => {
  it("opens the same populated revision form", async () => {
    stubFetch([confirmedNoScope]);
    renderPage();
    await screen.findByText(/existing CC road/);
    fireEvent.click(screen.getByTitle("Edit (creates a revision)"));
    expect(heading()).toBe("Revise confirmed scope record");
    expect(chainageInputs()[0].value).toBe("2.1000");
  });
});

// ── D / J / K / L — revision identity & reference integrity (source contract) ──
describe("D/J/K/L — revision id + arrangement reference behaviour", () => {
  const storage = readFileSync("server/storage.ts", "utf8");
  const routes = readFileSync("server/routes.ts", "utf8");
  const register = readFileSync("client/src/pages/ExecutionArrangements.tsx", "utf8");

  it("J/D — confirmed edit creates a NEW row (revisionOf link) and keeps the old row as superseded — never in-place mutation", () => {
    const branch = storage.slice(storage.indexOf("async updateProjectScopeSegment"));
    expect(branch).toContain('if (existing.status === "confirmed")');
    expect(branch).toContain("revisionOf: existing.id");
    expect(branch).toContain('status: "draft"');
    expect(branch).toContain('.set({ status: "superseded"');
  });

  it("K — confirming the revision re-points earthworkArrangements.scopeSegmentIds from the superseded id to the new id", () => {
    expect(routes).toContain("repointArrangementScopeLinks(Number((segment as any).revisionOf), segment.id)");
    const fn = routes.slice(routes.indexOf("async function repointArrangementScopeLinks"));
    expect(fn).toContain("x === oldSegId ? newSegId : x");
  });

  it("L — Arrangement register flags a linked reach that is no longer confirmed instead of silently failing", () => {
    expect(register).toContain('s.status === "confirmed" ? name : `${name} (${s.status})`');
    // unknown id still renders a stable placeholder, never a crash/blank
    expect(register).toContain("`Reach #${id}`");
  });
});
