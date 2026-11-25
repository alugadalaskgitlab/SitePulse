import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as XLSX from "xlsx";
import { FileSpreadsheet, Plus, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "./LevelInput";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  formatChainagePair,
  formatChainage,
  normalizeDesignImportRows,
  consultantLayoutLayers,
  type ConsultantLayerImport,
  parseChainage,
  toOursChainage,
  toBookChainage,
  type BookChainageSystem,
} from "@shared/levelSheets";

type Row = {
  id: number;
  chainageOursKm: number;
  centreLevel: number;
  crossfallLeftPct: number;
  crossfallRightPct: number;
  topWidthLeftM: number;
  topWidthRightM: number;
  source: "EXCEL" | "TYPED";
};
type Settings = { bookChainageSystem: BookChainageSystem; consultantOffsetM: number };
type Mapping = {
  chainage: string; centreLevel: string; crossfallLeft: string; crossfallRight: string;
  topWidthLeft: string; topWidthRight: string;
};
const EMPTY_MAPPING: Mapping = {
  chainage: "", centreLevel: "", crossfallLeft: "", crossfallRight: "", topWidthLeft: "", topWidthRight: "",
};
const MAPPING_FIELDS: Array<[keyof Mapping, string, RegExp]> = [
  ["chainage", "Chainage", /chainage|chain|km/i],
  ["centreLevel", "Level at centre", /centre|center|level|rl/i],
  ["crossfallLeft", "Cross-fall left %", /cross.?fall.*left|left.*cross.?fall|lhs.*fall/i],
  ["crossfallRight", "Cross-fall right %", /cross.?fall.*right|right.*cross.?fall|rhs.*fall/i],
  ["topWidthLeft", "Top width left (m)", /width.*left|left.*width|lhs.*width/i],
  ["topWidthRight", "Top width right (m)", /width.*right|right.*width|rhs.*width/i],
];

function getJson(url: string) {
  return fetch(url, { credentials: "include" }).then(async response => {
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body?.message ?? "Could not load design levels.");
    return body;
  });
}

function numberText(value: unknown) {
  return value == null ? "" : String(value);
}
function asNumber(value: string) {
  if (!value.trim()) return null;
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

export function DesignLevelsTab({ siteId, layerName, settings, canCreate, canEdit }: {
  siteId: number; layerName: string; settings: Settings; canCreate: boolean; canEdit: boolean;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [newRow, setNewRow] = useState({
    chainage: "", centreLevel: "", crossfallLeftPct: "", crossfallRightPct: "",
    topWidthLeftM: "", topWidthRightM: "",
  });
  const [rows, setRows] = useState<Row[]>([]);
  const [frlSource, setFrlSource] = useState("");
  const [targetLayer, setTargetLayer] = useState(layerName);
  const [depthM, setDepthM] = useState("");
  const [replaceDerived, setReplaceDerived] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importName, setImportName] = useState("");
  const [importHeaders, setImportHeaders] = useState<string[]>([]);
  const [importRows, setImportRows] = useState<Array<Record<string, unknown>>>([]);
  const [mapping, setMapping] = useState<Mapping>(EMPTY_MAPPING);
  const [replaceImport, setReplaceImport] = useState(false);
  const [importMessage, setImportMessage] = useState("");
  const [matrix, setMatrix] = useState<unknown[][]>([]);
  const [multiLayers, setMultiLayers] = useState<Array<ConsultantLayerImport & { selected: boolean }>>([]);

  const designQuery = useQuery({
    queryKey: ["/api/level-sheets/design", siteId, layerName],
    queryFn: () => getJson(`/api/level-sheets/design?siteId=${siteId}&layerName=${encodeURIComponent(layerName)}`),
    enabled: siteId > 0 && !!layerName,
  });
  useEffect(() => {
    setRows((designQuery.data?.rows ?? []) as Row[]);
  }, [designQuery.data]);
  useEffect(() => {
    setNewRow({ chainage: "", centreLevel: "", crossfallLeftPct: "", crossfallRightPct: "", topWidthLeftM: "", topWidthRightM: "" });
    setTargetLayer(layerName);
  }, [siteId, layerName]);

  const layerNamesQuery = useQuery({
    queryKey: ["/api/level-sheets/bootstrap", siteId],
    queryFn: () => getJson(`/api/level-sheets/bootstrap?siteId=${siteId}`),
    enabled: siteId > 0,
  });
  const layerOptions = useMemo(() => [...new Set([
    ...(layerNamesQuery.data?.layerOptions ?? []),
    ...rows.map(row => layerName),
    layerName,
  ].filter(Boolean))], [layerNamesQuery.data?.layerOptions, rows, layerName]);

  const refreshRows = async () => {
    await queryClient.invalidateQueries({ queryKey: ["/api/level-sheets/design", siteId, layerName] });
  };
  const addMutation = useMutation({
    mutationFn: async () => {
      const bookKm = parseChainage(newRow.chainage);
      if (bookKm == null) throw new Error("Enter a valid chainage.");
      const payload = {
        siteId, layerName,
        chainageOursKm: toOursChainage(bookKm, settings.bookChainageSystem, Number(settings.consultantOffsetM)),
        centreLevel: asNumber(newRow.centreLevel),
        crossfallLeftPct: asNumber(newRow.crossfallLeftPct),
        crossfallRightPct: asNumber(newRow.crossfallRightPct),
        topWidthLeftM: asNumber(newRow.topWidthLeftM),
        topWidthRightM: asNumber(newRow.topWidthRightM),
      };
      if (Object.values(payload).some(value => value == null)) throw new Error("Enter a level, both cross-falls and both widths.");
      const response = await apiRequest("POST", "/api/level-sheets/design/rows", payload);
      return response.json();
    },
    onSuccess: async () => {
      setNewRow({ chainage: "", centreLevel: "", crossfallLeftPct: "", crossfallRightPct: "", topWidthLeftM: "", topWidthRightM: "" });
      await refreshRows();
      toast({ title: "Design row saved" });
    },
    onError: error => toast({ title: "Could not save design row", description: error.message, variant: "destructive" }),
  });
  const editMutation = useMutation({
    mutationFn: async (row: Row) => {
      const response = await apiRequest("PATCH", `/api/level-sheets/design/rows/${row.id}`, row);
      return response.json();
    },
    onSuccess: async () => {
      await refreshRows();
      toast({ title: "Design row updated" });
    },
    onError: error => toast({ title: "Could not update design row", description: error.message, variant: "destructive" }),
  });
  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/level-sheets/design/rows/${id}`);
    },
    onSuccess: refreshRows,
    onError: error => toast({ title: "Could not remove design row", description: error.message, variant: "destructive" }),
  });
  const importMutation = useMutation({
    mutationFn: async () => {
      if (multiLayers.length) {
        const response = await apiRequest("POST", "/api/level-sheets/design/import-layers", {
          siteId, matrix, layers: multiLayers.filter(layer => layer.selected).map(layer => ({ key: layer.key, layerName: layer.layerName })), replace: replaceImport,
        });
        const result = await response.json();
        return { imported: Array(result.imported).fill(null), skipped: Array(result.skipped).fill(null) };
      }
      const normalized = normalizeDesignImportRows(
        importRows, mapping, settings.bookChainageSystem, Number(settings.consultantOffsetM),
      );
      const response = await apiRequest("POST", "/api/level-sheets/design/import", {
        siteId, layerName, columns: mapping, rows: importRows, replace: replaceImport,
      });
      const result = await response.json();
      return { ...result, previewCount: normalized.length };
    },
    onSuccess: async result => {
      setImportMessage(`${result.imported.length} rows imported${result.skipped.length ? ` · ${result.skipped.length} typed rows kept` : ""}.`);
      setImportOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["/api/level-sheets/design", siteId] });
      await queryClient.invalidateQueries({ queryKey: ["/api/level-sheets/bootstrap", siteId] });
      toast({ title: "Excel design levels imported", description: `${result.imported.length} rows saved.` });
    },
    onError: error => toast({ title: "Could not import design levels", description: error.message, variant: "destructive" }),
  });
  const deriveMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/level-sheets/design/derive", {
        siteId, sourceLayer: frlSource, targetLayer, depthM: asNumber(depthM), replace: replaceDerived,
      });
      return response.json();
    },
    onSuccess: async result => {
      setImportMessage(`${result.created.length} rows derived from FRL.`);
      await queryClient.invalidateQueries({ queryKey: ["/api/level-sheets/design"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/level-sheets/bootstrap", siteId] });
      toast({ title: "Design levels derived from FRL", description: `${result.created.length} rows saved.` });
    },
    onError: error => toast({ title: "Could not derive design levels", description: error.message, variant: "destructive" }),
  });

  const updateRow = (id: number, field: keyof Row, value: string) => {
    const parsed = field === "chainageOursKm" ? parseChainage(value) : asNumber(value);
    if (parsed == null) return;
    setRows(current => current.map(row => row.id === id ? { ...row, [field]: parsed } : row));
  };

  const readExcel = async (file?: File) => {
    if (!file) return;
    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rawMatrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" });
      const layers = consultantLayoutLayers(rawMatrix, settings.bookChainageSystem, Number(settings.consultantOffsetM));
      setMatrix(rawMatrix);
      setMultiLayers(layers.map(layer => ({ ...layer, selected: true })));
      if (layers.length) {
        setImportName(file.name); setImportRows([]); setReplaceImport(false); setImportMessage(""); setImportOpen(true);
        return;
      }
      const imported = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" })
        .filter(row => Object.values(row).some(value => String(value ?? "").trim() !== ""));
      if (!imported.length) throw new Error("The selected sheet has no data rows.");
      const headers = Object.keys(imported[0]);
      setImportRows(imported);
      setImportHeaders(headers);
      setImportName(file.name);
      setMapping(Object.fromEntries(MAPPING_FIELDS.map(([key, , pattern]) => [
        key, headers.find(header => pattern.test(header)) ?? "",
      ])) as Mapping);
      setReplaceImport(false);
      setImportMessage("");
      setImportOpen(true);
    } catch (error) {
      toast({ title: "Could not read the Excel file", description: error instanceof Error ? error.message : "Check the file and try again.", variant: "destructive" });
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const preview = useMemo(() => {
    if (!importRows.length || Object.values(mapping).some(value => !value)) return [];
    try {
      return normalizeDesignImportRows(importRows.slice(0, 5), mapping, settings.bookChainageSystem, Number(settings.consultantOffsetM));
    } catch { return []; }
  }, [importRows, mapping, settings]);

  const changeMapping = (key: keyof Mapping, value: string) => setMapping(current => ({ ...current, [key]: value }));

  return (
    <div className="space-y-5">
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="font-semibold">Design levels · {layerName.toLocaleUpperCase("en")}</h3>
            <p className="text-xs text-muted-foreground">Reusable for every level sheet at this site and layer.</p>
          </div>
          <div className="flex gap-2">
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={event => void readExcel(event.target.files?.[0])} />
            {canCreate && <Button variant="outline" onClick={() => fileRef.current?.click()}><Upload className="mr-2 h-4 w-4" /> Import consultant Excel</Button>}
          </div>
        </div>
        {importMessage && <p role="status" className="text-sm text-muted-foreground">{importMessage}</p>}
        {designQuery.isLoading && <p className="text-sm text-muted-foreground">Loading design rows…</p>}
        {designQuery.isError && <p role="alert" className="text-sm text-destructive">{(designQuery.error as Error).message}</p>}
        {!!rows.length && <div className="overflow-x-auto rounded border">
          <table className="min-w-[980px] w-full text-sm">
            <thead><tr className="border-b bg-muted/40 text-left text-xs">
              <th className="p-2">Chainage</th><th className="p-2">Level at centre</th><th className="p-2">Cross-fall left %</th>
              <th className="p-2">Cross-fall right %</th><th className="p-2">Top width left (m)</th><th className="p-2">Top width right (m)</th><th className="p-2">From</th><th className="p-2">Actions</th>
            </tr></thead>
            <tbody>{rows.map(row => <tr key={row.id} className="border-b">
              <td className="p-2">
                <Input aria-label={`Chainage ${row.id}`} value={formatChainage(toBookChainage(row.chainageOursKm, settings.bookChainageSystem, Number(settings.consultantOffsetM)))}
                  onChange={event => {
                    const book = parseChainage(event.target.value);
                    if (book != null) updateRow(row.id, "chainageOursKm", String(toOursChainage(book, settings.bookChainageSystem, Number(settings.consultantOffsetM))));
                  }} disabled={!canEdit} />
                <span className="mt-1 block whitespace-nowrap text-[10px] text-muted-foreground">{formatChainagePair(row.chainageOursKm, settings.bookChainageSystem, Number(settings.consultantOffsetM))}</span>
              </td>
              {([
                ["centreLevel", "Level at centre"], ["crossfallLeftPct", "Cross-fall left"],
                ["crossfallRightPct", "Cross-fall right"], ["topWidthLeftM", "Top width left"],
                ["topWidthRightM", "Top width right"],
              ] as Array<[keyof Row, string]>).map(([field, label]) => <td key={field} className="p-2">
                <Input aria-label={`${label} ${row.id}`} type="text" inputMode="decimal" value={numberText(row[field])}
                  onChange={event => updateRow(row.id, field, event.target.value)} disabled={!canEdit} />
              </td>)}
              <td className="p-2 font-medium">{row.source}</td>
              <td className="p-2"><div className="flex gap-1">
                {canEdit && <Button size="sm" variant="outline" onClick={() => editMutation.mutate(row)} disabled={editMutation.isPending}>Save</Button>}
                {canEdit && <Button size="icon" variant="ghost" aria-label={`Remove design row ${row.id}`} onClick={() => deleteMutation.mutate(row.id)} disabled={deleteMutation.isPending}><Trash2 className="h-4 w-4" /></Button>}
              </div></td>
            </tr>)}</tbody>
          </table>
        </div>}

        {canCreate && <div className="rounded-lg border p-3">
          <h4 className="mb-2 text-sm font-semibold">Type a row</h4>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-6">
            <Input aria-label="New design chainage" placeholder="Chainage" value={newRow.chainage} onChange={event => setNewRow(current => ({ ...current, chainage: event.target.value }))} />
            <Input aria-label="New centre level" placeholder="Centre level" inputMode="decimal" value={newRow.centreLevel} onChange={event => setNewRow(current => ({ ...current, centreLevel: event.target.value }))} />
            <Input aria-label="New left cross-fall" placeholder="Left %" inputMode="decimal" value={newRow.crossfallLeftPct} onChange={event => setNewRow(current => ({ ...current, crossfallLeftPct: event.target.value }))} />
            <Input aria-label="New right cross-fall" placeholder="Right %" inputMode="decimal" value={newRow.crossfallRightPct} onChange={event => setNewRow(current => ({ ...current, crossfallRightPct: event.target.value }))} />
            <Input aria-label="New left top width" placeholder="Left width (m)" inputMode="decimal" value={newRow.topWidthLeftM} onChange={event => setNewRow(current => ({ ...current, topWidthLeftM: event.target.value }))} />
            <Input aria-label="New right top width" placeholder="Right width (m)" inputMode="decimal" value={newRow.topWidthRightM} onChange={event => setNewRow(current => ({ ...current, topWidthRightM: event.target.value }))} />
          </div>
          <Button className="mt-2" onClick={() => addMutation.mutate()} disabled={addMutation.isPending}><Plus className="mr-2 h-4 w-4" /> Add design row</Button>
        </div>}
      </section>

      <section className="space-y-3 rounded-lg border p-3">
        <div className="flex items-center gap-2"><FileSpreadsheet className="h-4 w-4" /><h3 className="font-semibold">Work out from FRL − depth</h3></div>
        <p className="text-sm text-muted-foreground">Layer level = FRL at centre − depth (m). Cross-falls and widths copy from the FRL rows.</p>
        <div className="grid gap-2 md:grid-cols-4">
          <select aria-label="FRL source layer" className="h-10 rounded-md border bg-background px-3" value={frlSource} onChange={event => setFrlSource(event.target.value)}>
            <option value="">Choose FRL source layer</option>
            {layerOptions.map(layer => <option key={layer} value={layer}>{layer.toLocaleUpperCase("en")}</option>)}
          </select>
          <Input aria-label="Target layer name" value={targetLayer} onChange={event => setTargetLayer(event.target.value)} placeholder="Target layer" />
          <Input aria-label="Depth in metres" type="text" inputMode="decimal" value={depthM} onChange={event => setDepthM(event.target.value)} placeholder="Depth (m)" />
          <Button variant="outline" onClick={() => deriveMutation.mutate()} disabled={!canCreate || deriveMutation.isPending || !frlSource || !targetLayer || asNumber(depthM) == null}>
            Generate rows
          </Button>
        </div>
        {canEdit && <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={replaceDerived} onChange={event => setReplaceDerived(event.target.checked)} />
          Replace target design rows
        </label>}
      </section>

      {importOpen && <div role="dialog" aria-modal="true" aria-label="Import consultant Excel" className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3">
        <div className="max-h-[90vh] w-full max-w-5xl space-y-4 overflow-auto rounded-lg bg-background p-4 shadow-lg">
          <div className="flex items-center justify-between gap-3">
            <div><h3 className="font-semibold">Import consultant Excel</h3><p className="text-sm text-muted-foreground">{importName} · {importRows.length} rows</p></div>
            <Button variant="outline" onClick={() => setImportOpen(false)}>Close</Button>
          </div>
          {!!multiLayers.length && <div className="space-y-2">
            {multiLayers.map((layer, index) => <div className="grid items-center gap-2 rounded border p-2 sm:grid-cols-[auto_1fr_1fr]" key={layer.key}>
              <input aria-label={`Import ${layer.layerName}`} type="checkbox" checked={layer.selected} onChange={event => setMultiLayers(current => current.map((row, i) => i === index ? { ...row, selected: event.target.checked } : row))} />
              <Input aria-label={`Layer name ${index + 1}`} value={layer.layerName} onChange={event => setMultiLayers(current => current.map((row, i) => i === index ? { ...row, layerName: event.target.value } : row))} />
              <span>Offsets {layer.offsets.join(", ")} m · {layer.rows.length} rows</span>
              <div className="sm:col-span-3">{layer.rows.slice(0, 3).map(row => <p className="text-xs" key={row.chainageOursKm}>
                {formatChainagePair(row.chainageOursKm, settings.bookChainageSystem, Number(settings.consultantOffsetM))} · {row.centreLevel.toFixed(3)} · left {row.crossfallLeftPct.toFixed(2)}% / {row.topWidthLeftM.toFixed(2)} m · right {row.crossfallRightPct.toFixed(2)}% / {row.topWidthRightM.toFixed(2)} m
              </p>)}</div>
            </div>)}
          </div>}
          {!multiLayers.length && <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {MAPPING_FIELDS.map(([key, label]) => <label key={key} className="space-y-1 text-sm">
              <span>{label}</span>
              <select className="h-10 w-full rounded-md border bg-background px-3" value={mapping[key]} onChange={event => changeMapping(key, event.target.value)}>
                <option value="">Choose column</option>
                {importHeaders.map(header => <option key={header} value={header}>{header}</option>)}
              </select>
            </label>)}
          </div>}
          {canEdit && <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={replaceImport} onChange={event => setReplaceImport(event.target.checked)} />
            Replace existing rows for these layers
          </label>}
          <p className="text-xs text-muted-foreground">Without Replace, typed rows stay as saved; matching Excel rows update and matching typed rows are kept.</p>
          {preview.length > 0 && <div className="overflow-x-auto rounded border">
            <table className="w-full min-w-[700px] text-xs">
              <thead><tr className="border-b text-left"><th className="p-2">Ours · consultant</th><th className="p-2">Centre</th><th className="p-2">Left %</th><th className="p-2">Right %</th><th className="p-2">Left width</th><th className="p-2">Right width</th></tr></thead>
              <tbody>{preview.map((row, index) => <tr key={index} className="border-b">
                <td className="p-2">{formatChainagePair(row.chainageOursKm, settings.bookChainageSystem, Number(settings.consultantOffsetM))}</td>
                <td className="p-2">{row.centreLevel}</td><td className="p-2">{row.crossfallLeftPct}</td><td className="p-2">{row.crossfallRightPct}</td><td className="p-2">{row.topWidthLeftM}</td><td className="p-2">{row.topWidthRightM}</td>
              </tr>)}</tbody>
            </table>
          </div>}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setImportOpen(false)}>Cancel</Button>
            <Button onClick={() => importMutation.mutate()} disabled={!canCreate || importMutation.isPending || (multiLayers.length ? !multiLayers.some(layer => layer.selected) || multiLayers.some(layer => layer.selected && (!layer.layerName.trim() || !layer.rows.length)) : !importRows.length || !preview.length || Object.values(mapping).some(value => !value)) || (replaceImport && !canEdit)}>
              Import {multiLayers.length ? multiLayers.filter(layer => layer.selected).reduce((sum, layer) => sum + layer.rows.length, 0) : importRows.length} rows
            </Button>
          </div>
        </div>
      </div>}
    </div>
  );
}
