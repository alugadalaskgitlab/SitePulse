import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Input } from "./LevelInput";
import { RangeRowsForm } from "./RangeRowsForm";

export function AssumedSheetForm({ siteId, layerName, settings }: {
  siteId: number; layerName: string; settings: { bookChainageSystem: "ours" | "consultant"; consultantOffsetM: number };
}) {
  const client = useQueryClient();
  const [date, setDate] = useState(new Date().toLocaleDateString("en-CA"));
  const [flat, setFlat] = useState(false);
  const save = useMutation({
    mutationFn: async (readings: any[]) => {
      const response = await apiRequest("POST", "/api/level-sheets", { siteId, layerName, sheetDate: date, readingMode: "rl",
        toleranceAboveMm: 10, toleranceBelowMm: 10, allowedClosingErrorMm: 10, readings, personnelIds: [],
        basis: "assumed", status: "saved", assumedFromDesign: true, flatBeyondWidth: flat });
      return response.json();
    },
    onSuccess: () => client.invalidateQueries({ queryKey: ["/api/level-sheets"] }),
  });
  return <section className="space-y-3 rounded border p-3">
    <h3 className="font-semibold">Create assumed sheet from design levels</h3>
    <p className="text-sm">Layer: {layerName.toUpperCase()} · Basis: Assumed or agreed · Made from design levels</p>
    <label>Date<Input type="date" value={date} onChange={event => setDate(event.target.value)} /></label>
    <label className="flex gap-2"><input type="checkbox" checked={flat} onChange={event => setFlat(event.target.checked)} />Carry the edge level flat beyond the layer width</label>
    <RangeRowsForm settings={settings} label={save.isPending ? "Creating assumed sheet…" : "Create assumed sheet"} disabled={save.isPending} onCreate={rows => save.mutate(rows)} />
    {save.isError && <p role="alert">{(save.error as Error).message}</p>}
    {save.isSuccess && <p role="status">Assumed sheet #{save.data.id} saved. It is available in Level sheets and Quantities between sheets.</p>}
  </section>;
}
