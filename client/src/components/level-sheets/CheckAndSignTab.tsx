import { useState } from "react";
import { AttachmentViewer } from "@/components/AttachmentViewer";
import { Button } from "@/components/ui/button";
import { Input } from "./LevelInput";
import { useUpload } from "@/hooks/use-upload";
import { formatChainagePair, type BookChainageSystem, type CalculatedSection } from "@shared/levelSheets";
import type { SheetReadingRow } from "./ReadingsTab";

export type CheckPointDraft = {
  chainageOursKm: number;
  columnKey: string;
  checked: boolean;
  checkedRl: string;
};

type AttachmentValue = { fileName: string | null; objectPath: string | null; mimeType: string | null; fileSize: number | null };
const upper = (value: unknown) => String(value ?? "").toLocaleUpperCase("en");

export function CheckAndSignTab({ sheetId, canEdit, canApprove, staff, personnelIds, onPersonnelIdsChange,
  readings, sections, settings, checkedByType, checkedByName, checkedByDesignation, checkedDate,
  checkedPoints, onCheckedByTypeChange, onCheckedByNameChange, onCheckedByDesignationChange, onCheckedDateChange,
  onCheckedPointsChange, attachment, onSaveCheck, saving,
}: {
  sheetId: number | null;
  canEdit: boolean;
  canApprove: boolean;
  staff: Array<{ id: number; name: string; role: string; isActive: number | null }>;
  personnelIds: number[];
  onPersonnelIdsChange: (ids: number[]) => void;
  readings: SheetReadingRow[];
  sections: CalculatedSection[];
  settings: { bookChainageSystem: BookChainageSystem; consultantOffsetM: number };
  checkedByType: "not_checked" | "department" | "consultant";
  checkedByName: string;
  checkedByDesignation: string;
  checkedDate: string;
  checkedPoints: CheckPointDraft[];
  onCheckedByTypeChange: (value: "not_checked" | "department" | "consultant") => void;
  onCheckedByNameChange: (value: string) => void;
  onCheckedByDesignationChange: (value: string) => void;
  onCheckedDateChange: (value: string) => void;
  onCheckedPointsChange: (rows: CheckPointDraft[]) => void;
  attachment: AttachmentValue;
  onSaveCheck: (payload: any) => Promise<void>;
  saving: boolean;
}) {
  const { uploadFile, isUploading } = useUpload();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [attachmentRemoved, setAttachmentRemoved] = useState(false);
  const [viewingAttachment, setViewingAttachment] = useState(false);
  const [error, setError] = useState("");
  const sectionByChainage = new Map(sections.map(section => [section.chainageOursKm, section]));
  const checkCount = new Set(checkedPoints.filter(point => point.checked).map(point => point.chainageOursKm)).size;
  const statusText = checkedByType === "not_checked"
    ? "Staff levels — not checked yet"
    : `Checked by ${checkedByType} (${upper(checkedByName) || "name not entered"}) at ${checkCount} of ${readings.length} chainages`;

  const updatePoint = (chainageOursKm: number, columnKey: string, patch: Partial<CheckPointDraft>) => {
    const key = (row: CheckPointDraft) => row.chainageOursKm === chainageOursKm && row.columnKey === columnKey;
    const existing = checkedPoints.find(key);
    const next = existing
      ? checkedPoints.map(row => key(row) ? { ...row, ...patch } : row)
      : [...checkedPoints, { chainageOursKm, columnKey, checked: false, checkedRl: "", ...patch }];
    onCheckedPointsChange(next);
  };

  const save = async () => {
    setError("");
    if (!sheetId) { setError("Save the level sheet before recording its check."); return; }
    if (checkedByType !== "not_checked" && (!checkedByName.trim() || !checkedDate)) {
      setError("Enter the checker name and date.");
      return;
    }
    const checkedValues = checkedPoints.map(point => ({
      ...point,
      checkedRl: point.checkedRl.trim() ? Number(point.checkedRl.replace(",", ".")) : null,
    }));
    if (checkedValues.some(point => point.checkedRl != null && !Number.isFinite(point.checkedRl))) {
      setError("Enter a valid checked RL or leave it blank.");
      return;
    }
    let nextAttachment: AttachmentValue | null = attachmentRemoved ? null : attachment;
    if (selectedFile) {
      const allowedType = selectedFile.type.startsWith("image/") || selectedFile.type === "application/pdf";
      if (!allowedType || selectedFile.size > 15 * 1024 * 1024) {
        setError("Choose an image or PDF up to 15 MB.");
        return;
      }
      const uploaded = await uploadFile(selectedFile);
      if (!uploaded) { setError("The signed sheet could not be uploaded."); return; }
      nextAttachment = {
        fileName: selectedFile.name,
        objectPath: uploaded.objectPath,
        mimeType: selectedFile.type || null,
        fileSize: selectedFile.size,
      };
    }
    try {
      await onSaveCheck({
        checkedByType,
        checkedByName: checkedByType === "not_checked" ? "" : checkedByName,
        checkedByDesignation: checkedByType === "not_checked" ? "" : checkedByDesignation,
        checkedDate: checkedByType === "not_checked" ? null : checkedDate,
        checkedPoints: checkedByType === "not_checked" ? [] : checkedValues.map(point => ({
          chainageOursKm: point.chainageOursKm,
          columnKey: point.columnKey,
          checked: point.checked,
          checkedRl: point.checkedRl,
        })),
        attachment: nextAttachment,
      });
      setSelectedFile(null);
      setAttachmentRemoved(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Check details could not be saved.");
    }
  };

  return (
    <section className="space-y-4" aria-label="Check and sign">
      <div className="rounded border p-3">
        <p className="font-semibold">Taken by</p>
        <p className="mb-2 text-xs text-muted-foreground">Select the site staff who took these levels.</p>
        <div className="flex flex-wrap gap-2">
          {staff.map(person => {
            const id = Number(person.id);
            const checked = personnelIds.includes(id);
            const active = Number(person.isActive) === 1;
            return <label key={id} className={`flex items-center gap-2 rounded border px-2 py-1 text-sm ${!active ? "opacity-70" : ""}`}>
              <input type="checkbox" checked={checked} disabled={!canEdit || (!active && !checked)}
                onChange={() => onPersonnelIdsChange(checked ? personnelIds.filter(value => value !== id) : [...personnelIds, id])} />
              <span>{upper(person.name)}{!active ? " · inactive" : ""}</span>
            </label>;
          })}
          {!staff.length && <span className="text-sm text-muted-foreground">No site staff available.</span>}
        </div>
      </div>

      <div className="grid gap-3 rounded border p-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="space-y-1 text-sm"><span>Checked by</span>
          <select className="h-10 w-full rounded-md border bg-background px-3" value={checkedByType}
            disabled={!canApprove || !sheetId} onChange={event => onCheckedByTypeChange(event.target.value as typeof checkedByType)}>
            <option value="not_checked">Not checked yet</option>
            <option value="department">Department</option>
            <option value="consultant">Consultant</option>
          </select>
        </label>
        {checkedByType !== "not_checked" && <>
          <label className="space-y-1 text-sm"><span>Checker name</span><Input value={checkedByName} onChange={event => onCheckedByNameChange(event.target.value)} disabled={!canApprove} /></label>
          <label className="space-y-1 text-sm"><span>Designation</span><Input value={checkedByDesignation} onChange={event => onCheckedByDesignationChange(event.target.value)} disabled={!canApprove} /></label>
          <label className="space-y-1 text-sm"><span>Check date</span><Input type="date" value={checkedDate} onChange={event => onCheckedDateChange(event.target.value)} disabled={!canApprove} /></label>
        </>}
      </div>

      <p className="rounded border p-3 text-sm font-medium" aria-live="polite">{statusText}</p>

      {checkedByType !== "not_checked" && <div className="overflow-x-auto rounded border">
        <table className="min-w-[720px] w-full text-sm">
          <thead><tr className="border-b text-left">
            <th className="p-2">Chainage</th><th className="p-2">Point</th><th className="p-2">Design RL</th>
            <th className="p-2">Checked RL</th><th className="p-2">Difference</th>
          </tr></thead>
          <tbody>{readings.flatMap(row => row.points.map(point => {
            const columnKey = String(point.columnKey ?? "");
            const draft = checkedPoints.find(item => item.chainageOursKm === row.chainageOursKm && item.columnKey === columnKey)
              ?? { chainageOursKm: row.chainageOursKm, columnKey, checked: false, checkedRl: "" };
            const calculated = sectionByChainage.get(row.chainageOursKm)?.points.find(item => item.columnKey === columnKey);
            const parsedCheckedRl = draft.checkedRl.trim() ? Number(draft.checkedRl.replace(",", ".")) : null;
            const checkedRl = parsedCheckedRl != null && Number.isFinite(parsedCheckedRl) ? parsedCheckedRl : null;
            const differenceMm = checkedRl == null || calculated?.designLevel == null ? null : (checkedRl - calculated.designLevel) * 1000;
            const pointName = point.side === "CL" ? "CL" : `${point.side}${point.distanceM == null ? "?" : String(point.distanceM)}`;
            return <tr key={`${row.chainageOursKm}:${columnKey}`} className="border-b">
              <td className="p-2 whitespace-nowrap">{formatChainagePair(row.chainageOursKm, settings.bookChainageSystem, Number(settings.consultantOffsetM))}</td>
              <td className="p-2"><label className="flex items-center gap-2"><input type="checkbox" checked={draft.checked} disabled={!canApprove} onChange={event =>
                updatePoint(row.chainageOursKm, columnKey, { checked: event.target.checked })} />{pointName}</label></td>
              <td className="p-2">{calculated?.designLevel == null ? "—" : calculated.designLevel.toFixed(3)}</td>
              <td className="p-2"><Input className="h-8 w-28" inputMode="decimal" aria-label={`Checked RL ${pointName} ${row.chainageOursKm}`}
                value={draft.checkedRl} onChange={event => updatePoint(row.chainageOursKm, columnKey, { checkedRl: event.target.value })} disabled={!canApprove || !draft.checked} /></td>
              <td className="p-2">{differenceMm == null ? "—" : `${differenceMm > 0 ? "+" : ""}${Math.round(differenceMm)} mm`}</td>
            </tr>;
          }))}</tbody>
        </table>
        {!canApprove && <p className="p-3 text-xs text-muted-foreground">You can view the check record but cannot change it.</p>}
      </div>}

      <div className="space-y-2 rounded border p-3">
        <p className="font-medium">Signed sheet</p>
        {attachment.objectPath && !attachmentRemoved && <div className="flex flex-wrap items-center gap-2 text-sm">
          <span>{attachment.fileName}</span>
          <Button type="button" variant="outline" size="sm" onClick={() => setViewingAttachment(true)}>View signed sheet</Button>
          {canApprove && <Button type="button" variant="ghost" size="sm" onClick={() => setAttachmentRemoved(true)}>Remove</Button>}
        </div>}
        {canApprove && <Input type="file" accept="image/*,application/pdf" onChange={event => setSelectedFile(event.target.files?.[0] ?? null)} />}
        {selectedFile && <p className="text-xs">{selectedFile.name}</p>}
      </div>

      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {canApprove && <Button type="button" onClick={save} disabled={!sheetId || saving || isUploading}>
        {saving || isUploading ? "Saving…" : "Save check & sign"}
      </Button>}
      {!sheetId && <p className="text-xs text-muted-foreground">Save the level sheet before recording check details.</p>}

      <AttachmentViewer
        attachment={viewingAttachment && attachment.objectPath && !attachmentRemoved ? {
          id: sheetId ?? 0, moduleType: "level_sheet", linkedRecordId: sheetId ?? 0, siteId: null, boqProjectId: null,
          boqItemId: null, structureId: null, equipmentId: null, materialId: null,
          fileName: attachment.fileName ?? "Signed level sheet", objectPath: attachment.objectPath,
          mimeType: attachment.mimeType, fileSize: attachment.fileSize, caption: null, progressEntryKey: null,
          docType: "other", uploadedBy: null, uploadedAt: null,
        } : null}
        onClose={() => setViewingAttachment(false)}
      />
    </section>
  );
}
