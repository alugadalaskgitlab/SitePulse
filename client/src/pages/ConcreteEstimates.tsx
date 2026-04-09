import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ChevronLeft, Trash2, Calendar, Plus, Building2, ChevronDown, ChevronUp, Copy, ExternalLink, Search, LogOut } from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { ConcreteEstimate } from "@shared/schema";

const ROLE_KEY = "hlc_mix_role";
const LS_KEY = "hlc_concrete_calc_v1";

const STRUCTURE_TYPE_COLORS: Record<string, string> = {
  "Drain": "bg-blue-100 text-blue-700 border-blue-200",
  "Box Culvert": "bg-violet-100 text-violet-700 border-violet-200",
  "Bridge": "bg-orange-100 text-orange-700 border-orange-200",
  "Retaining Wall": "bg-green-100 text-green-700 border-green-200",
};

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
  return dt.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export default function ConcreteEstimates() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [structureFilter, setStructureFilter] = useState<string>("");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const role = getMixRole();
  const canEdit = role === "admin";

  const isStandalonePWA = useMemo(() => {
    const nav: Navigator & { standalone?: boolean } = window.navigator;
    return window.matchMedia('(display-mode: standalone)').matches ||
      nav.standalone === true ||
      document.referrer.includes('/mix-calculator/login');
  }, []);

  useEffect(() => {
    if (!role) {
      window.location.href = "/mix-calculator/login?returnTo=/admin/concrete-estimates";
    }
  }, [role]);

  const { data: estimates = [], isLoading } = useQuery<ConcreteEstimate[]>({
    queryKey: ["/api/concrete-estimates"],
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/concrete-estimates/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/concrete-estimates"] });
      toast({ title: "Estimate deleted" });
    },
    onError: () => toast({ title: "Failed to delete estimate", variant: "destructive" }),
  });

  const cloneMutation = useMutation({
    mutationFn: async (est: ConcreteEstimate) => {
      const cloneName = est.name + " (Copy)";
      return apiRequest("POST", "/api/concrete-estimates", {
        name: cloneName,
        contractor: est.contractor,
        structureType: est.structureType,
        grade: est.grade,
        state: est.state,
        totalCum: est.totalCum,
        totalAmt: est.totalAmt,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/concrete-estimates"] });
      toast({ title: "Estimate cloned" });
    },
    onError: () => toast({ title: "Failed to clone estimate", variant: "destructive" }),
  });

  function loadInCalculator(est: ConcreteEstimate) {
    try {
      const state = JSON.parse(est.state);
      localStorage.setItem(LS_KEY, JSON.stringify(state));
      localStorage.setItem(LS_KEY + "_estId", String(est.id));
      localStorage.setItem(LS_KEY + "_estName", est.name);
    } catch {
      toast({ title: "Invalid estimate data", variant: "destructive" });
      return;
    }
    window.location.href = "/concrete-calculator";
  }

  const filtered = useMemo(() => {
    return estimates.filter((e) => {
      const matchSearch = !search || e.name.toLowerCase().includes(search.toLowerCase()) ||
        (e.contractor || "").toLowerCase().includes(search.toLowerCase());
      const matchType = !structureFilter || e.structureType === structureFilter;
      return matchSearch && matchType;
    });
  }, [estimates, search, structureFilter]);

  const groups = useMemo(() => {
    const map: Record<string, ConcreteEstimate[]> = {};
    filtered.forEach((est) => {
      const key = est.contractor?.trim().toUpperCase() || "UNASSIGNED";
      if (!map[key]) map[key] = [];
      map[key].push(est);
    });
    return Object.entries(map)
      .sort(([, a], [, b]) => {
        const la = a[0]?.updatedAt, lb = b[0]?.updatedAt;
        if (!la && !lb) return 0;
        if (!la) return 1;
        if (!lb) return -1;
        return new Date(lb).getTime() - new Date(la).getTime();
      })
      .map(([key, ests]) => ({ key, ests }));
  }, [filtered]);

  const structureTypes = useMemo(() => {
    const types = new Set<string>();
    estimates.forEach((e) => { if (e.structureType) types.add(e.structureType); });
    return Array.from(types).sort();
  }, [estimates]);

  function toggleGroup(key: string) {
    setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4 mb-5">
        {!isStandalonePWA && (
          <Link href="/">
            <Button variant="ghost" size="sm" data-testid="btn-back">
              <ChevronLeft className="w-4 h-4 mr-1" /> Back
            </Button>
          </Link>
        )}
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Building2 className="w-6 h-6 text-blue-600" />
            Concrete Rate Estimates
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Saved estimates grouped by contractor — click to open in calculator
          </p>
        </div>
        <div className="flex items-center gap-2">
          <a href="/concrete-calculator" target="_blank" rel="noopener noreferrer">
            <Button variant="outline" size="sm" data-testid="btn-open-calculator">
              <ExternalLink className="w-4 h-4 mr-1" /> Open Calculator
            </Button>
          </a>
          {canEdit && (
            <a href="/concrete-calculator">
              <Button variant="default" size="sm" data-testid="btn-new-estimate">
                <Plus className="w-4 h-4 mr-1" /> New Estimate
              </Button>
            </a>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { localStorage.removeItem(ROLE_KEY); window.location.href = "/mix-calculator/login"; }}
            data-testid="btn-logout"
            title="Logout"
          >
            <LogOut className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-5">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by name or contractor..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
            data-testid="input-search"
          />
        </div>
        <div className="flex gap-2">
          {["", ...structureTypes].map((t) => (
            <Button
              key={t || "all"}
              variant={structureFilter === t ? "default" : "outline"}
              size="sm"
              onClick={() => setStructureFilter(t)}
              data-testid={`btn-filter-${t || "all"}`}
            >
              {t || "All Types"}
            </Button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-16 text-muted-foreground">Loading estimates...</div>
      ) : groups.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Building2 className="w-12 h-12 text-muted-foreground/40 mx-auto mb-4" />
            <p className="text-muted-foreground font-medium">No estimates found</p>
            {estimates.length === 0 ? (
              <>
                <p className="text-sm text-muted-foreground mt-1">
                  Use the Concrete Rate Calculator to build and save estimates.
                </p>
                <a href="/concrete-calculator">
                  <Button variant="default" className="mt-4" data-testid="btn-go-calculator">
                    Open Calculator
                  </Button>
                </a>
              </>
            ) : (
              <p className="text-sm text-muted-foreground mt-1">Try adjusting your search or filter.</p>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {groups.map(({ key, ests }) => {
            const isCollapsed = collapsed[key];
            const totalCum = ests.reduce((s, e) => s + (e.totalCum || 0), 0);
            const totalAmt = ests.reduce((s, e) => s + (e.totalAmt || 0), 0);

            return (
              <Card key={key} className="border-l-4 border-l-blue-500 overflow-hidden" data-testid={`card-contractor-${key}`}>
                <div
                  className="flex items-center justify-between px-5 py-3.5 bg-blue-50 dark:bg-blue-950/30 cursor-pointer select-none border-b border-blue-100 dark:border-blue-900"
                  onClick={() => toggleGroup(key)}
                >
                  <div className="flex items-center gap-3">
                    <Building2 className="w-5 h-5 text-blue-600 shrink-0" />
                    <span className="font-bold text-base text-foreground">{key}</span>
                    <span className="text-sm text-muted-foreground">{ests.length} estimate{ests.length !== 1 ? "s" : ""}</span>
                    {totalCum > 0 && (
                      <Badge variant="outline" className="text-xs">{totalCum.toFixed(0)} m³ total</Badge>
                    )}
                    {totalAmt > 0 && (
                      <Badge className="text-xs bg-blue-600 text-white border-blue-700">{fmtAmt(totalAmt)}</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                    <button
                      className="text-muted-foreground hover:text-foreground transition-colors p-1"
                      onClick={() => toggleGroup(key)}
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
                          <th className="text-left px-5 py-2.5 font-semibold">Estimate Name</th>
                          <th className="text-left px-4 py-2.5 font-semibold">Grade / Type</th>
                          <th className="text-right px-4 py-2.5 font-semibold">Volume (m³)</th>
                          <th className="text-right px-4 py-2.5 font-semibold">Total Cost</th>
                          <th className="text-right px-4 py-2.5 font-semibold">Rate ₹/m³</th>
                          <th className="text-right px-4 py-2.5 font-semibold">Saved</th>
                          <th className="px-4 py-2.5"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {ests.map((est) => {
                          const ratePerCum = est.totalCum && est.totalAmt ? est.totalAmt / est.totalCum : null;
                          return (
                            <tr
                              key={est.id}
                              className="border-t border-border/50 hover:bg-muted/20 transition-colors"
                              data-testid={`row-estimate-${est.id}`}
                            >
                              <td className="px-5 py-3">
                                <span className="font-medium text-foreground">{est.name}</span>
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2 flex-wrap">
                                  {est.grade && (
                                    <Badge variant="outline" className="text-xs font-mono">{est.grade}</Badge>
                                  )}
                                  {est.structureType && (
                                    <Badge variant="outline" className={`text-xs ${STRUCTURE_TYPE_COLORS[est.structureType] || ""}`}>
                                      {est.structureType}
                                    </Badge>
                                  )}
                                </div>
                              </td>
                              <td className="px-4 py-3 text-right text-muted-foreground">
                                {est.totalCum ? `${est.totalCum.toFixed(1)} m³` : "—"}
                              </td>
                              <td className="px-4 py-3 text-right font-medium text-foreground">
                                {fmtAmt(est.totalAmt)}
                              </td>
                              <td className="px-4 py-3 text-right text-muted-foreground">
                                {ratePerCum ? `₹${Math.round(ratePerCum).toLocaleString("en-IN")}/m³` : "—"}
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
                                    data-testid={`btn-load-${est.id}`}
                                  >
                                    Open
                                  </Button>
                                  {canEdit && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="px-2"
                                      onClick={() => cloneMutation.mutate(est)}
                                      title="Clone"
                                      data-testid={`btn-clone-${est.id}`}
                                    >
                                      <Copy className="w-3.5 h-3.5" />
                                    </Button>
                                  )}
                                  {canEdit && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="text-destructive hover:text-destructive hover:bg-destructive/10 px-2"
                                      onClick={() => { if (!confirm(`Delete "${est.name}"?`)) return; deleteMutation.mutate(est.id); }}
                                      data-testid={`btn-delete-${est.id}`}
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </Button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
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
    </div>
  );
}
