// ─────────────────────────────────────────────────────────────────────────────
// Physical Stock Reconciliation (Task #1385)
// Stores & Inventory → Current Balances → Physical Stock Reconciliation
//
// Batch session: enter physical counts for multiple materials, preview every
// adjustment, then post once. Posting writes immutable stock-ledger
// 'adjustment' entries; a wrong reconciliation is corrected by a NEW session.
// ─────────────────────────────────────────────────────────────────────────────
import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ArrowLeft, ClipboardCheck, Loader2, Scale, FileText, AlertTriangle, CheckCircle2 } from "lucide-react";
import type { Party, PlantMaterial } from "@shared/schema";
import {
  RECONCILIATION_REASONS,
  resolveConversion,
  convertToBase,
  computeAdjustment,
  isNoChange,
  summarizeSession,
  computeVarianceWarnings,
  toFiniteNumber,
  formatQty,
  STATUS_LABELS,
  type ReconciliationStatus,
} from "@shared/stockReconciliation";

interface BalanceRow {
  id: number;
  partyId: number | null;
  materialId: number;
  balance: number;
  uom: string | null;
}

interface RowDraft {
  physicalQty: string;   // as typed, in physicalUom
  physicalUom: string;
  reason: string;
  note: string;
  include: boolean;
}

// Display-safe formatter (shared helper): handles pg numeric strings, null,
// undefined, "", NaN — invalid/missing renders as "—", never crashes and
// never silently shows 0 for missing data.
const fmt = (n: unknown) => formatQty(n, 3);

export default function PlantStockReconciliation() {
  const { toast } = useToast();
  const { sectionCan, isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const canPost = isAdmin || sectionCan("stock_reconciliation", "create");

  const today = new Date().toISOString().slice(0, 10);
  const [countDate, setCountDate] = useState(today);
  const [drafts, setDrafts] = useState<Record<string, RowDraft>>({});
  const [showPreview, setShowPreview] = useState(false);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [draftId, setDraftId] = useState<number | null>(null);   // server-side draft being worked on
  const [warningsAcknowledged, setWarningsAcknowledged] = useState(false);

  const { data: parties } = useQuery<Party[]>({ queryKey: ["/api/plant-module/parties"] });
  const { data: materials } = useQuery<PlantMaterial[]>({ queryKey: ["/api/plant-module/materials"] });
  const { data: balances, isLoading } = useQuery<BalanceRow[]>({ queryKey: ["/api/plant-module/stock-balances"] });
  const { data: sessions } = useQuery<any[]>({ queryKey: ["/api/plant-module/stock-reconciliations"] });

  const partyName = (id: number | null) =>
    id === null ? "Plant Common" : parties?.find(p => p.id === id)?.name ?? `Party ${id}`;
  const materialById = (id: number) => materials?.find(m => m.id === id);

  const rowKey = (b: BalanceRow) => `${b.materialId}:${b.partyId ?? "common"}`;
  const getDraft = (b: BalanceRow): RowDraft =>
    drafts[rowKey(b)] ?? { physicalQty: "", physicalUom: b.uom ?? "", reason: "", note: "", include: false };
  const setDraft = (b: BalanceRow, patch: Partial<RowDraft>) =>
    setDrafts(d => ({ ...d, [rowKey(b)]: { ...getDraft(b), ...patch } }));

  // Compute preview per included row using the SAME shared logic as the server.
  const computedRows = useMemo(() => {
    if (!balances) return [];
    return balances
      .filter(b => getDraft(b).include)
      .map(b => {
        const draft = getDraft(b);
        const material = materialById(b.materialId);
        const stockUom = b.uom ?? material?.defaultUom ?? "Units";
        const qty = parseFloat(draft.physicalQty);
        const qtyValid = Number.isFinite(qty) && qty >= 0;
        const conv = material
          ? resolveConversion(
              { conversionFactor: material.conversionFactor ?? null, conversionFromUom: material.conversionFromUom ?? null, conversionToUom: material.conversionToUom ?? null },
              draft.physicalUom || stockUom, stockUom)
          : null;
        // Calculation-safe book balance: pg numeric strings are normalised;
        // a missing/invalid balance BLOCKS the row instead of acting as zero.
        const bookBalance = toFiniteNumber(b.balance);
        const physicalBase = qtyValid && conv ? convertToBase(qty, conv) : null;
        const adjustment = physicalBase !== null && bookBalance !== null ? computeAdjustment(bookBalance, physicalBase) : null;
        return {
          balanceRow: b, draft, material, stockUom, qty, qtyValid, conv, bookBalance,
          physicalBase, adjustment,
          noChange: adjustment !== null && isNoChange(adjustment, stockUom),
          conversionMissing: qtyValid && !conv,
          reasonMissing: qtyValid && !draft.reason,
          balanceInvalid: bookBalance === null,
          ready: qtyValid && !!conv && !!draft.reason && bookBalance !== null,
        };
      });
  }, [balances, drafts, materials]);

  const readyRows = computedRows.filter(r => r.ready);
  const blockedRows = computedRows.filter(r => !r.ready);
  const summary = summarizeSession(readyRows.map(r => ({
    adjustment: r.adjustment!, physicalBase: r.physicalBase!, conversionMissing: false,
  })));

  // Variance sanity warnings — same shared logic the server enforces at post.
  const varianceWarnings = useMemo(() => computeVarianceWarnings(readyRows.map(r => ({
    key: rowKey(r.balanceRow),
    label: `${r.material?.name ?? r.balanceRow.materialId} (${partyName(r.balanceRow.partyId)})`,
    oldBalance: r.bookBalance!,
    physicalBase: r.physicalBase!,
    adjustment: r.adjustment!,
    uom: r.stockUom,
    category: r.material?.category ?? null,
  }))), [readyRows]);

  // ── Draft persistence: save/submit server-side so the session survives
  // page close, logout, refresh, and reopening on another day. ─────────────
  const draftRowsPayload = () =>
    Object.entries(drafts)
      .filter(([, d]) => d.include)
      .map(([key, d]) => ({ key, ...d }));

  const saveDraftMutation = useMutation({
    mutationFn: async (status: "draft" | "submitted") => {
      const rows = draftRowsPayload();
      if (rows.length === 0) throw new Error("Tick at least one material before saving a draft.");
      const res = await apiRequest("POST", "/api/plant-module/stock-reconciliation-drafts", {
        id: draftId ?? undefined, countDate, status, rows,
      });
      return res.json();
    },
    onSuccess: (data: any, status) => {
      setDraftId(data.id);
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/stock-reconciliations"] });
      toast({
        title: status === "submitted" ? `Submitted for approval — ${data.refNo}` : `Draft saved — ${data.refNo}`,
        description: status === "submitted"
          ? "An Owner/Admin can now open, review and post this session from the Report tab."
          : "You can close this page and continue later — the draft is saved on the server.",
      });
    },
    onError: (err: any) => toast({ title: "Could not save draft", description: err?.message || "Unknown error", variant: "destructive" }),
  });

  const rejectMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("POST", `/api/plant-module/stock-reconciliation-drafts/${id}/reject`, {});
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/stock-reconciliations"] });
      if (draftId === data.id) { setDraftId(null); setDrafts({}); }
      toast({ title: `Returned — ${data.refNo}`, description: "The session was rejected/returned. Prepare a new one if needed." });
    },
    onError: (err: any) => toast({ title: "Could not reject", description: err?.message || "Unknown error", variant: "destructive" }),
  });

  const openDraft = (s: any) => {
    try {
      const rows = JSON.parse(s.draftRows || "[]") as Array<RowDraft & { key: string }>;
      const next: Record<string, RowDraft> = {};
      for (const r of rows) next[r.key] = { physicalQty: r.physicalQty, physicalUom: r.physicalUom, reason: r.reason, note: r.note, include: true };
      setDrafts(next);
      setCountDate(s.countDate);
      setDraftId(s.id);
      setWarningsAcknowledged(false);
      toast({ title: `Opened ${s.refNo}`, description: `Prepared by ${s.preparedBy || "unknown"} — review each row, then post or return it.` });
    } catch {
      toast({ title: "Could not open draft", description: "Draft data is unreadable.", variant: "destructive" });
    }
  };

  const postMutation = useMutation({
    mutationFn: async () => {
      // Draft posts: the SAVED draft is what the server posts, so persist the
      // rows currently on screen first — any review edits become authoritative.
      // Only READY rows are persisted for posting: the server reconstructs the
      // whole saved draft, so a blocked row (invalid balance / missing
      // conversion or reason) left in it would fail the ENTIRE batch — the
      // preview's "Blocked (not posting)" promise must hold on this path too.
      if (draftId) {
        const readyKeys = new Set(readyRows.map(r => rowKey(r.balanceRow)));
        await apiRequest("POST", "/api/plant-module/stock-reconciliation-drafts", {
          id: draftId, countDate, status: "submitted", rows: draftRowsPayload().filter(r => readyKeys.has(r.key)),
        });
      }
      const res = await apiRequest("POST", "/api/plant-module/stock-reconciliation", {
        countDate,
        clientRequestId: requestId,
        draftId: draftId ?? undefined,
        acknowledgeWarnings: varianceWarnings.length === 0 || warningsAcknowledged,
        items: readyRows.map(r => ({
          materialId: r.balanceRow.materialId,
          partyId: r.balanceRow.partyId,
          sourceQty: r.qty,
          sourceUom: r.draft.physicalUom || r.stockUom,
          reason: r.draft.reason,
          note: r.draft.note || undefined,
        })),
      });
      return res.json();
    },
    onSuccess: (data: any) => {
      setShowPreview(false);
      setDrafts({});
      setRequestId(null);
      setDraftId(null);
      setWarningsAcknowledged(false);
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/stock-balances"] });
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/stock-ledger"] });
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/stock-ledger-all"] });
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/stock-reconciliations"] });
      toast({
        title: data.alreadyPosted ? "Already posted" : `Reconciliation posted — ${data.session?.refNo}`,
        description: data.alreadyPosted
          ? "This session was already posted; no duplicate adjustments were created."
          : `${data.items?.length ?? 0} material(s) reconciled. Balances now match the physical count.`,
      });
    },
    onError: (err: any) => {
      toast({ title: "Posting failed", description: err?.message || "Unknown error", variant: "destructive" });
    },
  });

  const openPreview = () => {
    if (readyRows.length === 0) {
      toast({ title: "Nothing to post", description: "Enter a physical quantity and reason for at least one material.", variant: "destructive" });
      return;
    }
    setRequestId(crypto.randomUUID());
    setWarningsAcknowledged(false);
    setShowPreview(true);
  };

  const uomOptions = (b: BalanceRow, material?: PlantMaterial) => {
    const opts = new Set<string>();
    if (b.uom) opts.add(b.uom);
    if (material?.defaultUom) opts.add(material.defaultUom);
    if (material?.conversionFromUom) opts.add(material.conversionFromUom);
    if (material?.conversionToUom) opts.add(material.conversionToUom);
    try {
      for (const u of JSON.parse(material?.allowedUoms || "[]")) opts.add(String(u));
    } catch { /* ignore malformed allowedUoms */ }
    return Array.from(opts);
  };

  return (
    <div className="container mx-auto p-4 max-w-6xl space-y-4">
      <div className="flex items-center gap-3">
        <Link href="/plant/stock">
          <Button variant="ghost" size="icon" data-testid="button-back"><ArrowLeft className="w-5 h-5" /></Button>
        </Link>
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Scale className="w-5 h-5" /> Physical Stock Reconciliation
          </h1>
          <p className="text-sm text-muted-foreground">
            Enter counted quantities; each posted line becomes a permanent adjustment entry in the stock ledger.
          </p>
        </div>
      </div>

      <Tabs defaultValue="reconcile">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="reconcile" className="gap-2"><ClipboardCheck className="w-4 h-4" /> Reconcile</TabsTrigger>
          <TabsTrigger value="report" className="gap-2"><FileText className="w-4 h-4" /> Report</TabsTrigger>
        </TabsList>

        <TabsContent value="reconcile" className="space-y-4 mt-4">
          <Card>
            <CardContent className="pt-4 flex flex-wrap items-end gap-4">
              <div>
                <label className="text-sm font-medium">Count date</label>
                <Input type="date" value={countDate} onChange={e => setCountDate(e.target.value)} className="w-44" data-testid="input-count-date" />
              </div>
              <div className="text-sm text-muted-foreground">
                Tick the materials you counted. Materials left unticked are not touched.
              </div>
            </CardContent>
          </Card>

          {isLoading ? (
            <div className="flex justify-center p-8"><Loader2 className="w-6 h-6 animate-spin" /></div>
          ) : (
            <div className="space-y-3">
              {(balances ?? [])
                .slice()
                .sort((a, b2) => (partyName(a.partyId) + (materialById(a.materialId)?.name ?? "")).localeCompare(partyName(b2.partyId) + (materialById(b2.materialId)?.name ?? "")))
                .map(b => {
                  const draft = getDraft(b);
                  const material = materialById(b.materialId);
                  const stockUom = b.uom ?? material?.defaultUom ?? "Units";
                  const row = computedRows.find(r => r.balanceRow === b);
                  return (
                    <Card key={rowKey(b)} className={draft.include ? "border-primary/50" : ""} data-testid={`row-${rowKey(b)}`}>
                      <CardContent className="pt-4 space-y-3">
                        <div className="flex flex-wrap items-center gap-2 justify-between">
                          <label className="flex items-center gap-2 font-medium cursor-pointer">
                            <input type="checkbox" checked={draft.include}
                              onChange={e => setDraft(b, { include: e.target.checked })}
                              data-testid={`check-${rowKey(b)}`} />
                            {material?.name ?? `Material ${b.materialId}`}
                            <Badge variant={b.partyId === null ? "secondary" : "outline"}>{partyName(b.partyId)}</Badge>
                          </label>
                          <div className="text-sm">
                            System balance:{" "}
                            <span className={`font-semibold ${(toFiniteNumber(b.balance) ?? 0) < 0 ? "text-red-600" : ""}`}>
                              {fmt(b.balance)} {stockUom}
                            </span>
                          </div>
                        </div>

                        {draft.include && (
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            <div>
                              <label className="text-xs text-muted-foreground">Physical quantity</label>
                              <Input type="number" min="0" step="any" value={draft.physicalQty}
                                onChange={e => setDraft(b, { physicalQty: e.target.value })}
                                placeholder="counted qty" data-testid={`input-qty-${rowKey(b)}`} />
                            </div>
                            <div>
                              <label className="text-xs text-muted-foreground">Count UOM</label>
                              <Select value={draft.physicalUom || stockUom} onValueChange={v => setDraft(b, { physicalUom: v })}>
                                <SelectTrigger data-testid={`select-uom-${rowKey(b)}`}><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  {uomOptions(b, material).map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                                </SelectContent>
                              </Select>
                            </div>
                            <div>
                              <label className="text-xs text-muted-foreground">Reason</label>
                              <Select value={draft.reason} onValueChange={v => setDraft(b, { reason: v })}>
                                <SelectTrigger data-testid={`select-reason-${rowKey(b)}`}><SelectValue placeholder="select reason" /></SelectTrigger>
                                <SelectContent>
                                  {RECONCILIATION_REASONS.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                                </SelectContent>
                              </Select>
                            </div>
                            <div>
                              <label className="text-xs text-muted-foreground">Note</label>
                              <Input value={draft.note} onChange={e => setDraft(b, { note: e.target.value })}
                                placeholder="detail (optional)" data-testid={`input-note-${rowKey(b)}`} />
                            </div>
                          </div>
                        )}

                        {draft.include && row && row.qtyValid && (
                          <div className="text-sm rounded-md bg-muted/50 p-2 flex flex-wrap gap-x-6 gap-y-1">
                            {row.balanceInvalid ? (
                              <span className="text-red-600 flex items-center gap-1">
                                <AlertTriangle className="w-4 h-4" />
                                System balance for this row is missing/invalid — it cannot be reconciled until the balance record is fixed. Posting blocked.
                              </span>
                            ) : row.conversionMissing ? (
                              <span className="text-red-600 flex items-center gap-1">
                                <AlertTriangle className="w-4 h-4" />
                                No approved conversion from {draft.physicalUom || stockUom} to {stockUom} — configure it in Material Masters. Posting blocked.
                              </span>
                            ) : (
                              <>
                                {row.conv && row.conv.kind !== "same" && (
                                  <span>Conversion factor: <b>{row.conv.factor}</b> ({row.conv.kind === "multiply" ? `${draft.physicalUom} × factor → ${stockUom}` : `${draft.physicalUom} ÷ factor → ${stockUom}`})</span>
                                )}
                                <span>Physical in {stockUom}: <b>{fmt(row.physicalBase!)}</b></span>
                                <span>
                                  Adjustment:{" "}
                                  {row.noChange ? (
                                    <Badge variant="secondary" className="gap-1"><CheckCircle2 className="w-3 h-3" /> Verified — no adjustment</Badge>
                                  ) : (
                                    <b className={row.adjustment! > 0 ? "text-green-600" : "text-red-600"}>
                                      {row.adjustment! > 0 ? "+" : ""}{fmt(row.adjustment!)} {stockUom}
                                    </b>
                                  )}
                                </span>
                                {row.reasonMissing && <span className="text-amber-600">Select a reason to include this line.</span>}
                              </>
                            )}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
            </div>
          )}

          <div className="sticky bottom-2 flex flex-wrap justify-end gap-2 items-center">
            {draftId && <Badge variant="outline" data-testid="badge-working-draft">Working on saved draft #{draftId}</Badge>}
            <Button variant="outline" onClick={() => saveDraftMutation.mutate("draft")}
              disabled={saveDraftMutation.isPending || computedRows.length === 0} data-testid="button-save-draft">
              {saveDraftMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
              Save draft
            </Button>
            <Button variant="secondary" onClick={() => saveDraftMutation.mutate("submitted")}
              disabled={saveDraftMutation.isPending || computedRows.length === 0} data-testid="button-submit-approval">
              Submit for approval
            </Button>
            <Button size="lg" onClick={openPreview} disabled={!canPost || readyRows.length === 0} data-testid="button-preview">
              Preview & Post ({readyRows.length})
            </Button>
          </div>
          {!canPost && (
            <p className="text-sm text-amber-600 text-right">
              You can prepare and submit this reconciliation as a draft; posting needs an Owner/Admin or a user with Stock Reconciliation permission.
            </p>
          )}
        </TabsContent>

        <TabsContent value="report" className="mt-4 space-y-4">
          {(sessions ?? []).length === 0 && (
            <Card><CardContent className="pt-6 text-sm text-muted-foreground">No reconciliations yet.</CardContent></Card>
          )}
          {(sessions ?? []).map((s: any) => {
            const status: ReconciliationStatus = s.status || "posted";
            const isOpenDraft = status === "draft" || status === "submitted";
            return (
            <Card key={s.id} data-testid={`session-${s.id}`}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex flex-wrap items-center gap-2">
                  {s.refNo || `Session ${s.id}`}
                  <Badge variant={status === "posted" ? "default" : status === "rejected" ? "destructive" : "secondary"}>
                    {STATUS_LABELS[status] ?? status}
                  </Badge>
                  <Badge variant="outline">count date {s.countDate}</Badge>
                  <span className="text-sm font-normal text-muted-foreground">
                    {status === "posted"
                      ? `posted by ${s.postedBy} · ${s.postedAt ? new Date(s.postedAt).toLocaleString() : ""}`
                      : `prepared by ${s.preparedBy || "unknown"} · ${s.preparedAt ? new Date(s.preparedAt).toLocaleString() : ""}`}
                  </span>
                  {isOpenDraft && (
                    <span className="ml-auto flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => openDraft(s)} data-testid={`button-open-draft-${s.id}`}>
                        Open & review
                      </Button>
                      {canPost && (
                        <Button size="sm" variant="ghost" className="text-red-600" onClick={() => rejectMutation.mutate(s.id)}
                          disabled={rejectMutation.isPending} data-testid={`button-reject-draft-${s.id}`}>
                          Return/Reject
                        </Button>
                      )}
                    </span>
                  )}
                </CardTitle>
                {status === "rejected" && s.rejectionNote && (
                  <p className="text-sm text-red-600">{s.rejectionNote}</p>
                )}
              </CardHeader>
              <CardContent className="overflow-x-auto">
                {isOpenDraft || status === "rejected" ? (
                  <div className="text-sm text-muted-foreground">
                    {(() => { try { const rows = JSON.parse(s.draftRows || "[]"); return `${rows.length} prepared row(s)` + (isOpenDraft ? " — open to review the figures." : ""); } catch { return "Draft rows unavailable."; } })()}
                  </div>
                ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-muted-foreground border-b">
                      <th className="py-1 pr-2">Owner</th><th className="py-1 pr-2">Material</th>
                      <th className="py-1 pr-2 text-right">Before</th><th className="py-1 pr-2 text-right">Physical</th>
                      <th className="py-1 pr-2 text-right">Variance</th><th className="py-1 pr-2">Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {s.items.map((it: any) => (
                      <tr key={it.id} className="border-b last:border-0">
                        <td className="py-1 pr-2">{partyName(it.partyId)}</td>
                        <td className="py-1 pr-2">{materialById(it.materialId)?.name ?? it.materialId}</td>
                        <td className="py-1 pr-2 text-right">{fmt(Number(it.oldBalance))} {it.baseUom}</td>
                        <td className="py-1 pr-2 text-right">{fmt(Number(it.physicalQty))} {it.baseUom}</td>
                        <td className={`py-1 pr-2 text-right font-medium ${Number(it.adjustment) > 0 ? "text-green-600" : Number(it.adjustment) < 0 ? "text-red-600" : ""}`}>
                          {it.verifiedNoChange ? "Verified" : `${Number(it.adjustment) > 0 ? "+" : ""}${fmt(Number(it.adjustment))}`}
                        </td>
                        <td className="py-1 pr-2">{it.reason}{it.note ? ` — ${it.note}` : ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                )}
              </CardContent>
            </Card>
            );
          })}
        </TabsContent>
      </Tabs>

      <Dialog open={showPreview} onOpenChange={(o) => { if (!postMutation.isPending) setShowPreview(o); }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Confirm reconciliation — {countDate}</DialogTitle>
            <DialogDescription>
              Each changed line posts one permanent adjustment entry. Posted adjustments cannot be edited or
              deleted — a mistake is corrected with a new reconciliation.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-wrap gap-2 text-sm">
            <Badge variant="outline">Reviewed: {summary.reviewed}</Badge>
            <Badge variant="secondary">Unchanged: {summary.unchanged}</Badge>
            <Badge className="bg-green-600">Increased: {summary.increased}</Badge>
            <Badge variant="destructive">Decreased: {summary.decreased}</Badge>
            <Badge variant="outline">Zeroed: {summary.zeroed}</Badge>
            {blockedRows.length > 0 && <Badge variant="destructive">Blocked (not posting): {blockedRows.length}</Badge>}
          </div>

          <div className="space-y-1 text-sm">
            {readyRows.map(r => (
              <div key={rowKey(r.balanceRow)} className="flex justify-between gap-2 border-b py-1 last:border-0">
                <span>{r.material?.name} <span className="text-muted-foreground">({partyName(r.balanceRow.partyId)})</span></span>
                <span>
                  {fmt(r.balanceRow.balance)} → <b>{fmt(r.physicalBase!)}</b> {r.stockUom}{" "}
                  {r.noChange
                    ? <Badge variant="secondary">no change</Badge>
                    : <span className={r.adjustment! > 0 ? "text-green-600" : "text-red-600"}>({r.adjustment! > 0 ? "+" : ""}{fmt(r.adjustment!)})</span>}
                </span>
              </div>
            ))}
          </div>

          {varianceWarnings.length > 0 && (
            <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/30 p-3 space-y-2 text-sm" data-testid="variance-warnings">
              <div className="font-medium text-amber-700 dark:text-amber-400 flex items-center gap-1">
                <AlertTriangle className="w-4 h-4" /> Large variance detected — please recheck before posting
              </div>
              <ul className="list-disc pl-5 space-y-1 text-amber-800 dark:text-amber-300">
                {varianceWarnings.map((w, i) => <li key={i}>{w.message}</li>)}
              </ul>
              <label className="flex items-center gap-2 font-medium cursor-pointer pt-1">
                <input type="checkbox" checked={warningsAcknowledged}
                  onChange={e => setWarningsAcknowledged(e.target.checked)}
                  data-testid="check-acknowledge-warnings" />
                I have rechecked these counts and material selections — post anyway
              </label>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPreview(false)} disabled={postMutation.isPending}>Cancel</Button>
            <Button onClick={() => postMutation.mutate()}
              disabled={postMutation.isPending || (varianceWarnings.length > 0 && !warningsAcknowledged)}
              data-testid="button-confirm-post">
              {postMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Post {readyRows.length} line(s)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
