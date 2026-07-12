import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  Camera, Truck, Wrench, Users, ShoppingCart, ShoppingBag,
  BookOpen, MessageSquare, LayoutDashboard, MapPin,
  ArrowRight, AlertTriangle, CheckCircle2, Circle, AlertCircle,
  Target, Zap, ClipboardList, Home, FileText, BarChart2, User,
  ChevronRight, Bell,
} from "lucide-react";
import { HubShell } from "@/components/HubShell";
import { useAuth } from "@/lib/auth-context";
import { useDeviceType } from "@/hooks/use-device-type";
import { format } from "date-fns";

// ─── Types ───────────────────────────────────────────────────────────────────

type DprPhase = "not-started" | "draft" | "submitted";
type CheckState = "done" | "partial" | "pending";

interface CheckItem {
  id: string;
  label: string;
  state: CheckState;
  sub: string;
}

interface FocusItem {
  level: "warn" | "alert" | "info" | "ok";
  text: string;
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function ToDoBadge({ type, text }: { type: "backlog" | "ahead" | "not-started" | "in-progress"; text: string }) {
  const styles = {
    backlog:      "text-red-600 bg-red-50 border border-red-100",
    ahead:        "text-blue-600 bg-blue-50 border border-blue-100",
    "not-started":"text-gray-500 bg-gray-100 border border-gray-200",
    "in-progress":"text-amber-700 bg-amber-50 border border-amber-100",
  } as const;
  return (
    <span className={`inline-block text-[11px] font-semibold px-2 py-0.5 rounded-md ${styles[type]}`}>
      {text}
    </span>
  );
}

function FocusRow({ item }: { item: FocusItem }) {
  const s = {
    warn:  { dot: "bg-red-400",    bg: "bg-red-50",    text: "text-red-800"    },
    alert: { dot: "bg-amber-400",  bg: "bg-amber-50",  text: "text-amber-800"  },
    info:  { dot: "bg-blue-400",   bg: "bg-blue-50",   text: "text-blue-800"   },
    ok:    { dot: "bg-green-400",  bg: "bg-green-50",  text: "text-green-800"  },
  }[item.level];
  return (
    <div className={`flex items-start gap-2.5 px-3 py-2.5 rounded-lg ${s.bg}`}>
      <div className={`w-2 h-2 rounded-full flex-shrink-0 mt-[5px] ${s.dot}`} />
      <p className={`text-sm leading-snug ${s.text}`}>{item.text}</p>
    </div>
  );
}

function PendingRow({ item }: { item: CheckItem }) {
  const icons = {
    done:    <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0" />,
    partial: <AlertCircle  className="w-5 h-5 text-amber-500 flex-shrink-0" />,
    pending: <Circle       className="w-5 h-5 text-gray-300 flex-shrink-0"  />,
  };
  return (
    <div className="flex items-center gap-3 w-full py-2.5 px-1">
      {icons[item.state]}
      <div className="flex-1 min-w-0">
        <p className={`text-sm leading-tight ${item.state === "done" ? "line-through text-gray-400" : "text-gray-800"}`}>
          {item.label}
        </p>
        {item.sub && (
          <p className={`text-xs mt-0.5 ${
            item.state === "done"    ? "text-gray-300" :
            item.state === "partial" ? "text-amber-600" :
                                       "text-gray-400"
          }`}>{item.sub}</p>
        )}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function FieldHome({ onViewFullDashboard }: { onViewFullDashboard?: () => void }) {
  const { user, sectionVisible } = useAuth();
  const deviceType = useDeviceType();
  const [, navigate] = useLocation();

  const todayStr = format(new Date(), "yyyy-MM-dd");
  const todayDisplay = format(new Date(), "EEE, d MMM yyyy");
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const firstName = user?.fullName?.split(" ")[0] ?? "";
  const initials  = user?.fullName ? user.fullName.split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2) : "U";

  // ── Data fetching ─────────────────────────────────────────────────────────

  const { data: sites = [] } = useQuery<any[]>({ queryKey: ["/api/sites"] });

  const { data: todayDprs = [] } = useQuery<any[]>({
    queryKey: ["/api/dprs/with-details", { dateFrom: todayStr, dateTo: todayStr }],
    queryFn: () =>
      fetch(`/api/dprs/with-details?dateFrom=${todayStr}&dateTo=${todayStr}`)
        .then(r => r.json()),
  });

  const { data: purchaseIndents = [] } = useQuery<any[]>({
    queryKey: ["/api/purchase-indents"],
    enabled: sectionVisible("site_procurement"),
  });

  const canRaiseIrn = sectionVisible("irn_raise");
  const { data: irnList = [] } = useQuery<any[]>({
    queryKey: ["/api/irn", { status: "all" }],
    queryFn: () => fetch("/api/irn", { credentials: "include" }).then(r => r.json()),
    enabled: canRaiseIrn,
  });

  // ── Derived: site + DPR state ─────────────────────────────────────────────

  const activeSites = sites.filter((s: any) => s.isActive !== 0);
  // Field engineers typically work on one or few sites; show their first active site name
  const primarySite = activeSites.length === 1 ? activeSites[0].name : (activeSites[0]?.name ?? "");

  // Find today's DPR for the primary site (if single site) or the first filed DPR
  const todayDpr = todayDprs.find((d: any) =>
    !primarySite || d.site === primarySite
  ) ?? todayDprs[0] ?? null;

  const dprPhase: DprPhase = !todayDpr
    ? "not-started"
    : todayDpr.status === "submitted" || !!todayDpr.submittedAt
    ? "submitted"
    : "draft";

  const dprId: number | null = todayDpr?.id ?? null;

  // ── Today's Site Goal rows (from DPR progress + live data) ────────────────
  // Shows activities logged in today's DPR. Planned quantities come from the
  // work programme (not fetched here — marked "—" until linked). This section
  // is PARTIALLY LIVE: completed quantity is real; "Planned" and "To be done"
  // are derived from whatever is in the DPR.
  interface GoalRow {
    id: string;
    item: string;
    stretch: string;
    planned: string;
    completed: string;
    toDo: string;
    toDoType: "backlog" | "ahead" | "not-started" | "in-progress";
  }

  const goalRows: GoalRow[] = dprPhase !== "not-started" && todayDpr?.progress?.length > 0
    ? todayDpr.progress.map((p: any, i: number) => ({
        id: `p${i}`,
        item: p.activity ?? p.description ?? "Activity",
        stretch: p.chainage
          ? `Ch ${p.chainage}`
          : p.location ?? "",
        planned: "—",
        completed: p.quantity != null
          ? `${Number(p.quantity).toLocaleString()} ${p.unit ?? ""}`.trim()
          : "—",
        toDo: "In progress",
        toDoType: "in-progress" as const,
      }))
    : [];

  // ── Today's Focus (derived, partially live) ───────────────────────────────
  const focusItems: FocusItem[] = [];

  if (dprPhase === "not-started") {
    focusItems.push({ level: "alert", text: "No DPR started yet — begin today's site work to log activities" });
  }

  const hasPendingIndents = purchaseIndents.filter(
    (p: any) => p.status === "pending" || p.status === "submitted" || p.status === "stores_check"
  ).length > 0;

  if (hasPendingIndents && sectionVisible("site_procurement")) {
    focusItems.push({ level: "warn", text: "Purchase indents pending approval — follow up with store / manager" });
  }

  if (dprPhase === "draft") {
    const eq  = todayDpr?.equipment?.length ?? 0;
    const lab = todayDpr?.labour?.length ?? 0;
    const mat = todayDpr?.materials?.length ?? 0;

    if (eq === 0)  focusItems.push({ level: "alert", text: "Equipment logs not yet added — record today's equipment usage" });
    if (lab === 0) focusItems.push({ level: "alert", text: "Labour count not yet entered — add today's workforce" });
    if (mat === 0) focusItems.push({ level: "info",  text: "No material trips logged yet — add material received today" });
  }

  if (dprPhase === "submitted") {
    focusItems.push({ level: "ok", text: "DPR submitted — good work!" });
  }

  if (focusItems.length === 0) {
    focusItems.push({ level: "info", text: "Log today's activities, equipment, labour and materials in your DPR" });
  }

  // Cap at 5 focus items
  const visibleFocus = focusItems.slice(0, 5);

  // ── Pending Before Submit checklist (partially live) ─────────────────────
  const eqCount  = todayDpr?.equipment?.length ?? 0;
  const labCount = todayDpr?.labour?.length ?? 0;
  const progCount = todayDpr?.progress?.length ?? 0;
  const matCount = todayDpr?.materials?.length ?? 0;

  const pendingChecks: CheckItem[] = [
    {
      id: "c1",
      label: "Equipment closing meter",
      state: eqCount > 0 ? "done" : dprPhase === "not-started" ? "pending" : "pending",
      sub: eqCount > 0 ? `${eqCount} equipment logged` : "No equipment recorded yet",
    },
    {
      id: "c2",
      label: "Final labour count",
      state: labCount > 0 ? "done" : "pending",
      sub: labCount > 0 ? `${labCount} labour records` : "No labour entries yet",
    },
    {
      id: "c3",
      label: "Material challan recorded",
      state: matCount > 0 ? "done" : "pending",
      sub: matCount > 0 ? `${matCount} material logs` : "No material entries yet",
    },
    {
      id: "c4",
      label: "Activity quantities entered",
      state: progCount > 0 ? "done" : "pending",
      sub: progCount > 0 ? `${progCount} activit${progCount === 1 ? "y" : "ies"} logged` : "No activities recorded yet",
    },
    {
      id: "c5",
      label: "DPR submitted",
      state: dprPhase === "submitted" ? "done" : "pending",
      sub: dprPhase === "submitted" ? "Submitted successfully" : "Submit once all items are done",
    },
  ];

  const doneCount    = pendingChecks.filter(c => c.state === "done").length;
  const pendingCount = pendingChecks.filter(c => c.state !== "done").length;
  const donePct      = Math.round((doneCount / pendingChecks.length) * 100);

  // ── CTA config ────────────────────────────────────────────────────────────
  const ctaConfig = {
    "not-started": {
      label: "Start Today's Site Work",
      href: "/site/new",
      status: "DPR not started yet",
      color: "bg-orange-500 hover:bg-orange-600 shadow-orange-200",
      dotColor: "bg-orange-300",
      badge: null,
      badgeColor: "",
    },
    "draft": {
      label: "Continue Today's Site Work",
      href: dprId ? `/site/edit/${dprId}` : "/site/new",
      status: `DPR draft open · ${doneCount}/${pendingChecks.length} items done`,
      color: "bg-orange-500 hover:bg-orange-600 shadow-orange-200",
      dotColor: "bg-orange-400",
      badge: "In progress",
      badgeColor: "bg-orange-50 text-orange-600",
    },
    "submitted": {
      label: "View Today's Site Report",
      href: dprId ? `/site/report/${dprId}` : "/site/hub",
      status: "DPR submitted",
      color: "bg-slate-400 hover:bg-slate-500 shadow-slate-200",
      dotColor: "bg-green-400",
      badge: "Submitted",
      badgeColor: "bg-green-50 text-green-600",
    },
  }[dprPhase];

  const dprHref = dprId ? `/site/edit/${dprId}` : "/site/new";

  // ── Quick actions (permission-gated) ─────────────────────────────────────
  interface QuickAction {
    label: string;
    icon: any;
    color: string;
    href: string;
    perm?: boolean;
  }

  const allQuickActions: QuickAction[] = [
    {
      label: "Activity Photo",
      icon: Camera,
      color: "bg-slate-600",
      href: dprHref,
      perm: sectionVisible("site_dprs"),
    },
    {
      label: "Material Trip",
      icon: Truck,
      color: "bg-blue-600",
      href: "/site/material-trips?returnTo=/",
      perm: sectionVisible("site_materials"),
    },
    {
      label: "Equipment Log",
      icon: Wrench,
      color: "bg-amber-600",
      href: dprHref,
      perm: sectionVisible("site_dprs"),
    },
    {
      label: "Labour Log",
      icon: Users,
      color: "bg-teal-600",
      href: dprHref,
      perm: sectionVisible("site_dprs"),
    },
    {
      label: "Site Purchase",
      icon: ShoppingCart,
      color: "bg-green-600",
      href: dprHref,
      perm: sectionVisible("site_dprs"),
    },
    {
      label: "Raise PI",
      icon: ShoppingBag,
      color: "bg-purple-600",
      href: "/plant/purchase-indents?returnTo=/&from=site",
      perm: sectionVisible("site_procurement"),
    },
    {
      label: "Raise IRN",
      icon: BookOpen,
      color: "bg-indigo-600",
      href: "/irn/new?from=site&returnTo=/",
      perm: canRaiseIrn,
    },
    {
      label: "Site Remark",
      icon: MessageSquare,
      color: "bg-rose-500",
      href: dprHref,
      perm: sectionVisible("site_dprs"),
    },
  ];

  const visibleActions = allQuickActions.filter(a => a.perm !== false);

  // ── Layout ────────────────────────────────────────────────────────────────
  const containerWidth = deviceType === "mobile"
    ? "max-w-lg"
    : deviceType === "tablet"
    ? "max-w-2xl"
    : "max-w-2xl";

  return (
    <HubShell title="Field Home">
      <div className="min-h-screen bg-gray-50 text-gray-900">

        {/* ── Sticky header ── */}
        <div className="bg-white border-b border-gray-100 shadow-sm sticky top-0 z-40">
          <div className={`${containerWidth} mx-auto px-4 pt-3 pb-3`}>
            <div className="flex items-center justify-between gap-3">
              {/* Left: avatar + identity */}
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className="w-10 h-10 rounded-full bg-orange-500 flex items-center justify-center font-bold text-white text-sm flex-shrink-0"
                  data-testid="avatar-field-home"
                >
                  {initials}
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-gray-400 leading-tight">
                    {greeting}, <span className="font-semibold text-gray-800">{firstName || "Engineer"}</span>
                  </p>
                  <p className="text-xs font-medium text-gray-500 leading-tight">{user?.role ?? "Field Engineer"}</p>
                  {primarySite && (
                    <div className="flex items-center gap-1 mt-0.5">
                      <MapPin className="w-3 h-3 text-orange-500 flex-shrink-0" />
                      <span className="text-xs font-bold text-gray-900 truncate" data-testid="text-primary-site">{primarySite}</span>
                    </div>
                  )}
                </div>
              </div>
              {/* Right: date + dashboard link */}
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className="text-xs text-gray-400 hidden sm:block">{todayDisplay}</span>
                {onViewFullDashboard && (
                  <button
                    type="button"
                    onClick={onViewFullDashboard}
                    className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center"
                    title="Full dashboard"
                    data-testid="button-full-dashboard-header"
                  >
                    <LayoutDashboard className="w-3.5 h-3.5 text-gray-500" />
                  </button>
                )}
                <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
                  <Bell className="w-3.5 h-3.5 text-gray-500" />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Scrollable body ── */}
        <div className={`pb-24 ${containerWidth} mx-auto px-4 pt-4 space-y-4`}>

          {/* ═══════════════════════════════════════════════════════
              1. TODAY'S SITE GOAL — table: item, stretch, planned,
                 completed, to-be-done. No progress bars.
              ═══════════════════════════════════════════════════════ */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                  <Target className="w-4 h-4 text-orange-500" />
                  Today's Site Goal
                </h2>
                <p className="text-xs text-gray-400 mt-0.5">Planned vs completed vs to be done</p>
              </div>
              {goalRows.length > 0 && (
                <Link href="/site/hub">
                  <a className="text-xs font-medium text-orange-500 flex items-center gap-0.5">
                    View all <ChevronRight className="w-3 h-3" />
                  </a>
                </Link>
              )}
            </div>

            {goalRows.length === 0 ? (
              <div className="px-4 py-6 text-center" data-testid="text-goal-empty">
                <p className="text-sm text-gray-400">
                  {dprPhase === "not-started"
                    ? "Start today's DPR to see activities here"
                    : "No activities logged in today's DPR yet"}
                </p>
                <Link href="/site/new">
                  <a className="mt-2 inline-block text-xs font-medium text-orange-500" data-testid="link-start-dpr-goal">
                    {dprPhase === "not-started" ? "Start DPR →" : "Add activities →"}
                  </a>
                </Link>
              </div>
            ) : (
              <>
                {/* Column headers */}
                <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-3 px-4 py-2 bg-gray-50 border-b border-gray-100 text-[10px] font-semibold text-gray-400 uppercase tracking-wide">
                  <span>Item / Stretch</span>
                  <span className="text-right w-16">Planned</span>
                  <span className="text-right w-20">Completed</span>
                  <span className="text-right w-24">To be done</span>
                </div>
                <div className="divide-y divide-gray-50">
                  {goalRows.map((row) => (
                    <div
                      key={row.id}
                      className="grid grid-cols-[1fr_auto_auto_auto] gap-x-3 px-4 py-3 items-start hover:bg-gray-50/60 transition-colors"
                      data-testid={`goal-row-${row.id}`}
                    >
                      <div>
                        <p className="text-sm font-semibold text-gray-900 leading-tight">{row.item}</p>
                        {row.stretch && <p className="text-xs text-gray-400 mt-0.5">{row.stretch}</p>}
                      </div>
                      <div className="w-16 text-right">
                        <p className="text-xs text-gray-500 font-medium">{row.planned}</p>
                      </div>
                      <div className="w-20 text-right">
                        <p className="text-xs text-gray-800 font-semibold">{row.completed}</p>
                      </div>
                      <div className="w-24 text-right">
                        <ToDoBadge type={row.toDoType} text={row.toDo} />
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* ═══════════════════════════════════════════════════════
              2. TODAY'S FOCUS — 3–5 priority bullets
              ═══════════════════════════════════════════════════════ */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100">
              <h2 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                <Zap className="w-4 h-4 text-orange-500" />
                Today's Focus
              </h2>
              <p className="text-xs text-gray-400 mt-0.5">What to prioritise today</p>
            </div>
            <div className="px-4 py-3 space-y-2">
              {visibleFocus.map((item, i) => (
                <FocusRow key={i} item={item} />
              ))}
            </div>
          </div>

          {/* ═══════════════════════════════════════════════════════
              3. TODAY'S SITE WORK — dynamic CTA
              ═══════════════════════════════════════════════════════ */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                <ClipboardList className="w-4 h-4 text-orange-500" />
                Today's Site Work
              </h2>
              {ctaConfig.badge && (
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${ctaConfig.badgeColor}`}>
                  {ctaConfig.badge}
                </span>
              )}
            </div>

            {/* Flow steps hint */}
            <div className="flex items-center gap-1 flex-wrap">
              {["Start of Day", "Progress", "Labour", "Equipment", "Materials", "Photos", "Submit"].map((step, i, arr) => (
                <span key={step} className="flex items-center gap-1">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                    dprPhase === "submitted"                              ? "bg-green-100 text-green-700" :
                    dprPhase === "draft" && i <= 1                       ? "bg-orange-100 text-orange-700" :
                                                                           "bg-gray-100 text-gray-400"
                  }`}>{step}</span>
                  {i < arr.length - 1 && <ChevronRight className="w-2.5 h-2.5 text-gray-300 flex-shrink-0" />}
                </span>
              ))}
            </div>

            {/* CTA button */}
            <Link href={ctaConfig.href}>
              <a
                className={`w-full py-4 rounded-2xl text-white font-bold text-base flex items-center justify-center gap-2 shadow-lg transition-all active:scale-[0.98] ${ctaConfig.color}`}
                data-testid="button-site-work-cta"
              >
                <span>{ctaConfig.label}</span>
                <ArrowRight className="w-5 h-5 ml-auto" />
              </a>
            </Link>

            {/* Status sub-text */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${ctaConfig.dotColor}`} />
                <p className="text-xs text-gray-500">{ctaConfig.status}</p>
              </div>
              {pendingCount > 0 && dprPhase !== "submitted" && (
                <span className="text-[10px] font-semibold text-amber-600 bg-amber-50 border border-amber-100 px-2 py-0.5 rounded-full flex-shrink-0">
                  {pendingCount} item{pendingCount !== 1 ? "s" : ""} pending before submit
                </span>
              )}
            </div>
          </div>

          {/* ═══════════════════════════════════════════════════════
              4. QUICK ACTIONS — permission-gated 4×2 grid
              ═══════════════════════════════════════════════════════ */}
          {visibleActions.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3">
              <h2 className="text-sm font-bold text-gray-900 mb-3">Quick Actions</h2>
              <div className="grid grid-cols-4 gap-2">
                {visibleActions.map(a => (
                  <Link href={a.href} key={a.label}>
                    <a
                      className="flex flex-col items-center gap-1.5 p-2 rounded-xl hover:bg-gray-50 transition-colors"
                      data-testid={`quick-action-${a.label.toLowerCase().replace(/\s+/g, "-")}`}
                    >
                      <div className={`w-11 h-11 rounded-2xl ${a.color} flex items-center justify-center shadow`}>
                        <a.icon className="w-5 h-5 text-white" />
                      </div>
                      <span className="text-[10px] text-gray-500 text-center leading-tight font-medium">{a.label}</span>
                    </a>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════
              5. PENDING BEFORE SUBMIT — checklist
              ═══════════════════════════════════════════════════════ */}
          <div className={`bg-white rounded-xl border shadow-sm overflow-hidden ${pendingCount > 0 ? "border-amber-200" : "border-green-100"}`}>
            <div className="px-4 py-3 border-b border-gray-50 flex items-center justify-between">
              <h2 className={`text-sm font-bold flex items-center gap-2 ${pendingCount > 0 ? "text-gray-900" : "text-green-700"}`}>
                {pendingCount > 0
                  ? <><AlertTriangle className="w-4 h-4 text-amber-500" /> Pending Before Submit</>
                  : <><CheckCircle2 className="w-4 h-4 text-green-500" /> Ready to Submit</>
                }
              </h2>
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                pendingCount > 0 ? "bg-amber-50 text-amber-600" : "bg-green-50 text-green-600"
              }`}>
                {doneCount}/{pendingChecks.length} done
              </span>
            </div>

            {/* Thin progress strip */}
            <div className="h-1 w-full bg-gray-100">
              <div
                className={`h-full transition-all duration-500 ${donePct === 100 ? "bg-green-400" : "bg-amber-400"}`}
                style={{ width: `${donePct}%` }}
              />
            </div>

            <div className="px-4 py-1 divide-y divide-gray-50">
              {pendingChecks.map(c => (
                <PendingRow key={c.id} item={c} />
              ))}
            </div>

            <div className="px-4 pb-3 pt-2">
              {dprPhase !== "submitted" ? (
                <Link href={dprId ? `/site/edit/${dprId}` : "/site/new"}>
                  <a
                    className={`block w-full py-3 rounded-xl font-bold text-sm text-center transition-all ${
                      pendingCount === 0
                        ? "bg-green-500 text-white shadow-md shadow-green-200"
                        : "bg-gray-100 text-gray-400"
                    }`}
                    data-testid="button-submit-dpr"
                  >
                    {pendingCount > 0
                      ? `${pendingCount} item${pendingCount !== 1 ? "s" : ""} pending before submit`
                      : "Submit DPR Now"
                    }
                  </a>
                </Link>
              ) : (
                <Link href={dprId ? `/site/report/${dprId}` : "/site/hub"}>
                  <a
                    className="block w-full py-3 rounded-xl font-bold text-sm text-center bg-green-50 text-green-700 border border-green-200"
                    data-testid="link-view-report"
                  >
                    View Submitted Report
                  </a>
                </Link>
              )}
            </div>
          </div>

          {/* Full dashboard fallback */}
          {onViewFullDashboard && (
            <button
              type="button"
              onClick={onViewFullDashboard}
              className="flex items-center justify-center gap-2 text-sm font-medium text-slate-400 py-2 w-full hover:text-slate-600 transition-colors"
              data-testid="link-full-dashboard"
            >
              <LayoutDashboard className="w-4 h-4" />
              View full dashboard
            </button>
          )}
        </div>

        {/* ── Bottom nav — 4 tabs, no floating button duplication ── */}
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 shadow-lg z-50">
          <div className={`${containerWidth} mx-auto flex items-center justify-around px-4 py-2`}>
            {[
              { label: "Work",    icon: Home,      href: "/"         },
              { label: "Reports", icon: FileText,  href: "/site/hub" },
              { label: "Progress",icon: BarChart2, href: "/site/dashboard" },
              { label: "Profile", icon: User,      href: "/profile"  },
            ].map(n => {
              const active = n.href === "/";
              return (
                <Link href={n.href} key={n.label}>
                  <a
                    className="flex flex-col items-center gap-1 px-3 py-1"
                    data-testid={`nav-tab-${n.label.toLowerCase()}`}
                  >
                    <n.icon className={`w-5 h-5 ${active ? "text-orange-500" : "text-gray-400"}`} />
                    <span className={`text-[10px] font-medium ${active ? "text-orange-500" : "text-gray-400"}`}>
                      {n.label}
                    </span>
                  </a>
                </Link>
              );
            })}
          </div>
        </div>

      </div>
    </HubShell>
  );
}
