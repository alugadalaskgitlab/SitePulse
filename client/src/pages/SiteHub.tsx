import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  FileText, Package, ClipboardList, TrendingUp, Fuel, ShoppingCart, Boxes,
  Route, Building2, BarChart2, CheckCircle2, HardHat, Store, Cog,
  LayoutDashboard, Users, Truck, Wrench, Archive, Gauge, Activity,
} from "lucide-react";
import { HubShell } from "@/components/HubShell";
import { HubActionTile } from "@/components/HubActionTile";
import { useAuth } from "@/lib/auth-context";
import type { SectionKey } from "@/lib/auth-context";

const TODAY = format(new Date(), "yyyy-MM-dd");
const HUB = "/site/hub";

// ── Role detection ─────────────────────────────────────────────────────────
// Maps permission set to one of 6 workspace roles. Priority top-down.
// Uses sectionCan(key, "view") for precise gate (not sectionVisible which
// returns true for ANY action including create-only access).
function useWorkspaceRole(
  sectionCan: (k: SectionKey, a: "view") => boolean,
  isAdmin: boolean,
  isFieldEngineer: boolean,
) {
  const hasDpr      = sectionCan("site_dprs",        "view");
  const hasStores   = sectionCan("stores_inventory", "view");
  const hasPlant    = sectionCan("plant_shift_logs", "view");
  const hasMaterials = sectionCan("site_materials",  "view");

  if (isAdmin)                     return "admin"          as const;
  if (isFieldEngineer && hasDpr)   return "engineer"       as const;
  if (hasPlant && !hasDpr)         return "plant-operator" as const;
  if (hasStores && !hasDpr)        return "storekeeper"    as const;
  if (hasDpr && !isFieldEngineer)  return "pm"             as const;
  if (hasMaterials)                return "site-support"   as const;
  return "viewer"                                          as const;
}

// ── KPI card ────────────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, highlight }: {
  label: string; value?: string | number; sub?: string; highlight?: "amber" | "green" | "blue";
}) {
  return (
    <div className={`bg-white rounded-xl border p-5 shadow-sm ${
      highlight === "amber" ? "border-amber-200" :
      highlight === "green" ? "border-green-200" :
      highlight === "blue"  ? "border-blue-200"  :
      "border-slate-200"
    }`}>
      <p className="text-sm font-medium text-slate-500 uppercase tracking-wider mb-1">{label}</p>
      <p className={`text-3xl font-bold tracking-tight ${
        highlight === "amber" ? "text-amber-700" :
        highlight === "green" ? "text-green-700" :
        highlight === "blue"  ? "text-blue-700"  :
        "text-slate-800"
      }`}>
        {value !== undefined ? value : <span className="text-slate-300">—</span>}
      </p>
      {sub && <p className="text-sm text-slate-400 mt-1">{sub}</p>}
    </div>
  );
}

// ── Role badge ──────────────────────────────────────────────────────────────
function RoleBadge({ role }: { role: ReturnType<typeof useWorkspaceRole> }) {
  const map: Record<string, { label: string; cls: string }> = {
    "admin":          { label: "Admin",            cls: "bg-rose-50 text-rose-700 border-rose-200" },
    "engineer":       { label: "Field Engineer",   cls: "bg-amber-50 text-amber-700 border-amber-200" },
    "plant-operator": { label: "Plant Operator",   cls: "bg-orange-50 text-orange-700 border-orange-200" },
    "storekeeper":    { label: "Storekeeper",      cls: "bg-indigo-50 text-indigo-700 border-indigo-200" },
    "pm":             { label: "PM / Manager",     cls: "bg-blue-50 text-blue-700 border-blue-200" },
    "site-support":   { label: "Site Support",     cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
    "viewer":         { label: "Viewer",           cls: "bg-slate-100 text-slate-600 border-slate-200" },
  };
  const { label, cls } = map[role] ?? map["viewer"];
  return (
    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${cls}`}>{label}</span>
  );
}

// ── Section header ──────────────────────────────────────────────────────────
function SectionHead({ title, role, showBadge }: { title: string; role?: ReturnType<typeof useWorkspaceRole>; showBadge?: boolean }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider">{title}</h2>
      {showBadge && role && <RoleBadge role={role} />}
    </div>
  );
}

// ── Main component ──────────────────────────────────────────────────────────
export default function SiteHub() {
  const { sectionCan, isAdmin, isFieldEngineer } = useAuth();
  const wsRole = useWorkspaceRole(sectionCan as any, isAdmin, isFieldEngineer);

  // Convenience: typed sectionCan wrapper used in enabled props
  const can = (k: SectionKey) => sectionCan(k, "view");

  const { data: dprs = [] } = useQuery<any[]>({
    queryKey: ["/api/dprs/with-details", TODAY],
    queryFn: async () => {
      const res = await fetch(`/api/dprs/with-details?dateFrom=${TODAY}&dateTo=${TODAY}`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: can("site_dprs"),
  });

  const activeSites   = new Set(dprs.map((d: any) => d.site).filter(Boolean)).size || (dprs.length > 0 ? 1 : 0);
  const totalWorkforce = dprs.reduce((sum: number, d: any) =>
    sum + (parseInt(d.totalWorkers ?? d.manpowerCount ?? d.workforce ?? "0") || 0), 0,
  );

  // ─────────────────────────────────────────────────────────────────────────
  //  RENDER: choose layout branch per role
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <HubShell
      title="Site Operations"
      subtitle="Daily progress reports & site activities"
      backHref="/"
      backLabel="Dashboard"
    >
      <div className="p-6 max-w-5xl mx-auto space-y-8">

        {/* ── KPI ribbon (shown to roles that have DPR view access) ── */}
        {can("site_dprs") && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KpiCard label="Active Sites"  value={activeSites}                                          sub="with DPR today" />
            <KpiCard label="DPRs Filed"    value={dprs.length}                                          sub="today" highlight={dprs.length > 0 ? "green" : "amber"} />
            <KpiCard label="Workforce"     value={totalWorkforce > 0 ? totalWorkforce : "—"}            sub="workers on site" />
            <KpiCard label="Date"          value={format(new Date(), "dd MMM")}                         sub={format(new Date(), "yyyy")} />
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════
            FIELD ENGINEER — DPR entry first, then secondary actions
            ══════════════════════════════════════════════════════════════ */}
        {wsRole === "engineer" && (
          <>
            <div>
              <SectionHead title="Today's Work" role={wsRole} showBadge />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <HubActionTile
                  href="/site/dpr/road"
                  icon={Route}
                  title="Road Works DPR"
                  description="7-step guided flow — programme reach, activity, qty, labour, equipment, materials"
                  accent="amber" iconBg="bg-amber-100"
                  badge={dprs.length === 0 ? "File Today" : undefined}
                  enabled={can("site_dprs")}
                  data-testid="tile-road-dpr"
                />
                <HubActionTile
                  href="/site/dpr/structure"
                  icon={Building2}
                  title="Structure DPR"
                  description="Guided flow — bridges, culverts, drains & structures from schedule"
                  accent="blue" iconBg="bg-blue-100"
                  enabled={can("site_dprs")}
                  data-testid="tile-structure-dpr"
                />
              </div>
            </div>

            {dprs.length > 0 && (
              <div className="bg-green-50 border border-green-200 rounded-xl px-5 py-4 flex items-center gap-3">
                <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-green-800">{dprs.length} DPR{dprs.length > 1 ? "s" : ""} filed today</p>
                  <p className="text-xs text-green-600 mt-0.5">{dprs.map((d: any) => d.site || "—").join(", ")}</p>
                </div>
              </div>
            )}

            <div>
              <SectionHead title="Materials & Stores" />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <HubActionTile
                  href={`/site/material-trips?returnTo=${HUB}`}
                  icon={Package} title="Material Entry"
                  description="Log incoming material receipts & deliveries to site"
                  accent="emerald" iconBg="bg-emerald-100"
                  enabled={can("site_materials")}
                />
                <HubActionTile
                  href={`/site/materials-received?returnTo=${HUB}`}
                  icon={BarChart2} title="Materials Received"
                  description="View summary of all material receipts across date ranges"
                  accent="green" iconBg="bg-green-100"
                  enabled={can("site_materials")}
                />
                <HubActionTile
                  href="/irn/new?from=site&returnTo=/site/hub"
                  icon={ClipboardList} title="Raise Requisition (IRN)"
                  description="Request materials from stores for site operations"
                  accent="indigo" iconBg="bg-indigo-100"
                  enabled={can("irn_raise")}
                />
                <HubActionTile
                  href="/irn?returnTo=/site/hub"
                  icon={FileText} title="IRN List"
                  description="Track & manage all internal material requisitions"
                  accent="indigo" iconBg="bg-indigo-100"
                  enabled={can("irn_view")}
                />
              </div>
            </div>

            <div>
              <SectionHead title="Reports & Logs" />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <HubActionTile
                  href={`/site/dashboard?returnTo=${HUB}`}
                  icon={LayoutDashboard} title="Submitted DPRs"
                  description="View & review all submitted daily progress reports"
                  accent="teal" iconBg="bg-teal-100"
                  enabled={can("site_dprs")}
                />
                <HubActionTile
                  href="/plant/equipment-usage?returnTo=/site/hub"
                  icon={Activity} title="Equipment Usage"
                  description="Log and view daily equipment hours and fuel consumption"
                  accent="orange" iconBg="bg-orange-100"
                  enabled={can("plant_equipment")}
                />
                <HubActionTile
                  href={`/site/purchases?returnTo=${HUB}`}
                  icon={TrendingUp} title="Site Purchases Report"
                  description="Purchases, expenses & procurement analysis for site"
                  accent="rose" iconBg="bg-rose-100"
                  enabled={can("report_site_purchases")}
                />
              </div>
            </div>

            <div>
              <SectionHead title="Procurement" />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <HubActionTile
                  href="/plant/purchase-indents?returnTo=/site/hub&from=site"
                  icon={ShoppingCart} title="Purchase Indent"
                  description="Raise and track purchase indents for site materials"
                  accent="blue" iconBg="bg-blue-100"
                  enabled={can("site_procurement")}
                />
                <HubActionTile
                  href="/plant/diesel-requirements?returnTo=/site/hub"
                  icon={Fuel} title="Daily Diesel Requirement"
                  description="Plan & approve diesel allocation for site equipment"
                  accent="amber" iconBg="bg-amber-100"
                  enabled={can("site_diesel")}
                />
              </div>
            </div>
          </>
        )}

        {/* ══════════════════════════════════════════════════════════════
            PM / MANAGER — overview, DPR access, reports, approvals
            ══════════════════════════════════════════════════════════════ */}
        {wsRole === "pm" && (
          <>
            <div>
              <SectionHead title="DPR Entry" role={wsRole} showBadge />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <HubActionTile
                  href="/site/dpr/road"
                  icon={Route} title="Road Works DPR"
                  description="Guided road DPR with programme reach auto-fill"
                  accent="amber" iconBg="bg-amber-100"
                  badge={dprs.length === 0 ? "Today" : undefined}
                  enabled={can("site_dprs")}
                />
                <HubActionTile
                  href="/site/dpr/structure"
                  icon={Building2} title="Structure DPR"
                  description="Guided structure DPR — bridges, culverts, drains"
                  accent="blue" iconBg="bg-blue-100"
                  enabled={can("site_dprs")}
                />
              </div>
            </div>

            <div>
              <SectionHead title="Reports & Overview" />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <HubActionTile
                  href={`/site/dashboard?returnTo=${HUB}`}
                  icon={LayoutDashboard} title="DPR History"
                  description="View, review & track all submitted daily progress reports"
                  accent="teal" iconBg="bg-teal-100"
                  enabled={can("site_dprs")}
                />
                <HubActionTile
                  href={`/site/materials-received?returnTo=${HUB}`}
                  icon={BarChart2} title="Materials Received"
                  description="Summary of all material receipts across date ranges"
                  accent="green" iconBg="bg-green-100"
                  enabled={can("site_materials")}
                />
                <HubActionTile
                  href={`/site/purchases?returnTo=${HUB}`}
                  icon={TrendingUp} title="Site Purchases Report"
                  description="Purchases, expenses & procurement analysis"
                  accent="rose" iconBg="bg-rose-100"
                  enabled={can("report_site_purchases")}
                />
                <HubActionTile
                  href="/work-program"
                  icon={Activity} title="Plan vs Actual"
                  description="Work programme progress — compare planned vs achieved quantities"
                  accent="blue" iconBg="bg-blue-100"
                  enabled={can("qto_boq")}
                />
              </div>
            </div>

            <div>
              <SectionHead title="Procurement & Approvals" />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <HubActionTile
                  href="/plant/purchase-indents?returnTo=/site/hub&from=site"
                  icon={ShoppingCart} title="Purchase Indents"
                  description="Review and approve purchase indents raised by site team"
                  accent="blue" iconBg="bg-blue-100"
                  enabled={can("site_procurement")}
                />
                <HubActionTile
                  href="/irn?returnTo=/site/hub"
                  icon={ClipboardList} title="IRN Approvals"
                  description="Review and approve internal material requisition notes"
                  accent="indigo" iconBg="bg-indigo-100"
                  enabled={can("irn_approve")}
                />
                <HubActionTile
                  href="/plant/diesel-requirements?returnTo=/site/hub"
                  icon={Fuel} title="Daily Diesel Requirement"
                  description="Review & approve daily diesel allocation requests"
                  accent="amber" iconBg="bg-amber-100"
                  enabled={can("site_diesel")}
                />
              </div>
            </div>

            <div>
              <SectionHead title="Materials & Stores" />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <HubActionTile
                  href={`/site/material-trips?returnTo=${HUB}`}
                  icon={Package} title="Material Entry"
                  description="Log incoming material receipts & deliveries"
                  accent="emerald" iconBg="bg-emerald-100"
                  enabled={can("site_materials")}
                />
                <HubActionTile
                  href={`/site/material-stock?returnTo=${HUB}`}
                  icon={Boxes} title="Site Material Stock"
                  description="Ordered vs delivered vs consumed at each site"
                  accent="emerald" iconBg="bg-emerald-100"
                  enabled={can("site_materials")}
                />
              </div>
            </div>
          </>
        )}

        {/* ══════════════════════════════════════════════════════════════
            STOREKEEPER — stores, IRN, material entry, procurement
            ══════════════════════════════════════════════════════════════ */}
        {wsRole === "storekeeper" && (
          <>
            <div>
              <SectionHead title="Stores" role={wsRole} showBadge />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <HubActionTile
                  href="/stores/grns"
                  icon={Archive} title="GRN — Goods Receipt"
                  description="Log and manage inward goods receipt notes for stores"
                  accent="emerald" iconBg="bg-emerald-100"
                  badge="Primary"
                  enabled={can("stores_inventory")}
                />
                <HubActionTile
                  href="/stores/items"
                  icon={Boxes} title="Stock Items"
                  description="View current stock levels and item catalog for stores"
                  accent="teal" iconBg="bg-teal-100"
                  enabled={can("stores_inventory")}
                />
                <HubActionTile
                  href="/stores/issues"
                  icon={Package} title="Stock Issues"
                  description="Issue materials from stores against IRN or work orders"
                  accent="amber" iconBg="bg-amber-100"
                  enabled={can("stores_inventory")}
                />
              </div>
            </div>

            <div>
              <SectionHead title="Requisitions & Procurement" />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <HubActionTile
                  href="/irn/new?from=site&returnTo=/site/hub"
                  icon={ClipboardList} title="Raise Requisition (IRN)"
                  description="Request materials from stores for site operations"
                  accent="indigo" iconBg="bg-indigo-100"
                  enabled={can("irn_raise")}
                />
                <HubActionTile
                  href="/irn?returnTo=/site/hub"
                  icon={FileText} title="IRN List"
                  description="View & track all material requisition notes"
                  accent="indigo" iconBg="bg-indigo-100"
                  enabled={can("irn_view")}
                />
                <HubActionTile
                  href="/plant/purchase-indents?returnTo=/site/hub&from=site"
                  icon={ShoppingCart} title="Purchase Indent"
                  description="Raise and track purchase indents for materials"
                  accent="blue" iconBg="bg-blue-100"
                  enabled={can("site_procurement")}
                />
                <HubActionTile
                  href={`/site/purchases?returnTo=${HUB}`}
                  icon={TrendingUp} title="Site Purchases Report"
                  description="Purchases, expenses & procurement analysis"
                  accent="rose" iconBg="bg-rose-100"
                  enabled={can("report_site_purchases")}
                />
              </div>
            </div>

            <div>
              <SectionHead title="Site Materials" />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <HubActionTile
                  href={`/site/material-trips?returnTo=${HUB}`}
                  icon={Package} title="Material Entry"
                  description="Log incoming material receipts & deliveries to site"
                  accent="emerald" iconBg="bg-emerald-100"
                  enabled={can("site_materials")}
                />
                <HubActionTile
                  href={`/site/materials-received?returnTo=${HUB}`}
                  icon={BarChart2} title="Materials Received Report"
                  description="Summary of all receipts across date ranges"
                  accent="green" iconBg="bg-green-100"
                  enabled={can("site_materials")}
                />
              </div>
            </div>
          </>
        )}

        {/* ══════════════════════════════════════════════════════════════
            PLANT OPERATOR — plant-related quick links
            (navigates to Site Hub, but primary workspace is Plant Hub)
            ══════════════════════════════════════════════════════════════ */}
        {wsRole === "plant-operator" && (
          <>
            <div>
              <SectionHead title="Plant Operations" role={wsRole} showBadge />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <HubActionTile
                  href="/plant/shift-log"
                  icon={HardHat} title="Plant Shift Log"
                  description="Log today's plant shift — equipment, production, manpower"
                  accent="orange" iconBg="bg-orange-100"
                  badge="Primary"
                  enabled={can("plant_shift_logs")}
                />
                <HubActionTile
                  href="/plant/material-receipts"
                  icon={Package} title="Material Receipts"
                  description="Log incoming material deliveries to the plant"
                  accent="emerald" iconBg="bg-emerald-100"
                  enabled={can("plant_materials")}
                />
                <HubActionTile
                  href="/plant/dispatches"
                  icon={Truck} title="Dispatches"
                  description="Log mix dispatches, truck trips and production output"
                  accent="amber" iconBg="bg-amber-100"
                  enabled={can("plant_production")}
                />
                <HubActionTile
                  href="/plant/equipment-usage"
                  icon={Activity} title="Equipment Usage"
                  description="Log daily equipment hours, idle time and fuel consumption"
                  accent="orange" iconBg="bg-orange-100"
                  enabled={can("plant_equipment")}
                />
              </div>
            </div>

            <div>
              <SectionHead title="Fuel & Stocks" />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <HubActionTile
                  href="/plant/ldo-flow-meter"
                  icon={Gauge} title="LDO / Fuel Flow"
                  description="Record LDO meter readings and track diesel consumption"
                  accent="rose" iconBg="bg-rose-100"
                  enabled={can("plant_ldo")}
                />
                <HubActionTile
                  href="/plant/bitumen-stock"
                  icon={Fuel} title="Bitumen Stock"
                  description="Track bitumen receipts, usage and current stock levels"
                  accent="slate" iconBg="bg-slate-100"
                  enabled={can("plant_bitumen")}
                />
              </div>
            </div>

            <div>
              <SectionHead title="Maintenance & Reports" />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <HubActionTile
                  href="/plant/maintenance"
                  icon={Wrench} title="Maintenance / Breakdown"
                  description="Log equipment breakdowns, repairs and maintenance records"
                  accent="red" iconBg="bg-red-100"
                  enabled={can("plant_maintenance")}
                />
                <HubActionTile
                  href="/plant/daily-reports"
                  icon={FileText} title="Plant Daily Reports"
                  description="View and export daily plant production reports"
                  accent="blue" iconBg="bg-blue-100"
                  enabled={can("plant_daily_reports")}
                />
              </div>
            </div>

            <div>
              <SectionHead title="Procurement" />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <HubActionTile
                  href="/plant/purchase-indents?returnTo=/site/hub"
                  icon={ShoppingCart} title="Purchase Indent"
                  description="Raise indents for plant consumables & materials"
                  accent="blue" iconBg="bg-blue-100"
                  enabled={can("site_procurement")}
                />
                <HubActionTile
                  href="/plant/diesel-requirements?returnTo=/site/hub"
                  icon={Fuel} title="Daily Diesel Requirement"
                  description="Plan & log diesel allocation for equipment"
                  accent="amber" iconBg="bg-amber-100"
                  enabled={can("site_diesel")}
                />
              </div>
            </div>
          </>
        )}

        {/* ══════════════════════════════════════════════════════════════
            ADMIN — full suite in organised groups
            ══════════════════════════════════════════════════════════════ */}
        {wsRole === "admin" && (
          <>
            <div>
              <SectionHead title="DPR Entry" role={wsRole} showBadge />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <HubActionTile
                  href="/site/dpr/road"
                  icon={Route} title="Road Works DPR"
                  description="Guided 7-step road DPR with programme reach auto-fill"
                  accent="amber" iconBg="bg-amber-100"
                  badge={dprs.length === 0 ? "Today" : undefined}
                  enabled={can("site_dprs")}
                />
                <HubActionTile
                  href="/site/dpr/structure"
                  icon={Building2} title="Structure DPR"
                  description="Guided structure DPR — bridges, culverts & more"
                  accent="blue" iconBg="bg-blue-100"
                  enabled={can("site_dprs")}
                />
              </div>
            </div>

            <div>
              <SectionHead title="Reports & History" />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <HubActionTile
                  href={`/site/dashboard?returnTo=${HUB}`}
                  icon={LayoutDashboard} title="DPR History"
                  description="View, edit & track all submitted daily progress reports"
                  accent="teal" iconBg="bg-teal-100"
                  enabled={can("site_dprs")}
                />
                <HubActionTile
                  href={`/site/purchases?returnTo=${HUB}`}
                  icon={TrendingUp} title="Site Purchases Report"
                  description="Purchases, expenses & procurement analysis"
                  accent="rose" iconBg="bg-rose-100"
                  enabled={can("site_procurement")}
                />
                <HubActionTile
                  href={`/site/materials-received?returnTo=${HUB}`}
                  icon={BarChart2} title="Materials Received Report"
                  description="Summary of all material receipts across date ranges"
                  accent="green" iconBg="bg-green-100"
                  enabled={can("site_materials")}
                />
              </div>
            </div>

            <div>
              <SectionHead title="Materials & Stores" />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <HubActionTile
                  href={`/site/material-trips?returnTo=${HUB}`}
                  icon={Package} title="Material Entry"
                  description="Log incoming material receipts & deliveries to site"
                  accent="emerald" iconBg="bg-emerald-100"
                  enabled={can("site_materials")}
                />
                <HubActionTile
                  href={`/site/material-stock?returnTo=${HUB}`}
                  icon={Boxes} title="Site Material Stock"
                  description="Ordered vs delivered vs consumed at each site"
                  accent="emerald" iconBg="bg-emerald-100"
                  enabled={can("site_materials")}
                />
                <HubActionTile
                  href="/irn/new?from=site&returnTo=/site/hub"
                  icon={ClipboardList} title="Raise Requisition (IRN)"
                  description="Request materials from stores for site operations"
                  accent="indigo" iconBg="bg-indigo-100"
                  enabled={can("irn_raise")}
                />
                <HubActionTile
                  href="/irn?returnTo=/site/hub"
                  icon={FileText} title="IRN List"
                  description="View & manage all internal requisition notes"
                  accent="indigo" iconBg="bg-indigo-100"
                  enabled={can("irn_view")}
                />
              </div>
            </div>

            <div>
              <SectionHead title="Procurement" />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <HubActionTile
                  href="/plant/purchase-indents?returnTo=/site/hub&from=site"
                  icon={ShoppingCart} title="Purchase Indent"
                  description="Raise and track purchase indents for site materials"
                  accent="blue" iconBg="bg-blue-100"
                  enabled={can("site_procurement")}
                />
                <HubActionTile
                  href="/plant/diesel-requirements?returnTo=/site/hub"
                  icon={Fuel} title="Daily Diesel Requirement"
                  description="Plan & approve diesel allocation for site equipment"
                  accent="amber" iconBg="bg-amber-100"
                  enabled={can("site_diesel")}
                />
              </div>
            </div>
          </>
        )}

        {/* ══════════════════════════════════════════════════════════════
            SITE-SUPPORT — materials, IRN, procurement (no DPR filing)
            ══════════════════════════════════════════════════════════════ */}
        {wsRole === "site-support" && (
          <>
            <div>
              <SectionHead title="Your Workspace" role={wsRole} showBadge />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <HubActionTile
                  href={`/site/material-trips?returnTo=${HUB}`}
                  icon={Package} title="Material Entry"
                  description="Log incoming material receipts & deliveries to site"
                  accent="emerald" iconBg="bg-emerald-100"
                  badge="Primary"
                  enabled={can("site_materials")}
                />
                <HubActionTile
                  href={`/site/material-stock?returnTo=${HUB}`}
                  icon={Boxes} title="Site Material Stock"
                  description="Current material stock levels at each site"
                  accent="emerald" iconBg="bg-emerald-100"
                  enabled={can("site_materials")}
                />
                <HubActionTile
                  href={`/site/materials-received?returnTo=${HUB}`}
                  icon={BarChart2} title="Materials Received Report"
                  description="Summary of all material receipts across date ranges"
                  accent="green" iconBg="bg-green-100"
                  enabled={can("site_materials")}
                />
                <HubActionTile
                  href="/irn/new?from=site&returnTo=/site/hub"
                  icon={ClipboardList} title="Raise Requisition (IRN)"
                  description="Request materials from stores for site operations"
                  accent="indigo" iconBg="bg-indigo-100"
                  enabled={can("irn_raise")}
                />
                <HubActionTile
                  href="/plant/purchase-indents?returnTo=/site/hub&from=site"
                  icon={ShoppingCart} title="Purchase Indent"
                  description="Raise and track purchase indents for site materials"
                  accent="blue" iconBg="bg-blue-100"
                  enabled={can("site_procurement")}
                />
                <HubActionTile
                  href="/plant/diesel-requirements?returnTo=/site/hub"
                  icon={Fuel} title="Daily Diesel Requirement"
                  description="Plan & approve diesel allocation for equipment"
                  accent="amber" iconBg="bg-amber-100"
                  enabled={can("site_diesel")}
                />
              </div>
            </div>
          </>
        )}

        {/* ══════════════════════════════════════════════════════════════
            VIEWER — read-only links to reports
            ══════════════════════════════════════════════════════════════ */}
        {wsRole === "viewer" && (
          <div>
            <SectionHead title="Reports" role={wsRole} showBadge />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <HubActionTile
                href={`/site/dashboard?returnTo=${HUB}`}
                icon={LayoutDashboard} title="DPR History"
                description="View submitted daily progress reports"
                accent="teal" iconBg="bg-teal-100"
                enabled={can("site_dprs")}
              />
              <HubActionTile
                href={`/site/materials-received?returnTo=${HUB}`}
                icon={BarChart2} title="Materials Received"
                description="Summary of material receipts"
                accent="green" iconBg="bg-green-100"
                enabled={can("site_materials")}
              />
            </div>
            {!can("site_dprs") && !can("site_materials") && (
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-6 text-center mt-4">
                <Users className="w-8 h-8 text-slate-300 mx-auto mb-3" />
                <p className="text-sm font-medium text-slate-500">No site modules are enabled for your account.</p>
                <p className="text-xs text-slate-400 mt-1">Contact your administrator to request access.</p>
              </div>
            )}
          </div>
        )}

      </div>
    </HubShell>
  );
}
