// @vitest-environment jsdom
import React from "react";
import { describe, expect, it, vi, afterEach } from "vitest";
import { renderHook, waitFor, act, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useDprCorrections } from "./use-dpr-corrections";
import { apiRequest } from "@/lib/queryClient";
import type { DprCorrectionForm } from "@/lib/dprCorrections";

vi.mock("@/lib/queryClient", () => ({ apiRequest: vi.fn() }));
afterEach(() => { cleanup(); vi.resetAllMocks(); });
const form: DprCorrectionForm = {
  header: { site: "TAKKADPALLY-SIRUR" }, workType: "road", structureItems: [],
  progress: [{ persistedId: 28, chainageTo: "2+248" }],
  equipment: [{ persistedId: 741, plantUsageId: 188, openingDiesel: null, dieselBalanceInTank: 0 }], labour: [], materials: [], sitePurchases: [],
};
function setup(enabled = true) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return { client, ...renderHook(() => useDprCorrections(427, enabled), { wrapper }) };
}
describe("DPR correction API hooks", () => {
  it("previews raw state and submits the same form with hash, reason and explicit confirmation, returning pending distinctly", async () => {
    vi.mocked(apiRequest).mockImplementation(async (method, url) => ({
      json: async () => method === "GET" ? [] : url.endsWith("correction-review") ?
        { baseHash: "facts-v7", revision: 7, changes: [], blocked: [], requiresApproval: true, impact: [] } :
        { pending: true, requestId: 83, id: 427 },
    } as Response));
    const { result } = setup();
    await waitFor(() => expect(result.current.history.isSuccess).toBe(true));
    await act(async () => { await result.current.preview.mutateAsync(form); });
    expect(apiRequest).toHaveBeenCalledWith("POST", "/api/dprs/427/correction-review", { form });
    let outcome: unknown;
    await act(async () => { outcome = await result.current.save.mutateAsync({ form, baseHash: "facts-v7", reason: "Register checked", confirmImpact: true }); });
    expect(outcome).toEqual({ pending: true, requestId: 83, id: 427 });
    expect(apiRequest).toHaveBeenCalledWith("POST", "/api/dprs/427/version", { correction: { form, baseHash: "facts-v7", reason: "Register checked", confirmImpact: true } });
    expect(form.equipment[0]).toMatchObject({ plantUsageId: 188, openingDiesel: null, dieselBalanceInTank: 0 });
  });
  it("does not access submitted correction endpoints for draft or unauthorized editors", async () => {
    const { result } = setup(false);
    expect(result.current.history.fetchStatus).toBe("idle");
    expect(apiRequest).not.toHaveBeenCalled();
  });
  it("preserves raw input on a stale version error and does not retry a mutation", async () => {
    vi.mocked(apiRequest).mockImplementation(async (method) => {
      if (method === "GET") return { json: async () => [] } as Response;
      throw new Error('409: {"message":"DPR changed since review"}');
    });
    const { result } = setup();
    const before = structuredClone(form);
    await act(async () => {
      await expect(result.current.save.mutateAsync({ form, baseHash: "old", reason: "Register checked", confirmImpact: true })).rejects.toThrow("changed since review");
    });
    expect(form).toEqual(before);
    expect(vi.mocked(apiRequest).mock.calls.filter(([method]) => method === "POST")).toHaveLength(1);
  });
  it.each([true, false])("posts the explicit administrator decision approve=%s", async (approve) => {
    vi.mocked(apiRequest).mockResolvedValue({ json: async () => [] } as Response);
    const { result } = setup();
    await act(async () => { await result.current.decide.mutateAsync({ requestId: 83, approve, reason: "Independent review", confirmImpact: true }); });
    expect(apiRequest).toHaveBeenCalledWith("POST", "/api/dprs/427/corrections/83", { approve, reason: "Independent review", confirmImpact: true });
  });
});
