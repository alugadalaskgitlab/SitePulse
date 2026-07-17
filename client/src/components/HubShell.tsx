import { useState, useRef, useEffect, type ReactNode } from "react";
import { Link, useLocation, useSearch } from "wouter";
import {
  Settings, LayoutDashboard, LogOut,
  Menu, ChevronRight, Calculator,
  HardHat, Factory, Building2, Wrench, Package, Receipt, BarChart2,
  RefreshCw, Database, ClipboardList, FileSpreadsheet, BookOpen, ChevronUp, ShieldCheck,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { AdminNotifications } from "@/components/AdminNotifications";
import { useAuth } from "@/lib/auth-context";
import { useFeatureFlags } from "@/lib/featureFlags";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";

const WP_ENABLED = import.meta.env.VITE_ENABLE_WORK_PROGRAM === "true";

interface HubShellProps {
  children: ReactNode;
  title?: string;
  subtitle?: string;
  backHref?: string;
  backLabel?: string;
}

interface NavItem {
  href: string;
  icon: React.ElementType;
  label: string;
  matchPrefix?: string;
  contextKey?: string;
}

export function HubShell({ children, title, subtitle, backHref, backLabel }: HubShellProps) {
  const { user, isAdmin, isManager, isFieldEngineer, logout, sectionVisible } = useAuth();
  const { rmcEnabled, companyName, moduleAllowed } = useFeatureFlags();
  const [location] = useLocation();
  const searchString = useSearch();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const mainRef = useRef<HTMLElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    const el = mainRef.current;
    if (!el) return;
    const onScroll = () => setShowScrollTop(el.scrollTop > 300);
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  function handleRefresh() {
    if (isRefreshing) return;
    setIsRefreshing(true);
    queryClient.invalidateQueries({}).then(() => {
      toast({ description: "Data refreshed", duration: 2000 });
    }).catch(() => {}).finally(() => {
      setTimeout(() => setIsRefreshing(false), 600);
    });
  }

  const { data: unassignedData } = useQuery<{
    dieselRequirements: unknown[];
    purchaseIndents: unknown[];
  }>({
    queryKey: ["/api/admin/site-backfill/unassigned"],
    enabled: isAdmin,
  });
  const unassignedCount = isAdmin
    ? (unassignedData?.dieselRequirements?.length ?? 0) + (unassignedData?.purchaseIndents?.length ?? 0)
    : 0;

  const canSeeIrn = sectionVisible("irn_view") || sectionVisible("irn_raise");

  const { data: pendingEditRequests } = useQuery<unknown[]>({
    queryKey: ["/api/edit-requests/pending"],
    queryFn: async () => {
      const res = await fetch("/api/edit-requests/pending", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: isAdmin,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
  const pendingEditCount = isAdmin ? (pendingEditRequests?.length ?? 0) : 0;

  const { data: pendingIrns } = useQuery<unknown[]>({
    queryKey: ["/api/irn", "pending_stores"],
    queryFn: async () => {
      const res = await fetch("/api/irn?status=pending_stores", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: canSeeIrn,
    staleTime: 60_000,
  });
  const pendingIrnCount = pendingIrns?.length ?? 0;

  // Task #1247 — isManager is true for every non-admin authenticated user
  // (see auth-context.tsx), so the old `isManager ? "Manager" : "Engineer"`
  // branch never actually resolved to "Engineer". Use the explicit
  // isFieldEngineer flag for the label instead.
  const roleLabel = isAdmin ? "Admin" : isFieldEngineer ? "Engineer" : "Manager";
  const initials = user?.fullName
    ? user.fullName.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()
    : user?.email?.slice(0, 2).toUpperCase() ?? "?";

  const isHome = location === "/";

  // Task #1248 — canSeeEstimator was previously `isAdmin || isManager`, and
  // since isManager is true for every non-admin user this exposed the
  // Estimator/mix/concrete/QTO/rate-card modules to everyone regardless of
  // actual permissions. Gate on the real permission section keys instead so
  // only users explicitly granted access to one of the calculator modules
  // see the nav entry.
  const canSeeEstimator = isAdmin || (
    sectionVisible("estimator_portal") ||
    sectionVisible("mix_calculator") ||
    sectionVisible("concrete_calculator") ||
    sectionVisible("qto_boq") ||
    sectionVisible("rate_cards")
  );

  const mainNavItems: NavItem[] = [
    { href: "/", icon: LayoutDashboard, label: "Dashboard" },
    ...(sectionVisible("site_hub") || isAdmin ? [{ href: "/site/hub", icon: HardHat, label: "Site Operations", matchPrefix: "/site" }] : []),
    ...(moduleAllowed("hmp") ? [{ href: "/plant/hub", icon: Factory, label: "HMP Operations", matchPrefix: "/plant", contextKey: "hmp" }] : []),
    ...(rmcEnabled && moduleAllowed("rmc") ? [{ href: "/rmc/hub", icon: Building2, label: "RMC Operations", matchPrefix: "/rmc", contextKey: "rmc" }] : []),
    ...(sectionVisible("equipment_hub") || isAdmin ? [{ href: "/equipment/hub", icon: Wrench, label: "Equipment & Fleet", matchPrefix: "/equipment", contextKey: "equipment" }] : []),
    ...(sectionVisible("stores_hub") || isAdmin ? [{ href: "/stores/hub", icon: Package, label: "Stores & Inventory", matchPrefix: "/stores", contextKey: "stores" }] : []),
    ...(sectionVisible("finance_hub") || isAdmin ? [{ href: "/finance/hub", icon: Receipt, label: "Procurement & Billing", matchPrefix: "/finance" }] : []),
    ...(canSeeIrn ? [{ href: "/irn", icon: ClipboardList, label: "Requisitions", matchPrefix: "/irn" }] : []),
    ...(WP_ENABLED && (sectionVisible("qto_boq") || isAdmin) ? [{ href: "/work-program", icon: FileSpreadsheet, label: "Work Program & BOQ", matchPrefix: "/work-program" }] : []),
    ...(WP_ENABLED && (sectionVisible("qto_boq") || isAdmin) ? [{ href: "/norms", icon: BookOpen, label: "Norms Library (SNL)", matchPrefix: "/norms" }] : []),
    ...(sectionVisible("reports_hub") || isAdmin ? [{ href: "/reports/hub", icon: BarChart2, label: "Reports", matchPrefix: "/reports" }] : []),
    ...(isAdmin ? [{ href: "/edit-requests", icon: ShieldCheck, label: "Edit Requests", matchPrefix: "/edit-requests" }] : []),
  ];

  const bottomNavItems: NavItem[] = [
    ...(canSeeEstimator ? [{ href: "/estimator-login", icon: Calculator, label: "Estimator" }] : []),
    ...(isAdmin ? [{ href: "/masters/hub", icon: Database, label: "Masters", matchPrefix: "/masters" }] : []),
    ...(isAdmin ? [{ href: "/admin/hub", icon: Settings, label: "Settings", matchPrefix: "/admin" }] : []),
  ];

  // Some pages (e.g. shared plant/equipment usage & material pages) are reachable
  // from more than one hub and live under a route prefix that doesn't match the
  // hub they were opened from (e.g. /plant/equipment-usage opened from the
  // Equipment & Fleet hub). Those links append a `?context=<contextKey>` param
  // so the sidebar highlights the hub the user actually navigated from instead
  // of guessing from the URL prefix alone.
  const activeContext = new URLSearchParams(searchString).get("context");

  const isNavActive = (item: NavItem) => {
    if (item.href === "/") return isHome;
    if (activeContext) {
      const anyItemMatchesContext = mainNavItems.some((i) => i.contextKey === activeContext);
      if (anyItemMatchesContext) return item.contextKey === activeContext;
    }
    // /plant/rmc/* routes belong to RMC Operations — must be tested before the
    // generic /plant prefix so they don't accidentally highlight HMP Operations.
    if (location.startsWith("/plant/rmc")) return item.contextKey === "rmc";
    if (item.matchPrefix) return location.startsWith(item.matchPrefix);
    return location.startsWith(item.href);
  };

  const SidebarContent = () => (
    <>
      {/* Logo */}
      <div className="h-16 flex items-center px-4 border-b border-slate-800 flex-shrink-0">
        <Link href="/">
          <a className="flex items-center gap-2.5 group min-w-0">
            <img src="/sitepulse-logo.png" alt="SitePulse" className="w-8 h-8 object-contain rounded flex-shrink-0" />
            <div className="min-w-0">
              <div className="flex items-baseline gap-0 leading-none">
                <span className="font-black text-sm tracking-tight text-white">Site</span>
                <span className="font-black text-sm tracking-tight text-orange-400">Pulse</span>
              </div>
              <p className="text-[12px] text-slate-400 leading-none mt-0.5 truncate max-w-[150px]">{companyName}</p>
            </div>
          </a>
        </Link>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto flex flex-col">
        <p className="text-[12px] font-semibold text-slate-400 uppercase tracking-wider px-3 py-2">Navigation</p>
        {mainNavItems.map((item) => {
          const active = isNavActive(item);
          const showUnassignedBadge = item.href === "/" && unassignedCount > 0;
          const showIrnBadge = item.href === "/irn" && pendingIrnCount > 0;
          const showEditBadge = item.href === "/edit-requests" && pendingEditCount > 0;
          return (
            <Link key={item.href} href={item.href}>
              <a
                onClick={() => setSidebarOpen(false)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  active
                    ? "bg-orange-500/15 text-orange-300 border border-orange-500/20"
                    : "text-slate-300 hover:bg-slate-800 hover:text-white"
                }`}
              >
                <item.icon className="w-4 h-4 flex-shrink-0" />
                <span className="flex-1">{item.label}</span>
                {showUnassignedBadge && (
                  <span
                    data-testid="badge-dashboard-unassigned"
                    className="ml-auto min-w-[18px] h-[18px] px-1 rounded-full bg-amber-500 text-white text-[12px] font-bold flex items-center justify-center leading-none"
                  >
                    {unassignedCount}
                  </span>
                )}
                {showIrnBadge && (
                  <span
                    data-testid="badge-irn-pending"
                    className="ml-auto min-w-[18px] h-[18px] px-1 rounded-full bg-amber-500 text-white text-[12px] font-bold flex items-center justify-center leading-none"
                  >
                    {pendingIrnCount}
                  </span>
                )}
                {showEditBadge && (
                  <span
                    data-testid="badge-edit-requests-pending"
                    className="ml-auto min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[12px] font-bold flex items-center justify-center leading-none"
                  >
                    {pendingEditCount}
                  </span>
                )}
              </a>
            </Link>
          );
        })}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Bottom nav items (Estimator, Settings) */}
        {bottomNavItems.length > 0 && (
          <>
            <p className="text-[12px] font-semibold text-slate-400 uppercase tracking-wider px-3 py-2 mt-2">Tools</p>
            {bottomNavItems.map((item) => {
              const active = isNavActive(item);
              const showBadge = item.href === "/masters/hub" && unassignedCount > 0;
              return (
                <Link key={item.href} href={item.href}>
                  <a
                    onClick={() => setSidebarOpen(false)}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                      active
                        ? "bg-orange-500/15 text-orange-300 border border-orange-500/20"
                        : "text-slate-300 hover:bg-slate-800 hover:text-white"
                    }`}
                  >
                    <item.icon className="w-4 h-4 flex-shrink-0" />
                    <span className="flex-1">{item.label}</span>
                    {showBadge && (
                      <span
                        data-testid="badge-masters-unassigned"
                        className="ml-auto min-w-[18px] h-[18px] px-1 rounded-full bg-amber-500 text-white text-[12px] font-bold flex items-center justify-center leading-none"
                      >
                        {unassignedCount}
                      </span>
                    )}
                  </a>
                </Link>
              );
            })}
          </>
        )}
      </nav>

      {/* User chip */}
      <div className="border-t border-slate-800 p-3 flex-shrink-0">
        <div className="flex items-center gap-2.5 px-2 py-2">
          <Link href="/account">
            <a
              className="flex items-center gap-2.5 flex-1 min-w-0 hover:opacity-80 transition-opacity"
              data-testid="link-account"
            >
              <div className="w-8 h-8 bg-amber-500 rounded-full flex items-center justify-center font-bold text-sm text-white flex-shrink-0">
                {initials}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white truncate leading-snug">
                  {user?.fullName || user?.email}
                </p>
                <p className="text-xs text-slate-400">{roleLabel}</p>
              </div>
            </a>
          </Link>
          <button
            onClick={() => { void logout(); }}
            title="Sign out"
            className="p-1.5 hover:bg-slate-800 rounded-md transition-colors text-slate-500 hover:text-red-400 flex-shrink-0"
            data-testid="button-logout"
          >
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Sidebar — desktop */}
      <aside className="w-56 bg-slate-900 flex-shrink-0 hidden md:flex flex-col border-r border-slate-800 fixed inset-y-0 left-0 z-30">
        <SidebarContent />
      </aside>

      {/* Sidebar — mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-56 bg-slate-900 flex flex-col border-r border-slate-800 transition-transform duration-200 md:hidden ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <SidebarContent />
      </aside>

      {/* Main content — offset for desktop sidebar */}
      <div className="flex-1 flex flex-col md:pl-56 min-h-screen">
        {/* Top header */}
        <header className="h-14 bg-white border-b border-slate-200 flex items-center px-4 md:px-6 gap-3 sticky top-0 z-20 shadow-sm">
          {/* Mobile menu button */}
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-1.5 rounded-md hover:bg-slate-100 text-slate-500 md:hidden"
            data-testid="button-menu"
          >
            <Menu className="w-5 h-5" />
          </button>

          {/* Breadcrumb */}
          <div className="flex items-center gap-2 flex-1 min-w-0">
            {backHref && (
              <>
                <Link href={backHref}>
                  <a className="text-sm text-slate-400 hover:text-slate-600 transition-colors hidden sm:block">
                    {backLabel ?? "Dashboard"}
                  </a>
                </Link>
                <ChevronRight className="w-3.5 h-3.5 text-slate-300 hidden sm:block flex-shrink-0" />
              </>
            )}
            <div className="min-w-0">
              <h1 className="text-base font-semibold text-slate-800 truncate">{title}</h1>
              {subtitle && <p className="text-xs text-slate-500 truncate hidden sm:block">{subtitle}</p>}
            </div>
          </div>

          {/* Right side */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              aria-label="Refresh data"
              data-testid="button-global-refresh"
              title="Refresh data"
              className="flex items-center gap-1.5 h-8 px-2 rounded-md border border-slate-200 bg-white hover:bg-slate-50 text-slate-500 hover:text-slate-700 transition-colors disabled:opacity-50 shadow-sm"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
              <span className="text-xs font-medium hidden sm:inline">Refresh</span>
            </button>
            <div data-testid="button-notifications">
              <AdminNotifications />
            </div>
          </div>
        </header>

        {/* Page content */}
        <main ref={mainRef} className="flex-1 overflow-auto relative">
          {children}
          {showScrollTop && (
            <button
              onClick={() => mainRef.current?.scrollTo({ top: 0, behavior: "smooth" })}
              className="fixed bottom-6 right-6 z-50 flex items-center justify-center w-10 h-10 rounded-full bg-slate-700 hover:bg-slate-600 text-white shadow-lg transition-all duration-200"
              aria-label="Scroll to top"
              data-testid="button-scroll-to-top"
            >
              <ChevronUp className="w-5 h-5" />
            </button>
          )}
        </main>
      </div>
    </div>
  );
}
