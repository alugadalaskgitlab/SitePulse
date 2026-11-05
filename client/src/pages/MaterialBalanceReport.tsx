import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { FileSpreadsheet, FileText, ArrowLeft } from "lucide-react";
import { HubShell } from "@/components/HubShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type ProjectOption = { id: number; name: string; siteName?: string | null };
type BalanceRow = {
  materialName: string;
  rolledQuantity: number;
  rolledUom: string;
  compactedCum: number | null;
  requiredMt: number | null;
  requiredLooseCum: number | null;
  requiredLooseCft: number | null;
  wastageMt: number | null;
  wastageCum: number | null;
  receivedMt: number | null;
  usedMt: number | null;
  differenceMt: number | null;
  valuesConfigured: boolean;
  receivedSources: string[];
  usedSources: string[];
  attributions: string[];
};
type BalanceResponse = {
  projectId: number;
  projectName: string;
  siteName: string;
  from: string;
  to: string;
  differenceDefinition: string;
  rows: BalanceRow[];
};

function localDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

const today = new Date();
const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

function number(value: number | null, digits = 2) {
  return value == null || !Number.isFinite(value) ? "—" : value.toLocaleString("en-IN", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export default function MaterialBalanceReport() {
  const searchProjectId = new URLSearchParams(window.location.search).get("projectId") ?? "";
  const [projectId, setProjectId] = useState(searchProjectId);
  const [from, setFrom] = useState(localDate(monthStart));
  const [to, setTo] = useState(localDate(today));

  const projectsQuery = useQuery<ProjectOption[]>({
    queryKey: ["/api/boq/projects"],
    queryFn: async () => {
      const response = await fetch("/api/boq/projects", { credentials: "include" });
      if (!response.ok) throw new Error("Could not load BOQ projects.");
      return response.json();
    },
  });
  const reportQuery = useQuery<BalanceResponse>({
    queryKey: ["/api/reports/material-balance", projectId, from, to],
    queryFn: async () => {
      const params = new URLSearchParams({ projectId, from, to });
      const response = await fetch(`/api/reports/material-balance?${params}`, { credentials: "include" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.message || "Could not load material balance report.");
      return body;
    },
    enabled: Boolean(projectId && from && to && from <= to),
  });

  const exportRows = useMemo(() => (reportQuery.data?.rows ?? []).map((row) => ({
    Material: row.materialName,
    "BOQ rolled quantity": `${number(row.rolledQuantity)} ${row.rolledUom}`,
    "Required compacted (Cum)": row.valuesConfigured ? number(row.compactedCum) : "Values not set",
    "Required (MT)": row.valuesConfigured ? number(row.requiredMt) : "Values not set",
    "Required loose (Cum)": row.valuesConfigured ? number(row.requiredLooseCum) : "Values not set",
    "Required loose (CFT)": row.valuesConfigured ? number(row.requiredLooseCft) : "Values not set",
    "Wastage (MT)": row.valuesConfigured ? number(row.wastageMt) : "Values not set",
    "Wastage (Cum)": row.valuesConfigured ? number(row.wastageCum) : "Values not set",
    "Received (MT)": number(row.receivedMt),
    "Used (MT)": number(row.usedMt),
    "Difference (MT)": number(row.differenceMt),
    Sources: [...row.receivedSources, ...row.usedSources].join("; "),
    Attribution: row.attributions.join(", "),
  })), [reportQuery.data]);

  const exportExcel = () => {
    if (!reportQuery.data) return;
    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.json_to_sheet(exportRows);
    XLSX.utils.book_append_sheet(workbook, sheet, "Material Balance");
    XLSX.writeFile(workbook, `material-balance-${reportQuery.data.projectId}-${from}-${to}.xlsx`);
  };

  const exportPdf = () => {
    if (!reportQuery.data) return;
    const report = reportQuery.data;
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    doc.setTextColor(30);
    doc.setFontSize(15);
    doc.text("Material Balance Report", 14, 15);
    doc.setFontSize(9);
    doc.text(`${report.projectName} · ${report.siteName} · Actuals: ${from} to ${to}`, 14, 22);
    doc.text("Difference = Received minus Used. BOQ requirement is the full current project quantity.", 14, 27);
    autoTable(doc, {
      startY: 32,
      head: [["Material", "BOQ rolled", "Required comp. Cum", "Required MT", "Loose Cum / CFT", "Wastage MT / Cum", "Received MT", "Used MT", "Difference MT", "Source / attribution"]],
      body: report.rows.map((row) => [
        row.materialName,
        `${number(row.rolledQuantity)} ${row.rolledUom}`,
        row.valuesConfigured ? number(row.compactedCum) : "Values not set",
        row.valuesConfigured ? number(row.requiredMt) : "Values not set",
        row.valuesConfigured ? `${number(row.requiredLooseCum)} / ${number(row.requiredLooseCft, 0)}` : "Values not set",
        row.valuesConfigured ? `${number(row.wastageMt)} / ${number(row.wastageCum)}` : "Values not set",
        number(row.receivedMt),
        number(row.usedMt),
        number(row.differenceMt),
        [...row.attributions, ...row.receivedSources, ...row.usedSources].join("; "),
      ]),
      styles: { fontSize: 6.5, textColor: [45, 45, 45], lineColor: [175, 175, 175] },
      headStyles: { fillColor: [225, 225, 225], textColor: [25, 25, 25], lineColor: [140, 140, 140] },
      alternateRowStyles: { fillColor: [248, 248, 248] },
      margin: { left: 8, right: 8 },
    });
    doc.save(`material-balance-${report.projectId}-${from}-${to}.pdf`);
  };

  return (
    <HubShell title="Material Balance" subtitle="BOQ requirement compared with site receipts and recorded use" backHref="/reports/hub" backLabel="Reports">
      <div className="mx-auto max-w-7xl space-y-5 p-4">
        <Link href="/reports/hub">
          <a className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Reports
          </a>
        </Link>
        <section className="grid gap-3 rounded-lg border bg-card p-4 md:grid-cols-4">
          <div className="md:col-span-2">
            <Label htmlFor="balance-project">BOQ project</Label>
            <select
              id="balance-project"
              data-testid="select-material-balance-project"
              className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm"
              value={projectId}
              onChange={(event) => setProjectId(event.target.value)}
            >
              <option value="">Choose a project</option>
              {(projectsQuery.data ?? []).map((project) => (
                <option key={project.id} value={project.id}>{project.name}{project.siteName ? ` · ${project.siteName}` : ""}</option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="balance-from">Actuals from</Label>
            <Input id="balance-from" type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
          </div>
          <div>
            <Label htmlFor="balance-to">Actuals to</Label>
            <Input id="balance-to" type="date" value={to} onChange={(event) => setTo(event.target.value)} />
          </div>
          <div className="flex flex-wrap gap-2 md:col-span-4">
            <Button variant="outline" onClick={exportExcel} disabled={!reportQuery.data}>
              <FileSpreadsheet className="mr-2 h-4 w-4" /> Export Excel
            </Button>
            <Button variant="outline" onClick={exportPdf} disabled={!reportQuery.data}>
              <FileText className="mr-2 h-4 w-4" /> Export greyscale PDF
            </Button>
          </div>
        </section>
        {projectsQuery.isError && <p className="text-sm text-destructive">{(projectsQuery.error as Error).message}</p>}
        {reportQuery.isLoading && <p className="text-sm text-muted-foreground">Loading report…</p>}
        {reportQuery.isError && <p className="text-sm text-destructive">{(reportQuery.error as Error).message}</p>}
        {reportQuery.data && (
          <>
            <p className="text-xs text-muted-foreground">
              {reportQuery.data.projectName} · {reportQuery.data.siteName} · Actuals {from}–{to}. Difference = Received − Used.
              Plant dispatch and store issue quantities are attributed by site; DPR use is linked by BOQ project/item.
            </p>
            <div className="overflow-x-auto rounded-lg border bg-card">
              <table className="min-w-[1320px] w-full text-sm">
                <thead className="bg-muted/60 text-left">
                  <tr>
                    {["Material", "BOQ rolled quantity", "Required compacted Cum", "Required MT", "Loose Cum", "Loose CFT", "Wastage MT", "Wastage Cum", "Received MT", "Used MT", "Difference MT", "Sources / attribution"].map((heading) => (
                      <th key={heading} className="whitespace-nowrap px-3 py-2 font-semibold">{heading}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {reportQuery.data.rows.map((row) => (
                    <tr key={row.materialName} className="border-t align-top">
                      <td className="px-3 py-2 font-medium">{row.materialName}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{number(row.rolledQuantity)} {row.rolledUom}</td>
                      <td className="px-3 py-2">{row.valuesConfigured ? number(row.compactedCum) : "Values not set"}</td>
                      <td className="px-3 py-2">{row.valuesConfigured ? number(row.requiredMt) : "Values not set"}</td>
                      <td className="px-3 py-2">{row.valuesConfigured ? number(row.requiredLooseCum) : "Values not set"}</td>
                      <td className="px-3 py-2">{row.valuesConfigured ? number(row.requiredLooseCft, 0) : "Values not set"}</td>
                      <td className="px-3 py-2">{row.valuesConfigured ? number(row.wastageMt) : "Values not set"}</td>
                      <td className="px-3 py-2">{row.valuesConfigured ? number(row.wastageCum) : "Values not set"}</td>
                      <td className="px-3 py-2">{number(row.receivedMt)}</td>
                      <td className="px-3 py-2">{number(row.usedMt)}</td>
                      <td className="px-3 py-2">{number(row.differenceMt)}</td>
                      <td className="px-3 py-2 text-xs">
                        {[...row.attributions, ...row.receivedSources, ...row.usedSources].join(" · ") || "No linked actuals"}
                      </td>
                    </tr>
                  ))}
                  {reportQuery.data.rows.length === 0 && (
                    <tr><td colSpan={12} className="px-3 py-8 text-center text-muted-foreground">No material recipe rows are configured for this project.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </HubShell>
  );
}
