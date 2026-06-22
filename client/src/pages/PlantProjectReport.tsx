import { useState, useMemo } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, Download, Factory, Building2, Loader2 } from "lucide-react";
import * as XLSX from "xlsx";
import { format, subMonths } from "date-fns";
import { useAuth } from "@/lib/auth-context";
import { useOrigin } from "@/hooks/use-origin";
import type { Party, PlantSettingsWithSite } from "@shared/schema";

type SummaryRow = {
  plantName: string;
  partyId: number;
  partyName: string;
  loadCount: number;
  totalMT: number;
  mixTypes: string[] | null;
};

export default function PlantProjectReport() {
  const { isAdmin, isManager } = useAuth();
  const { getPlantBackLink } = useOrigin();
  const backLink = getPlantBackLink({ defaultTab: "reports" });

  const today = format(new Date(), "yyyy-MM-dd");
  const threeMonthsAgo = format(subMonths(new Date(), 3), "yyyy-MM-dd");

  const [dateFrom, setDateFrom] = useState(threeMonthsAgo);
  const [dateTo, setDateTo] = useState(today);
  const [selectedPlants, setSelectedPlants] = useState<string[]>([]);
  const [selectedParties, setSelectedParties] = useState<number[]>([]);

  const { data: plantSettings = [] } = useQuery<PlantSettingsWithSite[]>({
    queryKey: ["/api/plant-module/plant-settings"],
    enabled: isAdmin || isManager,
  });
  const { data: parties = [] } = useQuery<Party[]>({
    queryKey: ["/api/plant-module/parties"],
    enabled: isAdmin || isManager,
  });

  const availablePlants = plantSettings.map((s) => s.plantName);

  const queryParams = useMemo(() => {
    const p = new URLSearchParams();
    if (dateFrom) p.set("dateFrom", dateFrom);
    if (dateTo) p.set("dateTo", dateTo);
    if (selectedPlants.length > 0) p.set("plantNames", selectedPlants.join(","));
    if (selectedParties.length > 0) p.set("partyIds", selectedParties.join(","));
    return p.toString();
  }, [dateFrom, dateTo, selectedPlants, selectedParties]);

  const { data: summaryRows = [], isLoading } = useQuery<SummaryRow[]>({
    queryKey: ["/api/reports/plant-project-dispatch-summary", queryParams],
    queryFn: () =>
      fetch(`/api/reports/plant-project-dispatch-summary?${queryParams}`).then((r) => {
        if (!r.ok) throw new Error("Failed to fetch summary");
        return r.json();
      }),
    enabled: isAdmin || isManager,
  });

  const totalLoads = summaryRows.reduce((s, r) => s + r.loadCount, 0);
  const totalMT = summaryRows.reduce((s, r) => s + r.totalMT, 0);

  const grouped = useMemo(() => {
    const map: Record<string, SummaryRow[]> = {};
    for (const row of summaryRows) {
      if (!map[row.plantName]) map[row.plantName] = [];
      map[row.plantName].push(row);
    }
    return map;
  }, [summaryRows]);

  function togglePlant(name: string) {
    setSelectedPlants((prev) =>
      prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]
    );
  }

  function toggleParty(id: number) {
    setSelectedParties((prev) =>
      prev.includes(id) ? prev.filter((n) => n !== id) : [...prev, id]
    );
  }

  function exportToExcel() {
    const rows: Record<string, unknown>[] = [];
    for (const [plantName, plantRows] of Object.entries(grouped)) {
      for (const r of plantRows) {
        rows.push({
          Plant: r.plantName,
          "Party / Project": r.partyName,
          Loads: r.loadCount,
          "Total MT": r.totalMT,
          "Mix Types": (r.mixTypes ?? []).join(", "),
        });
      }
      const plantLoads = plantRows.reduce((s, r) => s + r.loadCount, 0);
      const plantMT = plantRows.reduce((s, r) => s + r.totalMT, 0);
      rows.push({
        Plant: `${plantName} — Subtotal`,
        "Party / Project": "",
        Loads: plantLoads,
        "Total MT": Math.round(plantMT * 100) / 100,
        "Mix Types": "",
      });
    }
    rows.push({
      Plant: "GRAND TOTAL",
      "Party / Project": "",
      Loads: totalLoads,
      "Total MT": Math.round(totalMT * 100) / 100,
      "Mix Types": "",
    });

    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = [{ wch: 22 }, { wch: 28 }, { wch: 8 }, { wch: 12 }, { wch: 30 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Dispatch Summary");
    XLSX.writeFile(wb, `plant-project-dispatch-${dateFrom}-to-${dateTo}.xlsx`);
  }

  if (!isAdmin && !isManager) {
    return (
      <div className="max-w-md mx-auto text-center py-20">
        <p className="text-muted-foreground">Access restricted to administrators and managers.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto p-4 md:p-6">
      <div className="flex items-center gap-3">
        <Link href={backLink}>
          <Button variant="ghost" size="icon" data-testid="button-back">
            <ChevronLeft className="w-5 h-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">
            Plant-Project Dispatch Summary
          </h1>
          <p className="text-sm text-muted-foreground">
            Cross-plant and cross-project dispatch analysis — grouped by plant and party
          </p>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-start">
            <div>
              <Label className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-1.5 block">
                From
              </Label>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                data-testid="input-date-from"
              />
            </div>
            <div>
              <Label className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-1.5 block">
                To
              </Label>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                data-testid="input-date-to"
              />
            </div>

            <div>
              <Label className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-1.5 block">
                Plants {selectedPlants.length > 0 && `(${selectedPlants.length} selected)`}
              </Label>
              <div className="border rounded-md p-2 max-h-32 overflow-y-auto space-y-1 bg-white dark:bg-slate-900">
                {availablePlants.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-1">All plants</p>
                ) : (
                  availablePlants.map((name) => (
                    <label key={name} className="flex items-center gap-2 cursor-pointer text-sm py-0.5">
                      <input
                        type="checkbox"
                        checked={selectedPlants.includes(name)}
                        onChange={() => togglePlant(name)}
                        className="rounded"
                        data-testid={`checkbox-plant-${name}`}
                      />
                      <span className="truncate">{name}</span>
                    </label>
                  ))
                )}
              </div>
              {selectedPlants.length > 0 && (
                <button
                  onClick={() => setSelectedPlants([])}
                  className="text-sm text-blue-600 dark:text-blue-400 mt-1 hover:underline"
                >
                  Clear
                </button>
              )}
            </div>

            <div>
              <Label className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-1.5 block">
                Party / Project {selectedParties.length > 0 && `(${selectedParties.length} selected)`}
              </Label>
              <div className="border rounded-md p-2 max-h-32 overflow-y-auto space-y-1 bg-white dark:bg-slate-900">
                {parties.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-1">All parties</p>
                ) : (
                  parties.map((p) => (
                    <label key={p.id} className="flex items-center gap-2 cursor-pointer text-sm py-0.5">
                      <input
                        type="checkbox"
                        checked={selectedParties.includes(p.id)}
                        onChange={() => toggleParty(p.id)}
                        className="rounded"
                        data-testid={`checkbox-party-${p.id}`}
                      />
                      <span className="truncate">{p.name}</span>
                    </label>
                  ))
                )}
              </div>
              {selectedParties.length > 0 && (
                <button
                  onClick={() => setSelectedParties([])}
                  className="text-sm text-blue-600 dark:text-blue-400 mt-1 hover:underline"
                >
                  Clear
                </button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Results header */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          {isLoading
            ? "Loading…"
            : summaryRows.length === 0
            ? "No data for the selected filters"
            : `${summaryRows.length} group${summaryRows.length !== 1 ? "s" : ""} · ${totalLoads.toLocaleString()} loads · ${totalMT.toFixed(2)} MT total`}
        </div>
        {summaryRows.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={exportToExcel}
            className="gap-2"
            data-testid="button-export-excel"
          >
            <Download className="w-4 h-4" />
            Export Excel
          </Button>
        )}
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : summaryRows.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground text-sm border rounded-lg bg-slate-50 dark:bg-slate-800/30">
          No dispatch records found for the selected date range and filters.
        </div>
      ) : (
        <div className="space-y-5">
          {Object.entries(grouped).map(([plantName, rows]) => {
            const plantLoads = rows.reduce((s, r) => s + r.loadCount, 0);
            const plantMT = rows.reduce((s, r) => s + r.totalMT, 0);
            return (
              <Card key={plantName} className="overflow-hidden">
                <CardHeader className="pb-2 pt-3 px-4 bg-slate-50 dark:bg-slate-800/40 border-b">
                  <CardTitle className="text-sm flex items-center gap-2 font-semibold text-slate-700 dark:text-slate-300">
                    <Factory className="w-4 h-4 text-slate-500" />
                    {plantName}
                    <span className="ml-auto font-normal text-muted-foreground">
                      {plantLoads.toLocaleString()} loads ·{" "}
                      <span className="font-semibold text-slate-700 dark:text-slate-300">
                        {plantMT.toFixed(2)} MT
                      </span>
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <table className="w-full text-sm" data-testid={`table-plant-${plantName}`}>
                    <thead>
                      <tr className="bg-white dark:bg-slate-900/60">
                        <th className="text-left px-4 py-2 font-semibold text-slate-500 text-sm uppercase tracking-wide">
                          Party / Project
                        </th>
                        <th className="text-right px-4 py-2 font-semibold text-slate-500 text-sm uppercase tracking-wide w-24">
                          Loads
                        </th>
                        <th className="text-right px-4 py-2 font-semibold text-slate-500 text-sm uppercase tracking-wide w-28">
                          Total MT
                        </th>
                        <th className="text-left px-4 py-2 font-semibold text-slate-500 text-sm uppercase tracking-wide hidden sm:table-cell">
                          Mix Types
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row) => (
                        <tr
                          key={row.partyId}
                          className="border-t hover:bg-slate-50/60 dark:hover:bg-slate-800/20 transition-colors"
                          data-testid={`row-party-${row.partyId}`}
                        >
                          <td className="px-4 py-2.5 font-medium text-slate-800 dark:text-slate-200">
                            <div className="flex items-center gap-1.5">
                              <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                              {row.partyName}
                            </div>
                          </td>
                          <td className="px-4 py-2.5 text-right text-slate-700 dark:text-slate-300 tabular-nums">
                            {row.loadCount.toLocaleString()}
                          </td>
                          <td className="px-4 py-2.5 text-right font-semibold text-slate-800 dark:text-slate-200 tabular-nums">
                            {row.totalMT.toFixed(2)}
                          </td>
                          <td className="px-4 py-2.5 hidden sm:table-cell">
                            <div className="flex flex-wrap gap-1">
                              {(row.mixTypes ?? []).map((mt) => (
                                <Badge key={mt} variant="secondary" className="text-sm py-0 px-1.5">
                                  {mt}
                                </Badge>
                              ))}
                            </div>
                          </td>
                        </tr>
                      ))}
                      <tr className="border-t bg-slate-100/70 dark:bg-slate-800/50">
                        <td className="px-4 py-2 text-sm font-semibold text-slate-500 uppercase tracking-wide">
                          Subtotal
                        </td>
                        <td className="px-4 py-2 text-right text-sm font-semibold text-slate-700 dark:text-slate-300 tabular-nums">
                          {plantLoads.toLocaleString()}
                        </td>
                        <td className="px-4 py-2 text-right text-sm font-semibold text-slate-800 dark:text-slate-200 tabular-nums">
                          {plantMT.toFixed(2)}
                        </td>
                        <td className="hidden sm:table-cell" />
                      </tr>
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            );
          })}

          {/* Grand total */}
          <div className="flex items-center justify-between bg-slate-800 dark:bg-slate-700 text-white rounded-lg px-5 py-3.5">
            <span className="font-bold uppercase tracking-wide text-sm">Grand Total</span>
            <div className="flex gap-8 text-sm">
              <span className="text-slate-300">{totalLoads.toLocaleString()} loads</span>
              <span className="font-bold text-base">{totalMT.toFixed(2)} MT</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
