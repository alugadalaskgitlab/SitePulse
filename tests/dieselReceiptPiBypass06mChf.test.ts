// 06M-C-HF — Daily Diesel Receipt: bypass PI/Indent warning.
// Tests the shared decision helpers that PlantMaterialReceipts.tsx now uses
// for PI auto-selection, submit validation, PI-block visibility, and the
// post-save regularise notice.
import { describe, it, expect } from "vitest";
import {
  isDieselSourcedReceipt,
  decidePiAutoSelect,
  submitBlockedByPi,
  showPiIndentBlock,
  showPiPendingBadge,
  showRegulariseIndentNotice,
  receiptClosureStatus,
} from "../shared/dieselReceiptSource";

describe("06M-C-HF source-mode flag", () => {
  it("linkedDieselRequirementId != null → diesel-sourced", () => {
    expect(isDieselSourcedReceipt(42)).toBe(true);
    expect(isDieselSourcedReceipt(0)).toBe(true); // any non-null id counts
    expect(isDieselSourcedReceipt(null)).toBe(false);
    expect(isDieselSourcedReceipt(undefined)).toBe(false);
  });
});

describe("§8 PI auto-selection suppression", () => {
  const pending = [{ indentNo: "PI-101", itemId: 7 }];
  const active = [{ indentNo: "PI-202" }];

  it("L: diesel deep-link + coincidental pending Material Indent for Diesel → effect skipped entirely", () => {
    const d = decidePiAutoSelect({
      linkedDieselRequirementId: 42,
      editing: false,
      currentIndentRef: "",
      pendingIndents: pending, // a matching pending indent EXISTS
      activeIndents: [],
    });
    expect(d).toEqual({ action: "skip" }); // not clearPendingItem, not select
  });

  it("L: diesel deep-link + coincidental single active/approved Diesel PI → skipped", () => {
    const d = decidePiAutoSelect({
      linkedDieselRequirementId: 42,
      editing: false,
      currentIndentRef: "",
      pendingIndents: [],
      activeIndents: active, // a single approved PI EXISTS
    });
    expect(d).toEqual({ action: "skip" });
  });

  it("ordinary receipt: single pending Material Indent still auto-selects (unchanged)", () => {
    const d = decidePiAutoSelect({
      linkedDieselRequirementId: null,
      editing: false,
      currentIndentRef: "",
      pendingIndents: pending,
      activeIndents: [],
    });
    expect(d).toEqual({ action: "select", indentNo: "PI-101", pendingItemId: 7 });
  });

  it("ordinary receipt: single active PI (name-based) still auto-selects with null pending item", () => {
    const d = decidePiAutoSelect({
      linkedDieselRequirementId: null,
      editing: false,
      currentIndentRef: "",
      pendingIndents: [],
      activeIndents: active,
    });
    expect(d).toEqual({ action: "select", indentNo: "PI-202", pendingItemId: null });
  });

  it("ordinary receipt: editing or existing indentRef skips; ambiguity clears pending item", () => {
    expect(decidePiAutoSelect({ linkedDieselRequirementId: null, editing: true, currentIndentRef: "", pendingIndents: pending, activeIndents: [] })).toEqual({ action: "skip" });
    expect(decidePiAutoSelect({ linkedDieselRequirementId: null, editing: false, currentIndentRef: "PI-9", pendingIndents: pending, activeIndents: [] })).toEqual({ action: "skip" });
    expect(decidePiAutoSelect({ linkedDieselRequirementId: null, editing: false, currentIndentRef: "", pendingIndents: [], activeIndents: [] })).toEqual({ action: "clearPendingItem" });
  });
});

describe("§5 submit-time PI validation", () => {
  it("diesel-sourced: never blocked, even with a non-approved PI coincidentally selected and no override", () => {
    expect(submitBlockedByPi({ linkedDieselRequirementId: 42, selectedPiStatus: "pending", indentOverride: false })).toBe(false);
  });

  it("ordinary receipt: non-approved PI without override blocks (unchanged)", () => {
    expect(submitBlockedByPi({ linkedDieselRequirementId: null, selectedPiStatus: "pending", indentOverride: false })).toBe(true);
  });

  it("ordinary receipt: override, approved, ordered, or no PI selected → not blocked (unchanged)", () => {
    expect(submitBlockedByPi({ linkedDieselRequirementId: null, selectedPiStatus: "pending", indentOverride: true })).toBe(false);
    expect(submitBlockedByPi({ linkedDieselRequirementId: null, selectedPiStatus: "approved", indentOverride: false })).toBe(false);
    expect(submitBlockedByPi({ linkedDieselRequirementId: null, selectedPiStatus: "ordered", indentOverride: false })).toBe(false);
    expect(submitBlockedByPi({ linkedDieselRequirementId: null, selectedPiStatus: null, indentOverride: false })).toBe(false);
  });
});

describe("§3/§4 PI block visibility in the form", () => {
  it("diesel-sourced → PI/Indent block hidden (no warning, no selector, no override)", () => {
    expect(showPiIndentBlock(42)).toBe(false);
  });
  it("ordinary receipt → PI block shown as before", () => {
    expect(showPiIndentBlock(null)).toBe(true);
    expect(showPiIndentBlock(undefined)).toBe(true);
  });
});

describe("§7/§9 hard guards in PlantMaterialReceipts.tsx (source-level)", () => {
  // The component wiring can't be unit-rendered here; assert the concrete
  // guard expressions exist so a refactor can't silently drop them.
  const fs = require("fs");
  const src = fs.readFileSync("client/src/pages/PlantMaterialReceipts.tsx", "utf8");

  it("payload forces indentRef null in diesel mode (create + update)", () => {
    const guards = src.match(/indentRef: linkedDieselRequirementId != null \? null : \(indentRef \|\| null\)/g) || [];
    expect(guards.length).toBe(2);
  });

  it("PI close-loop PATCH is gated on no diesel link", () => {
    expect(src).toContain("selectedPendingPiItemId && receipt?.id && linkedDieselRequirementId == null");
  });

  it("entering diesel mode clears indentRef/pending PI item; edit restores diesel link", () => {
    expect(src).toContain("setLinkedDieselRequirementId(autoOpenParams.dieselReqId)");
    expect(src).toContain('setIndentRef(dieselLink != null ? "" : ((receipt as any).indentRef || ""))');
    expect(src).toContain("setLinkedDieselRequirementId(dieselLink)");
  });
});

describe("Task #1424 diesel source and final-edit authorization UI guards", () => {
  const fs = require("fs");
  const src = fs.readFileSync("client/src/pages/PlantMaterialReceipts.tsx", "utf8");

  it("locks Material and UOM while identifying their canonical Diesel/Liters source", () => {
    expect(src).toContain('disabled={linkedDieselRequirementId != null}');
    expect(src).toContain("Canonical Diesel / Liters source — material and UOM are locked.");
  });

  it("passes the granted request id only on Final Submitted receipt updates and clears it on reset", () => {
    expect(src).toContain("onEditGranted={(requestId) => handleEditClick(receipt, requestId)}");
    expect(src).toContain("deferConsumeUntilSave");
    expect(src).toContain('...((editingReceipt as any).documentStatus === "submitted" && editPermissionRequestId !== null');
    expect(src).toContain("? { editPermissionRequestId }");
    expect(src).toContain("setEditPermissionRequestId(null);");
  });
});

describe("submitted receipt approval consumption contract", () => {
  const fs = require("fs");
  const buttonSrc = fs.readFileSync("client/src/components/EditPermissionButton.tsx", "utf8");

  it("can defer approval consumption until the record save succeeds", () => {
    expect(buttonSrc).toContain("deferConsumeUntilSave?: boolean");
    expect(buttonSrc).toContain("if (!deferConsumeUntilSave) consumePermission(activeRequest.id)");
    expect(buttonSrc).toContain("onEditGranted?.(activeRequest.id)");
  });
});

describe("§10 post-save regularise notice", () => {
  it("diesel-linked receipt with no indentRef → notice suppressed", () => {
    expect(showRegulariseIndentNotice({ linkedDieselRequirementId: 42, indentRef: null, indentStatus: undefined })).toBe(false);
  });
  it("ordinary receipt with no indentRef → notice still shows (unchanged)", () => {
    expect(showRegulariseIndentNotice({ linkedDieselRequirementId: null, indentRef: null, indentStatus: undefined })).toBe(true);
  });
  it("ordinary receipt with non-approved indent → notice shows; approved → hidden (unchanged)", () => {
    expect(showRegulariseIndentNotice({ linkedDieselRequirementId: null, indentRef: "PI-1", indentStatus: "pending" })).toBe(true);
    expect(showRegulariseIndentNotice({ linkedDieselRequirementId: null, indentRef: "PI-1", indentStatus: "approved" })).toBe(false);
  });
});

describe("receipt row source and closure helpers", () => {
  it("suppresses the compact PI Pending badge for diesel-linked receipts", () => {
    expect(showPiPendingBadge({ linkedDieselRequirementId: 42, indentRef: null, indentStatus: undefined })).toBe(false);
    expect(showPiPendingBadge({ linkedDieselRequirementId: null, indentRef: null, indentStatus: undefined })).toBe(true);
  });

  it("labels document workflow rows without auto-submitting them", () => {
    expect(receiptClosureStatus("draft", false)).toBe("Pending Document");
    expect(receiptClosureStatus("draft", true)).toBe("Ready to Final Submit");
    expect(receiptClosureStatus("submitted", false)).toBe("Final Submitted");
  });
});
