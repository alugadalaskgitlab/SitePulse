import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const source = (file: string) => readFileSync(`client/src/${file}`, "utf8");

describe("execution arrangement reach-card presentation", () => {
  it("keeps one compact identity/evidence presentation per programme reach", () => {
    const page = source("pages/ExecutionArrangements.tsx");
    expect(page).toContain("detail-bar-${al.programmeBarId}");
    expect(page).toContain("Balance source: DPR executed quantity");
    expect(page).toContain("DPR executed");
    expect(page).toContain("balanceVsAllocation");
  });

  it("surfaces evidence failures with retry and refreshes live while detail is open", () => {
    const page = source("pages/ExecutionArrangements.tsx");
    expect(page).toContain("isError: evidenceError");
    expect(page).toContain("refetch: refetchEvidence");
    expect(page).toContain("refetchInterval: detailTargetId != null ? 30_000 : false");
    expect(page).toContain("refetchOnWindowFocus: true");
    expect(page).toContain("execution-evidence-error");
    expect(page).toContain("button-retry-execution-evidence");
    expect(page).toContain("refetchEvidence()");
  });

  it("shows original trip quantities with their converted Cum reconciliation", () => {
    const page = source("pages/ExecutionArrangements.tsx");
    expect(page).toContain("tripOriginal.map");
    expect(page).toContain("= ${evidence.tripConvertedCum.toLocaleString()} Cum");
    expect(page).toContain("varianceCum");
  });

  it("requires explicit override before writing event actual quantity", () => {
    const control = source("components/ArrangementOutcomeControl.tsx");
    expect(control).toContain("Override / accepted quantity");
    expect(control).toContain("actualQuantity: needsAcceptedQty");
    expect(control).toContain("Number.isFinite(Number(actualQuantity))");
    expect(control).toContain("status-event override");
    expect(control).toContain("not payable");
  });
});