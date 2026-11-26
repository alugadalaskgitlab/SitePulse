import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatChainage } from "@shared/levelSheets";
import { DesignLevelsTab } from "./DesignLevelsTab";
import { AssumedSheetForm } from "./AssumedSheetForm";

export function SiteDesignLevelsTab({ siteId, settings, layerOptions, initialLayer, canCreate, canEdit }: {
  siteId: number; settings: { bookChainageSystem: "ours" | "consultant"; consultantOffsetM: number };
  layerOptions: string[]; initialLayer?: string; canCreate: boolean; canEdit: boolean;
}) {
  const [layer, setLayer] = useState(initialLayer || layerOptions[0] || "Original ground");
  const [other, setOther] = useState(false);
  useEffect(() => { if (initialLayer) setLayer(initialLayer); }, [initialLayer]);
  const { data = [], isError } = useQuery<any[]>({
    queryKey: ["/api/level-sheets/design/layers", siteId],
    queryFn: async () => {
      const response = await fetch(`/api/level-sheets/design/layers?siteId=${siteId}`, { credentials: "include" });
      if (!response.ok) throw new Error("Could not load design layers.");
      return response.json();
    },
  });
  const rows = Array.isArray(data) ? data : [];
  const names = [...new Set([...rows.map(row => row.layerName), ...layerOptions, layer])];
  return <section className="space-y-4">
    <h2 className="text-lg font-semibold">Design levels</h2>
    {isError && <p role="alert">Could not load design layers.</p>}
    <label className="block text-sm">Layer<select aria-label="Design layer" className="block w-full rounded border p-2" value={other ? "__other" : layer}
      onChange={event => { setOther(event.target.value === "__other"); if (event.target.value !== "__other") setLayer(event.target.value); }}>
      {names.map(name => { const summary = rows.find(row => row.layerName === name); return <option key={name} value={name}>{name.toUpperCase()}{summary ? ` · ${summary.count} rows · ${formatChainage(summary.fromKm)} to ${formatChainage(summary.toKm)}` : " · 0 rows"}</option>; })}
      <option value="__other">Other…</option>
    </select></label>
    {other && <label className="block text-sm">New layer name<input className="block w-full rounded border p-2" value={layer} onChange={event => setLayer(event.target.value)} /></label>}
    {!!layer.trim() && <DesignLevelsTab siteId={siteId} layerName={layer} settings={settings} canCreate={canCreate} canEdit={canEdit}
      onImported={name => { setLayer(name); setOther(false); }} />}
    {canCreate && !!layer.trim() && <AssumedSheetForm key={`${siteId}:${layer}`} siteId={siteId} layerName={layer} settings={settings} />}
  </section>;
}
