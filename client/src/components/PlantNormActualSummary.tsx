import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/lib/auth-context";

type DayData = {
  date: string;
  daily: { bitumenNormMt: number; bitumenActualMt: number | null; ldoNormL: number; ldoActualL: number | null };
};
type RangeData = {
  daily: Array<DayData["daily"] & { date: string }>;
  totals: {
    bitumenNormMt: number; bitumenActualMt: number | null;
    bitumenVariance: { saved: number | null; label: string };
    bitumenMeasuredDays: number; ldoNormL: number; ldoActualL: number | null;
    ldoVariance: { saved: number | null; label: string }; ldoMeasuredDays: number; normDays: number;
  };
};

function numberOrDash(value: number | null | undefined, digits: number) {
  return value == null || !Number.isFinite(value) ? "—" : value.toFixed(digits);
}

function savedOrExcess(norm: number, actual: number | null, digits: number, unit: string) {
  if (actual == null) return "actual unavailable";
  const difference = norm - actual;
  return `${Math.abs(difference).toFixed(digits)} ${unit} ${difference >= 0 ? "saved" : "excess"}`;
}

export function PlantNormActualDaySummary({ date, plantName }: { date: string; plantName: string }) {
  const { sectionCan } = useAuth();
  const allowed = sectionCan("plant_norm_vs_actual", "view");
  const query = useQuery<DayData>({
    queryKey: ["/api/plant-module/norm-vs-actual/day", date, plantName],
    queryFn: async () => {
      const res = await fetch(`/api/plant-module/norm-vs-actual/day/${encodeURIComponent(date)}?plant=${encodeURIComponent(plantName)}`, { credentials: "include" });
      if (!res.ok) throw new Error("Could not load the confidential fuel comparison.");
      return res.json();
    },
    enabled: allowed && !!date && !!plantName,
  });
  if (!allowed) return null;
  return (
    <Card data-testid="plant-norm-actual-day" className="border-slate-300">
      <CardHeader className="pb-2"><CardTitle className="text-base">Plant fuel norm vs actual — HLC</CardTitle></CardHeader>
      <CardContent className="space-y-1 text-sm">
        {query.isError ? <p role="alert">Fuel comparison unavailable.</p> : query.data ? (
          <>
            <p>Bitumen: book {numberOrDash(query.data.daily.bitumenNormMt, 3)} MT · dips {numberOrDash(query.data.daily.bitumenActualMt, 3)} MT · {savedOrExcess(query.data.daily.bitumenNormMt, query.data.daily.bitumenActualMt, 3, "MT")}</p>
            <p>LDO: norm {numberOrDash(query.data.daily.ldoNormL, 1)} L · actual {numberOrDash(query.data.daily.ldoActualL, 1)} L · {savedOrExcess(query.data.daily.ldoNormL, query.data.daily.ldoActualL, 1, "L")}</p>
          </>
        ) : <p className="text-muted-foreground">Loading fuel comparison…</p>}
      </CardContent>
    </Card>
  );
}

export function PlantNormActualPeriodSummary({ from, to, plantName }: { from: string; to: string; plantName: string }) {
  const { sectionCan } = useAuth();
  const allowed = sectionCan("plant_norm_vs_actual", "view");
  const query = useQuery<RangeData>({
    queryKey: ["/api/plant-module/norm-vs-actual", from, to, plantName],
    queryFn: async () => {
      const params = new URLSearchParams({ from, to, plant: plantName });
      const res = await fetch(`/api/plant-module/norm-vs-actual?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Could not load the confidential fuel comparison.");
      return res.json();
    },
    enabled: allowed && !!from && !!to && !!plantName,
  });
  if (!allowed) return null;
  return (
    <Card data-testid="plant-norm-actual-period" className="border-slate-300">
      <CardHeader className="pb-2"><CardTitle className="text-base">Dip-based LDO actual — HLC</CardTitle></CardHeader>
      <CardContent className="space-y-2 text-sm">
        <p className="text-muted-foreground">Meter readings remain listed separately below. Shared tank actuals are not assigned to parties or orders.</p>
        {query.isError ? <p role="alert">Fuel comparison unavailable.</p> : query.data ? (
          <>
            <div className="grid grid-cols-2 gap-2">
              <div>LDO norm: {numberOrDash(query.data.totals.ldoNormL, 1)} L</div>
              <div>LDO dip actual: {numberOrDash(query.data.totals.ldoActualL, 1)} L</div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead><tr className="border-b"><th className="py-1 pr-3">Date</th><th className="py-1 pr-3">Norm (L)</th><th className="py-1">Dip actual (L)</th></tr></thead>
                <tbody>{query.data.daily.map(day => (
                  <tr key={day.date} className="border-b last:border-0">
                    <td className="py-1 pr-3">{day.date}</td>
                    <td className="py-1 pr-3">{numberOrDash(day.ldoNormL, 1)}</td>
                    <td className="py-1">{numberOrDash(day.ldoActualL, 1)}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </>
        ) : <p className="text-muted-foreground">Loading fuel comparison…</p>}
      </CardContent>
    </Card>
  );
}
