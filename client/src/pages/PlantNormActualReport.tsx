import { useEffect, useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useFeatureFlags } from "@/lib/featureFlags";
import { useOrigin } from "@/hooks/use-origin";
import { useAuth } from "@/lib/auth-context";
import { ChevronLeft, Download } from "lucide-react";

type Report = {
  from: string; to: string; plantName: string;
  actualAttribution: string;
  groups: Array<{ partyName: string; orderNo: string | null; mixName: string; bitumenNormMt: number; ldoNormL: number }>;
  daily: Array<{ date: string; bitumenNormMt: number; bitumenActualMt: number | null; ldoNormL: number; ldoActualL: number | null }>;
  totals: {
    bitumenNormMt: number; bitumenActualMt: number | null;
    bitumenVariance: { saved: number | null; label: string };
    bitumenMeasuredDays: number; ldoNormL: number; ldoActualL: number | null;
    ldoVariance: { saved: number | null; label: string }; ldoMeasuredDays: number; normDays: number;
  };
};

const dateText = (date: Date) => date.toISOString().slice(0, 10);
const num = (value: number | null, digits: number) => value == null ? "—" : value.toFixed(digits);

export default function PlantNormActualReport() {
  const { defaultPlantName } = useFeatureFlags();
  const { sectionCan } = useAuth();
  const { appendOrigin } = useOrigin();
  const today = dateText(new Date());
  const [from, setFrom] = useState(() => dateText(new Date(Date.now() - 6 * 86_400_000)));
  const [to, setTo] = useState(today);
  const [plantName, setPlantName] = useState(defaultPlantName);
  const [touchedPlant, setTouchedPlant] = useState(false);
  useEffect(() => {
    if (!touchedPlant) setPlantName(defaultPlantName);
  }, [defaultPlantName, touchedPlant]);
  const canView = sectionCan("plant_norm_vs_actual", "view");
  const canExport = sectionCan("plant_norm_vs_actual", "export");
  const query = useQuery<Report>({
    queryKey: ["/api/plant-module/norm-vs-actual", from, to, plantName],
    queryFn: async () => {
      const params = new URLSearchParams({ from, to, plant: plantName });
      const response = await fetch(`/api/plant-module/norm-vs-actual?${params}`, { credentials: "include" });
      if (!response.ok) throw new Error((await response.json().catch(() => ({}))).message || "Could not load the report.");
      return response.json();
    },
    enabled: canView && !!from && !!to && !!plantName,
  });
  const plantsQuery = useQuery<string[]>({
    queryKey: ["/api/plant-module/shift-logs/plants"],
    queryFn: async () => {
      const response = await fetch("/api/plant-module/shift-logs/plants", { credentials: "include" });
      return response.ok ? response.json() : [defaultPlantName];
    },
    enabled: canView,
  });
  const exportHref = (format: "pdf" | "xlsx") => {
    const params = new URLSearchParams({ from, to, plant: plantName, format });
    return `/api/plant-module/norm-vs-actual/export?${params}`;
  };
  const formatVariance = (saved: number | null, label: string, digits: number, unit: string) =>
    saved == null ? "Unavailable" : `${Math.abs(saved).toFixed(digits)} ${unit} ${label}`;

  if (!canView) return null;

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-4" data-testid="plant-norm-actual-report">
      <div className="flex flex-wrap items-center gap-3">
        <Link href={appendOrigin("/plant")}>
          <Button variant="ghost" size="icon" aria-label="Back to plant"><ChevronLeft className="h-5 w-5" /></Button>
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold">Plant norm vs actual</h1>
          <p className="text-sm text-muted-foreground">HLC fuel comparison. Party stock and party statements remain based on dispatch norms.</p>
        </div>
        {canExport && (
          <div className="flex gap-2">
            <a href={exportHref("pdf")}><Button variant="outline"><Download className="mr-2 h-4 w-4" />PDF</Button></a>
            <a href={exportHref("xlsx")}><Button variant="outline"><Download className="mr-2 h-4 w-4" />Excel</Button></a>
          </div>
        )}
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 p-4">
          <label className="grid gap-1 text-sm">From<Input type="date" value={from} onChange={event => setFrom(event.target.value)} /></label>
          <label className="grid gap-1 text-sm">To<Input type="date" value={to} onChange={event => setTo(event.target.value)} /></label>
          <label className="grid gap-1 text-sm">Plant
            <select
              className="h-10 rounded-md border bg-background px-3"
              value={plantName}
              onChange={event => { setTouchedPlant(true); setPlantName(event.target.value); }}
              aria-label="Plant"
            >
              {(plantsQuery.data?.length ? plantsQuery.data : [defaultPlantName]).map(plant => <option key={plant} value={plant}>{plant}</option>)}
            </select>
          </label>
        </CardContent>
      </Card>

      {query.isError && <p role="alert" className="text-sm text-destructive">{query.error.message}</p>}
      {query.data && (
        <>
          <div className="grid gap-3 md:grid-cols-2">
            <Card><CardHeader className="pb-2"><CardTitle className="text-base">Bitumen · HLC total</CardTitle></CardHeader>
              <CardContent className="space-y-1 text-sm">
                <p>Book: {num(query.data.totals.bitumenNormMt, 3)} MT</p>
                <p>Dips: {num(query.data.totals.bitumenActualMt, 3)} MT</p>
                <p>{formatVariance(query.data.totals.bitumenVariance.saved, query.data.totals.bitumenVariance.label, 3, "MT")}
                  {` · measured ${query.data.totals.bitumenMeasuredDays}/${query.data.totals.normDays} norm days`}</p>
              </CardContent>
            </Card>
            <Card><CardHeader className="pb-2"><CardTitle className="text-base">LDO · HLC total</CardTitle></CardHeader>
              <CardContent className="space-y-1 text-sm">
                <p>Norm: {num(query.data.totals.ldoNormL, 1)} L</p>
                <p>Dip-based actual: {num(query.data.totals.ldoActualL, 1)} L</p>
                <p>{formatVariance(query.data.totals.ldoVariance.saved, query.data.totals.ldoVariance.label, 1, "L")}
                  {` · measured ${query.data.totals.ldoMeasuredDays}/${query.data.totals.normDays} norm days`}</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader><CardTitle className="text-base">Norm by party and order</CardTitle>
              <p className="text-sm text-muted-foreground">{query.data.actualAttribution}</p>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[700px] text-sm">
                  <thead><tr className="border-b text-left">
                    <th className="p-2">Party</th><th className="p-2">Order</th><th className="p-2">Mix</th>
                    <th className="p-2 text-right">Bitumen norm (MT)</th><th className="p-2">Bitumen actual</th>
                    <th className="p-2 text-right">LDO norm (L)</th><th className="p-2">LDO actual</th>
                  </tr></thead>
                  <tbody>
                    {query.data.groups.map((row, index) => <tr key={`${row.partyName}:${row.orderNo}:${row.mixName}:${index}`} className="border-b">
                      <td className="p-2">{row.partyName}</td><td className="p-2">{row.orderNo || "No linked order"}</td>
                      <td className="p-2">{row.mixName}</td><td className="p-2 text-right">{row.bitumenNormMt.toFixed(3)}</td>
                      <td className="p-2">Shared HLC tank — not allocated</td><td className="p-2 text-right">{row.ldoNormL.toFixed(1)}</td>
                      <td className="p-2">Shared plant — not allocated</td>
                    </tr>)}
                    <tr className="font-semibold">
                      <td className="p-2" colSpan={3}>HLC plant total</td>
                      <td className="p-2 text-right">{query.data.totals.bitumenNormMt.toFixed(3)}</td>
                      <td className="p-2">{num(query.data.totals.bitumenActualMt, 3)} MT</td>
                      <td className="p-2 text-right">{query.data.totals.ldoNormL.toFixed(1)}</td>
                      <td className="p-2">{num(query.data.totals.ldoActualL, 1)} L</td>
                    </tr>
                    {!query.data.groups.length && <tr><td className="p-3 text-muted-foreground" colSpan={7}>No dispatch norms in this date range.</td></tr>}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Daily physical totals</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full min-w-[620px] text-sm">
                <thead><tr className="border-b text-left">
                  <th className="p-2">Date</th><th className="p-2 text-right">Bitumen book (MT)</th><th className="p-2 text-right">Bitumen dips (MT)</th>
                  <th className="p-2 text-right">LDO norm (L)</th><th className="p-2 text-right">LDO actual (L)</th>
                </tr></thead>
                <tbody>{query.data.daily.map(day => <tr key={day.date} className="border-b">
                  <td className="p-2">{day.date}</td><td className="p-2 text-right">{day.bitumenNormMt.toFixed(3)}</td>
                  <td className="p-2 text-right">{num(day.bitumenActualMt, 3)}</td><td className="p-2 text-right">{day.ldoNormL.toFixed(1)}</td>
                  <td className="p-2 text-right">{num(day.ldoActualL, 1)}</td>
                </tr>)}</tbody>
              </table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
