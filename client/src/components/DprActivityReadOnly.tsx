import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { calculateLengthFromChainage, dprMeasurementSummary } from "@shared/dprGeometry";
import { boqItemDisplayName, shortItemName } from "@shared/boqItemName";
import { layerDisplayName } from "@shared/layerDisplay";

type Activity = Record<string, any>;

/** A single, collapsed-by-default activity. Facts in the detail pane are historical data, not inputs. */
export function DprActivityReadOnly({
  item, index, boqItem, personnelNames, nameStyle = "boq", children,
}: {
  item: Activity;
  index: number;
  boqItem?: any;
  personnelNames?: string | null;
  nameStyle?: "boq" | "activity";
  children?: ReactNode;
}) {
  const measurement = dprMeasurementSummary(item, boqItem ?? null);
  const name = nameStyle === "activity" ? shortItemName(item.activity) || item.activity
    : boqItem ? boqItemDisplayName(boqItem) : item.activity;
  const physical = measurement.measuredQty != null
    ? `${Number(measurement.measuredQty.toFixed(3))} ${measurement.measuredUom ?? "(unit unavailable)"}`
    : "—";
  const credit = item.noSiteWork ? "—" : item.isIncidental ? "No BOQ credit" : measurement.boqQty != null
    ? `${Number(measurement.boqQty.toFixed(6))} ${measurement.boqUom ?? "(BOQ unit unavailable)"}`
    : "Needs unit review";
  const facts: Array<[string, unknown]> = [
    ["Side", item.side], ["From", item.chainageFrom], ["To", item.chainageTo],
    ["Length (m)", item.length ?? (item.chainageFrom && item.chainageTo
      ? calculateLengthFromChainage(item.chainageFrom, item.chainageTo) : null)],
    ["Width (m)", item.width], ["Thickness (m)", item.thickness],
    ["Layer / Lift", item.layerNo != null ? layerDisplayName(item.activity, item.layerNo) : null],
    ["Dimensions", measurement.dims],
    ["Recorded quantity", item.quantity != null ? `${item.quantity} ${item.uom ?? ""}`.trim() : null],
    ["Physical measurement", item.noSiteWork ? "No site work" : physical], ["BOQ credit", credit],
    ["Personnel", personnelNames || (item.personnelIds?.length ? "Names unavailable" : null)],
    ["Material outcome", item.materialOutcome?.replaceAll("_", " ")],
    ["Reusable quantity", item.reusableQty],
    ["Execution arrangement", item.earthworkArrangementId != null ? "Linked" : null],
    ["Incidental description", item.incidentalDescription],
    ["No site work description", item.noSiteWorkDescription],
  ];
  return (
    <details className="rounded-lg border border-border/70 bg-card" data-testid={`row-progress-${index}`}>
      <summary className="cursor-pointer list-none p-3 marker:hidden [&::-webkit-details-marker]:hidden">
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{nameStyle === "boq" && boqItem?.itemCode ? `${boqItem.itemCode} · ` : ""}{name}</span>
          {item.isIncidental && <Badge variant="outline">Incidental · No BOQ credit</Badge>}
          {item.noSiteWork && <Badge variant="secondary">No site work</Badge>}
          {item.linkReviewRequired && <Badge variant="outline">Programme link review required</Badge>}
          <span className="ml-auto text-xs text-muted-foreground">Details ▾</span>
        </span>
        <span className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
          <span>{item.chainageFrom || "—"} → {item.chainageTo || "—"}</span>
          <span data-testid={`text-report-physical-${index}`}>Measured: {item.noSiteWork ? "No site work" : physical}</span>
          <span data-testid={`text-boq-progress-${index}`}>BOQ: {credit}</span>
        </span>
      </summary>
      <div className="border-t p-3 text-sm">
        <dl className="grid gap-x-5 gap-y-2 sm:grid-cols-2 lg:grid-cols-4">
          {facts.map(([label, value]) => (
            <div key={label}>
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd className="break-words">{value === null || value === undefined || value === "" ? "—" : String(value)}</dd>
            </div>
          ))}
        </dl>
        {measurement.warnings.length > 0 && <p className="mt-2 text-amber-700">{measurement.warnings.join(" · ")}</p>}
        {children}
      </div>
    </details>
  );
}