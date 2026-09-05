import { splitGuidedEquipmentRow } from "@shared/guidedEquipment";

export type GuidedDraftRecoveryMarker = {
  draftId?: number | null;
  baseDraftRevision?: string | null;
  serverDraftFingerprint?: string | null;
};

type ServerDraftItems = {
  id?: number | null;
  draftRevision?: string | null;
  progress?: any[] | null;
  equipment?: any[] | null;
  labour?: any[] | null;
};

/**
 * Proves that a browser recovery blob was created after this exact server
 * draft had hydrated. Legacy/pre-hydration blobs do not carry this marker and
 * cannot replace populated server rows, while deliberate edits (including row
 * deletion) retain it and remain recoverable.
 */
export function guidedServerDraftFingerprint(server: ServerDraftItems): string | null {
  if (server.id == null || server.draftRevision == null) return null;
  return JSON.stringify({
    id: server.id,
    revision: server.draftRevision,
    hydrated: true,
  });
}

export function canRestoreGuidedServerDraft(
  local: GuidedDraftRecoveryMarker,
  serverDraftId: number,
  serverDraftRevision: string | null,
  serverDraftFingerprint: string | null,
): boolean {
  return (
    serverDraftRevision != null &&
    serverDraftFingerprint != null &&
    local.draftId === serverDraftId &&
    local.baseDraftRevision === serverDraftRevision &&
    local.serverDraftFingerprint === serverDraftFingerprint
  );
}

/** Canonical saved-child-row → Guided form mapping used by the live screen. */
export function hydrateGuidedDraftItems(
  server: ServerDraftItems,
  newEntryKey: () => string,
) {
  return {
    entries: (server.progress ?? []).map((p: any) => ({
      entryKey: p.entryKey || newEntryKey(),
      noSiteWork: !!p.noSiteWork,
      noSiteWorkDescription: p.noSiteWorkDescription || "",
      activity: p.activity || "",
      boqItemId: p.boqItemId ?? null,
      programmeBarId: p.programmeBarId ?? null,
      earthworkArrangementId: p.earthworkArrangementId ?? null,
      side: p.side || "",
      chainageFrom: p.chainageFrom || "",
      chainageTo: p.chainageTo || "",
      quantity: p.quantity != null ? Number(p.quantity) : null,
      uom: p.uom || "SQM",
      expanded: false,
      width: p.width != null ? Number(p.width) : null,
      thickness: p.thickness != null ? Number(p.thickness) : null,
      remark: "",
      quantitySource: p.quantitySource || "",
      quantitySourceNote: p.quantitySourceNote || "",
      chainageOverrideReason: p.chainageOverrideReason || "",
      executedBy: p.executedBy || "",
      qtyOverridden: p.quantitySource != null && p.quantitySource !== "" && p.quantitySource !== "calculated",
      layerNo: p.layerNo != null ? Number(p.layerNo) : null,
      isIncidental: !!p.isIncidental,
      incidentalDescription: p.incidentalDescription || "",
      materialOutcome: p.materialOutcome ?? null,
      reusableQty: p.reusableQty != null ? Number(p.reusableQty) : null,
      allocations: [],
    })),
    equipment: (server.equipment ?? []).map((row: any) => splitGuidedEquipmentRow(row)),
    labour: (server.labour ?? []).map((l: any) => ({
      category: l.category || "",
      gender: l.gender || "",
      count: l.count != null ? Number(l.count) : null,
      contractor: l.contractor || "",
      task: l.task || "",
      boqItemId: l.boqItemId ?? null,
      structureId: l.structureId ?? null,
    })),
  };
}