import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as XLSX from "xlsx";
import { Button } from "@/components/ui/button";
import { Input } from "./LevelInput";
import { apiRequest } from "@/lib/queryClient";
import {
  detectTbmHeading, normalizeTbmImport, repeatedTbmNames, TBM_IMPORT_FIELDS,
  formatChainage, parseChainage, toBookChainage, toOursChainage,
  type BookChainageSystem, type TbmImportMapping,
} from "@shared/levelSheets";

const blank = { name: "", chainage: "", rl: "", easting: "", northing: "", description: "", active: true };
const labels = { name: "Name", chainage: "Chainage", rl: "RL", easting: "Easting", northing: "Northing", description: "Remarks" };
export function TbmsTab({ siteId, settings, canCreate, canEdit }: {
  siteId: number; settings: { bookChainageSystem: BookChainageSystem; consultantOffsetM: number };
  canCreate: boolean; canEdit: boolean;
}) {
  const client = useQueryClient();
  const [form, setForm] = useState({ ...blank });
  const [editing, setEditing] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [upload, setUpload] = useState<ReturnType<typeof detectTbmHeading> | null>(null);
  const [names, setNames] = useState<string[]>([]);
  const [confirmed, setConfirmed] = useState(false);
  const { data: tbms = [], isError } = useQuery<any[]>({
    queryKey: ["/api/level-sheets/tbms", siteId],
    queryFn: async () => {
      const response = await fetch(`/api/level-sheets/tbms?siteId=${siteId}`, { credentials: "include" });
      if (!response.ok) throw new Error("Could not load TBMs.");
      return response.json();
    },
  });
  let preview: ReturnType<typeof normalizeTbmImport> = [];
  let previewError = "";
  try { if (upload) preview = normalizeTbmImport(upload.rows, upload.mapping, settings.bookChainageSystem, settings.consultantOffsetM); }
  catch (error: any) { previewError = error.message; }
  const chosenNames = preview.map((row, index) => names[index] ?? row.name);
  const duplicates = repeatedTbmNames([...tbms.map(row => row.name), ...chosenNames]).slice(tbms.length);
  const refresh = () => client.invalidateQueries({ queryKey: ["/api/level-sheets/tbms", siteId] });
  const save = useMutation({
    mutationFn: async () => {
      const chainage = parseChainage(form.chainage);
      if (chainage == null) throw new Error("Enter a valid chainage.");
      const response = await apiRequest(editing ? "PATCH" : "POST", editing ? `/api/level-sheets/tbms/${editing}` : "/api/level-sheets/tbms", {
        ...form, siteId, chainageOursKm: toOursChainage(chainage, settings.bookChainageSystem, settings.consultantOffsetM),
        rl: form.rl === "" ? null : Number(form.rl.replace(",", ".")),
        easting: form.easting === "" ? null : Number(form.easting.replace(",", ".")), northing: form.northing === "" ? null : Number(form.northing.replace(",", ".")),
      });
      return response.json();
    },
    onSuccess: () => { setForm({ ...blank }); setEditing(null); setError(""); void refresh(); },
    onError: (error: Error) => setError(error.message),
  });
  const importer = useMutation({
    mutationFn: () => apiRequest("POST", "/api/level-sheets/tbms/import", { siteId, ...upload, names: chosenNames }),
    onSuccess: () => { setUpload(null); setNames([]); setError(""); setConfirmed(false); void refresh(); },
    onError: (error: Error) => setError(error.message),
  });
  const readExcel = async (file?: File) => {
    if (!file) return;
    try {
      const book = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const matrix = XLSX.utils.sheet_to_json<unknown[]>(book.Sheets[book.SheetNames[0]], { header: 1, defval: "" });
      setUpload(detectTbmHeading(matrix)); setNames([]); setError(""); setConfirmed(false);
    } catch (error: any) { setError(error.message); }
  };
  return <section className="space-y-4 rounded border p-4">
    <h2 className="text-lg font-semibold">TBMs</h2>
    {(isError || error) && <p role="alert" className="text-destructive">{error || "Could not load TBMs."}</p>}
    <div className="overflow-auto"><table className="w-full text-sm">
      <thead><tr className="border-b text-left">{["Name", "Chainage", "RL", "Easting", "Northing", "Remarks", "Status", ""].map((label, i) => <th className="p-2" key={i}>{label}</th>)}</tr></thead>
      <tbody>{tbms.map(row => <tr className="border-b" key={row.id}>
        <td className="p-2">{row.name.toUpperCase()}</td><td>{formatChainage(toBookChainage(row.chainageOursKm, settings.bookChainageSystem, settings.consultantOffsetM))}</td>
        <td>{Number(row.rl).toFixed(3)}</td><td>{row.easting ?? ""}</td><td>{row.northing ?? ""}</td><td>{row.description}</td><td>{row.active ? "Active" : "Inactive"}</td>
        <td>{canEdit && <Button variant="outline" onClick={() => {
          setEditing(row.id); setForm({ name: row.name, chainage: formatChainage(toBookChainage(row.chainageOursKm, settings.bookChainageSystem, settings.consultantOffsetM)), rl: String(row.rl), easting: row.easting == null ? "" : String(row.easting), northing: row.northing == null ? "" : String(row.northing), description: row.description ?? "", active: row.active });
        }}>Edit</Button>}</td>
      </tr>)}</tbody>
    </table></div>
    {(editing ? canEdit : canCreate) && <div className="space-y-3">
      <h3 className="font-semibold">{editing ? "Edit TBM" : "Add TBM"}</h3>
      <div className="grid gap-2 sm:grid-cols-3">{TBM_IMPORT_FIELDS.map(key => <label key={key} className="text-sm">{labels[key]}<Input inputMode={["rl", "easting", "northing"].includes(key) ? "decimal" : undefined} value={form[key]} onChange={event => setForm(current => ({ ...current, [key]: event.target.value }))} /></label>)}</div>
      <label className="flex gap-2"><input type="checkbox" checked={form.active} onChange={event => setForm(current => ({ ...current, active: event.target.checked }))} />Active</label>
      <Button disabled={save.isPending} onClick={() => save.mutate()}>Save TBM</Button>{" "}
      {editing && <Button variant="outline" onClick={() => { setEditing(null); setForm({ ...blank }); }}>Cancel</Button>}
    </div>}
    {canCreate && <label className="block text-sm">Import TBM Excel<Input type="file" accept=".xls,.xlsx,.csv" onChange={event => void readExcel(event.target.files?.[0])} /></label>}
    {upload && <div className="space-y-3 rounded border p-3">
      <h3 className="font-semibold">Import preview</h3>
      <div className="grid gap-2 sm:grid-cols-3">{TBM_IMPORT_FIELDS.map(key => <label key={key}>{labels[key]}
        <select className="block w-full rounded border p-2" value={upload.mapping[key]} onChange={event => { setUpload({ ...upload, mapping: { ...upload.mapping, [key]: Number(event.target.value) } as TbmImportMapping }); setNames([]); setConfirmed(false); }}>
          <option value={-1}>Not mapped</option>{upload.headers.map((label, index) => <option key={index} value={index}>{label || `Column ${index + 1}`}</option>)}
        </select>
      </label>)}</div>
      {previewError && <p role="alert">{previewError}</p>}
      <div className="max-h-80 overflow-auto">{preview.map((row, index) => <div className="flex flex-wrap items-center gap-2 border-b p-2" key={index}>
        <Input aria-label={`Imported TBM name ${index + 1}`} className="w-40" value={chosenNames[index]} onChange={event => { setNames(chosenNames.map((name, i) => i === index ? event.target.value : name)); setConfirmed(false); }} />
        <span>{formatChainage(row.chainageOursKm)} · RL {row.rl.toFixed(3)} · {row.easting ?? ""} · {row.northing ?? ""} · {row.description}</span>
        {duplicates[index] && <strong className="text-destructive">Repeated name — rename before import</strong>}
      </div>)}</div>
      <label className="flex gap-2"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />Confirm import of {preview.length} TBMs</label>
      <Button disabled={!confirmed || !preview.length || !!previewError || duplicates.some(Boolean) || importer.isPending} onClick={() => importer.mutate()}>Import TBMs</Button>{" "}
      <Button variant="outline" onClick={() => setUpload(null)}>Cancel</Button>
    </div>}
  </section>;
}
