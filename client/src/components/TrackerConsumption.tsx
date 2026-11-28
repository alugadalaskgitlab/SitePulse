import { useMemo, useState } from "react";
import { format, subDays } from "date-fns";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { openPrintableHtmlOrPreview } from "@/lib/installedApp";

type DipDay = { date: string; actual: number | null };
type DispatchDay = {
  date: string; partyId?: number | null; loadWeight: number;
  theoreticalBitumenQty?: number | null; theoreticalLdoQty?: number | null;
};

/** Presentation of the trackers' existing daily dip, dispatch and meter totals. */
export function TrackerConsumption({ kind, days, meterDays = [], dispatches = [], parties = [], canViewNormActual, canExport }: {
  kind: "bitumen" | "ldo"; days: DipDay[];
  meterDays?: { date: string; dryer: number | null }[];
  dispatches?: DispatchDay[]; parties?: { id: number; name: string }[];
  canViewNormActual: boolean; canExport: boolean;
}) {
  const [from, setFrom] = useState(() => format(subDays(new Date(), 9), "yyyy-MM-dd"));
  const [to, setTo] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [party, setParty] = useState("all");
  const ldo = kind === "ldo", unit = ldo ? "L" : "MT";
  const title = `${ldo ? "LDO" : "Bitumen"} consumption`;
  const rows = useMemo(() => {
    const production = new Map<string, { production: number; norm: number }>();
    for (const d of dispatches) {
      if (party !== "all" && String(d.partyId) !== party) continue;
      const day = production.get(d.date) || { production: 0, norm: 0 };
      day.production += d.loadWeight || 0;
      day.norm += (ldo ? d.theoreticalLdoQty : d.theoreticalBitumenQty) || 0;
      production.set(d.date, day);
    }
    const dips = new Map(days.map(d => [d.date, d.actual]));
    const meters = new Map(meterDays.map(d => [d.date, d.dryer]));
    const dates = party === "all" ? [...new Set([...production.keys(), ...dips.keys(), ...meters.keys()])] : [...production.keys()];
    return dates
      .filter(date => (!from || date >= from) && (!to || date <= to))
      .sort((a, b) => b.localeCompare(a))
      .map(date => {
        const dispatch = production.get(date);
        const actual = party === "all" ? dips.get(date) ?? null : null;
        const norm = canViewNormActual ? dispatch?.norm ?? 0 : null;
        const weight = canViewNormActual ? dispatch?.production ?? 0 : null;
        return { date, production: weight, norm, actual,
          dryer: party === "all" ? meters.get(date) ?? null : null,
          difference: actual == null || norm == null ? null : actual - norm,
          rate: actual == null || !weight ? null : actual / weight };
      });
  }, [days, meterDays, dispatches, party, from, to, ldo, canViewNormActual]);
  const sum = (key: "production" | "norm" | "actual" | "dryer" | "difference") =>
    rows.some(row => row[key] != null) ? rows.reduce((s, row) => s + (row[key] ?? 0), 0) : null;
  const production = sum("production"), actual = sum("actual");
  const totals = { date: "Total", production, norm: sum("norm"), actual, dryer: sum("dryer"),
    difference: sum("difference"), rate: actual == null || !production ? null : actual / production };
  const headers = ["Date", "Production (MT)", `Norm use (${unit})`, `Actual use from dips (${unit})`,
    ...(ldo ? ["Dryer meter (L)"] : []), `Difference (${unit})`, ...(ldo ? ["L per MT"] : [])];
  const number = (value: number | null, rate = false) => value == null ? "—" : value.toFixed(rate ? 2 : ldo ? 1 : 3);
  const cells = (row: typeof totals) => [row.date, number(row.production), number(row.norm), number(row.actual),
    ...(ldo ? [number(row.dryer)] : []),
    row.difference == null ? "—" : `${number(Math.abs(row.difference))}${row.difference > 0 ? " more" : row.difference < 0 ? " less" : ""}`,
    ...(ldo ? [number(row.rate, true)] : [])];
  const body = [...rows, totals].map(cells);
  function excel() {
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([headers, ...body]), "Consumption");
    XLSX.writeFile(book, `${kind}_consumption.xlsx`);
  }
  function pdf() {
    const doc = new jsPDF({ orientation: "landscape" });
    doc.text(title, 14, 15);
    autoTable(doc, { head: [headers], body, startY: 24 });
    doc.save(`${kind}_consumption.pdf`);
  }
  function print() {
    const escape = (s: string) => s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
    const html = `<html><head><title>${title}</title><style>body{font-family:Arial}table{border-collapse:collapse;width:100%}th,td{border:1px solid;padding:6px;text-align:right}th:first-child,td:first-child{text-align:left}</style></head><body><h1>${title}</h1><table><thead><tr>${headers.map(h => `<th>${escape(h)}</th>`).join("")}</tr></thead><tbody>${body.map(row => `<tr>${row.map(v => `<td>${escape(v)}</td>`).join("")}</tr>`).join("")}</tbody></table></body></html>`;
    openPrintableHtmlOrPreview(html, title, `${kind}_consumption.html`);
  }
  return <Card data-testid={`${kind}-consumption`}>
    <CardHeader><CardTitle>Consumption</CardTitle></CardHeader>
    <CardContent className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <Label>From date<Input aria-label="Consumption from date" type="date" value={from} onChange={e => setFrom(e.target.value)} /></Label>
        <Label>To date<Input aria-label="Consumption to date" type="date" value={to} onChange={e => setTo(e.target.value)} /></Label>
        <Label>Party<select aria-label="Consumption party" className="block h-9 rounded-md border bg-background px-3 text-sm" value={party} onChange={e => setParty(e.target.value)}>
          <option value="all">All parties</option>{parties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select></Label>
        {canExport && <><Button variant="outline" size="sm" onClick={excel}>Excel</Button><Button variant="outline" size="sm" onClick={pdf}>PDF</Button><Button variant="outline" size="sm" onClick={print}>Print</Button></>}
      </div>
      {party !== "all" && <p className="text-sm text-muted-foreground">Dips and meters measure the whole tank, not individual parties. Actual use and difference are shown for All parties only.</p>}
      <p className="text-sm text-muted-foreground">— means no recorded value. Totals include recorded values only.</p>
      <div className="overflow-x-auto"><table className="w-full text-sm" aria-label={`${title} table`}>
        <thead><tr>{headers.map(h => <th className="p-2 text-right first:text-left" key={h}>{h}</th>)}</tr></thead>
        <tbody>{rows.map(row => <tr className="border-t" key={row.date}>{cells(row).map((v, i) => <td className="p-2 text-right first:text-left" key={i}>{v}</td>)}</tr>)}
          {!rows.length && <tr><td className="p-2" colSpan={headers.length}>No records for these dates.</td></tr>}
        </tbody>
        <tfoot><tr className="border-t-2 font-bold">{cells(totals).map((v, i) => <td className="p-2 text-right first:text-left" key={i}>{v}</td>)}</tr></tfoot>
      </table></div>
    </CardContent>
  </Card>;
}
