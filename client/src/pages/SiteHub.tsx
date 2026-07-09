import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  FileText, Package, ClipboardList, TrendingUp, Fuel, ShoppingCart, Boxes,
  Route, Building2, Users, BarChart2, CheckCircle2,
} from "lucide-react";
import { HubShell } from "@/components/HubShell";
import { HubActionTile } from "@/components/HubActionTile";
import { useAuth } from "@/lib/auth-context";

const TODAY = format(new Date(), "yyyy-MM-dd");
const HUB = "/site/hub";

// ── Role detection ─────────────────────────────────────────────────────────
// Determines the user's primary workspace context from their permission set.
// Priority order: Admin/Manager → Field Engineer → Site-specific access.
function useWorkspaceRole(sectionVisible: (key: string) => boolean, isAdmin: boolean, isFieldEngineer: boolean) {
  const hasDpr = sectionVisible("site_dprs");
  const hasMaterials = sectionVisible("site_materials");
  const hasProcurement = sectionVisible("site_procurement") || sectionVisible("site_diesel");

  if (isAdmin) return "admin";
  if (isFieldEngineer || hasDpr) return "engineer";
  if (hasMaterials || hasProcurement) return "site-support";
  return "viewer";
}

function KpiCard({ label, value, sub, highlight }: {
  label: string; value?: string | number; sub?: string; highlight?: "amber" | "green" | "blue";
}) {
  return (
    <div className={`bg-white rounded-xl border p-5 shadow-sm ${
      highlight === "amber" ? "border-amber-200" :
      highlight === "green" ? "border-green-200" :
      highlight === "blue" ? "border-blue-200" :
      "border-slate-200"
    }`}>
      <p className="text-sm font-medium text-slate-500 uppercase tracking-wider mb-1">{label}</p>
      <p className={`text-3xl font-bold tracking-tight ${
        highlight === "amber" ? "text-amber-700" :
        highlight === "green" ? "text-green-700" :
        highlight === "blue" ? "text-blue-700" :
        "text-slate-800"
      }`}>
        {value !== undefined ? value : <span className="text-slate-300">—</span>}
      </p>
      {sub && <p className="text-sm text-slate-400 mt-1">{sub}</p>}
    </div>
  );
}

// ── Role badge ─────────────────────────────────────────────────────────────
function RoleBadge({ role }: { role: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    "admin":        { label: "Admin / Manager",    cls: "bg-rose-50 text-rose-700 border-rose-200" },
    "engineer":     { label: "Field Engineer",     cls: "bg-amber-50 text-amber-700 border-amber-200" },
    "site-support": { label: "Site Support",       cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
    "viewer":       { label: "Viewer",             cls: "bg-slate-100 text-slate-600 border-slate-200" },
  };
  const { label, cls } = map[role] ?? map["viewer"];
  return (
    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${cls}`}>{label}</span>
  );
}

export default function SiteHub() {
  const { sectionVisible, isAdmin, isFieldEngineer } = useAuth();
  const wsRole = useWorkspaceRole(sectionVisible, isAdmin, isFieldEngineer);

  const { data: dprs = [] } = useQuery<any[]>({
    queryKey: ["/api/dprs/with-details", TODAY],
    queryFn: async () => {
      const res = await fetch(`/api/dprs/with-details?dateFrom=${TODAY}&dateTo=${TODAY}`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: sectionVisible("site_dprs"),
  });

  const activeSites = new Set(dprs.map((d: any) => d.site).filter(Boolean)).size || (dprs.length > 0 ? 1 : 0);
  const totalWorkforce = dprs.reduce((sum: number, d: any) =>
    sum + (parseInt(d.totalWorkers ?? d.manpowerCount ?? d.workforce ?? "0") || 0), 0
  );

  // ── Quick-action tiles per workspace role ──────────────────────────────
  // Engineers see DPR entry tiles prominently at the top.
  // Admins/managers see the full suite in organised groups.
  const showEngineerPrimary = wsRole === "engineer";
  const showFullSuite = wsRole === "admin" || wsRole === "site-support";

  return (
    <HubShell
      title="Site Operations"
      subtitle="Daily progress reports & site activities"
      backHref="/"
      backLabel="Dashboard"
    >
      <div className="p-6 max-w-5xl mx-auto space-y-8">

        {/* KPI ribbon */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KpiCard
            label="Active Sites"
            value={sectionVisible("site_dprs") ? activeSites : undefined}
            sub="with DPR today"
          />
          <KpiCard
            label="DPRs Filed"
            value={sectionVisible("site_dprs") ? dprs.length : undefined}
            sub="today"
            highlight={dprs.length > 0 ? "green" : "amber"}
          />
          <KpiCard
            label="Workforce"
            value={sectionVisible("site_dprs") ? (totalWorkforce > 0 ? totalWorkforce : "—") : undefined}
            sub="workers on site"
          />
          <KpiCard
            label="Date"
            value={format(new Date(), "dd MMM")}
            sub={format(new Date(), "yyyy")}
          />
        </div>

        {/* ── Engineer / Field-first primary actions ──────────── */}
        {showEngineerPrimary && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider">
                Today's Work
              </h2>
              <RoleBadge role={wsRole} />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <HubActionTile
                href="/site/dpr/road"
                icon={Route}
                title="Road Works DPR"
                description="Guided 7-step flow — chainage, activity, qty, labour, equipment, materials"
                accent="amber"
                iconBg="bg-amber-100"
                badge={dprs.length === 0 && sectionVisible("site_dprs") ? "File Today" : undefined}
                enabled={sectionVisible("site_dprs")}
              />
              <HubActionTile
                href="/site/dpr/structure"
                icon={Building2}
                title="Structure DPR"
                description="Guided flow for bridges, culverts, drains & other structures"
                accent="blue"
                iconBg="bg-blue-100"
                enabled={sectionVisible("site_dprs")}
              />
            </div>
          </div>
        )}

        {/* ── DPR filed status (engineer quick-check) ─────────── */}
        {showEngineerPrimary && dprs.length > 0 && (
          <div className="bg-green-50 border border-green-200 rounded-xl px-5 py-4 flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
            <div>
              <p className="text-sm font-semibold text-green-800">{dprs.length} DPR{dprs.length > 1 ? "s" : ""} filed today</p>
              <p className="text-xs text-green-600 mt-0.5">{dprs.map((d: any) => d.site || "—").join(", ")}</p>
            </div>
          </div>
        )}

        {/* ── Full Operations suite (admin / manager / site-support) ── */}
        {(showFullSuite || isAdmin) && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider">
                DPR Entry
              </h2>
              {!showEngineerPrimary && <RoleBadge role={wsRole} />}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <HubActionTile
                href="/site/dpr/road"
                icon={Route}
                title="Road Works DPR"
                description="Guided entry — chainage, activity, qty, labour, equipment, materials"
                accent="amber"
                iconBg="bg-amber-100"
                badge={dprs.length === 0 && sectionVisible("site_dprs") ? "Today" : undefined}
                enabled={sectionVisible("site_dprs")}
              />
              <HubActionTile
                href="/site/dpr/structure"
                icon={Building2}
                title="Structure DPR"
                description="Guided entry for bridges, culverts, drains & other structures"
                accent="blue"
                iconBg="bg-blue-100"
                enabled={sectionVisible("site_dprs")}
              />
            </div>
          </div>
        )}

        {/* ── Operations & Reports ────────────────────────────── */}
        <div>
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4">
            Reports & History
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <HubActionTile
              href={`/site/dashboard?returnTo=${HUB}`}
              icon={ClipboardList}
              title="DPR History"
              description="View, edit & track all submitted daily progress reports"
              accent="teal"
              iconBg="bg-teal-100"
              enabled={sectionVisible("site_dprs")}
            />
            <HubActionTile
              href={`/site/purchases?returnTo=${HUB}`}
              icon={TrendingUp}
              title="Site Purchases Report"
              description="Purchases, expenses & procurement analysis for the site"
              accent="rose"
              iconBg="bg-rose-100"
              enabled={sectionVisible("site_procurement")}
            />
            <HubActionTile
              href={`/site/materials-received?returnTo=${HUB}`}
              icon={BarChart2}
              title="Materials Received Report"
              description="Summary of all material receipts across date ranges"
              accent="green"
              iconBg="bg-green-100"
              enabled={sectionVisible("site_materials")}
            />
          </div>
        </div>

        {/* ── Materials & Stores ──────────────────────────────── */}
        <div>
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4">
            Materials & Stores
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <HubActionTile
              href={`/site/material-trips?returnTo=${HUB}`}
              icon={Package}
              title="Material Entry"
              description="Log incoming material receipts & deliveries to site"
              accent="emerald"
              iconBg="bg-emerald-100"
              enabled={sectionVisible("site_materials")}
            />
            <HubActionTile
              href={`/site/material-stock?returnTo=${HUB}`}
              icon={Boxes}
              title="Site Material Stock"
              description="Ordered vs delivered vs consumed — what's lying at each site"
              accent="emerald"
              iconBg="bg-emerald-100"
              enabled={sectionVisible("site_materials")}
            />
            <HubActionTile
              href="/irn/new?from=site&returnTo=/site/hub"
              icon={ClipboardList}
              title="Raise Requisition (IRN)"
              description="Request materials from stores for site operations"
              accent="indigo"
              iconBg="bg-indigo-100"
              enabled={sectionVisible("irn_raise")}
            />
          </div>
        </div>

        {/* ── Procurement ─────────────────────────────────────── */}
        <div>
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4">
            Procurement
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <HubActionTile
              href="/plant/purchase-indents?returnTo=/site/hub&from=site"
              icon={ShoppingCart}
              title="Purchase Indent"
              description="Raise and track purchase indents for site materials & requirements"
              accent="blue"
              iconBg="bg-blue-100"
              enabled={sectionVisible("site_procurement")}
            />
            <HubActionTile
              href="/plant/diesel-requirements?returnTo=/site/hub"
              icon={Fuel}
              title="Daily Diesel Requirement"
              description="Plan & approve diesel allocation for site equipment"
              accent="amber"
              iconBg="bg-amber-100"
              enabled={sectionVisible("site_diesel")}
            />
          </div>
        </div>

      </div>
    </HubShell>
  );
}
