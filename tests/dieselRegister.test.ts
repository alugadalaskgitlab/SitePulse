import { describe, expect, it } from "vitest";
import { deriveDieselRegisterStatus } from "../client/src/lib/dieselRegister";
import fs from "node:fs";

describe("diesel register status derivation", () => {
  it("keeps the requirement lifecycle before purchase", () => {
    expect(deriveDieselRegisterStatus("pending")).toBe("Raised");
    expect(deriveDieselRegisterStatus("approved")).toBe("Approved");
  });
  it("refines a purchased requirement only with shared receipt states", () => {
    expect(deriveDieselRegisterStatus("purchased", { status: "receipt_pending" })).toBe("Purchased");
    expect(deriveDieselRegisterStatus("purchased", { status: "partly_received" })).toBe("Partly Received");
    expect(deriveDieselRegisterStatus("purchased", { status: "fully_received" })).toBe("Received");
  });
  it("never invents a Closed state", () => {
    expect(deriveDieselRegisterStatus("closed")).toBe("Raised");
  });

  it("renders every document type accepted as qualifying evidence", () => {
    const src = fs.readFileSync("client/src/pages/StoresDieselRegister.tsx", "utf8");
    expect(src).toContain('new Set(["bill", "invoice", "challan", "receipt", "dc"])');
    expect(src).toContain("qualifyingDocumentTypes.has(a.docType)");
  });
});