// 06M-E — Restore Diesel Payment Evidence (UI/attachment restoration only).
// The change is pure UI wiring over the existing generic attachments API, so
// these tests pin the contract at source level: correct moduleType/docType,
// bill flow untouched, evidence optional, no schema change.
import { describe, it, expect } from "vitest";
import fs from "fs";

const src = fs.readFileSync("client/src/pages/DieselRequirements.tsx", "utf8");

describe("06M-E payment evidence restoration", () => {
  it("uses the existing attachment infra: moduleType diesel_purchase + docType payment_evidence", () => {
    expect(src).toContain('docType="payment_evidence"');
    const evidenceUses = src.match(/docType="payment_evidence"/g) || [];
    // uploader (edit screen) + gallery (edit screen) + gallery (summary view)
    expect(evidenceUses.length).toBe(3);
    // never a new moduleType
    expect(src).not.toMatch(/moduleType="diesel_payment/);
  });

  it("Edit Purchase Details has a separate PAYMENT EVIDENCE section with uploader (camera+gallery+file via AttachmentUploader)", () => {
    expect(src).toContain('data-testid="section-payment-evidence"');
    expect(src).toContain("PAYMENT EVIDENCE");
    expect(src).toContain('label="Add Evidence (Camera / Gallery / File)"');
  });

  it("Bill/Invoice uploader + gallery remain unchanged (docType bill, same labels)", () => {
    expect(src).toContain('docType="bill"');
    expect(src).toContain('label="Add Bill (Gallery / File)"');
    expect(src).toContain("BILL / INVOICE");
  });

  it("summary shows Payment Evidence ✓ badge with View toggle only when evidence exists (historical included)", () => {
    expect(src).toContain('a.docType === "payment_evidence"');
    expect(src).toContain('data-testid="badge-payment-evidence"');
    expect(src).toContain('data-testid="gallery-payment-evidence"');
    // gated on hasPaymentEvidence — nothing shown / nothing required when absent
    expect(src).toMatch(/hasPaymentEvidence && \(/);
    expect(src).toMatch(/hasPaymentEvidence && showEvidence && \(/);
  });

  it("evidence is optional: no validation ties purchase save to payment evidence", () => {
    // purchase submit must not reference payment evidence
    expect(src).not.toMatch(/payment_evidence[^\n]*required/i);
    expect(src).not.toMatch(/hasPaymentEvidence[^\n]*disabled/);
  });

  it("Payment Mode / Paid By fields unchanged; no new payment-status fields added", () => {
    expect(src).toContain('data-testid="select-paid-by"');
    expect(src).toContain("COMPANY ACCOUNT");
    expect(src).not.toMatch(/paymentStatus|paymentDate|paymentReference/);
  });

  it("no schema change: attachments table already documents the docType split", () => {
    const schema = fs.readFileSync("shared/schema.ts", "utf8");
    expect(schema).toContain('docType distinguishes "bill" vs "payment_evidence"');
    expect(schema).not.toContain("payment_evidence_attachments");
  });
});
