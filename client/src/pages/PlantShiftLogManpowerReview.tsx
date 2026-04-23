import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Link } from "wouter";
import { ChevronLeft, Users, Loader2, ShieldAlert, Search, Wand2, Combine } from "lucide-react";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { PinAuth } from "@/components/PinAuth";
import { LABOUR_CATEGORIES, LABOUR_GENDERS } from "@shared/schema";

type ReviewRow = {
  name: string;
  count: number;
  earliestDate: string;
  latestDate: string;
  currentContractors: string[];
  currentCategories: string[];
  currentGenders: string[];
  roles: string[];
  needsContractor: boolean;
  needsCategory: boolean;
};

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return typeof err === "string" ? err : "Unknown error";
}

export default function PlantShiftLogManpowerReview() {
  const { toast } = useToast();
  const [adminPin, setAdminPin] = useState<string | null>(null);

  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [filterText, setFilterText] = useState<string>("");
  const [actor, setActor] = useState<string>("");

  const [rows, setRows] = useState<ReviewRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState<string | null>(null);

  const [edits, setEdits] = useState<Record<string, { contractor: string; category: string; gender: string }>>({});
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [mergeTarget, setMergeTarget] = useState<string>("");
  const [merging, setMerging] = useState(false);

  const { data: vendorNames } = useQuery<string[]>({
    queryKey: ["/api/vendor-bills/vendor-names"],
    enabled: !!adminPin,
  });

  const fetchRows = async () => {
    if (!adminPin) return;
    setLoading(true);
    try {
      const res = await fetch("/api/plant-module/shift-log-manpower/review-list", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ pin: adminPin, dateFrom: dateFrom || undefined, dateTo: dateTo || undefined }),
      });
      if (res.status === 401) {
        setAdminPin(null);
        toast({ title: "Admin PIN required", variant: "destructive" });
        return;
      }
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as ReviewRow[];
      setRows(data);
      const initial: Record<string, { contractor: string; category: string; gender: string }> = {};
      for (const r of data) {
        const knownContractor = r.currentContractors.find(c => c && c !== "UNKNOWN CONTRACTOR") || "";
        const knownCategory = r.currentCategories.find(c => c && c !== "OTHER") || "";
        const knownGender = r.currentGenders[0] || "MALE";
        initial[r.name] = {
          contractor: knownContractor,
          category: knownCategory,
          gender: knownGender,
        };
      }
      setEdits(initial);
      setSelected({});
      setMergeTarget("");
    } catch (err) {
      toast({ title: "Failed to load list", description: getErrorMessage(err), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const submitOne = async (row: ReviewRow) => {
    if (!adminPin) return;
    const e = edits[row.name];
    if (!e?.contractor || !e?.category || !e?.gender) {
      toast({ title: "Fill contractor, category and gender", variant: "destructive" });
      return;
    }
    if (!actor || actor.trim().length < 2) {
      toast({ title: "Enter your name (operator) for the audit log", variant: "destructive" });
      return;
    }
    setSubmitting(row.name);
    try {
      const res = await fetch("/api/plant-module/shift-log-manpower/bulk-relabel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          pin: adminPin,
          actor: actor.trim(),
          name: row.name,
          contractorName: e.contractor.trim(),
          category: e.category,
          gender: e.gender,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const result = (await res.json()) as { updated: number };
      toast({
        title: "Worker relabeled",
        description: `${row.name}: updated ${result.updated} row(s) → ${e.contractor.trim().toUpperCase()} / ${e.category} / ${e.gender}`,
      });
      // Refresh list
      await fetchRows();
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/shift-logs"] });
    } catch (err) {
      toast({ title: "Relabel failed", description: getErrorMessage(err), variant: "destructive" });
    } finally {
      setSubmitting(null);
    }
  };

  const submitMerge = async () => {
    if (!adminPin) return;
    const fromNames = Object.keys(selected).filter(n => selected[n]);
    if (fromNames.length < 2) {
      toast({ title: "Pick at least two name groups to merge", variant: "destructive" });
      return;
    }
    const target = mergeTarget.trim();
    if (!target) {
      toast({ title: "Pick a target name (the spelling to keep)", variant: "destructive" });
      return;
    }
    if (!fromNames.some(n => n.toUpperCase() === target.toUpperCase())) {
      toast({ title: "Target must be one of the selected names", variant: "destructive" });
      return;
    }
    if (!actor || actor.trim().length < 2) {
      toast({ title: "Enter your name (operator) for the audit log", variant: "destructive" });
      return;
    }
    const targetRow = rows?.find(r => r.name.toUpperCase() === target.toUpperCase());
    const targetEdit = targetRow ? edits[targetRow.name] : undefined;
    const pickFirst = (arr: (string | undefined)[], skip: (s: string) => boolean): string => {
      for (const v of arr) {
        if (v && !skip(v)) return v;
      }
      return "";
    };
    const allEdits = fromNames.map(n => edits[n]).filter(Boolean) as { contractor: string; category: string; gender: string }[];
    const contractor = (targetEdit?.contractor && targetEdit.contractor !== "UNKNOWN CONTRACTOR" ? targetEdit.contractor : "")
      || pickFirst(allEdits.map(e => e.contractor), s => !s || s === "UNKNOWN CONTRACTOR");
    const category = (targetEdit?.category && targetEdit.category !== "OTHER" ? targetEdit.category : "")
      || pickFirst(allEdits.map(e => e.category), s => !s || s === "OTHER");
    const gender = targetEdit?.gender || pickFirst(allEdits.map(e => e.gender), s => !s) || "MALE";
    if (!contractor || !category || !gender) {
      toast({ title: "Fill contractor + category on the target row first", variant: "destructive" });
      return;
    }
    setMerging(true);
    try {
      const res = await fetch("/api/plant-module/shift-log-manpower/bulk-relabel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          pin: adminPin,
          actor: actor.trim(),
          fromNames,
          toName: target,
          contractorName: contractor.trim(),
          category,
          gender,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const result = (await res.json()) as { updated: number };
      toast({
        title: "Names merged",
        description: `${fromNames.length} name(s) → ${target.toUpperCase()} · ${result.updated} row(s) updated`,
      });
      await fetchRows();
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/shift-logs"] });
    } catch (err) {
      toast({ title: "Merge failed", description: getErrorMessage(err), variant: "destructive" });
    } finally {
      setMerging(false);
    }
  };

  const filteredRows = useMemo(() => {
    if (!rows) return [];
    const q = filterText.trim().toUpperCase();
    if (!q) return rows;
    return rows.filter(r => r.name.includes(q));
  }, [rows, filterText]);

  const totals = useMemo(() => {
    if (!rows) return { workers: 0, items: 0 };
    return { workers: rows.length, items: rows.reduce((a, r) => a + r.count, 0) };
  }, [rows]);

  if (!adminPin) {
    return (
      <PinAuth
        targetRole="admin"
        onSuccess={(_role, pin) => setAdminPin(pin)}
        onClose={() => { window.history.back(); }}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 flex-wrap">
        <Link href="/plant">
          <Button variant="ghost" size="icon" data-testid="button-back">
            <ChevronLeft className="w-5 h-5" />
          </Button>
        </Link>
        <Users className="w-6 h-6 text-amber-700 dark:text-amber-500" />
        <h1 className="text-2xl font-bold flex-1">Review UNKNOWN-tagged Shift-Log Workers</h1>
        <Button variant="ghost" size="sm" onClick={() => setAdminPin(null)} data-testid="button-lock">
          Lock
        </Button>
      </div>

      <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/40 dark:border-amber-800 p-3 text-sm flex items-start gap-2">
        <ShieldAlert className="w-4 h-4 mt-0.5 text-amber-700 dark:text-amber-400 shrink-0" />
        <div>
          <div className="font-semibold text-amber-800 dark:text-amber-300">Admin only — clean up legacy plant shift-log workers.</div>
          <div className="text-xs text-amber-800/80 dark:text-amber-200/80 mt-0.5">
            These workers were auto-tagged <span className="font-mono">UNKNOWN CONTRACTOR</span> or
            <span className="font-mono"> OTHER</span> when historical shift logs were back-filled.
            Pick the real contractor / category / gender for each name and apply — every shift-log row of that
            worker (across all dates) is updated in one go. Once cleaned, they drop off this list.
          </div>
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Filters</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="space-y-1.5">
            <Label>Date from</Label>
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} data-testid="input-date-from" />
          </div>
          <div className="space-y-1.5">
            <Label>Date to</Label>
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} data-testid="input-date-to" />
          </div>
          <div className="space-y-1.5">
            <Label>Filter by name</Label>
            <Input value={filterText} onChange={(e) => setFilterText(e.target.value)} placeholder="e.g. RAJU" data-testid="input-filter-name" />
          </div>
          <div className="space-y-1.5">
            <Label>Operator name (audit log)</Label>
            <Input value={actor} onChange={(e) => setActor(e.target.value)} placeholder="e.g. Ramesh K." data-testid="input-actor" />
          </div>
          <div className="md:col-span-4 flex gap-2">
            <Button onClick={fetchRows} disabled={loading} data-testid="button-load">
              {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Search className="w-4 h-4 mr-2" />}
              Load workers needing review
            </Button>
            {rows && (
              <div className="text-sm text-muted-foreground self-center" data-testid="text-totals">
                {totals.workers} worker name(s) · {totals.items} shift-log row(s)
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {rows && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Workers</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {(() => {
              const selectedNames = Object.keys(selected).filter(n => selected[n]);
              if (selectedNames.length < 2) return null;
              return (
                <div className="rounded-md border border-blue-300 bg-blue-50 dark:bg-blue-950/40 dark:border-blue-800 p-3 flex flex-wrap items-end gap-3" data-testid="merge-bar">
                  <div className="flex-1 min-w-[220px]">
                    <div className="text-sm font-semibold text-blue-900 dark:text-blue-200">
                      Merge {selectedNames.length} duplicate name(s) into one
                    </div>
                    <div className="text-xs text-blue-900/80 dark:text-blue-200/80 mt-0.5">
                      Selected: {selectedNames.join(", ")}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Keep this spelling</Label>
                    <Select value={mergeTarget} onValueChange={setMergeTarget}>
                      <SelectTrigger className="min-w-[180px]" data-testid="select-merge-target">
                        <SelectValue placeholder="Pick canonical name" />
                      </SelectTrigger>
                      <SelectContent>
                        {selectedNames.map(n => (
                          <SelectItem key={n} value={n}>{n}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    onClick={submitMerge}
                    disabled={merging || !mergeTarget || actor.trim().length < 2}
                    className="bg-blue-600 hover:bg-blue-700 text-white"
                    data-testid="button-merge"
                  >
                    {merging
                      ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      : <Combine className="w-4 h-4 mr-2" />}
                    Merge into {mergeTarget || "…"}
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => { setSelected({}); setMergeTarget(""); }}
                    data-testid="button-clear-selection"
                  >
                    Clear
                  </Button>
                </div>
              );
            })()}
            {filteredRows.length === 0 ? (
              <div className="p-3 text-center text-muted-foreground text-sm" data-testid="text-empty">
                Nothing to clean up — every worker already has a real contractor and category. Nice.
              </div>
            ) : (
              <div className="overflow-auto border rounded-md">
                <table className="w-full text-sm">
                  <thead className="bg-muted/60 border-b sticky top-0">
                    <tr>
                      <th className="text-left p-2 w-8" title="Select to merge">
                        <span className="sr-only">Select</span>
                      </th>
                      <th className="text-left p-2">Worker name</th>
                      <th className="text-left p-2">Rows</th>
                      <th className="text-left p-2">Date range</th>
                      <th className="text-left p-2">Current</th>
                      <th className="text-left p-2 min-w-[180px]">New contractor</th>
                      <th className="text-left p-2 min-w-[140px]">Category</th>
                      <th className="text-left p-2 min-w-[110px]">Gender</th>
                      <th className="text-left p-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRows.map(r => {
                      const e = edits[r.name] || { contractor: "", category: "", gender: "MALE" };
                      const setField = (patch: Partial<typeof e>) => {
                        setEdits(prev => ({ ...prev, [r.name]: { ...e, ...patch } }));
                      };
                      return (
                        <tr key={r.name} className="border-b last:border-0 align-top" data-testid={`row-worker-${r.name}`}>
                          <td className="p-2">
                            <input
                              type="checkbox"
                              className="h-4 w-4 cursor-pointer"
                              checked={!!selected[r.name]}
                              onChange={(ev) => {
                                const checked = ev.target.checked;
                                setSelected(prev => ({ ...prev, [r.name]: checked }));
                                if (!checked && mergeTarget === r.name) setMergeTarget("");
                              }}
                              data-testid={`checkbox-select-${r.name}`}
                              aria-label={`Select ${r.name} for merge`}
                            />
                          </td>
                          <td className="p-2 font-medium">
                            {r.name}
                            {r.roles.length > 0 && (
                              <div className="text-xs text-muted-foreground mt-0.5">role: {r.roles.join(", ")}</div>
                            )}
                          </td>
                          <td className="p-2 tabular-nums">{r.count}</td>
                          <td className="p-2 text-xs whitespace-nowrap">
                            {r.earliestDate}<br />→ {r.latestDate}
                          </td>
                          <td className="p-2 text-xs">
                            <div className={r.needsContractor ? "text-red-600 dark:text-red-400 font-semibold" : ""}>
                              {r.currentContractors.join(", ") || "—"}
                            </div>
                            <div className={r.needsCategory ? "text-red-600 dark:text-red-400 font-semibold" : "text-muted-foreground"}>
                              {r.currentCategories.join(", ") || "—"} · {r.currentGenders.join(", ") || "—"}
                            </div>
                          </td>
                          <td className="p-2">
                            <Input
                              value={e.contractor}
                              onChange={(ev) => setField({ contractor: ev.target.value })}
                              placeholder="Contractor name"
                              list="contractor-options"
                              data-testid={`input-contractor-${r.name}`}
                            />
                          </td>
                          <td className="p-2">
                            <Select value={e.category} onValueChange={(v) => setField({ category: v })}>
                              <SelectTrigger data-testid={`select-category-${r.name}`}>
                                <SelectValue placeholder="Category" />
                              </SelectTrigger>
                              <SelectContent>
                                {LABOUR_CATEGORIES.map(c => (
                                  <SelectItem key={c} value={c}>{c}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </td>
                          <td className="p-2">
                            <Select value={e.gender} onValueChange={(v) => setField({ gender: v })}>
                              <SelectTrigger data-testid={`select-gender-${r.name}`}>
                                <SelectValue placeholder="Gender" />
                              </SelectTrigger>
                              <SelectContent>
                                {LABOUR_GENDERS.map(g => (
                                  <SelectItem key={g} value={g}>{g}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </td>
                          <td className="p-2">
                            <Button
                              size="sm"
                              className="bg-amber-600 hover:bg-amber-700 text-white"
                              disabled={submitting === r.name || !e.contractor || !e.category || !e.gender || actor.trim().length < 2}
                              onClick={() => submitOne(r)}
                              data-testid={`button-apply-${r.name}`}
                            >
                              {submitting === r.name
                                ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                : <Wand2 className="w-4 h-4 mr-2" />}
                              Apply to {r.count}
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <datalist id="contractor-options">
                  {(vendorNames || []).map(n => <option key={n} value={n} />)}
                </datalist>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
