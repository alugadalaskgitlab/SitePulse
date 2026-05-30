import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChevronLeft, Loader2, MapPin, Lock } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";

interface UnassignedDieselReq {
  id: number;
  date: string;
  raisedBy: string;
  status: string;
  totalPlanned: number;
  totalApproved: number | null;
}

interface UnassignedPurchaseIndent {
  id: number;
  date: string;
  indentNo: string;
  raisedBy: string;
  status: string;
}

interface Site {
  id: number;
  name: string;
}

interface UnassignedData {
  dieselRequirements: UnassignedDieselReq[];
  purchaseIndents: UnassignedPurchaseIndent[];
  sites: Site[];
}

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  approved: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-800",
  completed: "bg-blue-100 text-blue-800",
  purchased: "bg-purple-100 text-purple-800",
};

function statusBadge(status: string) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[status] ?? "bg-slate-100 text-slate-700"}`}>
      {status}
    </span>
  );
}

export default function SiteBackfill() {
  const { isAdmin } = useAuth();
  const { toast } = useToast();

  const [tab, setTab] = useState<"diesel" | "indents">("diesel");
  const [selectedDiesel, setSelectedDiesel] = useState<Set<number>>(new Set());
  const [selectedIndents, setSelectedIndents] = useState<Set<number>>(new Set());
  const [dieselSiteId, setDieselSiteId] = useState<string>("");
  const [indentSiteId, setIndentSiteId] = useState<string>("");

  const { data, isLoading, isError } = useQuery<UnassignedData>({
    queryKey: ["/api/admin/site-backfill/unassigned"],
    enabled: isAdmin,
  });

  const assignMutation = useMutation<{ updated: number }, Error, { table: string; ids: number[]; siteId: number }>({
    mutationFn: async (payload) => {
      const res = await apiRequest("POST", "/api/admin/site-backfill/assign", payload);
      return res.json();
    },
    onSuccess: (result, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/site-backfill/unassigned"] });
      if (vars.table === "diesel_requirements") setSelectedDiesel(new Set());
      else setSelectedIndents(new Set());
      toast({ title: "Site assigned", description: `${result.updated} record(s) updated.` });
    },
    onError: (err) => {
      toast({ title: "Assignment failed", description: err.message, variant: "destructive" });
    },
  });

  const handleAssign = (table: "diesel_requirements" | "purchase_indents") => {
    const ids = table === "diesel_requirements"
      ? Array.from(selectedDiesel)
      : Array.from(selectedIndents);
    const siteIdStr = table === "diesel_requirements" ? dieselSiteId : indentSiteId;
    if (!siteIdStr) {
      toast({ title: "Select a site first", variant: "destructive" });
      return;
    }
    if (ids.length === 0) {
      toast({ title: "Select at least one record", variant: "destructive" });
      return;
    }
    assignMutation.mutate({ table, ids, siteId: Number(siteIdStr) });
  };

  const handleAssignAll = (table: "diesel_requirements" | "purchase_indents") => {
    const ids = table === "diesel_requirements"
      ? (data?.dieselRequirements ?? []).map(r => r.id)
      : (data?.purchaseIndents ?? []).map(r => r.id);
    const siteIdStr = table === "diesel_requirements" ? dieselSiteId : indentSiteId;
    if (!siteIdStr) {
      toast({ title: "Select a site first", variant: "destructive" });
      return;
    }
    if (ids.length === 0) {
      toast({ title: "No records to assign" });
      return;
    }
    assignMutation.mutate({ table, ids, siteId: Number(siteIdStr) });
  };

  const toggleDiesel = (id: number) => {
    setSelectedDiesel(prev => {
      const s = new Set(prev);
      s.has(id) ? s.delete(id) : s.add(id);
      return s;
    });
  };

  const toggleIndent = (id: number) => {
    setSelectedIndents(prev => {
      const s = new Set(prev);
      s.has(id) ? s.delete(id) : s.add(id);
      return s;
    });
  };

  const toggleAllDiesel = () => {
    const all = data?.dieselRequirements ?? [];
    if (selectedDiesel.size === all.length) {
      setSelectedDiesel(new Set());
    } else {
      setSelectedDiesel(new Set(all.map(r => r.id)));
    }
  };

  const toggleAllIndents = () => {
    const all = data?.purchaseIndents ?? [];
    if (selectedIndents.size === all.length) {
      setSelectedIndents(new Set());
    } else {
      setSelectedIndents(new Set(all.map(r => r.id)));
    }
  };

  const sites = data?.sites ?? [];
  const dieselRows = data?.dieselRequirements ?? [];
  const indentRows = data?.purchaseIndents ?? [];

  if (!isAdmin) {
    return (
      <div className="space-y-4 max-w-2xl mx-auto py-12">
        <Link href="/admin/hub">
          <Button variant="ghost" size="sm" data-testid="link-back">
            <ChevronLeft className="w-4 h-4 mr-1" /> Back
          </Button>
        </Link>
        <Card>
          <CardContent className="p-8 flex flex-col items-center text-center gap-3">
            <Lock className="w-10 h-10 text-muted-foreground" />
            <h2 className="text-lg font-semibold">Admin only</h2>
            <p className="text-sm text-muted-foreground">
              The Site Backfill tool is restricted to admin users.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-5xl mx-auto p-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <Link href="/admin/hub">
          <Button variant="ghost" size="sm" data-testid="link-back">
            <ChevronLeft className="w-4 h-4 mr-1" /> Back to Masters Hub
          </Button>
        </Link>
        <Badge variant="outline">Admin only</Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <MapPin className="w-5 h-5 text-primary" />
            Site Backfill Tool
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Assign a site to historical Diesel Requirements and Purchase Indents that were created before site tracking was added.
            Records with no site assigned will not appear in site-filtered Management Report views.
          </p>
        </CardHeader>
        <CardContent>
          {isLoading && (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading unassigned records…
            </div>
          )}
          {isError && (
            <div className="text-sm text-red-600 py-6 text-center">Failed to load records. Please try again.</div>
          )}
          {!isLoading && !isError && (
            <Tabs value={tab} onValueChange={(v) => setTab(v as "diesel" | "indents")}>
              <TabsList className="mb-4">
                <TabsTrigger value="diesel" data-testid="tab-diesel">
                  Diesel Requirements
                  {dieselRows.length > 0 && (
                    <Badge variant="secondary" className="ml-2">{dieselRows.length}</Badge>
                  )}
                </TabsTrigger>
                <TabsTrigger value="indents" data-testid="tab-indents">
                  Purchase Indents
                  {indentRows.length > 0 && (
                    <Badge variant="secondary" className="ml-2">{indentRows.length}</Badge>
                  )}
                </TabsTrigger>
              </TabsList>

              <TabsContent value="diesel">
                {dieselRows.length === 0 ? (
                  <div className="text-center py-10 text-muted-foreground">
                    <MapPin className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    <p className="font-medium">All diesel requirements have a site assigned.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="flex items-center gap-3 flex-wrap">
                      <Select value={dieselSiteId} onValueChange={setDieselSiteId}>
                        <SelectTrigger className="w-56" data-testid="select-diesel-site">
                          <SelectValue placeholder="Select site…" />
                        </SelectTrigger>
                        <SelectContent>
                          {sites.map(s => (
                            <SelectItem key={s.id} value={String(s.id)} data-testid={`site-option-${s.id}`}>
                              {s.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        size="sm"
                        onClick={() => handleAssign("diesel_requirements")}
                        disabled={assignMutation.isPending || selectedDiesel.size === 0 || !dieselSiteId}
                        data-testid="button-assign-diesel-selected"
                      >
                        {assignMutation.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null}
                        Assign Selected ({selectedDiesel.size})
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleAssignAll("diesel_requirements")}
                        disabled={assignMutation.isPending || !dieselSiteId}
                        data-testid="button-assign-diesel-all"
                      >
                        Assign All ({dieselRows.length})
                      </Button>
                    </div>

                    <div className="border rounded-lg overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b bg-muted/40">
                            <th className="p-3 w-10">
                              <Checkbox
                                checked={selectedDiesel.size === dieselRows.length && dieselRows.length > 0}
                                onCheckedChange={toggleAllDiesel}
                                data-testid="checkbox-diesel-all"
                              />
                            </th>
                            <th className="p-3 text-left font-medium text-muted-foreground">Date</th>
                            <th className="p-3 text-left font-medium text-muted-foreground">Raised By</th>
                            <th className="p-3 text-left font-medium text-muted-foreground">Status</th>
                            <th className="p-3 text-right font-medium text-muted-foreground">Planned (L)</th>
                            <th className="p-3 text-right font-medium text-muted-foreground">Approved (L)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {dieselRows.map(row => (
                            <tr
                              key={row.id}
                              className={`border-b last:border-0 hover:bg-muted/20 cursor-pointer ${selectedDiesel.has(row.id) ? "bg-primary/5" : ""}`}
                              onClick={() => toggleDiesel(row.id)}
                            >
                              <td className="p-3">
                                <Checkbox
                                  checked={selectedDiesel.has(row.id)}
                                  onCheckedChange={() => toggleDiesel(row.id)}
                                  onClick={(e) => e.stopPropagation()}
                                  data-testid={`checkbox-diesel-${row.id}`}
                                />
                              </td>
                              <td className="p-3 font-medium">{format(new Date(row.date), "dd MMM yyyy")}</td>
                              <td className="p-3 text-muted-foreground">{row.raisedBy}</td>
                              <td className="p-3">{statusBadge(row.status)}</td>
                              <td className="p-3 text-right tabular-nums">{row.totalPlanned?.toLocaleString()}</td>
                              <td className="p-3 text-right tabular-nums">{row.totalApproved != null ? row.totalApproved.toLocaleString() : "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {selectedDiesel.size} of {dieselRows.length} selected
                    </p>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="indents">
                {indentRows.length === 0 ? (
                  <div className="text-center py-10 text-muted-foreground">
                    <MapPin className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    <p className="font-medium">All purchase indents have a site assigned.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="flex items-center gap-3 flex-wrap">
                      <Select value={indentSiteId} onValueChange={setIndentSiteId}>
                        <SelectTrigger className="w-56" data-testid="select-indent-site">
                          <SelectValue placeholder="Select site…" />
                        </SelectTrigger>
                        <SelectContent>
                          {sites.map(s => (
                            <SelectItem key={s.id} value={String(s.id)} data-testid={`indent-site-option-${s.id}`}>
                              {s.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        size="sm"
                        onClick={() => handleAssign("purchase_indents")}
                        disabled={assignMutation.isPending || selectedIndents.size === 0 || !indentSiteId}
                        data-testid="button-assign-indent-selected"
                      >
                        {assignMutation.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null}
                        Assign Selected ({selectedIndents.size})
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleAssignAll("purchase_indents")}
                        disabled={assignMutation.isPending || !indentSiteId}
                        data-testid="button-assign-indent-all"
                      >
                        Assign All ({indentRows.length})
                      </Button>
                    </div>

                    <div className="border rounded-lg overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b bg-muted/40">
                            <th className="p-3 w-10">
                              <Checkbox
                                checked={selectedIndents.size === indentRows.length && indentRows.length > 0}
                                onCheckedChange={toggleAllIndents}
                                data-testid="checkbox-indent-all"
                              />
                            </th>
                            <th className="p-3 text-left font-medium text-muted-foreground">Date</th>
                            <th className="p-3 text-left font-medium text-muted-foreground">Indent No</th>
                            <th className="p-3 text-left font-medium text-muted-foreground">Raised By</th>
                            <th className="p-3 text-left font-medium text-muted-foreground">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {indentRows.map(row => (
                            <tr
                              key={row.id}
                              className={`border-b last:border-0 hover:bg-muted/20 cursor-pointer ${selectedIndents.has(row.id) ? "bg-primary/5" : ""}`}
                              onClick={() => toggleIndent(row.id)}
                            >
                              <td className="p-3">
                                <Checkbox
                                  checked={selectedIndents.has(row.id)}
                                  onCheckedChange={() => toggleIndent(row.id)}
                                  onClick={(e) => e.stopPropagation()}
                                  data-testid={`checkbox-indent-${row.id}`}
                                />
                              </td>
                              <td className="p-3 font-medium">{format(new Date(row.date), "dd MMM yyyy")}</td>
                              <td className="p-3 font-mono text-xs">{row.indentNo}</td>
                              <td className="p-3 text-muted-foreground">{row.raisedBy}</td>
                              <td className="p-3">{statusBadge(row.status)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {selectedIndents.size} of {indentRows.length} selected
                    </p>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
