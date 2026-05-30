import { Link } from "wouter";
import {
  Users, Package, Receipt, Settings,
  RefreshCw, TrendingUp, ChevronRight, Shield,
} from "lucide-react";
import { HubShell } from "@/components/HubShell";
import { useAuth } from "@/lib/auth-context";

function ActionTile({
  href, icon: Icon, title, description, iconBg, iconColor,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  iconBg: string;
  iconColor: string;
}) {
  return (
    <Link href={href}>
      <a
        className="group flex items-start gap-4 bg-white border border-slate-200 rounded-xl p-5 hover:border-slate-400 hover:shadow-md transition-all cursor-pointer"
        data-testid={`tile-${title.toLowerCase().replace(/\s+/g, "-")}`}
      >
        <div className={`p-3 ${iconBg} rounded-lg group-hover:scale-110 transition-transform flex-shrink-0`}>
          <Icon className={`w-5 h-5 ${iconColor}`} />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-slate-800 group-hover:text-slate-900 transition-colors">
            {title}
          </h3>
          <p className="text-sm text-slate-500 mt-0.5">{description}</p>
        </div>
        <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-slate-500 flex-shrink-0 mt-0.5 group-hover:translate-x-0.5 transition-all" />
      </a>
    </Link>
  );
}

export default function MastersHub() {
  const { isAdmin } = useAuth();

  if (!isAdmin) {
    return (
      <HubShell title="Masters & Config">
        <div className="p-6 flex items-center justify-center min-h-64">
          <div className="text-center">
            <Shield className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 font-medium">Admin access required</p>
            <p className="text-sm text-slate-400 mt-1">Contact an administrator for access.</p>
          </div>
        </div>
      </HubShell>
    );
  }

  return (
    <HubShell
      title="Masters & Config"
      subtitle="Parties, materials, equipment & personnel"
      backHref="/"
      backLabel="Dashboard"
    >
      <div className="p-6 max-w-5xl mx-auto space-y-8">

        <div>
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4">
            Master Data
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <ActionTile
              href="/admin/settings"
              icon={Users}
              title="App Settings & Master Data"
              description="Manage party master, equipment master, plant config & site settings"
              iconBg="bg-slate-100"
              iconColor="text-slate-600"
            />
            <ActionTile
              href="/plant/rate-cards"
              icon={Receipt}
              title="Rate Cards"
              description="Equipment, material, transport & labour rate cards for billing"
              iconBg="bg-blue-50"
              iconColor="text-blue-600"
            />
            <ActionTile
              href="/stores/items"
              icon={Package}
              title="Item / Material Master"
              description="Manage store items, categories & unit of measurement"
              iconBg="bg-orange-50"
              iconColor="text-orange-600"
            />
          </div>
        </div>

        <div>
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4">
            User & Device Management
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <ActionTile
              href="/admin/users"
              icon={Users}
              title="User Management"
              description="Add users, assign roles, set permissions & manage access"
              iconBg="bg-violet-50"
              iconColor="text-violet-600"
            />
            <ActionTile
              href="/admin/devices"
              icon={Shield}
              title="Device Approvals"
              description="Review & approve new device login requests"
              iconBg="bg-emerald-50"
              iconColor="text-emerald-600"
            />
          </div>
        </div>

        <div>
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4">
            Estimator & Tools
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <ActionTile
              href="/estimator-login"
              icon={TrendingUp}
              title="Estimates Manager"
              description="Bituminous mix calculator, concrete BOQ analysis & saved estimates"
              iconBg="bg-teal-50"
              iconColor="text-teal-600"
            />
            <ActionTile
              href="/plant/data-sync"
              icon={RefreshCw}
              title="Data Sync & Export"
              description="Export or import selected table data for backup & transfer"
              iconBg="bg-amber-50"
              iconColor="text-amber-600"
            />
          </div>
        </div>

      </div>
    </HubShell>
  );
}
