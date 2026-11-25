import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "./LevelInput";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { formatChainage, parseChainage, toBookChainage, type BookChainageSystem } from "@shared/levelSheets";
import { boqItemDisplayText } from "@shared/boqItemName";

async function getJson(url: string) {
  const response = await fetch(url, { credentials: "include" });
  const body = await response.json();
  if (!response.ok) throw new Error(body.message ?? "Could not compare sheets.");
  return body;
}

export function BetweenSheetsTab({ siteId, siteName, sheets, settings, projects }: {
  siteId: number; siteName: string; sheets: any[];
  settings: { bookChainageSystem: BookChainageSystem; consultantOffsetM: number };
  projects: Array<{ id: number; name: string }>;
}) {
  const [lowerId, setLowerId] = useState("");
  const [upperId, setUpperId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [itemId, setItemId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [printOpen, setPrintOpen] = useState(false);
  const [params, setParams] = useState("");
  const project = useQuery({
    queryKey: ["/api/level-sheets/bootstrap", siteId, projectId],
    queryFn: () => getJson(`/api/level-sheets/bootstrap?siteId=${siteId}&boqProjectId=${projectId}`),
    enabled: !!projectId,
  });
  const result = useQuery({
    queryKey: ["/api/level-sheets/quantities", siteId, params],
    queryFn: () => getJson(`/api/level-sheets/quantities?${params}`),
    enabled: !!params,
  });
  const lower = sheets.find(row => String(row.id) === lowerId);
  const upper = sheets.find(row => String(row.id) === upperId);
  const saved = sheets.filter(row => row.status === "saved");
  const commonRange = () => {
    const bottom = (lower?.readings ?? []).map((row: any) => Number(row.chainageOursKm));
    const top = (upper?.readings ?? []).map((row: any) => Number(row.chainageOursKm));
    return { start: bottom.length && top.length ? Math.max(Math.min(...bottom), Math.min(...top)) : null,
      end: bottom.length && top.length ? Math.min(Math.max(...bottom), Math.max(...top)) : null };
  };
  const range = commonRange();
  const fromKm = from.trim() ? parseChainage(from) : range.start;
  const toKm = to.trim() ? parseChainage(to) : range.end;
  const selectedItem = (project.data?.items ?? []).find((item: any) => String(item.id) === itemId);
  const format = (value: number | null, decimals: number) => value == null ? "—" : Number(value).toFixed(decimals);
  const details = result.data;
  const report = details && <article className="space-y-3 bg-white p-3 text-black" id="between-sheets-print">
    <h2 className="text-xl font-bold">Quantities between sheets</h2>
    <p className="font-semibold">{siteName.toUpperCase()}</p>
    {selectedItem && <p>BOQ item: {boqItemDisplayText(selectedItem).toUpperCase()}</p>}
    <p>Lower: {details.lower.layerName.toUpperCase()} · {details.lower.sheetDate} · {details.lower.basis}</p>
    <p>Upper: {details.upper.layerName.toUpperCase()} · {details.upper.sheetDate} · {details.upper.basis}</p>
    <div className="overflow-auto"><table className="w-full border-collapse text-sm">
      <thead><tr>{["Our chainage", "Consultant chainage", "Width used (m)", "Fill (sqm)", "Cut (sqm)", "Check"].map(label => <th key={label} className="border border-black p-2 text-left">{label}</th>)}</tr></thead>
      <tbody>{details.rows.map((row: any) => <tr key={row.chainageOursKm}>
        <td className="border border-black p-2">{formatChainage(row.chainageOursKm)}</td>
        <td className="border border-black p-2">{formatChainage(toBookChainage(row.chainageOursKm, "consultant", settings.consultantOffsetM))}</td>
        <td className="border border-black p-2">{format(row.widthUsedM, 2)}</td>
        <td className="border border-black p-2">{format(row.fillSqm, 2)}</td>
        <td className="border border-black p-2">{format(row.cutSqm, 2)}</td>
        <td className="border border-black p-2">{row.reason ?? ""}</td>
      </tr>)}</tbody>
    </table></div>
    {!details.rows.length && <p>No common chainages in the selected range.</p>}
    <p className="font-semibold">Fill: {details.segments ? format(details.fillCum, 1) : "—"} cum · Cut: {details.segments ? format(details.cutCum, 1) : "—"} cum</p>
    {details.skipped.map((km: number) => <p key={km}>{formatChainage(km)} — Not in both sheets — skipped</p>)}
    {details.gaps.map((gap: any) => <p key={gap.fromKm}>{formatChainage(gap.fromKm)} – {formatChainage(gap.toKm)}: Gap of {Number(gap.distanceM.toFixed(3))} m — check</p>)}
    <div className="mt-12 grid grid-cols-2 gap-10 pt-12"><p className="border-t border-black pt-2">HLC signature / date</p><p className="border-t border-black pt-2">Department signature / date</p></div>
  </article>;
  return <section className="space-y-4 rounded border p-4">
    <h2 className="text-lg font-semibold">Quantities between sheets</h2>
    <div className="grid gap-3 sm:grid-cols-2">
      {(["Lower", "Upper"] as const).map(label => <label key={label} className="text-sm">{label} sheet
        <select className="block w-full rounded border p-2" value={label === "Lower" ? lowerId : upperId} onChange={event => { (label === "Lower" ? setLowerId : setUpperId)(event.target.value); setFrom(""); setTo(""); setParams(""); }}>
          <option value="">Choose saved sheet</option>{saved.map(row => <option value={row.id} key={row.id}>#{row.id} · {row.layerName.toUpperCase()} · {row.sheetDate}</option>)}
        </select>
      </label>)}
      <label className="text-sm">BOQ project (optional)<select className="block w-full rounded border p-2" value={projectId} onChange={event => { setProjectId(event.target.value); setItemId(""); }}>
        <option value="">No BOQ project</option>{projects.map(row => <option key={row.id} value={row.id}>{row.name.toUpperCase()}</option>)}
      </select></label>
      <label className="text-sm">BOQ item (optional)<select className="block w-full rounded border p-2" value={itemId} onChange={event => setItemId(event.target.value)} disabled={!projectId}>
        <option value="">No BOQ item</option>{(project.data?.items ?? []).map((row: any) => <option key={row.id} value={row.id}>{boqItemDisplayText(row).toUpperCase()}</option>)}
      </select></label>
      <label className="text-sm">From chainage (ours)<Input placeholder={range.start == null ? "2+600" : formatChainage(range.start)} value={from} onChange={event => { setFrom(event.target.value); setParams(""); }} /></label>
      <label className="text-sm">To chainage (ours)<Input placeholder={range.end == null ? "2+900" : formatChainage(range.end)} value={to} onChange={event => { setTo(event.target.value); setParams(""); }} /></label>
    </div>
    {project.isError && <p role="alert">Could not load BOQ items.</p>}
    <Button disabled={!lowerId || !upperId || lowerId === upperId || fromKm == null || toKm == null || fromKm > toKm || result.isFetching} onClick={() => setParams(new URLSearchParams({ lowerId, upperId, fromKm: String(fromKm), toKm: String(toKm) }).toString())}>Compare sheets</Button>
    {result.isFetching && <p>Calculating…</p>}
    {result.isError && <p role="alert" className="text-destructive">{(result.error as Error).message}</p>}
    {params && details && <>
      <Button variant="outline" onClick={() => setPrintOpen(true)}>Print preview</Button>
      {!printOpen && report}
      <Dialog open={printOpen} onOpenChange={setPrintOpen}><DialogContent className="max-h-[90vh] max-w-5xl overflow-auto">
        <DialogHeader><DialogTitle>Quantities print preview</DialogTitle><DialogDescription>Read-only quantities. Nothing is saved to BOQ or Work value.</DialogDescription></DialogHeader>
        <div className="flex gap-2 print:hidden"><Button onClick={() => window.print()}>Print</Button><Button variant="outline" onClick={() => setPrintOpen(false)}>Close</Button></div>
        <style>{`@page { size: A4 portrait; margin: 12mm; } @media print {
          body * { visibility: hidden !important; }
          #between-sheets-print, #between-sheets-print * { visibility: visible !important; color: black !important; background: transparent !important; box-shadow: none !important; }
          #between-sheets-print { position: absolute !important; inset: 0 !important; width: 100% !important; font-size: 9pt; }
          #between-sheets-print .overflow-auto { overflow: visible !important; }
          #between-sheets-print th, #between-sheets-print td { padding: 3px !important; }
        }`}</style>
        {report}
      </DialogContent></Dialog>
    </>}
  </section>;
}
