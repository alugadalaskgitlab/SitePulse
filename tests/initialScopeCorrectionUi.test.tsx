// @vitest-environment jsdom
/**
 * Initial confirmed scope correction — UI behaviour.
 *
 * Fetch is stubbed at the HTTP boundary.  This checks that correction is a
 * deliberate mode (not the ordinary revision mode), that server eligibility
 * and affected-draft details are visible, and that client gates cannot submit
 * without a reason and explicit confirmation.
 */
import React from "react";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import ScopeSetup from "../client/src/pages/ScopeSetup";

const segment = {
  id: 501,
  boqProjectId: 77,
  segmentType: "working_reach",
  status: "confirmed",
  revisionOf: null,
  chainageFrom: "0.0000",
  chainageTo: "10.0000",
  side: null,
  label: "Initial reach",
  applicability: "all_linear",
  categoryIds: null,
  itemIds: null,
  reason: "original confirmation",
  effectiveFrom: null,
  deptReference: null,
  withdrawalOrderRef: null,
  notes: "entered from imported BOQ",
};

const project = {
  id: 77,
  name: "ALIPUR BRIDGE",
  chainageFrom: "0",
  chainageTo: "10",
  corridorConfirmed: 1,
};

let auth: { isAdmin: boolean; isOwner: boolean };
let eligibility: any;
let calls: Array<{ url: string; method: string; body?: any }> = [];

function stubFetch() {
  calls = [];
  vi.stubGlobal("fetch", vi.fn(async (url: any, init?: any) => {
    const requestUrl = String(url);
    const method = String(init?.method ?? "GET").toUpperCase();
    const body = init?.body ? JSON.parse(init.body) : undefined;
    calls.push({ url: requestUrl, method, body });

    let payload: any = null;
    if (requestUrl === "/api/auth/me") payload = { user: auth };
    else if (requestUrl.endsWith("/scope-segments")) payload = [segment];
    else if (requestUrl.endsWith("/scope-reconciliation")) payload = null;
    else if (requestUrl.endsWith("/categories") || requestUrl.endsWith("/items")) payload = [];
    else if (requestUrl.endsWith("/initial-correction-eligibility")) payload = eligibility;
    else if (method === "POST" || method === "PATCH") {
      payload = method === "POST"
        ? { ...segment, status: "confirmed", correctedInPlace: true, affectedDrafts: eligibility?.affectedDrafts ?? [] }
        : { ...segment, id: 700, revised: true, status: "draft", revisionOf: segment.id };
    } else if (requestUrl.endsWith("/projects/77")) payload = project;

    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }));
}

function renderPage() {
  const qc = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        queryFn: async ({ queryKey }) => (await fetch(queryKey.join("/"))).json(),
      },
      mutations: { retry: false },
    },
  });
  const { hook } = memoryLocation({ path: "/work-program/77/scope" });
  return render(
    <QueryClientProvider client={qc}>
      <Router hook={hook}><ScopeSetup /></Router>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  cleanup();
  auth = { isAdmin: true, isOwner: false };
  eligibility = {
    eligible: true,
    projectId: 77,
    segment,
    blockers: [],
    affectedDrafts: [],
  };
  stubFetch();
});

afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
});

async function openCorrection() {
  renderPage();
  await screen.findByText("Initial reach");
  fireEvent.click(screen.getByTitle("Correct initial confirmed scope (keeps this row)"));
  await screen.findByText("Correct initial confirmed scope");
}

describe("correction mode versus ordinary confirmed revision", () => {
  it("shows a deliberate correction action only for authorized users", async () => {
    await openCorrection();

    expect(screen.getByTestId("text-scope-form-heading").textContent).toContain("Correct initial confirmed scope");
    expect(screen.getByText(/keeps the same segment ID and confirmed status/i)).toBeTruthy();
    expect(screen.getByText(/Correction reason \(required\)/i)).toBeTruthy();
    expect((screen.getByText("Apply correction") as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(screen.getByText("Cancel"));
    fireEvent.click(screen.getByTitle("Edit (creates a revision)"));
    expect(screen.getByTestId("text-scope-form-heading").textContent).toContain("Revise confirmed scope record");
    expect(screen.getByText("Create revision")).toBeTruthy();
    expect(screen.queryByText(/Correction reason \(required\)/i)).toBeNull();
  });

  it("hides correction from a non-admin/non-owner while leaving normal revision available", async () => {
    auth = { isAdmin: false, isOwner: false };
    renderPage();

    await screen.findByText("Initial reach");
    expect(screen.queryByTitle("Correct initial confirmed scope (keeps this row)")).toBeNull();
    expect(screen.getByTitle("Edit (creates a revision)")).toBeTruthy();
  });

  it("does not submit until reason and explicit confirmation are supplied", async () => {
    await openCorrection();
    await waitFor(() => expect(calls.some(c => c.url.endsWith("/initial-correction-eligibility"))).toBe(true));

    const apply = screen.getByText("Apply correction");
    expect((apply as HTMLButtonElement).disabled).toBe(true);

    const reason = screen.getByPlaceholderText("Explain the verified initial-entry error and source of correction");
    fireEvent.change(reason, { target: { value: "Verified against signed site note" } });
    expect((apply as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("checkbox"));
    expect((apply as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(apply);
    await waitFor(() => expect(calls.some(c =>
      c.method === "POST" && c.url === "/api/boq/scope-segments/501/correct-initial",
    )).toBe(true));
    const mutation = calls.find(c => c.url.endsWith("/correct-initial"))!;
    expect(mutation.body).toMatchObject({
      segmentType: "working_reach",
      chainageFrom: 0,
      chainageTo: 10,
      correctionReason: "Verified against signed site note",
    });
    expect(calls.some(c => c.method === "PATCH")).toBe(false);
  });
});

describe("server eligibility and draft preservation messaging", () => {
  it("renders affected draft DPRs for review without changing their values", async () => {
    eligibility = {
      eligible: true,
      projectId: 77,
      segment,
      blockers: [],
      affectedDrafts: [{ id: 900, date: "2026-03-02", site: "ALIPUR", affectedRows: 2 }],
    };
    await openCorrection();

    expect(await screen.findByText(/Draft DPRs to review after correction/i)).toBeTruthy();
    expect(screen.getByText(/DPR #900 — ALIPUR \(2026-03-02\), 2 affected row\(s\)/)).toBeTruthy();
    // The fetched segment remains the unchanged original while the form is open.
    expect((screen.getByPlaceholderText("e.g. Reach 2") as HTMLInputElement).value).toBe("Initial reach");
    expect((screen.getAllByPlaceholderText(/e\.g\. 2\./)[0] as HTMLInputElement).value).toBe("0.0000");
  });

  it("shows specific blockers, disables the action, and offers no override", async () => {
    eligibility = {
      eligible: false,
      projectId: 77,
      segment,
      blockers: [{
        code: "PROGRAMME_BARS_EXIST",
        message: "Programme/work-program bars already exist for this project.",
      }],
      affectedDrafts: [],
    };
    await openCorrection();

    expect(await screen.findByText("Correction is blocked:")).toBeTruthy();
    expect(screen.getByText("• Programme/work-program bars already exist for this project.")).toBeTruthy();
    expect(screen.queryByText(/override/i)).toBeNull();
    const apply = screen.getByText("Apply correction");
    fireEvent.change(screen.getByPlaceholderText("Explain the verified initial-entry error and source of correction"), {
      target: { value: "reason" },
    });
    fireEvent.click(screen.getByRole("checkbox"));
    expect((apply as HTMLButtonElement).disabled).toBe(true);
    expect(calls.some(c => c.method === "POST" && c.url.endsWith("/correct-initial"))).toBe(false);
  });
});
