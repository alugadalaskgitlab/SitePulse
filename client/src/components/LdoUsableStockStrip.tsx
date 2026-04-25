// Task #255 — Compact 3-card strip showing the live LDO usable-stock balance
// per physical tank, plus the combined total. Used at the top of both
// PlantLdoFlowMeter and PlantLdoLogs so operators always see the running
// balance regardless of which page they're on.

import { Card, CardContent } from "@/components/ui/card";
import { Gauge } from "lucide-react";

type AsOf = { date: string; time?: string };

interface Props {
  tank1L: number | null;
  tank2L: number | null;
  tank1AsOf?: AsOf;
  tank2AsOf?: AsOf;
}

function formatLiters(v: number | null): string {
  if (v == null) return "—";
  return `${v.toFixed(0)} L`;
}

function formatAsOf(a?: AsOf): string {
  if (!a) return "no stock entry";
  return `as of ${a.date}${a.time ? ` ${a.time}` : ""}`;
}

export function LdoUsableStockStrip({ tank1L, tank2L, tank1AsOf, tank2AsOf }: Props) {
  const totalL = tank1L == null && tank2L == null ? null : (tank1L || 0) + (tank2L || 0);
  // Compare date AND time so two same-date entries pick the later timestamp
  // for the "as of" footer (treat missing time as start of day).
  const asOfKey = (a: AsOf) => `${a.date}T${a.time || "00:00"}`;
  const totalAsOf = tank1AsOf && tank2AsOf
    ? asOfKey(tank1AsOf) >= asOfKey(tank2AsOf) ? tank1AsOf : tank2AsOf
    : tank1AsOf || tank2AsOf;

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3" data-testid="ldo-usable-stock-strip">
      <StockCard
        label="Tank 1 Balance"
        valueText={formatLiters(tank1L)}
        asOfText={formatAsOf(tank1AsOf)}
        toneClass="text-blue-700 dark:text-blue-300"
        testId="card-stock-tank1"
        valueTestId="text-stock-tank1"
      />
      <StockCard
        label="Tank 2 Balance"
        valueText={formatLiters(tank2L)}
        asOfText={formatAsOf(tank2AsOf)}
        toneClass="text-amber-700 dark:text-amber-300"
        testId="card-stock-tank2"
        valueTestId="text-stock-tank2"
      />
      <StockCard
        label="Total Usable LDO"
        valueText={formatLiters(totalL)}
        asOfText={formatAsOf(totalAsOf)}
        toneClass="text-green-700 dark:text-green-400"
        testId="card-stock-total"
        valueTestId="text-stock-total"
        emphasised
      />
    </div>
  );
}

function StockCard({
  label, valueText, asOfText, toneClass, testId, valueTestId, emphasised,
}: {
  label: string;
  valueText: string;
  asOfText: string;
  toneClass: string;
  testId: string;
  valueTestId: string;
  emphasised?: boolean;
}) {
  return (
    <Card data-testid={testId}>
      <CardContent className="py-3">
        <div className="flex items-center gap-2 mb-1">
          <Gauge className={`w-4 h-4 ${toneClass}`} />
          <span className="text-xs font-medium uppercase text-muted-foreground">{label}</span>
        </div>
        <div className={`font-bold ${emphasised ? "text-2xl" : "text-xl"} ${toneClass}`} data-testid={valueTestId}>
          {valueText}
        </div>
        <div className="text-xs text-muted-foreground mt-0.5">{asOfText}</div>
      </CardContent>
    </Card>
  );
}
