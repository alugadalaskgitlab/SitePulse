import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  new URL("../client/src/pages/PlantMaterialReceipts.tsx", import.meta.url),
  "utf8",
);

function sourceBetween(start: string, end: string): string {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  expect(from, `${start} should exist`).toBeGreaterThanOrEqual(0);
  expect(to, `${end} should follow ${start}`).toBeGreaterThan(from);
  return source.slice(from, to);
}

describe("REC-03 Material Receipt update feedback and submitted edit controls", () => {
  it("shows the server's parsed update failure in a destructive toast without closing the dialog", () => {
    const updateMutation = sourceBetween(
      "const updateMutation = useMutation({",
      "const deleteMutation = useMutation({",
    );
    const onError = sourceBetween(
      "onError: (error: any) => {",
      "const deleteMutation = useMutation({",
    );

    expect(updateMutation).toContain("onError: (error: any) =>");
    expect(onError).toContain('error.message.replace(/^\\d+:\\s*/, "")');
    expect(onError).toContain("parsed.message || msg");
    expect(onError).toContain('title: "Cannot update receipt"');
    expect(onError).toContain('variant: "destructive"');
    expect(onError).not.toContain("setDialogOpen(false)");
  });

  it("lets direct editors open a submitted receipt with the explicit zero sentinel", () => {
    expect(source).toContain(
      'const canDirectEditSubmittedReceipt = isOwnerOrAdmin || sectionCan("plant_materials", "edit")',
    );
    expect(source).toContain(
      '(receipt as any).documentStatus === "submitted" && canDirectEditSubmittedReceipt',
    );
    expect(source).toContain("onClick={() => handleEditClick(receipt, 0)}");
    expect(source).toContain('title="Correct this locked receipt"');
  });

  it("keeps non-direct submitted editors on the existing approval flow", () => {
    expect(source).toContain(
      '(receipt as any).documentStatus === "submitted" && !canDirectEditSubmittedReceipt',
    );
    expect(source).toContain('recordType="material_receipt"');
    expect(source).toContain(
      "onEditGranted={(requestId) => handleEditClick(receipt, requestId)}",
    );
    expect(source).toContain("deferConsumeUntilSave");
  });

  it("preserves zero and real approved ids in submitted update payloads", () => {
    expect(source).toContain(
      '(editingReceipt as any).documentStatus === "submitted" && editPermissionRequestId !== null',
    );
    expect(source).toContain("? { editPermissionRequestId }");
    expect(source).toContain("setEditPermissionRequestId(permissionRequestId)");
  });

  it("leaves ordinary draft receipt editing on the existing control", () => {
    expect(source).toContain(
      '(canEdit || isOwnerOrAdmin) && (receipt as any).documentStatus !== "submitted"',
    );
    expect(source).toContain("onClick={() => handleEditClick(receipt)}");
  });
});