import { useState, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import {
  Settings, LayoutDashboard, LogOut,
  Menu, ChevronRight, Calculator,
  HardHat, Factory, Building2, Wrench, Package, Receipt, BarChart2,
  RefreshCw, Database, ClipboardList,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { AdminNotifications } from "@/components/AdminNotifications";
import { useAuth } from "@/lib/auth-context";
import { useFeatureFlags } from "@/lib/featureFlags";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";

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
}

export function HubShell({ children, title, subtitle, backHref, backLabel }: HubShellProps) {
  const { user, isAdmin, isManager, logout } = useAuth();
  const { rmcEnabled, companyName } = useFeatureFlags();
  const [location] = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const { toast } = useToast();

  function handleRefresh() {
    if (isRefreshing) return;
    setIsRefreshing(true);
    queryClient.invalidateQueries({}, { throwOnError: true }).then(() => {
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

  const roleLabel = isAdmin ? "Admin" : isManager ? "Manager" : "Engineer";
  const initials = user?.fullName
    ? user.fullName.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()
    : user?.email?.slice(0, 2).toUpperCase() ?? "?";

  const isHome = location === "/";

  const canSeeEstimator = isAdmin || isManager;

  const mainNavItems: NavItem[] = [
    { href: "/", icon: LayoutDashboard, label: "Dashboard" },
    { href: "/site/hub", icon: HardHat, label: "Site Operations", matchPrefix: "/site" },
    { href: "/plant/hub", icon: Factory, label: "HMP Operations", matchPrefix: "/plant" },
    ...(rmcEnabled ? [{ href: "/rmc/hub", icon: Building2, label: "RMC Operations", matchPrefix: "/rmc" }] : []),
    { href: "/equipment/hub", icon: Wrench, label: "Equipment & Fleet", matchPrefix: "/equipment" },
    { href: "/irn", icon: ClipboardList, label: "Requisitions (IRN)", matchPrefix: "/irn" },
    { href: "/stores/hub", icon: Package, label: "Stores & Inventory", matchPrefix: "/stores" },
    { href: "/finance/hub", icon: Receipt, label: "Procurement & Billing", matchPrefix: "/finance" },
    { href: "/reports/hub", icon: BarChart2, label: "Reports", matchPrefix: "/reports" },
  ];

  const bottomNavItems: NavItem[] = [
    ...(canSeeEstimator ? [{ href: "/estimator-login", icon: Calculator, label: "Estimator" }] : []),
    ...(isAdmin ? [{ href: "/masters/hub", icon: Database, label: "Masters", matchPrefix: "/masters" }] : []),
    ...(isAdmin ? [{ href: "/admin/hub", icon: Settings, label: "Settings", matchPrefix: "/admin" }] : []),
  ];

  const isNavActive = (item: NavItem) => {
    if (item.href === "/") return isHome;
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
              <p className="text-[10px] text-slate-500 leading-none mt-0.5 truncate max-w-[150px]">{companyName}</p>
            </div>
          </a>
        </Link>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto flex flex-col">
        <p className="text-[10px] font-semibold text-slate-600 uppercase tracking-wider px-3 py-2">Navigation</p>
        {mainNavItems.map((item) => {
          const active = isNavActive(item);
          return (
            <Link key={item.href} href={item.href}>
              <a
                onClick={() => setSidebarOpen(false)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  active
                    ? "bg-orange-500/15 text-orange-300 border border-orange-500/20"
                    : "text-slate-400 hover:bg-slate-800 hover:text-white"
                }`}
              >
                <item.icon className="w-4 h-4 flex-shrink-0" />
                {item.label}
              </a>
            </Link>
          );
        })}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Bottom nav items (Estimator, Settings) */}
        {bottomNavItems.length > 0 && (
          <>
            <p className="text-[10px] font-semibold text-slate-600 uppercase tracking-wider px-3 py-2 mt-2">Tools</p>
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
                        : "text-slate-400 hover:bg-slate-800 hover:text-white"
                    }`}
                  >
                    <item.icon className="w-4 h-4 flex-shrink-0" />
                    <span className="flex-1">{item.label}</span>
                    {showBadge && (
                      <span
                        data-testid="badge-masters-unassigned"
                        className="ml-auto min-w-[18px] h-[18px] px-1 rounded-full bg-amber-500 text-white text-[10px] font-bold flex items-center justify-center leading-none"
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
          <div className="w-8 h-8 bg-amber-500 rounded-full flex items-center justify-center font-bold text-xs text-white flex-shrink-0">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white truncate leading-snug">
              {user?.fullName || user?.email}
            </p>
            <p className="text-[11px] text-slate-400">{roleLabel}</p>
          </div>
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
              {subtitle && <p className="text-[11px] text-slate-500 truncate hidden sm:block">{subtitle}</p>}
            </div>
          </div>

          {/* Right side */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <Button
              variant="ghost"
              size="icon"
              onClick={handleRefresh}
              disabled={isRefreshing}
              aria-label="Refresh data"
              data-testid="button-global-refresh"
              className="text-slate-500 hover:text-slate-700 h-8 w-8"
            >
              <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
            </Button>
            <div data-testid="button-notifications">
              <AdminNotifications />
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
