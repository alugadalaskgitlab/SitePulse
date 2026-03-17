import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, Trash2, ExternalLink, Calculator, Calendar, Plus, Building2, ChevronDown, ChevronUp } from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { MixEstimate } from "@shared/schema";

function fmtAmt(v: number | null | undefined) {
  if (!v) return "—";
  if (v >= 10000000) return "₹" + (v / 10000000).toFixed(2) + " Cr";
  if (v >= 100000) return "₹" + (v / 100000).toFixed(1) + " L";
  return "₹" + Math.round(v).toLocaleString("en-IN");
}

function fmtDate(d: Date | string | null | undefined) {
  if (!d) return "";
  return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

interface Props {
  embedded?: boolean;
}

export default function MixEstimates({ embedded = false }: Props) {
  const { toast } = useToast();
  const [collapsedContractors, setCollapsedContractors] = useState<Record<string, boolean>>({});

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
      localStorage.setItem("hlc_mix_calc_v3", JSON.stringify(state));
      localStorage.setItem("hlc_mix_calc_v3_estId", String(est.id));
      localStorage.setItem("hlc_mix_calc_v3_estName", est.name);
    } catch {
      toast({ title: "Invalid estimate data", variant: "destructive" });
      return;
    }
    window.location.href = "/mix-calculator";
  }

  // Group by contractor
  type Group = { contractor: string; estimates: MixEstimate[]; latestId: number };
  const groups: Group[] = [];
  const contractorMap: Record<string, MixEstimate[]> = {};

  estimates.forEach((est) => {
    const key = est.contractor?.trim().toUpperCase() || "UNASSIGNED";
    if (!contractorMap[key]) contractorMap[key] = [];
    contractorMap[key].push(est);
  });

  Object.keys(contractorMap).sort((a, b) => {
    const la = contractorMap[a][0]?.updatedAt;
    const lb = contractorMap[b][0]?.updatedAt;
    if (!la && !lb) return 0;
    if (!la) return 1;
    if (!lb) return -1;
    return new Date(lb).getTime() - new Date(la).getTime();
  }).forEach((key) => {
    const ests = contractorMap[key];
    const latestId = ests[0]?.id;
    groups.push({ contractor: key, estimates: ests, latestId });
  });

  // Latest estimate across all contractors (for "New Contractor" button)
  const globalLatestId = estimates[0]?.id;

  function toggleContractor(key: string) {
    setCollapsedContractors((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  return (
    <div className={embedded ? "p-0" : "p-6 max-w-5xl mx-auto"}>
      {/* Header */}
      <div className="flex items-center gap-4 mb-5">
        {!embedded && (
          <Link href="/admin/reports">
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
                Saved estimates grouped by contractor — each row is a separate site
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
          {globalLatestId && (
            <a href={`/mix-calculator?clone=${globalLatestId}`}>
              <Button variant="default" size="sm" data-testid="btn-new-contractor">
                <Plus className="w-4 h-4 mr-1" /> New Contractor
              </Button>
            </a>
          )}
          {!globalLatestId && (
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
          {groups.map(({ contractor, estimates: ests, latestId }) => {
            const isCollapsed = collapsedContractors[contractor];
            const totalMt = ests.reduce((s, e) => s + (e.totalMt || 0), 0);
            const totalAmt = ests.reduce((s, e) => s + (e.totalAmt || 0), 0);

            return (
              <Card key={contractor} className="border-l-4 border-l-primary overflow-hidden" data-testid={`card-contractor-${contractor}`}>
                {/* Contractor header */}
                <div
                  className="flex items-center justify-between px-5 py-3.5 bg-amber-50 dark:bg-amber-950/30 cursor-pointer select-none border-b border-amber-100 dark:border-amber-900"
                  onClick={() => toggleContractor(contractor)}
                >
                  <div className="flex items-center gap-3">
                    <Building2 className="w-5 h-5 text-primary shrink-0" />
                    <div>
                      <span className="font-bold text-base text-foreground">{contractor}</span>
                      <span className="ml-2 text-sm text-muted-foreground">
                        {ests.length} site{ests.length !== 1 ? "s" : ""}
                      </span>
                    </div>
                    {totalMt > 0 && (
                      <Badge variant="outline" className="text-xs ml-1">{totalMt.toFixed(0)} MT total</Badge>
                    )}
                    {totalAmt > 0 && (
                      <Badge className="text-xs bg-green-600 text-white border-green-700">{fmtAmt(totalAmt)}</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                    {contractor !== "UNASSIGNED" && (
                      <a
                        href={`/mix-calculator?clone=${latestId}&contractor=${encodeURIComponent(contractor)}`}
                        title="Add new site for this contractor using same base rates"
                      >
                        <Button variant="default" size="sm" data-testid={`btn-new-site-${contractor}`}>
                          <Plus className="w-3.5 h-3.5 mr-1" /> New Site
                        </Button>
                      </a>
                    )}
                    <button
                      className="text-muted-foreground hover:text-foreground transition-colors p-1"
                      onClick={() => toggleContractor(contractor)}
                      aria-label={isCollapsed ? "Expand" : "Collapse"}
                    >
                      {isCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Sites table */}
                {!isCollapsed && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm border-collapse">
                      <thead>
                        <tr className="bg-muted/40 text-muted-foreground text-xs uppercase tracking-wide">
                          <th className="text-left px-5 py-2.5 font-semibold">Site / Estimate Name</th>
                          <th className="text-right px-4 py-2.5 font-semibold">MT</th>
                          <th className="text-right px-4 py-2.5 font-semibold">Amount</th>
                          <th className="text-right px-4 py-2.5 font-semibold">Saved</th>
                          <th className="px-4 py-2.5"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {ests.map((est) => (
                          <tr
                            key={est.id}
                            className="border-t border-border/50 hover:bg-muted/20 transition-colors"
                            data-testid={`row-estimate-${est.id}`}
                          >
                            <td className="px-5 py-3">
                              <span className="font-medium text-foreground">{est.name}</span>
                              {est.contractorList && est.contractorList !== contractor && (
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
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-destructive hover:text-destructive hover:bg-destructive/10 px-2"
                                  onClick={() => handleDelete(est)}
                                  data-testid={`btn-delete-estimate-${est.id}`}
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
