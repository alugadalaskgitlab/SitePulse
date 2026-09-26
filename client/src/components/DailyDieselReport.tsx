import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { buildDailyDieselEquipmentReport } from "../../../server/dieselComparisonEquipment";

type Report = ReturnType<typeof buildDailyDieselEquipmentReport>;
const attribution = "Purchases are attributed only to single identifiable equipment; all other purchases remain unattributed.";

export function DailyDieselReport({ equipment, onBack }: {
  equipment: Array<{ id: number; name: string; registrationNumber?: string | null }>;
  onBack: () => void;
}) {
  const today = format(new Date(), "yyyy-MM-dd");
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [equipmentId, setEquipmentId] = useState("");
  const [exportError, setExportError] = useState("");
  const params = new URLSearchParams({ from, to });
  if (equipmentId) params.set("equipmentId", equipmentId);
  const valid = !!from && !!to && from <= to;
  const { data, isFetching, error } = useQuery<Report>({
    queryKey: ["/api/diesel-requirements/daily-report", params.toString()],
    enabled: valid,
    queryFn: async () => {
      const response = await fetch(`/api/diesel-requirements/daily-report?${params}`);
      if (!response.ok) throw new Error((await response.json()).message || "Unable to load daily report");
      return response.json();
    },
  });
  const exportReport = (kind: "pdf" | "xlsx") => {
    if (!data || isFetching || !valid || error) return;
    setExportError("");
    try {
      const rows: (string | number)[][] = [
        ["Daily Diesel Requirement Report", `${from} to ${to}`],
        ["Equipment filter", equipmentId ? equipment.find(e => String(e.id) === equipmentId)?.name || equipmentId : "All equipment"],
        [attribution],
        ["TOTAL", "Planned (L)", data.totals.planned, "Purchased (L)", data.totals.purchased, "Issued (L)", data.totals.issued, "Flagged equipment-days", data.totals.issueCount],
      ];
      for (const group of data.groups) {
        rows.push([group.date, `${group.issueCount} issues`]);
        rows.push(["Equipment", "Planned (L)", "Purchased (L)", "Issued (L)", "Logged Work", "Status"]);
        if (!group.rows.length) rows.push(["No activity"]);
        for (const r of group.rows) rows.push([r.equipmentName, r.planned, r.purchased, r.issued, r.loggedWork ? "Yes" : "No", r.statusFlag]);
      }
      const filename = `daily-diesel-${from}-${to}`;
      if (kind === "xlsx") {
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), "Daily equipment");
        XLSX.writeFile(wb, `${filename}.xlsx`);
      } else {
        const doc = new jsPDF({ orientation: "landscape" });
        doc.setFontSize(16);
        doc.text("Daily Diesel Requirement Report", 14, 15);
        doc.setFontSize(9);
        doc.text(`${from} to ${to} | Equipment: ${equipmentId ? equipment.find(e => String(e.id) === equipmentId)?.name || equipmentId : "All"}`, 14, 22);
        doc.text(attribution, 14, 28);
        doc.text(`Planned: ${data.totals.planned} L | Purchased: ${data.totals.purchased} L | Issued: ${data.totals.issued} L | Flagged equipment-days: ${data.totals.issueCount}`, 14, 34);
        autoTable(doc, {
          startY: 40,
          head: [["Date", "Equipment", "Planned (L)", "Purchased (L)", "Issued (L)", "Logged Work", "Status"]],
          body: data.groups.flatMap(group => [
            [group.date, `${group.issueCount} issues`, "", "", "", "", ""],
            ...(group.rows.length ? group.rows.map(r => [
              group.date, r.equipmentName, r.planned, r.purchased, r.issued, r.loggedWork ? "Yes" : "No", r.statusFlag,
            ]) : [[group.date, "No activity", "", "", "", "", ""]]),
          ]),
          styles: { fontSize: 8 },
          columnStyles: { 0: { cellWidth: 26 }, 1: { cellWidth: 62 }, 6: { cellWidth: 58 } },
          theme: "grid",
        });
        doc.save(`${filename}.pdf`);
      }
    } catch (e) { setExportError(e instanceof Error ? e.message : "Export failed"); }
  };
  return <section className="space-y-4" data-testid="daily-diesel-report">
    <div className="flex flex-wrap items-center gap-3">
      <Button variant="outline" onClick={onBack}>BACK</Button>
      <h1 className="text-xl font-bold">Daily Diesel Requirement Report</h1>
    </div>
    <div className="flex flex-wrap items-end gap-4">
      <label>From<Input type="date" value={from} onChange={e => setFrom(e.target.value)} data-testid="daily-from" /></label>
      <label>To<Input type="date" value={to} onChange={e => setTo(e.target.value)} data-testid="daily-to" /></label>
      <label>Equipment<select className="block border rounded p-2 bg-background" value={equipmentId} onChange={e => setEquipmentId(e.target.value)} data-testid="daily-equipment">
        <option value="">All equipment</option>
        {equipment.map(e => <option key={e.id} value={e.id}>{e.name}{e.registrationNumber ? ` (${e.registrationNumber})` : ""} [#{e.id}]</option>)}
      </select></label>
      <Button variant="outline" disabled={!data || isFetching || !valid || !!error} onClick={() => exportReport("pdf")} data-testid="daily-export-pdf">EXPORT PDF</Button>
      <Button variant="outline" disabled={!data || isFetching || !valid || !!error} onClick={() => exportReport("xlsx")} data-testid="daily-export-excel">EXPORT EXCEL</Button>
    </div>
    <p className="text-sm text-muted-foreground">{attribution} Dates without matching activity remain visible with no rows. Quantities are litres.</p>
    {!valid && <p role="alert">Select a valid From/To date range.</p>}
    {error && <p role="alert">{error.message}</p>}
    {exportError && <p role="alert">{exportError}</p>}
    {isFetching && <p role="status">Loading daily report…</p>}
    {valid && !error && !isFetching && data && <>
      <div className="rounded border p-4 flex flex-wrap gap-6" data-testid="daily-summary">
        <span>Planned: <strong>{data.totals.planned} L</strong></span>
        <span>Purchased: <strong>{data.totals.purchased} L</strong></span>
        <span>Issued: <strong>{data.totals.issued} L</strong></span>
        <span>Flagged equipment-days: <strong>{data.totals.issueCount}</strong></span>
      </div>
      {data.groups.map(group => <details key={`${from}-${to}-${equipmentId}-${group.date}`} open={group.date === today} className="rounded border" data-testid={`daily-group-${group.date}`}>
        <summary className="cursor-pointer p-4 font-semibold">{group.date} <Badge variant={group.issueCount ? "destructive" : "secondary"}>{group.issueCount} issues</Badge></summary>
        <div className="overflow-x-auto p-4">
          {!group.rows.length ? <p>No activity for the selected equipment/date.</p> : <table className="w-full text-sm">
            <thead><tr>{["Equipment", "Planned", "Purchased", "Issued", "Logged Work", "Status"].map(h => <th key={h} className="text-left p-2">{h}</th>)}</tr></thead>
            <tbody>{group.rows.map(r => <tr key={r.equipmentId ?? "unattributed"} className="border-t">
              <td className="p-2">{r.equipmentName}</td><td className="p-2">{r.planned}</td><td className="p-2">{r.purchased}</td><td className="p-2">{r.issued}</td>
              <td className="p-2">{r.loggedWork ? "Yes" : "No"}</td><td className="p-2"><Badge className={r.statusFlag === "OK" ? "bg-green-100 text-green-800" : ""} variant={r.statusFlag === "OK" ? "secondary" : "destructive"}>{r.statusFlag}</Badge></td>
            </tr>)}</tbody>
          </table>}
        </div>
      </details>)}
    </>}
  </section>;
}