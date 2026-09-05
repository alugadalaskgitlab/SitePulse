export type GuidedDraftRecoveryMarker = {
  draftId?: number | null;
  baseDraftRevision?: string | null;
};

export function canRestoreGuidedServerDraft(
  local: GuidedDraftRecoveryMarker,
  serverDraftId: number,
  serverDraftRevision: string | null,
): boolean {
  return (
    serverDraftRevision != null &&
    local.draftId === serverDraftId &&
    local.baseDraftRevision === serverDraftRevision
  );
}