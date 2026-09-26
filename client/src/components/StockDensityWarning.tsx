import React from "react";
import type { DensitySkips } from "@shared/siteMaterialStockWarnings";

export function StockDensityWarning({ skips, matched }: { skips?: DensitySkips; matched: boolean }) {
  if (!skips || !Object.values(skips).some(s => s.count > 0)) return null;
  return (
    <div role="alert" data-testid="stock-density-warning" className="mt-1 rounded border border-amber-200 bg-amber-50 p-2 text-xs font-normal text-amber-900">
      <strong>{matched ? "Missing bulk density" : "No matching material master / density unavailable"} — MT totals incomplete.</strong>
      <p>Ordered, Delivered, Consumed, To Supply and Lying at Site may be understated or misleading.</p>
      {(["ordered", "delivered", "consumed"] as const).filter(source => skips[source].count > 0).map(source => (
        <p key={source}>
          <span className="capitalize">{source}</span>: {skips[source].count} skipped {source === "consumed" ? "recipe calculations" : "records"}
          {" ("}{Object.entries(skips[source].quantities).map(([unit, qty]) => `${qty.toLocaleString("en-IN", { maximumFractionDigits: 3 })} ${unit}`).join(" + ")}{")"}
        </p>
      ))}
      <p>{matched ? "Set the verified bulk density (MT/m³) in Materials Master." : "Match this material in Materials Master and enter its verified bulk density (MT/m³)."} No density has been assumed.</p>
    </div>
  );
}