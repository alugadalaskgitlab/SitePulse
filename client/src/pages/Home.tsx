import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  HardHat, Factory, Package, BarChart3, Settings, LogOut,
  TrendingUp, Building2, ArrowUpRight, Calendar,
} from "lucide-react";
import { AdminNotifications } from "@/components/AdminNotifications";
import { useAuth } from "@/lib/auth-context";
import { useFeatureFlags } from "@/lib/featureFlags";
import type { Site } from "@shared/schema";

export default function Home() {
  const { user, sectionVisible, logout, isAdmin, isManager } = useAuth();
  const { rmcEnabled } = useFeatureFlags();

  const { data: sites } = useQuery<Site[]>({ queryKey: ["/api/sites"] });
  const activeSite = sites?.find((s) => s.isActive !== 0) ?? sites?.[0];

  const roleLabel = isAdmin ? "Admin" : isManager ? "Manager" : "Engineer";
  const initials = user?.fullName
    ? user.fullName.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()
    : user?.email?.slice(0, 2).toUpperCase() ?? "?";

  // ── Visibility guards ──────────────────────────────────────────────────────
  const canSeeSite =
    sectionVisible("site_dprs") ||
    sectionVisible("site_materials") ||
    sectionVisible("site_procurement") ||
    sectionVisible("site_diesel");

  const canSeeHmp =
    sectionVisible("plant_shift_logs") ||
    sectionVisible("plant_heating") ||
    sectionVisible("plant_production");

  const canSeeRmc =
    rmcEnabled &&
    (sectionVisible("plant_production") || sectionVisible("plant_materials"));

  const canSeeStores = sectionVisible("stores_inventory");

  const canSeeReports =
    sectionVisible("plant_daily_reports") || sectionVisible("reports");

  const canSeeEstimates = sectionVisible("admin_settings");
  const canSeeAdmin = sectionVisible("admin_settings");

  // ── Module card definitions ────────────────────────────────────────────────
  const modules = [
    {
      id: "site",
      show: canSeeSite,
      href: "/site",
      label: "Site Operations",
      description: "Daily progress reports, labour, equipment & material entries",
      icon: HardHat,
      accent: "from-amber-600 to-amber-500",
      iconBg: "bg-amber-500/20",
      borderHover: "hover:border-amber-500/50",
    },
    {
      id: "hmp",
      show: canSeeHmp,
      href: "/plant/dashboard",
      label: "HMP Operations",
      description: "Shift logs, heating sessions, production dispatches & LDO tracking",
      icon: Factory,
      accent: "from-yellow-600 to-yellow-500",
      iconBg: "bg-yellow-500/20",
      borderHover: "hover:border-yellow-500/50",
    },
    {
      id: "rmc",
      show: canSeeRmc,
      href: "/plant/rmc",
      label: "RMC Operations",
      description: "Ready-mix dispatches, delivery challans & cube test QC",
      icon: Building2,
      accent: "from-teal-600 to-teal-500",
      iconBg: "bg-teal-500/20",
      borderHover: "hover:border-teal-500/50",
    },
    {
      id: "stores",
      show: canSeeStores,
      href: "/stores",
      label: "Stores & Materials",
      description: "Inventory, GRN receipts, stock ledger & item master management",
      icon: Package,
      accent: "from-orange-600 to-orange-500",
      iconBg: "bg-orange-500/20",
      borderHover: "hover:border-orange-500/50",
    },
    {
      id: "reports",
      show: canSeeReports,
      href: sectionVisible("plant_daily_reports") ? "/plant/daily-reports" : "/admin/reports",
      label: "Reports & Analysis",
      description: "Plant daily reports, heating trends, RMC summaries & historical data",
      icon: BarChart3,
      accent: "from-blue-600 to-blue-500",
      iconBg: "bg-blue-500/20",
      borderHover: "hover:border-blue-500/50",
    },
    {
      id: "estimates",
      show: canSeeEstimates,
      href: "/estimator-login",
      label: "Estimates Manager",
      description: "Bituminous mix rate calculator, concrete BOQ analysis & saved estimates",
      icon: TrendingUp,
      accent: "from-violet-600 to-violet-500",
      iconBg: "bg-violet-500/20",
      borderHover: "hover:border-violet-500/50",
    },
    {
      id: "admin",
      show: canSeeAdmin,
      href: "/admin/settings",
      label: "App Management",
      description: "User accounts, device approvals, permissions, plant config & data sync",
      icon: Settings,
      accent: "from-slate-600 to-slate-500",
      iconBg: "bg-slate-500/20",
      borderHover: "hover:border-slate-500/50",
    },
  ].filter((m) => m.show);

  const today = new Date().toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col text-white">

      {/* ── Header ── */}
      <header className="bg-slate-900 border-b border-slate-800 px-4 md:px-6 py-3 flex items-center gap-3">
        <div className="flex items-center gap-2.5 flex-1 min-w-0">
          <div className="w-7 h-7 bg-amber-500 rounded-lg flex items-center justify-center shrink-0 shadow">
            <TrendingUp className="w-4 h-4 text-white" />
          </div>
          <div className="min-w-0">
            <span className="font-bold text-sm tracking-tight">SiteLog</span>
            <span className="hidden sm:inline text-slate-500 text-sm mx-1.5">·</span>
            <span className="hidden sm:inline text-slate-400 text-xs truncate">
              High Lane Constructions Pvt Ltd
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {/* Bell + admin notifications — AdminNotifications renders its own trigger */}
          <div data-testid="button-notifications">
            <AdminNotifications />
          </div>

          {/* User chip */}
          <div className="flex items-center gap-2 px-2.5 py-1.5 bg-slate-800 rounded-lg">
            <div className="w-7 h-7 bg-amber-500 rounded-full flex items-center justify-center font-bold text-xs shrink-0" data-testid="text-current-user">
              {initials}
            </div>
            <div className="text-left hidden sm:block">
              <p className="text-xs font-semibold leading-tight truncate max-w-[120px]">
                {user?.fullName || user?.email}
              </p>
              <p className="text-[10px] text-slate-400">{roleLabel}</p>
            </div>
          </div>

          {/* Sign out */}
          <button
            onClick={() => { void logout(); }}
            title="Sign out"
            className="p-2 hover:bg-slate-800 rounded-lg transition-colors text-slate-500 hover:text-red-400"
            data-testid="button-logout"
          >
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </header>

      {/* ── Project Banner ── */}
      {activeSite && (
        <div className="bg-gradient-to-r from-slate-900 via-slate-800/80 to-slate-900 border-b border-slate-800 px-4 md:px-6 py-2.5">
          <div className="max-w-5xl mx-auto flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold text-amber-400 uppercase tracking-wider leading-none mb-0.5">
                Active Project
              </p>
              <p className="text-sm font-bold text-white truncate">{activeSite.name}</p>
            </div>
            <p className="text-xs text-slate-500 flex items-center gap-1.5 shrink-0">
              <Calendar className="w-3 h-3" />
              {today}
            </p>
          </div>
        </div>
      )}

      {/* ── Module Grid ── */}
      <div className="flex-1 px-4 md:px-6 py-8">
        <div className="max-w-5xl mx-auto">
          <div className="mb-6">
            <h2 className="text-base font-semibold text-slate-200">
              Welcome back{user?.fullName ? `, ${user.fullName.split(" ")[0]}` : ""}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {modules.length} module{modules.length !== 1 ? "s" : ""} available
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4" data-testid="home-modules-grid">
            {modules.map((mod) => (
              <Link key={mod.id} href={mod.href}>
                <a
                  className={`group block text-left rounded-2xl overflow-hidden border border-slate-800 ${mod.borderHover} bg-slate-900 transition-all duration-200 hover:shadow-xl hover:-translate-y-0.5`}
                  data-testid={`card-${mod.id}`}
                >
                  {/* Gradient header strip */}
                  <div className={`bg-gradient-to-br ${mod.accent} px-4 pt-4 pb-5`}>
                    <div className="flex items-start justify-between">
                      <div className={`w-10 h-10 ${mod.iconBg} rounded-xl border border-white/20 flex items-center justify-center`}>
                        <mod.icon className="w-5 h-5 text-white" />
                      </div>
                      <ArrowUpRight className="w-4 h-4 text-white/50 mt-0.5 transition-all duration-200 group-hover:text-white/90 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                    </div>
                  </div>

                  {/* Label + description */}
                  <div className="px-4 py-3">
                    <h3 className="font-bold text-sm text-slate-100 leading-snug">{mod.label}</h3>
                    <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">{mod.description}</p>
                  </div>
                </a>
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* ── Footer ── */}
      <div className="border-t border-slate-800/60 px-4 md:px-6 py-3">
        <div className="max-w-5xl mx-auto text-center text-[10px] text-slate-700">
          SiteLog · High Lane Constructions Pvt Ltd · Each card is shown only to users with the required permission
        </div>
      </div>
    </div>
  );
}
