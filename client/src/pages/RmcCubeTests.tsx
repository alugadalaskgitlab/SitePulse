import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { ArrowLeft, Plus, Pencil, Trash2, CheckCircle, XCircle, TestTube, AlertTriangle, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth-context";
import type { RmcCubeTest, RmcBatchRecordWithDesign } from "@shared/schema";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";

const today = new Date().toISOString().slice(0, 10);
const AGE_OPTIONS = [3, 7, 14, 28];
const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

function defaultForm() {
  return {
    batchRecordId: "",
    sampleId: "",
    ageDays: "28",
    testDate: today,
    strengthMpa: "",
    targetStrength: "",
    passFail: "",
    remarks: "",
  };
}

export default function RmcCubeTests() {
  const { toast } = useToast();
  const { sectionCan, isAdmin } = useAuth();
  const canCreate = sectionCan("plant_production", "create");
  const canEdit = sectionCan("plant_production", "edit");

  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(defaultForm());
  const [dateFrom, setDateFrom] = useState(monthAgo);
  const [dateTo, setDateTo] = useState(today);
  const [filterAge, setFilterAge] = useState<string>("all");

  const [chartAge, setChartAge] = useState<string>("28");
  const [chartGrade, setChartGrade] = useState<string>("all");

  const { data: cubeTests = [], isLoading } = useQuery<RmcCubeTest[]>({
    queryKey: ["/api/rmc/cube-tests", dateFrom, dateTo, filterAge],
    queryFn: () => {
      const p = new URLSearchParams({ dateFrom, dateTo });
      if (filterAge && filterAge !== "all") p.set("ageDays", filterAge);
      return apiRequest("GET", `/api/rmc/cube-tests?${p}`).then(r => r.json());
    },
  });

  const { data: batchRecords = [] } = useQuery<RmcBatchRecordWithDesign[]>({
    queryKey: ["/api/rmc/batch-records"],
    queryFn: () => apiRequest("GET", "/api/rmc/batch-records").then(r => r.json()),
  });

  const upsertMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = editingId
        ? await apiRequest("PATCH", `/api/rmc/cube-tests/${editingId}`, payload)
        : await apiRequest("POST", "/api/rmc/cube-tests", payload);
      if (!res.ok) { const e = await res.json(); throw new Error(e.message || "Failed"); }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/rmc/cube-tests"] });
      toast({ title: editingId ? "Test result updated" : "Test result recorded" });
      setOpen(false);
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("DELETE", `/api/rmc/cube-tests/${id}`);
      if (!res.ok) { const e = await res.json(); throw new Error(e.message || "Failed"); }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/rmc/cube-tests"] });
      toast({ title: "Test deleted" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  function openCreate() {
    setEditingId(null);
    setForm(defaultForm());
    setOpen(true);
  }

  function openEdit(t: RmcCubeTest) {
    setEditingId(t.id);
    setForm({
      batchRecordId: t.batchRecordId.toString(),
      sampleId: t.sampleId,
      ageDays: t.ageDays.toString(),
      testDate: t.testDate,
      strengthMpa: t.strengthMpa.toString(),
      targetStrength: t.targetStrength?.toString() ?? "",
      passFail: t.passFail ?? "",
      remarks: t.remarks ?? "",
    });
    setOpen(true);
  }

  function derivePassFail(strength: string, target: string) {
    if (!strength || !target) return "";
    return Number(strength) >= Number(target) ? "pass" : "fail";
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.sampleId.trim()) return toast({ title: "Sample ID required", variant: "destructive" });
    if (!form.batchRecordId) return toast({ title: "Select batch record", variant: "destructive" });
    const pf = form.passFail || derivePassFail(form.strengthMpa, form.targetStrength);
    upsertMutation.mutate({
      batchRecordId: Number(form.batchRecordId),
      sampleId: form.sampleId.trim(),
      ageDays: Number(form.ageDays),
      testDate: form.testDate,
      strengthMpa: Number(form.strengthMpa),
      targetStrength: form.targetStrength ? Number(form.targetStrength) : null,
      passFail: pf || null,
      remarks: form.remarks || null,
    });
  }

  const passCount = cubeTests.filter(t => t.passFail === "pass").length;
  const failCount = cubeTests.filter(t => t.passFail === "fail").length;

  const getBatchLabel = (id: number) => {
    const b = batchRecords.find(b => b.id === id);
    return b ? `${b.date} — ${b.grade}` : `Batch #${id}`;
  };

  const getBatchGrade = (id: number) => {
    return batchRecords.find(b => b.id === id)?.grade ?? "";
  };

  const gradesInView = [...new Set(cubeTests.map(t => getBatchGrade(t.batchRecordId)).filter(Boolean))].sort();

  const chartTests = cubeTests
    .filter(t => {
      const gradeOk = chartGrade === "all" || getBatchGrade(t.batchRecordId) === chartGrade;
      const ageOk = chartAge === "all" || t.ageDays === Number(chartAge);
      return gradeOk && ageOk;
    })
    .map(t => ({
      date: t.testDate,
      strength: t.strengthMpa,
      target: t.targetStrength ?? undefined,
      sample: t.sampleId,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const avgTarget = chartTests.length > 0
    ? chartTests.reduce((s, t) => s + (t.target ?? 0), 0) / chartTests.filter(t => t.target != null).length
    : undefined;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Link href="/plant/rmc">
            <Button variant="ghost" size="icon" data-testid="btn-back"><ArrowLeft className="w-5 h-5" /></Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold">RMC Cube Tests</h1>
            <p className="text-sm text-muted-foreground">Concrete compressive strength QC results</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => {
              const p = new URLSearchParams({ dateFrom, dateTo });
              if (filterAge && filterAge !== "all") p.set("ageDays", filterAge);
              window.location.href = `/api/rmc/cube-tests/export?${p}`;
            }}
            data-testid="btn-export-cube-tests"
          >
            <Download className="w-4 h-4 mr-2" />Export Excel
          </Button>
          {canCreate && (
            <Button onClick={openCreate} data-testid="btn-add-test">
              <Plus className="w-4 h-4 mr-2" />Add Test Result
            </Button>
          )}
        </div>
      </div>

      {!isLoading && failCount > 0 && (
        <div
          className="flex items-start gap-3 rounded-lg border border-red-300 bg-red-50 dark:bg-red-950/20 dark:border-red-800 p-4"
          data-testid="banner-cube-failures"
        >
          <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-red-700 dark:text-red-300">
              {failCount} cube test{failCount !== 1 ? "s" : ""} failed in this date range
            </p>
            <p className="text-sm text-red-600 dark:text-red-400 mt-0.5">
              Review the failed samples below and investigate root causes.
            </p>
          </div>
        </div>
      )}

      {cubeTests.length > 0 && (
        <div className="grid grid-cols-3 gap-4">
          <Card className="bg-muted/30">
            <CardContent className="p-4 text-center">
              <p className="text-sm text-muted-foreground">Total Tests</p>
              <p className="text-2xl font-bold">{cubeTests.length}</p>
            </CardContent>
          </Card>
          <Card className="bg-green-50 dark:bg-green-950/20 border-green-200">
            <CardContent className="p-4 text-center">
              <p className="text-sm text-green-700 dark:text-green-400">Pass</p>
              <p className="text-2xl font-bold text-green-700 dark:text-green-300">{passCount}</p>
            </CardContent>
          </Card>
          <Card className="bg-red-50 dark:bg-red-950/20 border-red-200">
            <CardContent className="p-4 text-center">
              <p className="text-sm text-red-700 dark:text-red-400">Fail</p>
              <p className="text-2xl font-bold text-red-700 dark:text-red-300">{failCount}</p>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="w-36" data-testid="input-date-from" />
        <span className="text-muted-foreground text-sm">to</span>
        <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="w-36" data-testid="input-date-to" />
        <Select value={filterAge} onValueChange={setFilterAge}>
          <SelectTrigger className="w-32" data-testid="select-filter-age">
            <SelectValue placeholder="All ages" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All ages</SelectItem>
            {AGE_OPTIONS.map(a => <SelectItem key={a} value={a.toString()}>{a}-day</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {cubeTests.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <CardTitle className="text-base">Strength Trend</CardTitle>
              <div className="flex items-center gap-2">
                <Select value={chartGrade} onValueChange={setChartGrade}>
                  <SelectTrigger className="w-32 h-8 text-sm" data-testid="select-chart-grade">
                    <SelectValue placeholder="All grades" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All grades</SelectItem>
                    {gradesInView.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={chartAge} onValueChange={setChartAge}>
                  <SelectTrigger className="w-28 h-8 text-sm" data-testid="select-chart-age">
                    <SelectValue placeholder="Age" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All ages</SelectItem>
                    {AGE_OPTIONS.map(a => <SelectItem key={a} value={a.toString()}>{a}-day</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {chartTests.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">No data for selected filters.</p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={chartTests} margin={{ top: 8, right: 16, left: 0, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 11 }}
                    tickFormatter={d => d.slice(5)}
                  />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    unit=" MPa"
                    width={64}
                  />
                  <Tooltip
                    formatter={(value: any, name: string) => [`${value} MPa`, name === "strength" ? "Strength" : "Target"]}
                    labelFormatter={l => `Date: ${l}`}
                  />
                  <Legend formatter={v => v === "strength" ? "Actual Strength" : "Target fck"} />
                  {avgTarget != null && !isNaN(avgTarget) && (
                    <ReferenceLine
                      y={avgTarget}
                      stroke="#ef4444"
                      strokeDasharray="4 4"
                      label={{ value: `Avg target ${avgTarget.toFixed(1)}`, position: "insideTopRight", fontSize: 10, fill: "#ef4444" }}
                    />
                  )}
                  <Line
                    type="monotone"
                    dataKey="strength"
                    stroke="#0d9488"
                    strokeWidth={2}
                    dot={{ r: 4, fill: "#0d9488" }}
                    activeDot={{ r: 6 }}
                  />
                  {chartTests.some(t => t.target != null) && (
                    <Line
                      type="monotone"
                      dataKey="target"
                      stroke="#f97316"
                      strokeWidth={1.5}
                      strokeDasharray="4 4"
                      dot={false}
                    />
                  )}
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Loading…</div>
      ) : cubeTests.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 gap-3">
            <TestTube className="w-10 h-10 text-muted-foreground" />
            <p className="text-muted-foreground">No cube test results yet.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {cubeTests.map(t => (
            <Card key={t.id} data-testid={`card-cube-test-${t.id}`}
              className={t.passFail === "fail" ? "border-red-200 dark:border-red-800" : t.passFail === "pass" ? "border-green-200 dark:border-green-800" : ""}
            >
              <CardContent className="p-4 flex flex-wrap items-center gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold">{t.sampleId}</span>
                    <Badge variant="outline">{t.ageDays}-day</Badge>
                    <span className="font-bold text-lg">{t.strengthMpa} MPa</span>
                    {t.targetStrength && (
                      <span className="text-sm text-muted-foreground">/ {t.targetStrength} MPa target</span>
                    )}
                    {t.passFail === "pass" && (
                      <span className="flex items-center gap-1 text-green-600 dark:text-green-400 text-sm">
                        <CheckCircle className="w-4 h-4" />PASS
                      </span>
                    )}
                    {t.passFail === "fail" && (
                      <span className="flex items-center gap-1 text-red-600 dark:text-red-400 text-sm">
                        <XCircle className="w-4 h-4" />FAIL
                      </span>
                    )}
                  </div>
                  <div className="text-sm text-muted-foreground mt-1 flex flex-wrap gap-3">
                    <span>Tested: {t.testDate}</span>
                    <span>Batch: {getBatchLabel(t.batchRecordId)}</span>
                  </div>
                  {t.remarks && <p className="text-sm text-muted-foreground mt-1">{t.remarks}</p>}
                </div>
                <div className="flex gap-2">
                  {canEdit && (
                    <Button variant="outline" size="sm" onClick={() => openEdit(t)} data-testid={`btn-edit-test-${t.id}`}>
                      <Pencil className="w-4 h-4" />
                    </Button>
                  )}
                  {isAdmin && (
                    <Button
                      variant="outline" size="sm"
                      className="text-destructive hover:bg-destructive/10"
                      onClick={() => { if (confirm("Delete this test result?")) deleteMutation.mutate(t.id); }}
                      data-testid={`btn-delete-test-${t.id}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Test Result" : "Record Cube Test Result"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1">
              <Label>Batch Record *</Label>
              <Select
                value={form.batchRecordId}
                onValueChange={v => {
                  const batch = batchRecords.find(b => b.id === Number(v));
                  const ts = batch?.targetStrength != null ? batch.targetStrength.toString() : "";
                  setForm(f => ({
                    ...f,
                    batchRecordId: v,
                    targetStrength: ts || f.targetStrength,
                    passFail: derivePassFail(f.strengthMpa, ts || f.targetStrength),
                  }));
                }}
              >
                <SelectTrigger data-testid="select-batch-record">
                  <SelectValue placeholder="Select batch…" />
                </SelectTrigger>
                <SelectContent>
                  {batchRecords.map(b => (
                    <SelectItem key={b.id} value={b.id.toString()}>
                      {b.date} — {b.grade} — {b.totalVolumeM3}m³ {b.dcNumber ? `(DC: ${b.dcNumber})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Sample ID *</Label>
                <Input value={form.sampleId} onChange={e => setForm(f => ({ ...f, sampleId: e.target.value }))} placeholder="e.g. C1-25-001" required data-testid="input-sample-id" />
              </div>
              <div className="space-y-1">
                <Label>Test Age</Label>
                <Select value={form.ageDays} onValueChange={v => setForm(f => ({ ...f, ageDays: v }))}>
                  <SelectTrigger data-testid="select-age-days">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {AGE_OPTIONS.map(a => <SelectItem key={a} value={a.toString()}>{a} days</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Test Date *</Label>
                <Input type="date" value={form.testDate} onChange={e => setForm(f => ({ ...f, testDate: e.target.value }))} required data-testid="input-test-date" />
              </div>
              <div className="space-y-1">
                <Label>Strength (MPa) *</Label>
                <Input type="number" step="0.1" value={form.strengthMpa} onChange={e => {
                  const v = e.target.value;
                  setForm(f => ({ ...f, strengthMpa: v, passFail: derivePassFail(v, f.targetStrength) }));
                }} required data-testid="input-strength" />
              </div>
              <div className="space-y-1">
                <Label>Target fck (MPa)</Label>
                <Input type="number" step="0.1" value={form.targetStrength} onChange={e => {
                  const v = e.target.value;
                  setForm(f => ({ ...f, targetStrength: v, passFail: derivePassFail(f.strengthMpa, v) }));
                }} data-testid="input-target" />
              </div>
              <div className="space-y-1">
                <Label>Pass / Fail</Label>
                <Select value={form.passFail} onValueChange={v => setForm(f => ({ ...f, passFail: v }))}>
                  <SelectTrigger data-testid="select-pass-fail">
                    <SelectValue placeholder="Auto-detect" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pass">Pass</SelectItem>
                    <SelectItem value="fail">Fail</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label>Remarks</Label>
              <Textarea value={form.remarks} onChange={e => setForm(f => ({ ...f, remarks: e.target.value }))} rows={2} data-testid="textarea-remarks" />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={upsertMutation.isPending} data-testid="btn-save-test">
                {upsertMutation.isPending ? "Saving…" : "Save"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
