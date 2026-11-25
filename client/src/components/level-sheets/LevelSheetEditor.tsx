import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "./LevelInput";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { boqItemDisplayText } from "@shared/boqItemName";
import { CheckAndSignTab, type CheckPointDraft } from "./CheckAndSignTab";
import { DesignLevelsTab } from "@/components/level-sheets/DesignLevelsTab";
import { LevelSheetPrintPreview } from "./LevelSheetPrintPreview";
import { ReadingsTab, hydrateRows, type SheetReadingRow } from "@/components/level-sheets/ReadingsTab";
import { ResultsTab } from "./ResultsTab";
import {
  calculateLevelSheet,
  levelSheetBasisLabel,
  LEVEL_SHEET_FALLBACK_LAYERS,
  formatChainagePair,
  type BookChainageSystem,
  type ReadingMode,
} from "@shared/levelSheets";

type Bootstrap = {
  sites: Array<{ id: number; name: string }>;
  siteId: number | null;
  projects: Array<{ id: number; name: string; siteId: number; status: string }>;
  boqProjectId: number | null;
  items: Array<{ id: number; itemCode: string | null; displayName: string | null; itemName: string | null; description: string; unit: string; layerConfig: any }>;
  personnel: Array<{ id: number; name: string; role: string; isActive: number | null }>;
  layerOptions: string[];
  settings: { bookChainageSystem: BookChainageSystem; consultantOffsetM: number };
};
type FormState = {
  siteId: number;
  boqProjectId: string;
  boqItemId: string;
  layerName: string;
  sheetDate: string;
  instrument: string;
  toleranceAboveMm: string;
  toleranceBelowMm: string;
  allowedClosingErrorMm: string;
  readingMode: ReadingMode;
  tbmName: string;
  tbmRl: string;
  initialBackSight: string;
  closingForeSight: string;
  closingTbmName: string;
  closingTbmRl: string;
  basis: string;
  readings: SheetReadingRow[];
  personnelIds: number[];
  status: "draft" | "saved";
};
type CheckFormState = {
  checkedByType: "not_checked" | "department" | "consultant";
  checkedByName: string;
  checkedByDesignation: string;
  checkedDate: string;
  checkedPoints: CheckPointDraft[];
  attachment: { fileName: string | null; objectPath: string | null; mimeType: string | null; fileSize: number | null };
};

function localDate() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}
function blankForm(siteId: number, projectId: number | null, layerName: string): FormState {
  const { rows } = hydrateRows([]);
  return {
    siteId, boqProjectId: projectId ? String(projectId) : "", boqItemId: "",
    layerName: layerName || "Original ground", sheetDate: localDate(), instrument: "",
    toleranceAboveMm: "10", toleranceBelowMm: "10", allowedClosingErrorMm: "10",
    readingMode: "rl", tbmName: "", tbmRl: "", initialBackSight: "", closingForeSight: "",
    closingTbmName: "", closingTbmRl: "",
    basis: "own",
    readings: rows, personnelIds: [], status: "draft",
  };
}
function blankCheckForm(): CheckFormState {
  return {
    checkedByType: "not_checked", checkedByName: "", checkedByDesignation: "", checkedDate: "",
    checkedPoints: [], attachment: { fileName: null, objectPath: null, mimeType: null, fileSize: null },
  };
}
function checkFormFromSheet(sheet: any): CheckFormState {
  return {
    checkedByType: ["not_checked", "department", "consultant"].includes(sheet?.checkedByType) ? sheet.checkedByType : "not_checked",
    checkedByName: String(sheet?.checkedByName ?? ""),
    checkedByDesignation: String(sheet?.checkedByDesignation ?? ""),
    checkedDate: String(sheet?.checkedDate ?? ""),
    checkedPoints: Array.isArray(sheet?.checkedPoints) ? sheet.checkedPoints.map((point: any) => ({
      chainageOursKm: Number(point.chainageOursKm),
      columnKey: String(point.columnKey ?? ""),
      checked: point.checked === true,
      checkedRl: point.checkedRl == null ? "" : String(point.checkedRl),
    })) : [],
    attachment: {
      fileName: sheet?.fileName ?? null, objectPath: sheet?.objectPath ?? null,
      mimeType: sheet?.mimeType ?? null, fileSize: sheet?.fileSize == null ? null : Number(sheet.fileSize),
    },
  };
}
function numberOrNull(value: string) {
  if (!value.trim()) return null;
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}
function getJson(url: string) {
  return fetch(url, { credentials: "include" }).then(async response => {
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body?.message ?? "Could not load BOQ items.");
    return body;
  });
}
function displayItem(item: any) {
  const label = boqItemDisplayText(item);
  return `${item.itemCode ? `${item.itemCode} · ` : ""}${label}`.toLocaleUpperCase("en");
}

export function LevelSheetEditor({ siteId, bootstrap, sheetId, sheet, loadingSheet, sheetError, canCreate, canEdit, canApprove, onBack, onSave, saving, onOpenSiteTab }: {
  onOpenSiteTab?: (tab: "tbms" | "design", layer?: string) => void;
  siteId: number;
  bootstrap: Bootstrap;
  sheetId: number | null;
  sheet: any | null;
  loadingSheet: boolean;
  sheetError: string | null;
  canCreate: boolean;
  canEdit: boolean;
  canApprove: boolean;
  onBack: () => void;
  onSave: (payload: any) => void;
  saving: boolean;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("design");
  const [otherLayer, setOtherLayer] = useState(false);
  const [form, setForm] = useState<FormState>(() => blankForm(siteId, bootstrap.boqProjectId, bootstrap.layerOptions[0] ?? "Original ground"));
  const [checkForm, setCheckForm] = useState<CheckFormState>(() => blankCheckForm());
  const [settings, setSettings] = useState<Bootstrap["settings"]>(bootstrap.settings);
  const [settingsSaved, setSettingsSaved] = useState(false);
  const resetKey = sheetId;

  useEffect(() => {
    setSettings({
      bookChainageSystem: bootstrap.settings?.bookChainageSystem ?? "ours",
      consultantOffsetM: Number(bootstrap.settings?.consultantOffsetM ?? 0),
    });
  }, [siteId, bootstrap.settings?.bookChainageSystem, bootstrap.settings?.consultantOffsetM]);

  useEffect(() => {
    if (sheetId == null) {
      setForm(blankForm(siteId, bootstrap.boqProjectId, bootstrap.layerOptions[0] ?? "Original ground"));
      setCheckForm(blankCheckForm());
      setActiveTab("design");
      return;
    }
    if (!sheet || Number(sheet.id) !== sheetId) return;
    setCheckForm(checkFormFromSheet(sheet));
    setForm({
      siteId: Number(sheet.siteId),
      boqProjectId: sheet.boqProjectId == null ? "" : String(sheet.boqProjectId),
      boqItemId: sheet.boqItemId == null ? "" : String(sheet.boqItemId),
      layerName: String(sheet.layerName ?? ""),
      sheetDate: String(sheet.sheetDate),
      instrument: String(sheet.instrument ?? ""),
      toleranceAboveMm: String(sheet.toleranceAboveMm ?? 10),
      toleranceBelowMm: String(sheet.toleranceBelowMm ?? 10),
      allowedClosingErrorMm: String(sheet.allowedClosingErrorMm ?? 10),
      readingMode: sheet.readingMode === "staff" ? "staff" : "rl",
      tbmName: String(sheet.tbmName ?? ""),
      tbmRl: sheet.tbmRl == null ? "" : String(sheet.tbmRl),
      initialBackSight: sheet.initialBackSight == null ? "" : String(sheet.initialBackSight),
      closingForeSight: sheet.closingForeSight == null ? "" : String(sheet.closingForeSight),
      closingTbmName: String(sheet.closingTbmName ?? ""),
      closingTbmRl: sheet.closingTbmRl == null ? "" : String(sheet.closingTbmRl),
      basis: sheet.basis ?? "own",
      readings: hydrateRows(sheet.readings).rows,
      personnelIds: (sheet.personnelIds ?? sheet.staff?.map((person: any) => person.id) ?? []).map(Number),
      status: sheet.status === "saved" ? "saved" : "draft",
    });
    setActiveTab("readings");
  }, [sheetId, sheet?.id, siteId, bootstrap.boqProjectId, bootstrap.layerOptions]);

  const projectItemsQuery = useQuery({
    queryKey: ["/api/level-sheets/bootstrap", siteId, form.boqProjectId],
    queryFn: () => getJson(`/api/level-sheets/bootstrap?siteId=${siteId}${form.boqProjectId ? `&boqProjectId=${form.boqProjectId}` : ""}`),
    enabled: siteId > 0 && !!form.boqProjectId,
  });
  const projectData = projectItemsQuery.data;
  const items = projectData?.items ?? (Number(form.boqProjectId) === Number(bootstrap.boqProjectId) ? bootstrap.items : []);
  const layerOptions = [...new Set([
    ...bootstrap.layerOptions, ...(projectData?.layerOptions ?? []), ...LEVEL_SHEET_FALLBACK_LAYERS,
    form.layerName,
  ].filter(Boolean))];
  const staff = useMemo(() => {
    const all = [...bootstrap.personnel];
    for (const person of sheet?.staff ?? []) {
      if (!all.some(active => Number(active.id) === Number(person.id))) all.push(person);
    }
    return all;
  }, [bootstrap.personnel, sheet?.staff]);

  const designQuery = useQuery({
    queryKey: ["/api/level-sheets/design", siteId, form.layerName],
    queryFn: () => getJson(`/api/level-sheets/design?siteId=${siteId}&layerName=${encodeURIComponent(form.layerName)}`),
    enabled: siteId > 0 && !!form.layerName,
  });
  const designRows = designQuery.data?.rows ?? [];
  const tbmsQuery = useQuery({
    queryKey: ["/api/level-sheets/tbms", siteId],
    queryFn: () => getJson(`/api/level-sheets/tbms?siteId=${siteId}`),
  });
  const calc = useMemo(() => calculateLevelSheet({
    designRows,
    readings: form.readings,
    mode: form.readingMode,
    tbmRl: numberOrNull(form.tbmRl),
    backsight: numberOrNull(form.initialBackSight),
    closingForesight: numberOrNull(form.closingForeSight),
    closingTbmRl: numberOrNull(form.closingTbmRl),
    toleranceAboveMm: Number(form.toleranceAboveMm || 0),
    toleranceBelowMm: Number(form.toleranceBelowMm || 0),
  }), [designRows, form.readings, form.readingMode, form.tbmRl, form.initialBackSight, form.closingForeSight, form.closingTbmRl, form.toleranceAboveMm, form.toleranceBelowMm]);
  const settingsMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("PUT", "/api/level-sheets/site-settings", { siteId, ...settings });
      return response.json();
    },
    onSuccess: async saved => {
      setSettings({ bookChainageSystem: saved.bookChainageSystem, consultantOffsetM: Number(saved.consultantOffsetM) });
      setSettingsSaved(true);
      await queryClient.invalidateQueries({ queryKey: ["/api/level-sheets/bootstrap", siteId] });
      toast({ title: "Chainage settings saved" });
    },
    onError: error => toast({ title: "Could not save chainage settings", description: error.message, variant: "destructive" }),
  });
  const checkMutation = useMutation({
    mutationFn: async (payload: any) => {
      if (!sheetId) throw new Error("Save the level sheet before recording its check.");
      const response = await apiRequest("PATCH", `/api/level-sheets/${sheetId}/check`, payload);
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.message ?? "Check details could not be saved.");
      return body;
    },
    onSuccess: async saved => {
      setCheckForm(checkFormFromSheet(saved));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["/api/level-sheets", siteId] }),
        queryClient.invalidateQueries({ queryKey: ["/api/level-sheets", Number(saved.id)] }),
      ]);
      toast({ title: "Check details saved" });
    },
    onError: error => toast({ title: "Could not save check details", description: error.message, variant: "destructive" }),
  });

  const selectedSite = bootstrap.sites.find(site => Number(site.id) === siteId);
  const projectOptions = bootstrap.projects.filter(project => Number(project.siteId) === siteId);
  const sheetCanSave = sheetId == null ? canCreate : canEdit;
  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm(current => ({ ...current, [key]: value }));
  const setCheckedByType = (value: CheckFormState["checkedByType"]) => setCheckForm(current => value === "not_checked"
    ? { ...current, checkedByType: value, checkedByName: "", checkedByDesignation: "", checkedDate: "", checkedPoints: [] }
    : { ...current, checkedByType: value, checkedDate: current.checkedDate || localDate() });
  const staffNames = staff.filter(person => form.personnelIds.includes(Number(person.id))).map(person => person.name);
  const save = (status: "draft" | "saved") => {
    const numericField = (value: string) => numberOrNull(value);
    const readings = form.readings.map(row => ({
      ...row,
      points: row.points.map(point => ({ ...point, value: point.value == null ? null : Number(point.value) })),
    }));
    onSave({
      ...form,
      siteId,
      boqProjectId: form.boqProjectId || null,
      boqItemId: form.boqItemId || null,
      toleranceAboveMm: numericField(form.toleranceAboveMm),
      toleranceBelowMm: numericField(form.toleranceBelowMm),
      allowedClosingErrorMm: numericField(form.allowedClosingErrorMm),
      tbmRl: numericField(form.tbmRl),
      initialBackSight: numericField(form.initialBackSight),
      closingForeSight: numericField(form.closingForeSight),
      closingTbmRl: numericField(form.closingTbmRl),
      readings,
      status,
    });
  };

  if (loadingSheet) return <Card><CardContent className="p-8 text-center">Loading level sheet…</CardContent></Card>;
  if (sheetError) return <Card><CardContent className="space-y-4 p-6"><p role="alert" className="text-destructive">{sheetError}</p><Button variant="outline" onClick={onBack}>Back to list</Button></CardContent></Card>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="icon" aria-label="Back to level sheets" onClick={onBack}><ArrowLeft className="h-4 w-4" /></Button>
          <div><h2 className="text-xl font-semibold">{sheetId ? "Level sheet" : "New level sheet"}</h2><p className="text-sm text-muted-foreground">{selectedSite?.name?.toLocaleUpperCase("en")}</p></div>
        </div>
        <div className="flex gap-2">
          <LevelSheetPrintPreview
            siteName={selectedSite?.name ?? ""}
            itemLabel={items.find((item: any) => Number(item.id) === Number(form.boqItemId)) ? displayItem(items.find((item: any) => Number(item.id) === Number(form.boqItemId))) : String(sheet?.itemLabel ?? "")}
            layerName={form.layerName} sheetDate={form.sheetDate} instrument={form.instrument}
            tbmName={form.tbmName} tbmRl={form.tbmRl} closingErrorMm={calc.closingErrorMm}
            readings={form.readings} calculation={calc} settings={settings} staffNames={staffNames}
            checkedByType={checkForm.checkedByType} checkedByName={checkForm.checkedByName}
            checkedByDesignation={checkForm.checkedByDesignation} checkedDate={checkForm.checkedDate}
            basisLabel={levelSheetBasisLabel({ basis: form.basis, checkedByType: checkForm.checkedByType })}
            closingTbmName={form.closingTbmName} closingTbmRl={form.closingTbmRl}
          />
          {sheetCanSave && <Button variant="outline" onClick={() => save("draft")} disabled={saving}><Save className="mr-2 h-4 w-4" /> Save draft</Button>}
          {sheetCanSave && <Button onClick={() => save("saved")} disabled={saving}><Save className="mr-2 h-4 w-4" /> Save levels</Button>}
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Level sheet details</CardTitle></CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="space-y-1 text-sm"><span>BOQ project (optional)</span>
            <select className="h-10 w-full rounded-md border bg-background px-3" value={form.boqProjectId} onChange={event => setForm(current => ({ ...current, boqProjectId: event.target.value, boqItemId: "" }))} disabled={!sheetCanSave}>
              <option value="">No BOQ project</option>{projectOptions.map(project => <option key={project.id} value={String(project.id)}>{project.name.toLocaleUpperCase("en")}</option>)}
            </select>
          </label>
          <label className="space-y-1 text-sm"><span>BOQ item (optional)</span>
            <select className="h-10 w-full rounded-md border bg-background px-3" value={form.boqItemId} onChange={event => setField("boqItemId", event.target.value)} disabled={!sheetCanSave || !form.boqProjectId}>
              <option value="">No BOQ item</option>{items.map((item: any) => <option key={item.id} value={String(item.id)}>{displayItem(item)}</option>)}
            </select>
          </label>
          <label className="space-y-1 text-sm"><span>Levels of</span>
            <select aria-label="Levels of" className="h-10 w-full rounded border bg-background px-3" value={otherLayer ? "__other" : form.layerName} onChange={event => {
              setOtherLayer(event.target.value === "__other");
              if (event.target.value !== "__other") setField("layerName", event.target.value);
            }} disabled={!sheetCanSave}>
              {layerOptions.map(layer => <option key={layer} value={layer}>{layer.toUpperCase()}</option>)}<option value="__other">Other…</option>
            </select>
            {otherLayer && <Input aria-label="Other layer" value={form.layerName} onChange={event => setField("layerName", event.target.value)} disabled={!sheetCanSave} />}
          </label>
          <label className="space-y-1 text-sm"><span>Date</span><Input type="date" value={form.sheetDate} onChange={event => setField("sheetDate", event.target.value)} disabled={!sheetCanSave} /></label>
          <label className="space-y-1 text-sm"><span>Instrument</span><Input value={form.instrument} onChange={event => setField("instrument", event.target.value)} disabled={!sheetCanSave} /></label>
          <label className="space-y-1 text-sm"><span>Basis</span>
            {checkForm.checkedByType !== "not_checked"
              ? <p>{levelSheetBasisLabel({ checkedByType: checkForm.checkedByType })}</p>
              : <select className="h-10 w-full rounded border bg-background px-3" value={form.basis} disabled={!sheetCanSave} onChange={event => setField("basis", event.target.value)}>
                <option value="own">Own levels</option><option value="consultant">Consultant</option><option value="assumed">Assumed or agreed</option>
              </select>}
          </label>
          <label className="space-y-1 text-sm"><span>Tolerance above (mm)</span><Input inputMode="decimal" value={form.toleranceAboveMm} onChange={event => setField("toleranceAboveMm", event.target.value)} disabled={!sheetCanSave} /></label>
          <label className="space-y-1 text-sm"><span>Tolerance below (mm)</span><Input inputMode="decimal" value={form.toleranceBelowMm} onChange={event => setField("toleranceBelowMm", event.target.value)} disabled={!sheetCanSave} /></label>
          <label className="space-y-1 text-sm"><span>Allowed closing error (mm)</span><Input inputMode="decimal" value={form.allowedClosingErrorMm} onChange={event => setField("allowedClosingErrorMm", event.target.value)} disabled={!sheetCanSave} /></label>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Chainage settings</CardTitle></CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <label className="space-y-1 text-sm"><span>Consultant chainage format</span>
            <select className="h-10 w-full rounded-md border bg-background px-3" value={settings.bookChainageSystem} onChange={event => {
              setSettings(current => ({ ...current, bookChainageSystem: event.target.value as BookChainageSystem }));
              setSettingsSaved(false);
            }} disabled={!canEdit}>
              <option value="ours">Ours</option><option value="consultant">Consultant</option>
            </select>
          </label>
          <label className="space-y-1 text-sm"><span>Consultant offset (m)</span>
            <Input inputMode="decimal" value={String(settings.consultantOffsetM)} onChange={event => {
              const value = numberOrNull(event.target.value);
              if (value != null) setSettings(current => ({ ...current, consultantOffsetM: value }));
              setSettingsSaved(false);
            }} disabled={!canEdit || settings.bookChainageSystem !== "consultant"} />
          </label>
          {canEdit && <Button variant="outline" onClick={() => settingsMutation.mutate()} disabled={settingsMutation.isPending}>Save settings</Button>}
          <p className="text-xs text-muted-foreground sm:col-span-3">
            Ours and consultant chainages are shown together. Example: {formatChainagePair(2.6, settings.bookChainageSystem, Number(settings.consultantOffsetM))}.
            {settingsSaved ? " Settings saved." : ""}
          </p>
        </CardContent>
      </Card>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid h-auto w-full grid-cols-2 sm:grid-cols-4">
          <TabsTrigger value="design" className="whitespace-normal py-2">1. Design levels</TabsTrigger>
          <TabsTrigger value="readings" className="whitespace-normal py-2">2. Readings</TabsTrigger>
          <TabsTrigger value="results" className="whitespace-normal py-2">3. Result &amp; quantities</TabsTrigger>
          <TabsTrigger value="check" className="whitespace-normal py-2">4. Check &amp; sign</TabsTrigger>
        </TabsList>
        <TabsContent value="design">
          <Card><CardContent className="p-4">
            <p className="mb-3 text-sm">Design levels for this sheet’s layer are read-only here. <button type="button" className="underline" onClick={() => onOpenSiteTab?.("design", form.layerName)}>Edit in Design levels</button></p>
            <DesignLevelsTab siteId={siteId} layerName={form.layerName} settings={settings} canCreate={false} canEdit={false} readOnly />
          </CardContent></Card>
        </TabsContent>
        <TabsContent value="readings">
          <Card><CardContent className="p-4">
            <ReadingsTab
              resetKey={resetKey}
              rows={form.readings}
              onRowsChange={rows => setField("readings", rows)}
              mode={form.readingMode}
              onModeChange={mode => setField("readingMode", mode)}
              designRows={designRows}
              settings={settings}
              header={{ tbmName: form.tbmName, tbmRl: form.tbmRl, initialBackSight: form.initialBackSight, closingForeSight: form.closingForeSight, closingTbmName: form.closingTbmName, closingTbmRl: form.closingTbmRl }}
              tbms={Array.isArray(tbmsQuery.data) ? tbmsQuery.data : []}
              onOpenTbms={() => onOpenSiteTab?.("tbms")}
              onHeaderChange={header => setForm(current => ({ ...current, ...header }))}
              toleranceAboveMm={Number(form.toleranceAboveMm || 0)}
              toleranceBelowMm={Number(form.toleranceBelowMm || 0)}
              allowedClosingErrorMm={Number(form.allowedClosingErrorMm || 0)}
              readOnly={!sheetCanSave}
            />
            {tbmsQuery.isError && <p role="alert">Could not load TBMs.</p>}
          </CardContent></Card>
        </TabsContent>
        <TabsContent value="results">
          <Card><CardHeader><CardTitle className="text-base">Result &amp; quantities</CardTitle></CardHeader><CardContent className="space-y-4">
            <p className="text-sm">Closing error: {calc.closingErrorMm == null ? "—" : `${Math.round(calc.closingErrorMm)} mm`}</p>
            <ResultsTab readings={form.readings} calculation={calc} designRows={designRows} settings={settings} readingMode={form.readingMode} />
            {designQuery.isError && <p role="alert" className="text-sm text-destructive">Could not load design levels: {(designQuery.error as Error).message}</p>}
          </CardContent></Card>
        </TabsContent>
        <TabsContent value="check">
          <Card><CardHeader><CardTitle className="text-base">Check &amp; sign</CardTitle></CardHeader><CardContent className="p-4">
            <CheckAndSignTab
              sheetId={sheetId} canEdit={sheetCanSave} canApprove={canApprove} staff={staff}
              personnelIds={form.personnelIds} onPersonnelIdsChange={ids => setField("personnelIds", ids)}
              readings={form.readings} sections={calc.sections} settings={settings}
              checkedByType={checkForm.checkedByType} checkedByName={checkForm.checkedByName}
              checkedByDesignation={checkForm.checkedByDesignation} checkedDate={checkForm.checkedDate}
              checkedPoints={checkForm.checkedPoints}
              onCheckedByTypeChange={setCheckedByType}
              onCheckedByNameChange={value => setCheckForm(current => ({ ...current, checkedByName: value }))}
              onCheckedByDesignationChange={value => setCheckForm(current => ({ ...current, checkedByDesignation: value }))}
              onCheckedDateChange={value => setCheckForm(current => ({ ...current, checkedDate: value }))}
              onCheckedPointsChange={rows => setCheckForm(current => ({ ...current, checkedPoints: rows }))}
              attachment={checkForm.attachment}
              onSaveCheck={payload => checkMutation.mutateAsync(payload)}
              saving={checkMutation.isPending}
            />
          </CardContent></Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
