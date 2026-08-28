import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft, Check, ChevronRight, ClipboardCheck, FilePlus2, Loader2, RefreshCw, ShieldCheck, Wrench } from "lucide-react";
import { useLocation } from "wouter";
import { HubShell } from "@/components/HubShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type Exception = { id?: number; source?: string; sourceId?: number | string | null; exceptionType?: string; date: string; reason?: string; downtimeHours?: number; decision?: "full_day" | "half_day" | "none" | "manual"; finalDeduction?: number; remarks?: string };
type Statement = {
  id: number; revision: number; equipmentId: number; equipment?: string; equipmentName?: string; vendor?: string; vendorName?: string;
  basis?: string; rate?: number; period?: { from: string; to: string } | string; billingFrom?: string; billingTo?: string;
  status: string; calculatedQty?: number; gross?: number; deduction?: number; approvedAmount?: number;
  activityDays?: number; divisor?: number; usageSummary?: Record<string, unknown>; exceptions?: Exception[];
  linkedVendorBillId?: number | null;
};
const money = (n?: number) => `₹${Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dateNow = new Date();
const iso = (d: Date) => d.toISOString().slice(0, 10);
const firstOfMonth = iso(new Date(dateNow.getFullYear(), dateNow.getMonth(), 1));

async function request(url: string, method = "GET", body?: unknown) {
  const response = await fetch(url, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined, credentials: "include" });
  if (!response.ok) throw new Error((await response.text()) || `Request failed (${response.status})`);
  return response.status === 204 ? null : response.json();
}
function statusTone(status: string) {
  const s = status.toLowerCase();
  return s.includes("approved") || s.includes("bill") ? "bg-emerald-50 text-emerald-700 border-emerald-200" : s.includes("review") ? "bg-blue-50 text-blue-700 border-blue-200" : "bg-amber-50 text-amber-700 border-amber-200";
}
function Stat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return <div className="border-l-2 border-slate-200 pl-3"><p className="text-[10px] font-semibold uppercase tracking-[.14em] text-slate-500">{label}</p><p className={`mt-1 text-lg font-semibold ${accent || "text-slate-800"}`}>{value}</p></div>;
}

export default function EquipmentHireBilling() {
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const [from, setFrom] = useState(firstOfMonth);
  const [to, setTo] = useState(iso(dateNow));
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [exceptionDraft, setExceptionDraft] = useState<Exception | null>(null);
  const listKey = ["/api/equipment-hire/statements", from, to];
  const list = useQuery<Statement[]>({ queryKey: listKey, queryFn: () => request(`/api/equipment-hire/statements?billingFrom=${from}&billingTo=${to}`), retry: 1 });
  const detail = useQuery<Statement>({ queryKey: ["/api/equipment-hire/statements", selectedId], queryFn: () => request(`/api/equipment-hire/statements/${selectedId}`), enabled: !!selectedId });
  const invalidate = () => { queryClient.invalidateQueries({ queryKey: ["/api/equipment-hire/statements"] }); };
  const create = useMutation({ mutationFn: (row: Statement) => request("/api/equipment-hire/statements", "POST", { equipmentId: row.equipmentId, billingFrom: from, billingTo: to }), onSuccess: async (data: Statement) => { await invalidate(); await queryClient.invalidateQueries({ queryKey: ["/api/equipment-hire/statements", data.id] }); setSelectedId(data.id); } });
  const action = useMutation({ mutationFn: ({ id, path, expectedRevision }: { id: number; path: string; expectedRevision: number }) => request(`/api/equipment-hire/statements/${id}/${path}`, "POST", { expectedRevision }), onSuccess: () => { invalidate(); detail.refetch(); }, onError: () => detail.refetch() });
  const saveExceptions = useMutation({ mutationFn: ({ exceptions, expectedRevision }: { exceptions: Exception[]; expectedRevision: number }) => request(`/api/equipment-hire/statements/${selectedId}/exceptions`, "PATCH", { exceptions, expectedRevision }), onSuccess: () => { invalidate(); detail.refetch(); setExceptionDraft(null); }, onError: () => detail.refetch() });
  const rows = useMemo(() => Array.isArray(list.data) ? list.data : [], [list.data]);
  const current = detail.data;
  const exceptions = current?.exceptions || [];
  const errorMessage = (e: unknown) => e instanceof Error ? e.message : "Something went wrong. Try again.";
  const openRow = (row: Statement) => row.id < 0 ? create.mutate(row) : setSelectedId(row.id);

  return <HubShell title="Hire billing register" subtitle="Commercial review for hired equipment · traceable to daily activity" backHref="/equipment/hub" backLabel="Equipment & Fleet">
    <div className="min-h-[calc(100dvh-10rem)] bg-[#f4f6f5]">
      <div className="mx-auto max-w-[1500px] space-y-5 p-4 md:p-7">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div><p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[.2em] text-amber-700"><Wrench className="h-4 w-4" /> Equipment commercial control</p><h1 className="text-3xl font-bold text-slate-900">Hire billing register</h1><p className="mt-1 max-w-2xl text-sm text-slate-600">One statement per hire period. Review downtime deductions before a vendor bill is created.</p></div>
          <div className="flex flex-wrap items-end gap-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
            <label className="text-xs font-semibold text-slate-600">Billing from<Input type="date" value={from} onChange={e => setFrom(e.target.value)} /></label>
            <label className="text-xs font-semibold text-slate-600">Billing to<Input type="date" value={to} onChange={e => setTo(e.target.value)} /></label>
            <Button variant="outline" size="icon" aria-label="Refresh register" onClick={() => list.refetch()}><RefreshCw className="h-4 w-4" /></Button>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-white p-4"><Stat label="Statements in period" value={list.isLoading ? "…" : String(rows.length)} /></div>
          <div className="rounded-xl border border-slate-200 bg-white p-4"><Stat label="Awaiting review" value={String(rows.filter(r => r.status?.toLowerCase().includes("review") || r.status?.toLowerCase().includes("draft")).length)} accent="text-amber-700" /></div>
          <div className="rounded-xl border border-slate-200 bg-white p-4"><Stat label="Approved value" value={money(rows.reduce((sum, r) => sum + Number(r.approvedAmount || 0), 0))} accent="text-emerald-700" /></div>
        </div>
        <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_440px]">
          <section className="min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4"><div><h2 className="font-semibold text-slate-900">Statements</h2><p className="text-xs text-slate-500">Showing {from} through {to}</p></div><p className="text-xs text-slate-500">Select a configured row to open or start its statement</p></div>
            {create.isError && <p className="mx-5 mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{errorMessage(create.error)}</p>}
            {list.isLoading ? <div className="space-y-3 p-5"><div className="h-12 animate-pulse rounded bg-slate-100" /><div className="h-12 animate-pulse rounded bg-slate-100" /><div className="h-12 animate-pulse rounded bg-slate-100" /></div> :
              list.isError ? <div className="p-10 text-center"><AlertTriangle className="mx-auto mb-3 h-8 w-8 text-red-500" /><p className="font-semibold">Register unavailable</p><p className="mt-1 text-sm text-slate-500">{errorMessage(list.error)}</p><Button className="mt-4" variant="outline" onClick={() => list.refetch()}>Retry</Button></div> :
              !rows.length ? <div className="p-12 text-center"><ClipboardCheck className="mx-auto mb-3 h-9 w-9 text-slate-300" /><p className="font-semibold text-slate-700">No configured hired equipment for this period</p><p className="mt-1 text-sm text-slate-500">Add hire terms in Equipment Master to prepare statements from recorded activity.</p></div> :
              <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500"><tr><th className="px-5 py-3">Equipment / vendor</th><th className="px-3 py-3">Basis & rate</th><th className="px-3 py-3">Period</th><th className="px-3 py-3 text-right">Approved</th><th className="px-5 py-3">Status</th><th className="px-5 py-3 text-right">Action</th></tr></thead><tbody className="divide-y divide-slate-100">{rows.map(row => <tr key={row.id} onClick={() => openRow(row)} className={`cursor-pointer transition-colors hover:bg-amber-50/50 ${selectedId === row.id ? "bg-amber-50" : ""}`}><td className="px-5 py-4"><p className="font-semibold text-slate-800">{row.equipmentName || row.equipment || `Equipment #${row.equipmentId}`}</p><p className="text-xs text-slate-500">{row.vendorName || row.vendor || "Vendor not linked"}</p></td><td className="px-3 py-4 text-slate-700">{row.basis || "—"}<p className="text-xs text-slate-500">{money(row.rate)}</p></td><td className="whitespace-nowrap px-3 py-4 text-xs text-slate-600">{row.billingFrom || (typeof row.period === "object" ? row.period?.from : "")}<br />{row.billingTo || (typeof row.period === "object" ? row.period?.to : "")}</td><td className="px-3 py-4 text-right font-semibold text-slate-800">{money(row.approvedAmount)}</td><td className="px-5 py-4"><Badge variant="outline" className={statusTone(row.status)}>{row.id < 0 ? "Ready to draft" : row.status}</Badge></td><td className="px-5 py-4 text-right">{row.id < 0 ? <Button size="sm" variant="outline" disabled={create.isPending} onClick={e => { e.stopPropagation(); create.mutate(row); }}><FilePlus2 className="mr-1 h-4 w-4" />Create draft</Button> : <span className="text-xs font-semibold text-blue-700">Open</span>}</td></tr>)}</tbody></table></div>}
          </section>
          <DetailPanel current={current} loading={detail.isLoading} error={detail.error} exceptions={exceptions} exceptionDraft={exceptionDraft} setExceptionDraft={setExceptionDraft} saveExceptions={saveExceptions} action={action} onBack={() => setSelectedId(null)} navigate={navigate} />
        </div>
      </div>
    </div>
  </HubShell>;
}

function DetailPanel({ current, loading, error, exceptions, exceptionDraft, setExceptionDraft, saveExceptions, action, onBack, navigate }: { current?: Statement; loading: boolean; error: unknown; exceptions: Exception[]; exceptionDraft: Exception | null; setExceptionDraft: (v: Exception | null) => void; saveExceptions: any; action: any; onBack: () => void; navigate: (to: string) => void }) {
  if (!current && !loading) return <aside className="hidden rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center xl:block"><ShieldCheck className="mx-auto mb-3 h-8 w-8 text-slate-300" /><p className="font-semibold text-slate-700">Select a statement</p><p className="mt-1 text-sm text-slate-500">The full calculation trail and review controls will appear here.</p></aside>;
  if (loading) return <aside className="rounded-xl border border-slate-200 bg-white p-6"><div className="h-5 w-40 animate-pulse rounded bg-slate-100" /><div className="mt-5 h-36 animate-pulse rounded bg-slate-100" /></aside>;
  if (error || !current) return <aside className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">Unable to load statement details.</aside>;
  const editable = current.status.toLowerCase().includes("draft") || current.status.toLowerCase().includes("review");
  const addException = () => setExceptionDraft({ date: "", downtimeHours: 0, reason: "", remarks: "", source: "manual", sourceId: null, exceptionType: "manual" });
  const updateDraft = (patch: Partial<Exception>) => setExceptionDraft(exceptionDraft ? { ...exceptionDraft, ...patch } : null);
  const save = () => {
    if (!exceptionDraft?.date) return;
    const index = exceptionDraft.id != null
      ? exceptions.findIndex(item => item.id === exceptionDraft.id)
      : exceptions.findIndex(item => item.sourceId === exceptionDraft.sourceId && item.date === exceptionDraft.date && item.exceptionType === exceptionDraft.exceptionType);
    const next = [...exceptions];
    if (index >= 0) next[index] = exceptionDraft; else next.push(exceptionDraft);
    saveExceptions.mutate({ exceptions: next, expectedRevision: current.revision });
  };
  const isDraft = current.status.toLowerCase().includes("draft");
  const isReviewed = current.status.toLowerCase().includes("review");
  const canApprove = isReviewed || (isDraft && exceptions.length === 0);
  return <aside className="rounded-xl border border-slate-200 bg-white shadow-sm">
    <div className="flex items-start justify-between border-b border-slate-100 p-5"><div><button className="mb-2 inline-flex items-center gap-1 text-xs text-slate-500 xl:hidden" onClick={onBack}><ArrowLeft className="h-3 w-3" />Back to register</button><p className="text-xs font-semibold uppercase tracking-[.16em] text-amber-700">Statement #{current.id}</p><h2 className="mt-1 text-xl font-bold text-slate-900">{current.equipmentName || current.equipment || `Equipment #${current.equipmentId}`}</h2><p className="text-sm text-slate-500">{current.vendorName || current.vendor || "Vendor not linked"}</p></div><Badge variant="outline" className={statusTone(current.status)}>{current.status}</Badge></div>
    <div className="grid grid-cols-2 gap-y-5 p-5 sm:grid-cols-4 xl:grid-cols-2"><Stat label="Gross" value={money(current.gross)} /><Stat label="Deductions" value={`− ${money(current.deduction)}`} accent="text-red-700" /><Stat label="Approved" value={money(current.approvedAmount)} accent="text-emerald-700" /><Stat label="Activity days" value={`${current.activityDays ?? "—"} / ${current.divisor ?? "—"}`} /></div>
    <div className="mx-5 rounded-lg bg-slate-900 p-4 text-slate-100"><p className="text-[10px] uppercase tracking-[.16em] text-slate-400">Calculation basis</p><div className="mt-2 flex justify-between gap-3 text-sm"><span>{current.basis || "Daily hire"} · {current.calculatedQty ?? "—"} units</span><strong>{money(current.rate)} / unit</strong></div><p className="mt-2 text-xs text-slate-400">Usage and downtime are sourced from site records. No duplicate entry.</p></div>
    <div className="p-5"><div className="mb-3 flex items-center justify-between"><div><h3 className="font-semibold text-slate-800">Exceptions & deductions</h3><p className="text-xs text-slate-500">{exceptions.length} recorded adjustment{exceptions.length === 1 ? "" : "s"}</p></div>{editable && <Button size="sm" variant="outline" onClick={addException}>Add exception</Button>}</div>
      {exceptionDraft && <div className="mb-4 space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-3"><div className="grid grid-cols-2 gap-2"><Input type="date" value={exceptionDraft.date} onChange={e => updateDraft({ date: e.target.value })} /><Input type="number" placeholder="Downtime hours" value={exceptionDraft.downtimeHours || ""} onChange={e => updateDraft({ downtimeHours: Number(e.target.value) })} /></div><select className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm" value={exceptionDraft.decision || ""} onChange={e => updateDraft({ decision: e.target.value as Exception["decision"] })}><option value="" disabled>Select a decision</option><option value="none">No deduction</option><option value="full_day">Full day</option><option value="half_day">Half day</option><option value="manual">Manual amount</option></select>{exceptionDraft.decision === "manual" && <Input type="number" min="0" step="0.01" placeholder="Final deduction amount" value={exceptionDraft.finalDeduction ?? ""} onChange={e => updateDraft({ finalDeduction: e.target.value === "" ? undefined : Number(e.target.value) })} />}<Input placeholder="Reason" value={exceptionDraft.reason || ""} onChange={e => updateDraft({ reason: e.target.value })} /><Textarea placeholder="Remarks" value={exceptionDraft.remarks || ""} onChange={e => updateDraft({ remarks: e.target.value })} /><div className="flex justify-end gap-2"><Button variant="ghost" size="sm" onClick={() => setExceptionDraft(null)}>Cancel</Button><Button size="sm" disabled={!exceptionDraft.date || !exceptionDraft.decision || (exceptionDraft.decision === "manual" && exceptionDraft.finalDeduction == null) || saveExceptions.isPending} onClick={save}>Save exception</Button></div></div>}
      {exceptions.length ? <div className="space-y-2">{exceptions.map((e, i) => <div key={e.id || `${e.sourceId}-${e.date}-${i}`} className="rounded-lg border border-slate-100 bg-slate-50 p-3 text-sm"><div className="flex items-center justify-between gap-2"><span className="font-semibold text-slate-800">{e.date}</span><div className="flex items-center gap-2"><span className={e.decision ? "text-red-700" : "font-semibold text-amber-700"}>{!e.decision ? "Decision required" : e.decision === "full_day" ? "Full day deduction" : e.decision === "half_day" ? "Half day deduction" : `${money(e.finalDeduction)} deduction`}</span>{editable && <button type="button" className="text-xs font-semibold text-blue-700 hover:underline" onClick={() => setExceptionDraft({ ...e })}>Review / Edit</button>}</div></div><p className="mt-1 text-xs text-slate-600">{e.reason || "No reason supplied"} · {e.downtimeHours ?? 0}h downtime · {e.exceptionType || "Exception"}{e.source ? ` · ${e.source}` : ""}</p></div>)}</div> : <p className="rounded-lg border border-dashed border-slate-200 p-4 text-center text-xs text-slate-500">No exceptions recorded.</p>}</div>
    <div className="flex flex-wrap gap-2 border-t border-slate-100 p-5">{isDraft && exceptions.length > 0 && <Button disabled={action.isPending} onClick={() => action.mutate({ id: current.id, path: "review", expectedRevision: current.revision })}><ClipboardCheck className="mr-1.5 h-4 w-4" />Submit for review</Button>}{canApprove && <Button variant="outline" disabled={action.isPending} onClick={() => action.mutate({ id: current.id, path: "approve", expectedRevision: current.revision })}><Check className="mr-1.5 h-4 w-4" />Approve statement</Button>}{current.status.toLowerCase().includes("approved") && !current.linkedVendorBillId && <Button variant="outline" disabled={action.isPending} onClick={() => action.mutate({ id: current.id, path: "create-vendor-bill", expectedRevision: current.revision })}>Create vendor bill</Button>}{current.linkedVendorBillId && <Button variant="outline" onClick={() => navigate(`/plant/vendor-bills?selectedId=${current.linkedVendorBillId}`)}>Open vendor bill <ChevronRight className="ml-1 h-4 w-4" /></Button>}</div>
    {action.isError && <p className="px-5 pb-5 text-sm text-red-700">{action.error instanceof Error ? action.error.message : "Action could not be completed."}</p>}
  </aside>;
}