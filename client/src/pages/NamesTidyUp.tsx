import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";

type TidyTable = "boq_display_name" | "material_master" | "equipment_master" | "site" | "vendor_master" | "party";
type TidyRow = {
  table: TidyTable;
  id: number;
  currentName: string;
  suggestedName: string;
  usageCount: number;
  canApply: boolean;
  blockedReason: string | null;
};
type Preview = { rows: TidyRow[] };
const tableLabels: Record<TidyTable, string> = {
  boq_display_name: "BOQ item short names",
  material_master: "Material master names",
  equipment_master: "Equipment master names",
  site: "Site names",
  vendor_master: "Vendor master names",
  party: "Party names",
};
const rowKey = (row: Pick<TidyRow, "table" | "id">) => `${row.table}:${row.id}`;

export default function NamesTidyUp() {
  const { toast } = useToast();
  const { featureCan } = useAuth();
  const canView = featureCan("names_tidy_up", "view");
  const canEdit = featureCan("names_tidy_up", "edit");
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [editedNames, setEditedNames] = useState<Record<string, string>>({});
  const [confirming, setConfirming] = useState(false);
  const preview = useQuery<Preview>({ queryKey: ["/api/admin/names-tidy-up/preview"], enabled: canView });
  const rows = preview.data?.rows ?? [];
  const grouped = useMemo(() => (Object.keys(tableLabels) as TidyTable[])
    .map(table => ({ table, rows: rows.filter(row => row.table === table) }))
    .filter(group => group.rows.length), [rows]);
  const selectedRows = rows.filter(row => row.canApply && selected.has(rowKey(row)));
  const updateMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/admin/names-tidy-up/apply", {
        changes: selectedRows.map(row => ({
          table: row.table,
          id: row.id,
          expectedCurrent: row.currentName,
          name: editedNames[rowKey(row)] ?? row.suggestedName,
        })),
      });
      return response.json() as Promise<{ results: Array<{ table: string; id: number; ok: boolean; reason?: string }> }>;
    },
    onSuccess: result => {
      const changed = result.results.filter(row => row.ok).length;
      const skipped = result.results.filter(row => !row.ok);
      setConfirming(false);
      setSelected(new Set());
      setEditedNames({});
      void queryClient.invalidateQueries({ queryKey: ["/api/admin/names-tidy-up/preview"] });
      toast({
        title: `${changed} name${changed === 1 ? "" : "s"} updated`,
        description: skipped.length ? `${skipped.length} row${skipped.length === 1 ? "" : "s"} were not updated; refresh the preview and review them.` : "The selected master/display names were saved.",
      });
    },
    onError: error => toast({ title: "Names were not applied", description: error instanceof Error ? error.message : "Could not save the selected names.", variant: "destructive" }),
  });

  const tickAll = () => setSelected(new Set(rows.filter(row => row.canApply).map(rowKey)));
  const toggleRow = (row: TidyRow, checked: boolean) => setSelected(previous => {
    const next = new Set(previous);
    if (checked) next.add(rowKey(row));
    else next.delete(rowKey(row));
    return next;
  });

  return <main className="mx-auto max-w-6xl space-y-5 p-4 md:p-7">
    <Link href="/admin/settings" className="inline-flex items-center gap-2 text-sm font-medium text-primary underline underline-offset-4">
      <ArrowLeft className="h-4 w-4" /> Back to system settings
    </Link>
    <header className="space-y-1">
      <h1 className="text-2xl font-semibold">Names tidy-up</h1>
      <p className="text-sm text-muted-foreground">Available to Owners by default. Review suggested casing for master and BOQ display names. No changes are made until you confirm Apply ticked.</p>
    </header>

    <section className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-3">
      <Button type="button" variant="outline" onClick={tickAll} disabled={!canEdit || !rows.some(row => row.canApply)}>Tick all suggestions</Button>
      <Button type="button" onClick={() => setConfirming(true)} disabled={!canEdit || !selectedRows.length || updateMutation.isPending}>
        Apply ticked ({selectedRows.length})
      </Button>
      <Button type="button" variant="ghost" onClick={() => void preview.refetch()} disabled={preview.isFetching}>
        <RefreshCw className="mr-2 h-4 w-4" /> Refresh preview
      </Button>
      {preview.isFetching && <span role="status" className="text-sm text-muted-foreground">Loading names…</span>}
      {preview.isError && <span role="alert" className="text-sm text-destructive">Couldn’t load the names preview.</span>}
    </section>

    {grouped.map(group => <section key={group.table} className="overflow-hidden rounded-xl border bg-card">
      <h2 className="border-b bg-muted/40 px-4 py-3 text-base font-semibold">{tableLabels[group.table]} · {group.rows.length}</h2>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[780px] text-sm">
          <thead className="bg-muted/30 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Apply</th><th className="px-3 py-2">Current name</th>
              <th className="px-3 py-2">Suggested name</th><th className="px-3 py-2 text-right">Where used</th>
            </tr>
          </thead>
          <tbody>
            {group.rows.map(row => {
              const key = rowKey(row);
              return <tr key={key} className="border-t align-top">
                <td className="px-3 py-2">
                  <input
                    type="checkbox"
                    aria-label={`Apply suggestion for ${row.currentName}`}
                    checked={selected.has(key)}
                    disabled={!canEdit || !row.canApply}
                    onChange={event => toggleRow(row, event.target.checked)}
                  />
                </td>
                <td className="max-w-[260px] whitespace-normal px-3 py-2">{row.currentName}</td>
                <td className="px-3 py-2">
                  <Input
                    value={editedNames[key] ?? row.suggestedName}
                    disabled={!canEdit || !row.canApply}
                    aria-label={`Suggested name for ${row.currentName}`}
                    onChange={event => setEditedNames(previous => ({ ...previous, [key]: event.target.value }))}
                  />
                  {row.blockedReason && <p className="mt-1 max-w-lg text-xs text-amber-700">{row.blockedReason}</p>}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{row.usageCount}</td>
              </tr>;
            })}
          </tbody>
        </table>
      </div>
    </section>)}
    {!preview.isFetching && !preview.isError && !rows.length && <p className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">No names need casing changes.</p>}

    {confirming && <div role="dialog" aria-modal="true" aria-labelledby="confirm-name-tidy-title" className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <section className="w-full max-w-lg space-y-4 rounded-xl border bg-background p-5 shadow-xl">
        <h2 id="confirm-name-tidy-title" className="text-lg font-semibold">Apply {selectedRows.length} name changes?</h2>
        <p className="text-sm text-muted-foreground">Only the selected BOQ display names, material names and vendor names will change. Historical document snapshots and matching-key names are not rewritten.</p>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => setConfirming(false)} disabled={updateMutation.isPending}>Keep editing</Button>
          <Button type="button" onClick={() => updateMutation.mutate()} disabled={updateMutation.isPending || !selectedRows.length}>
            {updateMutation.isPending ? "Applying…" : "Apply ticked"}
          </Button>
        </div>
      </section>
    </div>}
  </main>;
}
