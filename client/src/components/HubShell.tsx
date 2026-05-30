import { useState, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import {
  TrendingUp, Settings, LayoutDashboard, LogOut,
  Menu, ChevronRight, ListChecks,
} from "lucide-react";
import { AdminNotifications } from "@/components/AdminNotifications";
import { useAuth } from "@/lib/auth-context";

interface HubShellProps {
  children: ReactNode;
  title: string;
  subtitle?: string;
  backHref?: string;
  backLabel?: string;
}

export function HubShell({ children, title, subtitle, backHref, backLabel }: HubShellProps) {
  const { user, isAdmin, isManager, logout } = useAuth();
  const [location] = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const roleLabel = isAdmin ? "Admin" : isManager ? "Manager" : "Engineer";
  const initials = user?.fullName
    ? user.fullName.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()
    : user?.email?.slice(0, 2).toUpperCase() ?? "?";

  const isHome = location === "/";

  const navItems = [
    { href: "/", icon: LayoutDashboard, label: "Dashboard" },
    { href: "/plant/purchase-indents", icon: ListChecks, label: "Tasks" },
    { href: "/admin/settings", icon: Settings, label: "Settings" },
  ];

  const SidebarContent = () => (
    <>
      {/* Logo */}
      <div className="h-16 flex items-center px-5 border-b border-slate-800 flex-shrink-0">
        <Link href="/">
          <a className="flex items-center gap-2.5 group">
            <div className="w-8 h-8 bg-orange-500 rounded-lg flex items-center justify-center shadow group-hover:bg-orange-400 transition-colors">
              <TrendingUp className="w-4 h-4 text-white" />
            </div>
            <div>
              <span className="text-white font-bold text-base tracking-tight">SiteLog</span>
              <p className="text-[10px] text-slate-500 leading-none mt-0.5">High Lane Constructions</p>
            </div>
          </a>
        </Link>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
        <p className="text-[10px] font-semibold text-slate-600 uppercase tracking-wider px-3 py-2">Navigation</p>
        {navItems.map((item) => {
          const active = item.href === "/" ? isHome : location.startsWith(item.href);
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
