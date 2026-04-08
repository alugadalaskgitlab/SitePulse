import { useState, useRef, useMemo, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ChevronLeft, ChevronRight, Trash2, ExternalLink, Calculator, Calendar, Plus, Building2, ChevronDown, ChevronUp, Pencil, Check, X, FlaskConical, LogOut, Power } from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { MixEstimate } from "@shared/schema";
import { buildMixComparisonData } from "@/lib/mixComparisonData";
import { MixComparisonContent } from "./MixComparativeReport";

const ROLE_KEY = "hlc_mix_role";

function getMixRole(): "admin" | "manager" | null {
  const r = localStorage.getItem(ROLE_KEY);
  if (r === "admin" || r === "manager") return r;
  return null;
}

function fmtAmt(v: number | null | undefined) {
  if (!v) return "—";
  if (v >= 10000000) return "₹" + (v / 10000000).toFixed(2) + " Cr";
  if (v >= 100000) return "₹" + (v / 100000).toFixed(1) + " L";
  return "₹" + Math.round(v).toLocaleString("en-IN");
}

function fmtDate(d: Date | string | null | undefined) {
  if (!d) return "";
  const dt = new Date(d);
  return dt.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) +
    ", " + dt.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
}

interface Props {
  embedded?: boolean;
}

export default function MixEstimates({ embedded = false }: Props) {
  const { toast } = useToast();
  const [collapsedContractors, setCollapsedContractors] = useState<Record<string, boolean>>({});
  const [editingContractor, setEditingContractor] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [showComparison, setShowComparison] = useState(false);
  const editInputRef = useRef<HTMLInputElement>(null);

  const role = getMixRole();
  const canEdit = role === "admin";

  const isStandalonePWA = useMemo(() => {
    const nav: Navigator & { standalone?: boolean } = window.navigator;
    return window.matchMedia('(display-mode: standalone)').matches ||
      nav.standalone === true ||
      document.referrer.includes('/mix-calculator');
  }, []);

  useEffect(() => {
    if (!embedded && !role) {
      window.location.href = "/mix-calculator/login?returnTo=/admin/mix-estimates";
    }
  }, [role, embedded]);

  const renameMutation = useMutation({
    mutationFn: ({ ids, to }: { ids: number[]; to: string }) =>
      apiRequest("PATCH", "/api/mix-estimates/rename-project", { ids, to }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/mix-estimates"] });
      toast({ title: "Project renamed" });
      setEditingContractor(null);
    },
    onError: () => toast({ title: "Failed to rename project", variant: "destructive" }),
  });

  function startEdit(groupKey: string, e: React.MouseEvent) {
    e.stopPropagation();
    setEditingContractor(groupKey);
    const group = groups.find(g => g.groupKey === groupKey);
    setEditValue(group?.projName || groupKey);
    setTimeout(() => editInputRef.current?.focus(), 50);
  }

  function confirmRename(groupKey: string) {
    const to = editValue.trim().toUpperCase();
    if (!to) { setEditingContractor(null); return; }
    const group = groups.find(g => g.groupKey === groupKey);
    if (!group || to === group.projName?.toUpperCase()) { setEditingContractor(null); return; }
    const ids = group.estimates.map(e => e.id);
    renameMutation.mutate({ ids, to });
  }

  const { data: estimates = [], isLoading } = useQuery<MixEstimate[]>({
    queryKey: ["/api/mix-estimates"],
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/mix-estimates/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/mix-estimates"] });
      toast({ title: "Estimate deleted" });
    },
    onError: () => toast({ title: "Failed to delete estimate", variant: "destructive" }),
  });

  function handleDelete(est: MixEstimate) {
    if (!confirm(`Delete "${est.name}"?`)) return;
    deleteMutation.mutate(est.id);
  }

  function loadInCalculator(est: MixEstimate) {
    try {
      const state = JSON.parse(est.state);
      localStorage.setItem("hlc_mix_calc_v4", JSON.stringify(state));
      localStorage.setItem("hlc_mix_calc_v4_estId", String(est.id));
      localStorage.setItem("hlc_mix_calc_v4_estName", est.name);
    } catch {
      toast({ title: "Invalid estimate data", variant: "destructive" });
      return;
    }
    localStorage.setItem("hlc_mix_calc_focus", "jobs");
    window.location.href = "/mix-calculator";
  }

  interface SiteInfo {
    name: string;
    mt: number;
    amt: number;
    estimateId: number;
  }

  const parsedStates = useMemo(() => {
    const map: Record<number, { projName: string; siteNames: string[]; sites: SiteInfo[] }> = {};
    estimates.forEach((est) => {
      try {
        const state = JSON.parse(est.state);
        const projName = state?.inputs?.projName || "";
        const sites: SiteInfo[] = [];
        if (Array.isArray(state?.sites)) {
          state.sites.forEach((s: { name?: string; jobs?: { _mt?: number; _totalAmt?: number }[] }) => {
            const name = s.name?.trim() || "";
            let mt = 0, amt = 0;
            if (Array.isArray(s.jobs)) {
              s.jobs.forEach((j) => { mt += (j._mt || 0); amt += (j._totalAmt || 0); });
            }
            if (name) sites.push({ name, mt, amt, estimateId: est.id });
          });
        }
        const siteNames = sites.map(s => s.name);
        map[est.id] = { projName, siteNames, sites };
      } catch {
        map[est.id] = { projName: "", siteNames: [], sites: [] };
      }
    });
    return map;
  }, [estimates]);

  type Group = { groupKey: string; estimates: MixEstimate[]; latestId: number; projName: string };
  const groups: Group[] = [];
  const groupMap: Record<string, MixEstimate[]> = {};

  estimates.forEach((est) => {
    const pn = parsedStates[est.id]?.projName?.trim().toUpperCase() || "";
    const key = pn || est.contractor?.trim().toUpperCase() || "UNASSIGNED";
    if (!groupMap[key]) groupMap[key] = [];
    groupMap[key].push(est);
  });

  Object.keys(groupMap).sort((a, b) => {
    const la = groupMap[a][0]?.updatedAt;
    const lb = groupMap[b][0]?.updatedAt;
    if (!la && !lb) return 0;
    if (!la) return 1;
    if (!lb) return -1;
    return new Date(lb).getTime() - new Date(la).getTime();
  }).forEach((key) => {
    const ests = groupMap[key];
    const latestId = ests[0]?.id;
    const projName = parsedStates[ests[0]?.id]?.projName || key;
    groups.push({ groupKey: key, estimates: ests, latestId, projName });
  });

  const comparisonData = useMemo(() => buildMixComparisonData(estimates), [estimates]);

  // Latest estimate across all contractors (for "New Contractor" button)
  const globalLatestId = estimates[0]?.id;

  function toggleContractor(key: string) {
    setCollapsedContractors((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  return (
    <div className={embedded ? "p-0" : "p-6 max-w-5xl mx-auto"}>
      {/* Header */}
      <div className="flex items-center gap-4 mb-5">
        {!embedded && !isStandalonePWA && (
          <Link href="/">
            <Button variant="ghost" size="sm" data-testid="btn-back">
              <ChevronLeft className="w-4 h-4 mr-1" /> Back
            </Button>
          </Link>
        )}
        <div className="flex-1">
          {!embedded && (
            <>
              <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
                <Calculator className="w-6 h-6 text-primary" />
                Mix Rate Estimates
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                Saved estimates grouped by project — each row is a site from the Job Estimator
              </p>
            </>
          )}
          {embedded && (
            <p className="text-sm text-muted-foreground">
              Saved estimates by contractor — click a row to open in the calculator
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {estimates.length >= 1 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowComparison(true)}
              data-testid="btn-comparative-report"
            >
              Comparative Report <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          )}
          {canEdit && globalLatestId && (
            <a href={`/mix-calculator?clone=${globalLatestId}`}>
              <Button variant="default" size="sm" data-testid="btn-new-contractor">
                <Plus className="w-4 h-4 mr-1" /> New Contractor
              </Button>
            </a>
          )}
          {canEdit && !globalLatestId && (
            <a href="/mix-calculator">
              <Button variant="default" size="sm" data-testid="btn-new-estimate">
                <Plus className="w-4 h-4 mr-1" /> New Estimate
              </Button>
            </a>
          )}
          <a href="/mix-calculator" target="_blank" rel="noopener noreferrer">
            <Button variant="outline" size="sm" data-testid="btn-open-calculator">
              <ExternalLink className="w-4 h-4 mr-1" /> Open Calculator
            </Button>
          </a>
          {!embedded && (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { localStorage.removeItem(ROLE_KEY); window.location.href = "/mix-calculator/login"; }}
                data-testid="btn-mix-logout"
                title="Logout"
              >
                <LogOut className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { localStorage.removeItem(ROLE_KEY); window.close(); setTimeout(() => { window.location.href = "/mix-calculator/login"; }, 300); }}
                data-testid="btn-mix-exit"
                title="Exit"
                className="text-destructive hover:text-destructive"
              >
                <Power className="w-4 h-4" />
              </Button>
            </>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-16 text-muted-foreground">Loading estimates...</div>
      ) : groups.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Calculator className="w-12 h-12 text-muted-foreground/40 mx-auto mb-4" />
            <p className="text-muted-foreground font-medium">No saved estimates yet</p>
            <p className="text-sm text-muted-foreground mt-1">
              Use the Mix Rate Calculator and click 💾 Save to store estimates here.
            </p>
            <a href="/mix-calculator">
              <Button variant="default" className="mt-4" data-testid="btn-go-calculator">
                Open Calculator
              </Button>
            </a>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {groups.map(({ groupKey, estimates: ests, latestId, projName }) => {
            const isCollapsed = collapsedContractors[groupKey];
            const totalMt = ests.reduce((s, e) => s + (e.totalMt || 0), 0);
            const totalAmt = ests.reduce((s, e) => s + (e.totalAmt || 0), 0);
            const allSites = ests.flatMap(e => parsedStates[e.id]?.sites || []);
            const siteCount = allSites.length || ests.length;

            return (
              <Card key={groupKey} className="border-l-4 border-l-primary overflow-hidden" data-testid={`card-contractor-${groupKey}`}>
                <div
                  className="flex items-center justify-between px-5 py-3.5 bg-amber-50 dark:bg-amber-950/30 cursor-pointer select-none border-b border-amber-100 dark:border-amber-900"
                  onClick={() => toggleContractor(groupKey)}
                >
                  <div className="flex items-center gap-3">
                    <Building2 className="w-5 h-5 text-primary shrink-0" />
                    {editingContractor === groupKey ? (
                      <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                        <input
                          ref={editInputRef}
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value.toUpperCase())}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") confirmRename(groupKey);
                            if (e.key === "Escape") setEditingContractor(null);
                          }}
                          className="border border-primary rounded px-2 py-0.5 text-sm font-bold w-48 focus:outline-none focus:ring-2 focus:ring-primary"
                          data-testid={`input-rename-${groupKey}`}
                        />
                        <button
                          onClick={() => confirmRename(groupKey)}
                          className="text-green-600 hover:text-green-700 p-0.5"
                          title="Confirm rename"
                          disabled={renameMutation.isPending}
                          data-testid={`btn-confirm-rename-${groupKey}`}
                        >
                          <Check className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setEditingContractor(null)}
                          className="text-muted-foreground hover:text-foreground p-0.5"
                          title="Cancel"
                          data-testid={`btn-cancel-rename-${groupKey}`}
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-base text-foreground">{projName}</span>
                        <span className="text-sm text-muted-foreground">
                          {siteCount} site{siteCount !== 1 ? "s" : ""}
                        </span>
                        {canEdit && groupKey !== "UNASSIGNED" && (
                          <button
                            onClick={(e) => startEdit(groupKey, e)}
                            className="text-muted-foreground/50 hover:text-muted-foreground transition-colors p-0.5"
                            title="Rename project"
                            data-testid={`btn-rename-${groupKey}`}
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    )}
                    {editingContractor !== groupKey && totalMt > 0 && (
                      <Badge variant="outline" className="text-xs">{totalMt.toFixed(0)} MT total</Badge>
                    )}
                    {editingContractor !== groupKey && totalAmt > 0 && (
                      <Badge className="text-xs bg-green-600 text-white border-green-700">{fmtAmt(totalAmt)}</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                    {latestId && (
                      <Link href={`/admin/mix-impact?estimateId=${latestId}`}>
                        <Button variant="outline" size="sm" data-testid={`btn-price-impact-${groupKey}`} title="Price Impact Analysis">
                          <FlaskConical className="w-3.5 h-3.5 mr-1" /> Price Impact
                        </Button>
                      </Link>
                    )}
                    {canEdit && groupKey !== "UNASSIGNED" && (
                      <a
                        href={`/mix-calculator?clone=${latestId}&contractor=${encodeURIComponent(ests[0]?.contractor || "")}`}
                        title="Add new site using same base rates"
                      >
                        <Button variant="default" size="sm" data-testid={`btn-new-site-${groupKey}`}>
                          <Plus className="w-3.5 h-3.5 mr-1" /> New Site
                        </Button>
                      </a>
                    )}
                    <button
                      className="text-muted-foreground hover:text-foreground transition-colors p-1"
                      onClick={() => toggleContractor(groupKey)}
                      aria-label={isCollapsed ? "Expand" : "Collapse"}
                    >
                      {isCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {!isCollapsed && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm border-collapse">
                      <thead>
                        <tr className="bg-muted/40 text-muted-foreground text-xs uppercase tracking-wide">
                          <th className="text-left px-5 py-2.5 font-semibold">Site Name</th>
                          <th className="text-right px-4 py-2.5 font-semibold">MT</th>
                          <th className="text-right px-4 py-2.5 font-semibold">Amount</th>
                          <th className="text-right px-4 py-2.5 font-semibold">Saved</th>
                          <th className="px-4 py-2.5"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {ests.flatMap((est) => {
                          const estSites = parsedStates[est.id]?.sites || [];
                          if (estSites.length > 0) {
                            return estSites.map((site, idx) => (
                              <tr
                                key={`${est.id}-site-${idx}`}
                                className="border-t border-border/50 hover:bg-muted/20 transition-colors"
                                data-testid={`row-site-${est.id}-${idx}`}
                              >
                                <td className="px-5 py-3">
                                  <span className="font-medium text-foreground">{site.name}</span>
                                </td>
                                <td className="px-4 py-3 text-right text-muted-foreground">
                                  {site.mt > 0 ? `${site.mt.toFixed(0)} MT` : "—"}
                                </td>
                                <td className="px-4 py-3 text-right font-medium text-foreground">
                                  {fmtAmt(site.amt)}
                                </td>
                                <td className="px-4 py-3 text-right text-xs text-muted-foreground">
                                  <span className="flex items-center justify-end gap-1">
                                    <Calendar className="w-3 h-3" />
                                    {fmtDate(est.updatedAt)}
                                  </span>
                                </td>
                                <td className="px-4 py-3">
                                  <div className="flex items-center justify-end gap-1.5">
                                    <Button
                                      variant="secondary"
                                      size="sm"
                                      onClick={() => loadInCalculator(est)}
                                      data-testid={`btn-load-estimate-${est.id}`}
                                    >
                                      Load
                                    </Button>
                                    {canEdit && (
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="text-destructive hover:text-destructive hover:bg-destructive/10 px-2"
                                        onClick={() => handleDelete(est)}
                                        data-testid={`btn-delete-estimate-${est.id}`}
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </Button>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            ));
                          }
                          return [(
                            <tr
                              key={est.id}
                              className="border-t border-border/50 hover:bg-muted/20 transition-colors"
                              data-testid={`row-estimate-${est.id}`}
                            >
                              <td className="px-5 py-3">
                                <span className="font-medium text-foreground">{est.name}</span>
                                {est.contractorList && (
                                  <span className="block text-xs text-muted-foreground mt-0.5">{est.contractorList}</span>
                                )}
                              </td>
                              <td className="px-4 py-3 text-right text-muted-foreground">
                                {est.totalMt && est.totalMt > 0 ? `${est.totalMt.toFixed(0)} MT` : "—"}
                              </td>
                              <td className="px-4 py-3 text-right font-medium text-foreground">
                                {fmtAmt(est.totalAmt)}
                              </td>
                              <td className="px-4 py-3 text-right text-xs text-muted-foreground">
                                <span className="flex items-center justify-end gap-1">
                                  <Calendar className="w-3 h-3" />
                                  {fmtDate(est.updatedAt)}
                                </span>
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex items-center justify-end gap-1.5">
                                  <Button
                                    variant="secondary"
                                    size="sm"
                                    onClick={() => loadInCalculator(est)}
                                    data-testid={`btn-load-estimate-${est.id}`}
                                  >
                                    Load
                                  </Button>
                                  {canEdit && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="text-destructive hover:text-destructive hover:bg-destructive/10 px-2"
                                      onClick={() => handleDelete(est)}
                                      data-testid={`btn-delete-estimate-${est.id}`}
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </Button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )];
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={showComparison} onOpenChange={setShowComparison}>
        <DialogContent className="max-w-[95vw] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              Contractor Comparative Rate Statement
            </DialogTitle>
          </DialogHeader>
          <MixComparisonContent data={comparisonData} />
        </DialogContent>
      </Dialog>
    </div>
  );
}
