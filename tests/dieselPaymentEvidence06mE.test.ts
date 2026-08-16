// 06M-E restored the Diesel Payment Evidence UI; 06M-F removed it again —
// for good. This file now pins the REMOVAL contract (06M-F §1 / Test A):
// no evidence badge/gallery/upload anywhere in DieselRequirements.tsx, while
// the Bill/Invoice attachment flow and historical data stay untouched.
import { describe, it, expect } from "vitest";
import fs from "fs";

const src = fs.readFileSync("client/src/pages/DieselRequirements.tsx", "utf8");

describe("06M-F §1 — payment evidence UI removed (supersedes 06M-E)", () => {
  it("no payment_evidence uploader, gallery, badge, or section remains", () => {
    expect(src).not.toContain('docType="payment_evidence"');
    expect(src).not.toContain('data-testid="badge-payment-evidence"');
    expect(src).not.toContain('data-testid="gallery-payment-evidence"');
    expect(src).not.toContain('data-testid="section-payment-evidence"');
    expect(src).not.toContain('label="Add Evidence (Camera / Gallery / File)"');
    expect(src).not.toMatch(/hasPaymentEvidence/);
  });

  it("Bill/Invoice attachment flow is untouched (docType bill, same labels)", () => {
    expect(src).toContain('docType="bill"');
    expect(src).toContain('label="Add Bill (Gallery / File)"');
    expect(src).toContain("BILL / INVOICE");
  });

  it("historical payment_evidence data is never deleted/migrated — no destructive attachment calls", () => {
    // UI removal only: no delete/migration of payment_evidence anywhere.
    expect(src).not.toMatch(/payment_evidence[^\n]*(delete|remove|migrate)/i);
    const schema = fs.readFileSync("shared/schema.ts", "utf8");
    expect(schema).toContain('docType distinguishes "bill" vs "payment_evidence"');
  });
});
