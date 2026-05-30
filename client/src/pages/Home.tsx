import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  Factory, Wrench, Building2, BarChart2, HardHat,
  Settings, ArrowRight,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { HubShell } from "@/components/HubShell";
import { useAuth } from "@/lib/auth-context";
import { useFeatureFlags } from "@/lib/featureFlags";
import type { Site } from "@shared/schema";

const MODULES = [
  {
    id: "hmp",
    title: "HMP Operations",
    description: "Shift logs, heating sessions & production dispatches",
    icon: Factory,
    href: "/plant/hub",
    lightBg: "bg-orange-50",
    iconColor: "text-orange-600",
    hoverBorder: "hover:border-orange-300",
    section: "hmp" as const,
    isAdmin: false,
  },
  {
    id: "equipment",
    title: "Equipment & Fleet",
    description: "Usage logs, breakdowns & diesel tracking",
    icon: Wrench,
    href: "/equipment/hub",
    lightBg: "bg-blue-50",
    iconColor: "text-blue-600",
    hoverBorder: "hover:border-blue-300",
    section: "equipment" as const,
    isAdmin: false,
  },
  {
    id: "rmc",
    title: "RMC Operations",
    description: "Ready-mix batching, delivery challans & cube tests",
    icon: Building2,
    href: "/plant/rmc",
    lightBg: "bg-emerald-50",
    iconColor: "text-emerald-600",
    hoverBorder: "hover:border-emerald-300",
    section: "rmc" as const,
    isAdmin: false,
  },
  {
    id: "reports",
    title: "Reports & Analysis",
    description: "Production reports, stock ledgers & finance",
    icon: BarChart2,
    href: "/reports/hub",
    lightBg: "bg-purple-50",
    iconColor: "text-purple-600",
    hoverBorder: "hover:border-purple-300",
    section: "reports" as const,
    isAdmin: false,
  },
  {
    id: "site",
    title: "Site Operations",
    description: "Daily progress reports & site activities",
    icon: HardHat,
    href: "/site/hub",
    lightBg: "bg-teal-50",
    iconColor: "text-teal-600",
    hoverBorder: "hover:border-teal-300",
    section: "site" as const,
    isAdmin: false,
  },
  {
    id: "masters",
    title: "Masters & Config",
    description: "Parties, materials, equipment & personnel",
    icon: Settings,
    href: "/admin/hub",
    lightBg: "bg-slate-100",
    iconColor: "text-slate-600",
    hoverBorder: "hover:border-slate-300",
    section: "masters" as const,
    isAdmin: true,
  },
];

export default function Home() {
  const { user, sectionVisible, isAdmin } = useAuth();
  const { rmcEnabled } = useFeatureFlags();

  const { data: sites } = useQuery<Site[]>({ queryKey: ["/api/sites"] });
  const activeSite = sites?.find((s) => s.isActive !== 0) ?? sites?.[0];
  const projectName = activeSite?.name ?? "HLC Projects";

  const firstName = user?.fullName?.split(" ")[0] ?? "";

  const today = new Date().toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const canSeeHmp =
    sectionVisible("plant_shift_logs") ||
    sectionVisible("plant_heating") ||
    sectionVisible("plant_production");

  const canSeeEquipment = sectionVisible("plant_equipment");
  const canSeeRmc = rmcEnabled && sectionVisible("plant_production");

  const canSeeReports =
    sectionVisible("plant_daily_reports") ||
    sectionVisible("reports") ||
    sectionVisible("admin_settings");

  const canSeeSite =
    sectionVisible("site_dprs") ||
    sectionVisible("site_materials") ||
    sectionVisible("site_procurement") ||
    sectionVisible("site_diesel");

  const canSeeMasters = isAdmin;

  function canSeeSection(id: string) {
    switch (id) {
      case "hmp": return canSeeHmp;
      case "equipment": return canSeeEquipment;
      case "rmc": return canSeeRmc;
      case "reports": return canSeeReports;
      case "site": return canSeeSite;
      case "masters": return canSeeMasters;
      default: return false;
    }
  }

  const visibleModules = MODULES.filter((m) => canSeeSection(m.id));

  return (
    <HubShell title="Home Dashboard">
      <div className="p-6 max-w-6xl mx-auto">

        {/* Welcome banner */}
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">
            Welcome back{firstName ? `, ${firstName}` : ""}
          </h2>
          <p className="text-slate-500 mt-1 text-sm">
            {projectName} · {today}
          </p>
        </div>

        {/* Module grid */}
        <div
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5"
          data-testid="home-modules-grid"
        >
          {visibleModules.map((mod) => (
            <Link key={mod.id} href={mod.href}>
              <a
                className={`group block bg-white rounded-2xl border border-slate-200 ${mod.hoverBorder} shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden cursor-pointer`}
                data-testid={`card-${mod.id}`}
              >
                <div className="p-5 pb-4">
                  <div className="flex items-start justify-between mb-4">
                    <div
                      className={`w-12 h-12 rounded-xl flex items-center justify-center ${mod.lightBg} ${mod.iconColor} group-hover:scale-110 transition-transform duration-200`}
                    >
                      <mod.icon className="w-6 h-6" />
                    </div>
                    {mod.isAdmin && (
                      <Badge
                        variant="secondary"
                        className="bg-slate-100 text-slate-600 border-slate-200"
                      >
                        Admin
                      </Badge>
                    )}
                  </div>
                  <h3 className="text-base font-semibold text-slate-900">
                    {mod.title}
                  </h3>
                  <p className="text-sm text-slate-500 mt-1 leading-relaxed line-clamp-2">
                    {mod.description}
                  </p>
                </div>
                <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-sm font-medium text-slate-500 group-hover:text-slate-800 transition-colors">
                  <span>View Operations</span>
                  <ArrowRight className="w-4 h-4 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-200" />
                </div>
              </a>
            </Link>
          ))}
        </div>

        {visibleModules.length === 0 && (
          <div className="text-center py-20 text-slate-400">
            <p className="text-sm">No modules available. Contact an administrator.</p>
          </div>
        )}
      </div>
    </HubShell>
  );
}
