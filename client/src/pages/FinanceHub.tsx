import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  ShoppingCart, Fuel, Receipt, CreditCard, ClipboardList,
} from "lucide-react";
import { HubShell } from "@/components/HubShell";
import { HubActionTile } from "@/components/HubActionTile";
import { useAuth } from "@/lib/auth-context";

const TODAY = format(new Date(), "yyyy-MM-dd");
const HUB = "/finance/hub";

function KpiCard({ label, value, sub, warn }: {
  label: string; value?: string | number; sub?: string; warn?: boolean;
}) {
  return (
    <div className={`bg-white rounded-xl border p-5 shadow-sm ${warn ? "border-amber-200" : "border-slate-200"}`}>
      <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">{label}</p>
      <p className={`text-3xl font-bold tracking-tight ${warn ? "text-amber-700" : "text-slate-800"}`}>
        {value !== undefined ? value : <span className="text-slate-300">—</span>}
      </p>
      {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
    </div>
  );
}

export default function FinanceHub() {
  const { sectionVisible } = useAuth();

  const { data: indents = [] } = useQuery<any[]>({
    queryKey: ["/api/purchase-indents", TODAY],
    queryFn: async () => {
      const res = await fetch(`/api/purchase-indents?dateFrom=2000-01-01&dateTo=${TODAY}`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: sectionVisible("site_procurement"),
  });

  const { data: irns = [] } = useQuery<any[]>({
    queryKey: ["/api/irn"],
    queryFn: async () => {
      const res = await fetch("/api/irn");
      if (!res.ok) return [];
      return res.json();
    },
    enabled: sectionVisible("irn_view") || sectionVisible("irn_raise"),
  });

  const pendingIndents = indents.filter((i: any) => i.status === "pending" || i.status === "stores_check").length;
  const approvedIndents = indents.filter((i: any) => i.status === "approved").length;
  const pendingIrns = irns.filter((r: any) => r.status === "pending_stores" || r.status === "stores_verified").length;

  return (
    <HubShell
      title="Procurement & Billing"
      subtitle="Purchase indents, diesel requirements, vendor bills & rate cards"
      backHref="/"
      backLabel="Dashboard"
    >
      <div className="p-6 max-w-5xl mx-auto space-y-8">

        {/* KPI ribbon */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KpiCard
            label="Pending Indents"
            value={sectionVisible("site_procurement") ? pendingIndents : undefined}
            sub="awaiting approval"
            warn={pendingIndents > 0}
          />
          <KpiCard
            label="Approved Indents"
            value={sectionVisible("site_procurement") ? approvedIndents : undefined}
            sub="ready to purchase"
          />
          <KpiCard
            label="Pending IRNs"
            value={(sectionVisible("irn_view") || sectionVisible("irn_raise")) ? pendingIrns : undefined}
            sub="stores to review"
            warn={pendingIrns > 0}
          />
          <KpiCard
            label="Date"
            value={format(new Date(), "dd MMM")}
            sub={format(new Date(), "yyyy")}
          />
        </div>

        {/* Procurement */}
        <div>
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4">
            Procurement
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <HubActionTile
              href={`/plant/purchase-indents?returnTo=${HUB}`}
              icon={ShoppingCart}
              title="Purchase Indents"
              description="Raise, track & approve material purchase requests"
              accent="blue"
              iconBg="bg-blue-100"
              badge={pendingIndents > 0 ? `${pendingIndents} pending` : undefined}
              enabled={sectionVisible("site_procurement")}
            />
            <HubActionTile
              href={`/plant/diesel-requirements?returnTo=${HUB}`}
              icon={Fuel}
              title="Daily Diesel Requirement"
              description="Plan diesel allocation per equipment & get approval"
              accent="amber"
              iconBg="bg-amber-100"
              enabled={sectionVisible("site_diesel")}
            />
          </div>
        </div>

        {/* Internal Requisitions */}
        {(sectionVisible("irn_view") || sectionVisible("irn_raise")) && (
          <div>
            <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4">
              Internal Requisitions
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <HubActionTile
                href={`/irn/new?returnTo=${HUB}`}
                icon={ClipboardList}
                title="Raise Requisition"
                description="Request materials from stores across site, HMP, equipment or RMC"
                accent="indigo"
                iconBg="bg-indigo-100"
                enabled={sectionVisible("irn_raise")}
              />
              <HubActionTile
                href={`/irn?returnTo=${HUB}`}
                icon={ClipboardList}
                title="All Requisitions"
                description="View, track & process all internal requisition notes"
                accent="indigo"
                iconBg="bg-indigo-100"
                badge={pendingIrns > 0 ? `${pendingIrns} pending` : undefined}
                enabled={sectionVisible("irn_view")}
              />
            </div>
          </div>
        )}

        {/* Billing */}
        <div>
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4">
            Vendor Billing
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <HubActionTile
              href={`/plant/vendor-bills?returnTo=${HUB}`}
              icon={Receipt}
              title="Vendor Bills"
              description="Manage equipment, material, transport & labour vendor bills"
              accent="rose"
              iconBg="bg-rose-100"
              enabled={sectionVisible("vendor_bills") || sectionVisible("vendor_bills_view") || sectionVisible("vendor_bills_raise") || sectionVisible("vendor_bills_verify") || sectionVisible("vendor_bills_approve")}
            />
            <HubActionTile
              href={`/plant/rate-cards?returnTo=${HUB}`}
              icon={CreditCard}
              title="Rate Cards"
              description="Equipment, material, transport & labour rate cards for billing"
              accent="violet"
              iconBg="bg-violet-100"
              enabled={sectionVisible("admin_settings")}
            />
          </div>
        </div>

      </div>
    </HubShell>
  );
}
