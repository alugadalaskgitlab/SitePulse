import type { DprActualEfficiency } from "@/lib/dprEquipmentEfficiency";

const rate = (value: number) => value > 0 && value < 0.000001
  ? value.toPrecision(3)
  : value.toLocaleString("en-IN", { minimumFractionDigits: 3, maximumFractionDigits: 6 });

export function DprEquipmentEfficiency({ norm, normUnit, actual, index }: {
  norm: number | null;
  normUnit: string;
  actual: DprActualEfficiency;
  index: number;
}) {
  return <div className="space-y-1 whitespace-normal" data-testid={`equipment-table-efficiency-${index}`}>
    <div><span className="font-medium">Norm: </span>
      {norm != null && Number.isFinite(norm) ? `${norm.toFixed(3)}${normUnit ? ` ${normUnit}` : ""}` : "—"}
    </div>
    <div><span className="font-medium">Actual: </span>
      {actual.state === "available" ? `${rate(actual.rate)} ${actual.unit}`
        : actual.state === "unavailable" ? `unavailable (${actual.reason})` : actual.reason}
    </div>
    {actual.state === "available" && <p className="text-xs text-muted-foreground">
      {actual.provenance}
    </p>}
  </div>;
}