import { dprMeasurementSummary } from "@shared/dprGeometry";
import { shortItemName } from "@shared/boqItemName";
import { summarizeReceived, type ReceivedEntry } from "@/lib/materialUnloadingSummary";

export const managementNumber = (value: unknown, decimals = 2): string =>
  value == null || value === "" || !Number.isFinite(Number(value)) ? "—"
    : Number(value).toLocaleString("en-IN", { maximumFractionDigits: decimals });

export const DPR_CONSUMPTION_LEGEND = "Consumption from tank dip (opening + issued − closing). ▲ more than 10% above norm · ▼ check more than 10% below (often a missed diesel entry) · no mark = within 10%.";

/** Recorded facts only; no operational calculation or unit conversion is performed here. */
export function managementQuantity(item: Record<string, any>, boqItem?: any) {
  // Structure items persist the row override under dprConversionFactor.
  // Keep that historical override for both report and shared summary display.
  const measurement = dprMeasurementSummary({
    ...item, rowConversionFactor: item.rowConversionFactor ?? item.dprConversionFactor,
  }, boqItem ?? null);
  const quantity = item.quantity ?? measurement.measuredQty;
  const unit = item.uom ?? measurement.measuredUom;
  const text = item.noSiteWork ? "No site work" : `${managementNumber(quantity)} ${unit ?? ""}`.trim();
  const differs = measurement.boqQty != null && quantity != null &&
    (Math.abs(Number(quantity) - measurement.boqQty) > 1e-6 ||
      String(unit ?? "").trim().toLowerCase() !== String(measurement.boqUom ?? "").trim().toLowerCase());
  const note = item.noSiteWork || item.isIncidental ? null : measurement.boqQty == null
    ? "unit review needed" : differs ? `BOQ credit ${managementNumber(measurement.boqQty)} ${measurement.boqUom ?? ""}`.trim() : null;
  return { text, note, measurement };
}

export function buildManagementShare(dpr: any, equipment: any[], receipts: ReceivedEntry[], boqItems: any[] = []) {
  const activities = dpr.workType === "structure" ? dpr.structureItems ?? [] : dpr.progress ?? [];
  const work = activities.filter((item: any) => !item.noSiteWork).map((item: any) =>
    `${shortItemName(item.activity ?? item.itemOfWork) || item.activity || item.itemOfWork}: ${managementQuantity(item, boqItems.find(b => b.id === item.boqItemId)).text}`);
  const working = equipment.filter(e => e.usageStatus === "working").length;
  const idle = equipment.filter(e => e.usageStatus === "idle_no_work" || e.usageStatus === "idle_no_operator").length;
  const breakdown = equipment.filter(e => e.usageStatus === "breakdown").length;
  const unspecified = equipment.length - working - idle - breakdown;
  const diesel = equipment.reduce((sum, e) => sum + (Number(e.diesel) || 0), 0);
  const labour = (dpr.labour ?? []).reduce((sum: number, l: any) => sum + (Number(l.count) || 0), 0);
  const bulk = summarizeReceived(receipts).map(g => `${managementNumber(g.totalQty)} ${g.uom} ${g.material}`).join("; ");
  return [`${dpr.site} · ${dpr.date} · DPR #${dpr.id}`,
    `Work done: ${work.join("; ") || "No site work"}`,
    `Machines: ${working}/${equipment.length} working · ${idle} idle · ${breakdown} breakdown${unspecified ? ` · ${unspecified} not specified` : ""}`,
    `Diesel issued: ${managementNumber(diesel, 1)} L`, `Labour: ${labour}`,
    `Bulk received: ${bulk || "none recorded"}`, `Remarks: ${dpr.remarks?.trim() || "none recorded"}`].join("\n");
}

export async function shareManagementReport(text: string): Promise<"shared" | "copied" | "cancelled"> {
  if (typeof navigator.share === "function") {
    try { await navigator.share({ text }); return "shared"; }
    catch (error) { if (error instanceof Error && error.name === "AbortError") return "cancelled"; }
  }
  const popup = window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
  // noopener browsers may return null even when opening succeeds; copying is a safe fallback.
  if (popup) return "shared";
  if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); return "copied"; }
  const field = document.createElement("textarea");
  field.value = text; field.style.position = "fixed"; field.style.opacity = "0";
  document.body.appendChild(field); field.select();
  try { if (!document.execCommand("copy")) throw new Error("Copy unavailable; select and copy the summary."); }
  finally { field.remove(); }
  return "copied";
}