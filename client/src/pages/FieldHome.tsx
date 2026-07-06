import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  HardHat, FileText, ChevronRight, PlusCircle, CheckCircle2, Clock,
  AlertTriangle, ShoppingCart, Fuel, LayoutDashboard,
} from "lucide-react";
import { HubShell } from "@/components/HubShell";
import { useAuth } from "@/lib/auth-context";
import { useDeviceType } from "@/hooks/use-device-type";
import { format } from "date-fns";

// Role-based work view for field engineers/supervisors. This is the default
// landing screen for field roles on EVERY device — mobile, tablet, and
// desktop — since the role (not the device) decides the workspace. Device
// only changes the layout: mobile keeps a tight single-column wizard,
// tablet gets a two-column card layout, and desktop gets an expanded
// layout with more context visible at once while keeping the same guided
// actions (today's DPR status, New DPR, quick actions, alerts).
export default function FieldHome({ onViewFullDashboard }: { onViewFullDashboard?: () => void }) {
  const { user, sectionVisible } = useAuth();
  const deviceType = useDeviceType();
  const isMobile = deviceType === "mobile";

  const todayStr = format(new Date(), "yyyy-MM-dd");
  const todayDisplay = format(new Date(), "EEEE, d MMMM yyyy");
  const firstName = user?.fullName?.split(" ")[0] ?? "";

  const { data: sites = [] } = useQuery<any[]>({ queryKey: ["/api/sites"] });

  const { data: todayDprs = [] } = useQuery<any[]>({
    queryKey: ["/api/dprs", { dateFrom: todayStr, dateTo: todayStr }],
    queryFn: () =>
      fetch(`/api/dprs?dateFrom=${todayStr}&dateTo=${todayStr}`)
        .then((r) => r.json()),
  });

  const { data: dieselReqs = [] } = useQuery<any[]>({
    queryKey: ["/api/diesel-requirements"],
    enabled: sectionVisible("site_diesel"),
  });

  const { data: purchaseIndents = [] } = useQuery<any[]>({
    queryKey: ["/api/purchase-indents"],
    enabled: sectionVisible("site_procurement"),
  });

  const activeSites = sites.filter((s: any) => s.isActive !== 0);
  const filedSiteNames = new Set(todayDprs.map((d: any) => d.site));
  const pendingSites = activeSites.filter((s: any) => !filedSiteNames.has(s.name));

  const myPendingDiesel = dieselReqs.filter(
    (d: any) => d.status === "pending" || d.status === "submitted"
  );
  const myPendingIndents = purchaseIndents.filter(
    (p: any) => p.status === "pending" || p.status === "submitted" || p.status === "stores_check"
  );
  const alertCount = pendingSites.length + myPendingDiesel.length + myPendingIndents.length;

  const containerMaxWidth =
    deviceType === "mobile" ? "max-w-lg" : deviceType === "tablet" ? "max-w-3xl" : "max-w-5xl";

  return (
    <HubShell title="Field Home">
      <div className={`p-4 ${containerMaxWidth} mx-auto space-y-5`}>

        {/* Greeting */}
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-slate-900">
              Hi{firstName ? `, ${firstName}` : ""}
            </h2>
            <p className="text-sm text-slate-500 mt-0.5">{todayDisplay}</p>
          </div>
          {!isMobile && onViewFullDashboard && (
            <button
              type="button"
              onClick={onViewFullDashboard}
              className="hidden sm:flex items-center gap-1.5 text-xs font-medium text-slate-500 border border-slate-200 rounded-full px-3 py-1.5 flex-shrink-0"
              data-testid="link-full-dashboard-top"
            >
              <LayoutDashboard className="w-3.5 h-3.5" />
              Full dashboard
            </button>
          )}
        </div>

        {/* Alert strip */}
        {alertCount > 0 && (
          <div
            className="flex items-center gap-2 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3"
            data-testid="alert-strip-field-home"
          >
            <AlertTriangle className="w-4 h-4 text-rose-600 flex-shrink-0" />
            <p className="text-sm text-rose-700 font-medium leading-snug">
              {pendingSites.length > 0 && `${pendingSites.length} site${pendingSites.length > 1 ? "s" : ""} need${pendingSites.length > 1 ? "" : "s"} today's DPR`}
              {pendingSites.length > 0 && (myPendingDiesel.length > 0 || myPendingIndents.length > 0) && " · "}
              {myPendingDiesel.length > 0 && `${myPendingDiesel.length} diesel req. pending`}
              {myPendingDiesel.length > 0 && myPendingIndents.length > 0 && " · "}
              {myPendingIndents.length > 0 && `${myPendingIndents.length} indent pending`}
            </p>
          </div>
        )}

        {/* Big New DPR action card + quick actions: stacked on mobile, side-by-side on tablet/desktop */}
        <div className={isMobile ? "space-y-5" : "grid grid-cols-3 gap-4 items-stretch"}>
          <Link href="/site/new">
            <a
              className={`block bg-teal-600 hover:bg-teal-700 active:bg-teal-800 transition-colors rounded-2xl px-5 py-6 text-white shadow-sm ${
                isMobile ? "" : "col-span-2"
              }`}
              data-testid="button-new-dpr-field-home"
            >
              <div className="flex items-center justify-between h-full">
                <div>
                  <div className="flex items-center gap-2">
                    <PlusCircle className="w-5 h-5" />
                    <span className="text-lg font-bold">New DPR</span>
                  </div>
                  <p className="text-sm text-teal-50 mt-1">
                    File today's progress report in a few guided steps
                  </p>
                </div>
                <ChevronRight className="w-6 h-6 text-teal-100 flex-shrink-0" />
              </div>
            </a>
          </Link>

          {/* Quick actions */}
          <div className={isMobile ? "grid grid-cols-2 gap-3" : "grid grid-cols-1 gap-3"}>
            {sectionVisible("site_procurement") && (
              <Link href="/plant/purchase-indents">
                <a className="bg-white rounded-xl border border-slate-200 px-4 py-3.5 flex items-center gap-3 h-full" data-testid="link-quick-indents">
                  <div className="w-9 h-9 rounded-lg bg-amber-50 flex items-center justify-center flex-shrink-0">
                    <ShoppingCart className="w-4 h-4 text-amber-600" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-800 truncate">Purchase Indent</p>
                    <p className="text-xs text-slate-400">Request material</p>
                  </div>
                </a>
              </Link>
            )}
            {sectionVisible("site_diesel") && (
              <Link href="/plant/diesel-requirements">
                <a className="bg-white rounded-xl border border-slate-200 px-4 py-3.5 flex items-center gap-3 h-full" data-testid="link-quick-diesel">
                  <div className="w-9 h-9 rounded-lg bg-orange-50 flex items-center justify-center flex-shrink-0">
                    <Fuel className="w-4 h-4 text-orange-600" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-800 truncate">Diesel Request</p>
                    <p className="text-xs text-slate-400">Daily requirement</p>
                  </div>
                </a>
              </Link>
            )}
          </div>
        </div>

        {/* Today's DPR status per site */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100">
            <HardHat className="w-4 h-4 text-slate-400" />
            <h3 className="text-sm font-semibold text-slate-800">Today's DPR Status</h3>
          </div>
          {activeSites.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-slate-400" data-testid="text-no-site-assigned">No site assigned. Please contact admin.</div>
          ) : (
            <div className={isMobile ? "divide-y divide-slate-50" : "grid grid-cols-2 divide-y-0"}>
              {activeSites.map((site: any) => {
                const dpr = todayDprs.find((d: any) => d.site === site.name);
                return (
                  <div
                    key={site.id}
                    className={`flex items-center gap-3 px-4 py-3 ${isMobile ? "" : "border-b border-slate-50 [&:nth-child(odd)]:border-r"}`}
                    data-testid={`field-dpr-status-${site.id}`}
                  >
                    {dpr
                      ? <CheckCircle2 className="w-4 h-4 text-teal-500 flex-shrink-0" />
                      : <Clock className="w-4 h-4 text-amber-400 flex-shrink-0" />
                    }
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">{site.name}</p>
                      {dpr
                        ? <p className="text-xs text-slate-500 mt-0.5">Filed by {dpr.engineer || "—"}</p>
                        : <p className="text-xs text-amber-500 font-medium mt-0.5">Not yet filed</p>
                      }
                    </div>
                    {!dpr && (
                      <Link href="/site/new">
                        <a className="text-xs font-medium text-orange-500 flex-shrink-0" data-testid={`link-file-dpr-${site.id}`}>
                          File now
                        </a>
                      </Link>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Link to full dashboard (always available as fallback, shown at bottom on mobile) */}
        {onViewFullDashboard && (
          <button
            type="button"
            onClick={onViewFullDashboard}
            className={`flex items-center justify-center gap-2 text-sm font-medium text-slate-500 py-2 w-full ${isMobile ? "" : "sm:hidden"}`}
            data-testid="link-full-dashboard"
          >
            <LayoutDashboard className="w-4 h-4" />
            View full dashboard
          </button>
        )}
      </div>
    </HubShell>
  );
}
