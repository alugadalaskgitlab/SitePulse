import { useEffect, useRef, useState } from "react";
import { AttachmentViewer } from "@/components/AttachmentViewer";
import { Button } from "@/components/ui/button";
import { Input } from "./LevelInput";
import { useUpload } from "@/hooks/use-upload";
import { checkedGridSummary, initialCheckGrid, formatChainage, parseChainage, toBookChainage, toOursChainage, levelPersonName,
  type BookChainageSystem, type CalculatedSection, type CheckDetails, type DesignLevelRow } from "@shared/levelSheets";
import { ReadingsTab, hydrateRows, type SheetReadingRow } from "./ReadingsTab";
import { LevelSignaturePad } from "./LevelSignaturePad";

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
  onCheckedPointsChange, attachment, onSaveCheck, saving, checkDetails, onCheckDetailsChange, designRows = [], tbms = [], allowedClosingErrorMm = 10,
}: {
  checkDetails?: CheckDetails | null;
  onCheckDetailsChange?: (value: CheckDetails) => void;
  designRows?: DesignLevelRow[];
  tbms?: Array<{ id: number; name: string; rl: number; active: boolean; chainageOursKm?: number }>;
  allowedClosingErrorMm?: number;
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
  const initial = (): CheckDetails => ({ grid: initialCheckGrid(readings, checkedPoints.map(point => ({ ...point, checkedRl: point.checkedRl.trim() ? Number(point.checkedRl) : null })), checkDetails?.grid),
    signatures: checkDetails?.signatures ?? { contractor: null, checker: null } });
  const [details, setLocalDetails] = useState<CheckDetails>(initial);
  const detailsRef = useRef(details);
  useEffect(() => { const next = initial(); detailsRef.current = next; setLocalDetails(next); }, [sheetId, checkDetails, readings]);
  const updateDetails = (value: CheckDetails) => { detailsRef.current = value; setLocalDetails(value); onCheckDetailsChange?.(value); };
  const updateGrid = (patch: Partial<CheckDetails["grid"]>) => updateDetails({ ...detailsRef.current, grid: { ...detailsRef.current.grid, ...patch } });
  const formatBook = (value: number | null) => value == null ? "" : formatChainage(toBookChainage(value, settings.bookChainageSystem, settings.consultantOffsetM));
  const [fromText, setFromText] = useState(() => formatBook(details.grid.fromKm));
  const [toText, setToText] = useState(() => formatBook(details.grid.toKm));
  useEffect(() => { setFromText(formatBook(details.grid.fromKm)); setToText(formatBook(details.grid.toKm)); }, [sheetId, details.grid.fromKm, details.grid.toKm, settings.bookChainageSystem, settings.consultantOffsetM]);
  const summary = checkedGridSummary(details.grid, sections);
  const statusText = checkedByType === "not_checked"
    ? "Staff levels — not checked yet"
    : `Checked by ${checkedByType} (${levelPersonName(checkedByName)}) — ${formatBook(details.grid.fromKm)} to ${formatBook(details.grid.toKm)}, ${summary.points.length} points`;

  const save = async () => {
    setError("");
    if (!sheetId) { setError("Save the level sheet before recording its check."); return; }
    if (checkedByType !== "not_checked" && (!checkedByName.trim() || !checkedDate)) {
      setError("Enter the checker name and date.");
      return;
    }
    const from = parseChainage(fromText), to = parseChainage(toText);
    if ((fromText.trim() && from == null) || (toText.trim() && to == null) || (from != null && to != null && from > to)) {
      setError("Enter a valid offered From–To range.");
      return;
    }
    const checkedValues = summary.points;
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
        checkDetails: details,
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

      <div className="space-y-3">
        <h3 className="text-sm font-medium">Stretch offered for checking</h3>
        <div className="grid grid-cols-2 gap-3">
          {(["from", "to"] as const).map(key => <label key={key}>{key === "from" ? "From" : "To"}
            <Input aria-label={`Offered ${key} chainage`} value={key === "from" ? fromText : toText} disabled={!canApprove}
              onChange={event => {
                const value = event.target.value; (key === "from" ? setFromText : setToText)(value);
                const book = parseChainage(value);
                if (!value.trim() || book != null) updateGrid({ [key === "from" ? "fromKm" : "toKm"]: book == null ? null : toOursChainage(book, settings.bookChainageSystem, settings.consultantOffsetM) });
              }} /></label>)}
        </div>
        {checkedByType !== "not_checked" && <ReadingsTab rows={hydrateRows(details.grid.readings).rows}
          onRowsChange={rows => updateGrid({ readings: rows })} mode={details.grid.mode} onModeChange={mode => updateGrid({ mode })}
          header={details.grid.header} onHeaderChange={header => updateGrid({ header: { ...details.grid.header, ...header } })}
          designRows={designRows} settings={settings} tbms={tbms} resetKey={sheetId} readOnly={!canApprove || !sheetId}
          toleranceAboveMm={0} toleranceBelowMm={0} allowedClosingErrorMm={allowedClosingErrorMm}
          comparisonSections={sections} lockGeometry displayRange={details.grid} />}
        <p role="status">Offered {formatBook(details.grid.fromKm)} to {formatBook(details.grid.toKm)} · checked {summary.points.length} points at {summary.chainages} chainages · largest difference {summary.largestDifferenceMm == null ? "—" : Math.round(summary.largestDifferenceMm)} mm</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {(["contractor", "checker"] as const).map(key => <LevelSignaturePad key={key}
          title={key === "contractor" ? "For the contractor (HLC)" : "For the department / consultant"} value={details.signatures[key]}
          disabled={!canApprove || !sheetId} onChange={value => updateDetails({ ...details, signatures: { ...details.signatures, [key]: value } })} />)}
      </div>

      <div className="space-y-2 rounded border p-3">
        <p className="font-medium">Attach signed sheet (photo/PDF)</p>
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
