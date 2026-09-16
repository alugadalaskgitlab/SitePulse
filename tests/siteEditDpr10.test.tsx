// @vitest-environment jsdom
import React from "react";
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, renderHook, screen } from "@testing-library/react";
import {
  ChainageOverlapWarning,
  useChainageOverlapHits,
} from "../client/src/components/ChainageOverlapGuard";
import type { CandidateChainageRow, PriorChainageEntry } from "../shared/chainageOverlap";

const siteEditSource = readFileSync("client/src/pages/SiteEdit.tsx", "utf8");

const candidate: CandidateChainageRow = {
  rowKey: 0,
  boqItemId: 17,
  side: "RHS",
  fromKm: 3.1,
  toKm: 3.25,
  chainageOverrideReason: "",
  label: "EMBANKMENT",
};

const prior: PriorChainageEntry = {
  entryId: 811,
  dprId: 812,
  dprDate: "2026-09-08",
  boqItemId: 17,
  side: "RHS",
  fromKm: 3.15,
  toKm: 3.25,
  quantity: 42,
  uom: "CUM",
};

function queryWrapper({ children }: React.PropsWithChildren) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe("DPR-10 SiteEdit regressions", () => {
  it("gates the bottom action by draft mode without changing the submitted version action", () => {
    const bottom = siteEditSource.slice(
      siteEditSource.indexOf('<div className="flex justify-end gap-4 pt-4">'),
    );

    expect(bottom).toContain("{isDraftMode ? (");
    expect(bottom).toContain("onClick={handleDraftSave}");
    expect(bottom).toContain("onClick={handleSubmitDraft}");
    expect(bottom).toContain("draftSaveMutation.isPending || submitDraftMutation.isPending");
    expect(bottom).toContain("submitDraftMutation.isPending || draftSaveMutation.isPending");
    expect(bottom).toContain("onClick={handleSave}");
    expect(bottom).toContain("disabled={updateMutation.isPending}");
    expect(siteEditSource).toContain('`/api/dprs/${id}/version`');
  });

  it("does not exempt hydrated draft rows from the prior-overlap warning", () => {
    expect(siteEditSource).toContain("const isDraftDpr = (dpr as any)?.dprStatus === \"draft\";");
    expect(siteEditSource).toContain(
      "const unchangedOverlapRowKeys = isDraftDpr\n    ? new Set<string | number>()",
    );
    expect(siteEditSource).toContain("const isDraftMode = isDraftDpr;");
  });

  it("updates the warning map when asynchronous prior rows arrive", () => {
    const { result, rerender } = renderHook(
      ({ priors }: { priors: PriorChainageEntry[] }) =>
        useChainageOverlapHits([candidate], priors, new Set()),
      { initialProps: { priors: [] } },
    );

    expect(result.current.get(0)).toBeUndefined();
    rerender({ priors: [prior] });
    expect(result.current.get(0)).toEqual([
      expect.objectContaining({
        source: "prior_dpr",
        withDprId: prior.dprId,
        segmentFromKm: 3.15,
        segmentToKm: 3.25,
      }),
    ]);
  });

  it("keeps Give reason visible for a flagged row", () => {
    render(
      <ChainageOverlapWarning
        hits={[{
          kind: "partial",
          source: "prior_dpr",
          segmentFromKm: 3.15,
          segmentToKm: 3.25,
          withDprId: prior.dprId,
          withDprDate: prior.dprDate,
          withEntryId: prior.entryId,
          withRowKey: null,
          withSide: prior.side,
          withFromKm: prior.fromKm,
          withToKm: prior.toKm,
          withQuantity: prior.quantity,
          withUom: prior.uom,
        }]}
        overrideReason=""
        onOverrideReason={() => {}}
        testidPrefix="progress-0"
      />,
      { wrapper: queryWrapper },
    );

    expect(screen.getByTestId("progress-0-overlap-warning")).toBeTruthy();
    expect(screen.getByTestId("progress-0-overlap-reason-needed")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Give reason" })).toBeTruthy();
  });
});