import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ClipboardList, Plus, RefreshCw } from "lucide-react";
import { Link } from "wouter";
import { HubShell } from "@/components/HubShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { LevelSheetEditor } from "@/components/level-sheets/LevelSheetEditor";
import { TbmsTab } from "@/components/level-sheets/TbmsTab";
import { BetweenSheetsTab } from "@/components/level-sheets/BetweenSheetsTab";

type Bootstrap = {
  sites: Array<{ id: number; name: string }>;
  siteId: number | null;
  projects: Array<{ id: number; name: string; siteId: number; status: string }>;
  boqProjectId: number | null;
  items: Array<{ id: number; itemCode: string | null; displayName: string | null; itemName: string | null; description: string; unit: string; layerConfig: any }>;
  personnel: Array<{ id: number; name: string; role: string; isActive: number | null }>;
  layerOptions: string[];
  settings: { bookChainageSystem: "ours" | "consultant"; consultantOffsetM: number };
};

function uppercase(value: unknown) {
  return String(value ?? "").toLocaleUpperCase("en");
}

async function getJson(url: string) {
  const response = await fetch(url, { credentials: "include" });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.message ?? "Could not load level sheets.");
  return body;
}

function dateLabel(value: string) {
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("en-IN", {
    day: "2-digit", month: "short", year: "numeric",
  }).format(date);
}

export default function LevelSheets() {
  const { sectionCan } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const canCreate = sectionCan("level_sheets", "create");
  const canEdit = sectionCan("level_sheets", "edit");
  const canApprove = sectionCan("level_sheets", "approve");
  const [siteId, setSiteId] = useState<number | null>(null);
  const [sheetId, setSheetId] = useState<number | null>(null);
  const [newSheet, setNewSheet] = useState(false);
  const [siteTab, setSiteTab] = useState("sheets");

  const bootstrapQuery = useQuery<Bootstrap>({
    queryKey: ["/api/level-sheets/bootstrap", siteId],
    queryFn: () => getJson(`/api/level-sheets/bootstrap${siteId ? `?siteId=${siteId}` : ""}`),
  });
  const bootstrap = bootstrapQuery.data;
  useEffect(() => {
    if (bootstrap?.siteId && siteId == null) setSiteId(Number(bootstrap.siteId));
  }, [bootstrap?.siteId, siteId]);
  const listQuery = useQuery<any[]>({
    queryKey: ["/api/level-sheets", siteId],
    queryFn: () => getJson(`/api/level-sheets?siteId=${siteId}`),
    enabled: siteId != null,
  });
  const detailQuery = useQuery<any>({
    queryKey: ["/api/level-sheets", sheetId],
    queryFn: () => getJson(`/api/level-sheets/${sheetId}`),
    enabled: sheetId != null,
  });
  const selectedSite = useMemo(
    () => bootstrap?.sites.find(site => Number(site.id) === Number(siteId)) ?? null,
    [bootstrap?.sites, siteId],
  );

  const saveMutation = useMutation({
    mutationFn: async (payload: any) => {
      const response = await apiRequest(
        sheetId ? "PATCH" : "POST",
        sheetId ? `/api/level-sheets/${sheetId}` : "/api/level-sheets",
        payload,
      );
      return response.json();
    },
    onSuccess: async row => {
      setSheetId(Number(row.id));
      setNewSheet(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["/api/level-sheets", siteId] }),
        queryClient.invalidateQueries({ queryKey: ["/api/level-sheets", Number(row.id)] }),
      ]);
      toast({ title: row.status === "saved" ? "Level sheet saved" : "Draft saved" });
    },
    onError: (error: Error) => toast({ title: "Could not save level sheet", description: error.message, variant: "destructive" }),
  });

  const beginNew = () => {
    setSheetId(null);
    setNewSheet(true);
  };
  const closeEditor = () => {
    setSheetId(null);
    setNewSheet(false);
  };

  return (
    <HubShell title="Level sheets" subtitle="Design levels, field readings and results" backHref="/site/hub" backLabel="Site Operations">
      <main className="mx-auto max-w-7xl space-y-5 p-4 md:p-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-[220px] flex-1 space-y-2">
            <label className="text-sm font-medium" htmlFor="level-sheet-site">Site</label>
            <Select value={siteId ? String(siteId) : ""} onValueChange={value => {
              setSiteId(Number(value));
              closeEditor();
            }}>
              <SelectTrigger id="level-sheet-site"><SelectValue placeholder="Choose site" /></SelectTrigger>
              <SelectContent>
                {(bootstrap?.sites ?? []).map(site => <SelectItem key={site.id} value={String(site.id)}>{uppercase(site.name)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => {
              void bootstrapQuery.refetch();
              void listQuery.refetch();
            }} disabled={bootstrapQuery.isFetching || listQuery.isFetching}>
              <RefreshCw className="mr-2 h-4 w-4" /> Refresh
            </Button>
            {canCreate && siteId != null && <Button onClick={beginNew}><Plus className="mr-2 h-4 w-4" /> New level sheet</Button>}
          </div>
        </div>

        {bootstrapQuery.isLoading && <p className="text-sm text-muted-foreground">Loading sites…</p>}
        {bootstrapQuery.isError && <p role="alert" className="rounded border border-destructive/40 p-3 text-sm text-destructive">{(bootstrapQuery.error as Error).message}</p>}
        {!bootstrapQuery.isLoading && bootstrap?.sites.length === 0 && <p className="rounded border border-dashed p-4 text-sm">No accessible active sites.</p>}
        {siteId && !newSheet && sheetId == null && <div className="flex gap-2">
          <Button variant={siteTab === "sheets" ? "default" : "outline"} onClick={() => setSiteTab("sheets")}>Level sheets</Button>
          <Button variant={siteTab === "tbms" ? "default" : "outline"} onClick={() => setSiteTab("tbms")}>TBMs</Button>
          <Button variant={siteTab === "quantities" ? "default" : "outline"} onClick={() => setSiteTab("quantities")}>Quantities between sheets</Button>
        </div>}
        {siteId && bootstrap && !newSheet && sheetId == null && siteTab === "quantities" && <BetweenSheetsTab key={siteId} siteId={siteId} siteName={selectedSite?.name ?? ""} sheets={listQuery.data ?? []} projects={bootstrap.projects.filter(project => Number(project.siteId) === siteId)} settings={bootstrap.settings} />}
        {siteId && bootstrap && !newSheet && sheetId == null && siteTab === "tbms" && <TbmsTab key={siteId} siteId={siteId} settings={bootstrap.settings} canCreate={canCreate} canEdit={canEdit} />}

        {(newSheet || sheetId != null) && bootstrap && selectedSite && (
          <LevelSheetEditor
            siteId={siteId!}
            bootstrap={bootstrap}
            sheetId={sheetId}
            sheet={sheetId ? detailQuery.data : null}
            loadingSheet={sheetId != null && detailQuery.isLoading}
            sheetError={sheetId != null && detailQuery.error ? (detailQuery.error as Error).message : null}
            canCreate={canCreate}
            canEdit={canEdit}
            canApprove={canApprove}
            onBack={closeEditor}
            onSave={payload => saveMutation.mutate(payload)}
            saving={saveMutation.isPending}
          />
        )}

        {!newSheet && sheetId == null && siteTab === "sheets" && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <ClipboardList className="h-5 w-5" /> {selectedSite ? uppercase(selectedSite.name) : "Level sheets"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {listQuery.isLoading && <p className="text-sm text-muted-foreground">Loading level sheets…</p>}
              {listQuery.isError && <p role="alert" className="text-sm text-destructive">{(listQuery.error as Error).message}</p>}
              {!listQuery.isLoading && !listQuery.isError && (listQuery.data?.length ?? 0) === 0 && (
                <div className="rounded-lg border border-dashed p-8 text-center">
                  <p className="font-medium">No level sheets for this site yet.</p>
                  {canCreate && <Button className="mt-4" onClick={beginNew}><Plus className="mr-2 h-4 w-4" /> New level sheet</Button>}
                </div>
              )}
              {!!listQuery.data?.length && (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[740px] text-left text-sm">
                    <thead><tr className="border-b text-xs uppercase text-muted-foreground">
                      <th className="p-2">Date</th><th className="p-2">BOQ item</th><th className="p-2">Levels of</th>
                      <th className="p-2">Status</th><th className="p-2">Taken by</th><th className="p-2">Checked by</th><th className="p-2">Open</th>
                    </tr></thead>
                    <tbody>
                      {listQuery.data.map(row => (
                        <tr key={row.id} className="border-b hover:bg-muted/30">
                          <td className="p-2 whitespace-nowrap">{dateLabel(row.sheetDate)}</td>
                          <td className="p-2">{row.itemLabel ? uppercase(row.itemLabel) : "—"}</td>
                          <td className="p-2">{uppercase(row.layerName)}</td>
                          <td className="p-2">{row.status === "saved" ? "Saved" : "Draft"}</td>
                          <td className="p-2">{row.staff?.length ? row.staff.map((person: any) => uppercase(person.name)).join(", ") : "—"}</td>
                          <td className="p-2">{row.checkedByType === "not_checked" ? "Not checked yet" : `${uppercase(row.checkedByType)} · ${uppercase(row.checkedByName)}`}</td>
                          <td className="p-2"><Button variant="outline" size="sm" onClick={() => { setSheetId(Number(row.id)); setNewSheet(false); }}>Open</Button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        )}
        {sheetId != null && detailQuery.isError && <div role="alert" className="text-sm text-destructive">{(detailQuery.error as Error).message}</div>}
        <Link href="/site/hub" className="inline-flex items-center gap-2 text-sm underline"><ArrowLeft className="h-4 w-4" /> Site Operations</Link>
      </main>
    </HubShell>
  );
}
