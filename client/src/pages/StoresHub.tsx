import { useQuery } from "@tanstack/react-query";
import {
  ArrowDownToLine, ArrowUpFromLine, ClipboardList,
  Package, Layers, BarChart3, ArrowLeftRight, Settings,
} from "lucide-react";
import { HubShell } from "@/components/HubShell";
import { HubActionTile } from "@/components/HubActionTile";
import { useAuth } from "@/lib/auth-context";

const HUB = "/stores/hub";

function KpiCard({ label, value, sub, warn }: {
  label: string; value?: string | number; sub?: string; warn?: boolean;
}) {
  return (
    <div className={`bg-white rounded-xl border p-5 shadow-sm ${warn ? "border-red-200" : "border-slate-200"}`}>
      <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">{label}</p>
      <p className={`text-3xl font-bold tracking-tight ${warn ? "text-red-600" : "text-slate-800"}`}>
        {value !== undefined ? value : <span className="text-slate-300">—</span>}
      </p>
      {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
    </div>
  );
}

export default function StoresHub() {
  const { sectionVisible, isAdmin } = useAuth();
  const canStores = sectionVisible("stores_inventory");
  const canBulk = sectionVisible("plant_materials");

  const { data: stock = [] } = useQuery<any[]>({
    queryKey: ["/api/stores/stock-summary"],
    enabled: canStores,
  });

  const totalItems = stock.length;
  const lowStockCount = stock.filter((s: any) => s.isLowStock).length;

  return (
    <HubShell
      title="Stores & Inventory"
      subtitle="GRNs, issue vouchers, item master & stock tracking"
      backHref="/"
      backLabel="Dashboard"
    >
      <div className="p-6 max-w-5xl mx-auto space-y-8">

        {/* KPI ribbon */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KpiCard
            label="Active Items"
            value={canStores ? totalItems : undefined}
            sub="in catalogue"
          />
          <KpiCard
            label="Low Stock"
            value={canStores ? lowStockCount : undefined}
            sub="items below minimum"
            warn={lowStockCount > 0}
          />
          <KpiCard
            label="Categories"
            value={canStores ? new Set(stock.map((s: any) => s.category)).size : undefined}
            sub="item categories"
          />
          <KpiCard
            label="Store Status"
            value={lowStockCount === 0 ? "OK" : "⚠"}
            sub={lowStockCount === 0 ? "Stock levels normal" : `${lowStockCount} low`}
            warn={lowStockCount > 0}
          />
        </div>

        {/* Store Items */}
        <div>
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4">
            Store Items
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <HubActionTile
              href={`/stores/grns?returnTo=${HUB}`}
              icon={ArrowDownToLine}
              title="Goods Received Notes (GRN)"
              description="Record & track incoming store items from vendors"
              accent="green"
              iconBg="bg-green-100"
              enabled={canStores}
            />
            <HubActionTile
              href={`/stores/issues?returnTo=${HUB}`}
              icon={ArrowUpFromLine}
              title="Issue Vouchers"
              description="Issue store items to plant, site or equipment teams"
              accent="orange"
              iconBg="bg-orange-100"
              enabled={canStores}
            />
            <HubActionTile
              href={`/stores/items?returnTo=${HUB}`}
              icon={ClipboardList}
              title="Item Master / Catalogue"
              description="Manage store items, spare parts, tools & consumables"
              accent="blue"
              iconBg="bg-blue-100"
              enabled={canStores}
            />
            <HubActionTile
              href={`/stores?tab=items&returnTo=${HUB}`}
              icon={BarChart3}
              title="Current Stock"
              description="View stock balances, low-stock alerts & ledger by item"
              accent="violet"
              iconBg="bg-violet-100"
              enabled={canStores}
            />
          </div>
        </div>

        {/* Bulk Materials */}
        {canBulk && (
          <div>
            <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4">
              Bulk Materials (Plant)
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <HubActionTile
                href={`/plant/material-receipts?returnTo=${HUB}`}
                icon={ArrowDownToLine}
                title="Material Receipts"
                description="Record incoming bulk materials at the plant"
                accent="teal"
                iconBg="bg-teal-100"
                enabled={canBulk}
              />
              <HubActionTile
                href={`/plant/material-issues?returnTo=${HUB}`}
                icon={ArrowUpFromLine}
                title="Material Issues"
                description="Issue bulk materials from plant stock to sites"
                accent="amber"
                iconBg="bg-amber-100"
                enabled={canBulk}
              />
              <HubActionTile
                href={`/plant/stock?returnTo=${HUB}`}
                icon={Layers}
                title="HMP Material Stock"
                description="View HMP plant material-wise stock balances & transaction history"
                accent="emerald"
                iconBg="bg-emerald-100"
                enabled={canBulk}
              />
              <HubActionTile
                href={`/plant/stock-transfer?returnTo=${HUB}`}
                icon={ArrowLeftRight}
                title="Inter-Party Transfer"
                description="Return borrowed material between contractor parties"
                accent="slate"
                iconBg="bg-slate-100"
                enabled={canBulk}
              />
            </div>
          </div>
        )}

        {/* Admin Tools */}
        {isAdmin && (
          <div>
            <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4">
              Admin Tools
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <HubActionTile
                href={`/plant/stock-reassign?returnTo=${HUB}`}
                icon={Settings}
                title="Stock Reassignment"
                description="Reassign ledger entries between parties"
                accent="slate"
                iconBg="bg-slate-100"
              />
              <HubActionTile
                href={`/plant/ledger-rebuild?returnTo=${HUB}`}
                icon={Settings}
                title="Dispatch Ledger Rebuild"
                description="Rewrite component ledger from a chosen date cutoff"
                accent="slate"
                iconBg="bg-slate-100"
              />
            </div>
          </div>
        )}

      </div>
    </HubShell>
  );
}
