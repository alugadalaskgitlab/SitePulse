import { projectEquipmentLogEvidence, type EquipmentLogEvidence } from "./equipmentLogEvidence";

/** Small read-only secondary lines; the surrounding Description and site chip
 * stay owned by the existing row renderer. */
export default function EquipmentLogFacts({ category, evidence, rowKey }: {
  category?: string | null; evidence?: EquipmentLogEvidence | null; rowKey: string | number;
}) {
  if (category !== "equipment" || !evidence) return null;
  const { lines, consumption } = projectEquipmentLogEvidence(evidence);
  if (!lines.length && !consumption) return null;
  const n = (value: number) => value.toLocaleString("en-IN", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const deviation = (value: number) => Math.abs(value).toLocaleString("en-IN", { maximumFractionDigits: 0 });
  return <div className="space-y-0.5 whitespace-normal text-[11px] font-normal leading-relaxed text-muted-foreground tabular-nums" data-testid={`equipment-log-facts-${rowKey}`}>
    {lines.map((line, index) => <div key={index}>{line}</div>)}
    {consumption && <div data-testid={`equipment-log-consumption-${rowKey}`}>
      {n(consumption.value!)} {consumption.displayUnit} (norm {n(consumption.norm!)})
      {consumption.flag === "worse" && <span className="ml-1 font-semibold text-red-700 dark:text-red-400" aria-label="More than 10% worse than norm">▲ {deviation(consumption.deviationPct!)}%</span>}
      {consumption.flag === "better_check" && <span className="ml-1 font-semibold text-amber-700 dark:text-amber-400" aria-label="More than 10% better than norm; check readings">▼ {deviation(consumption.deviationPct!)}% check</span>}
    </div>}
  </div>;
}