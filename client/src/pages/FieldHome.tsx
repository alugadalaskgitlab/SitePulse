import { useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  Camera, Truck, Wrench, Users, ShoppingCart, ShoppingBag,
  BookOpen, MessageSquare, LayoutDashboard, MapPin,
  ArrowRight, AlertTriangle, CheckCircle2, Circle, AlertCircle,
  Target, Zap, ClipboardList, Home, FileText, BarChart2, User,
  ChevronRight, Bell, ChevronDown,
} from "lucide-react";
import { HubShell } from "@/components/HubShell";
import { useAuth } from "@/lib/auth-context";
import { useDeviceType } from "@/hooks/use-device-type";
import { format } from "date-fns";
import type { PlanVsActualRow, BoqProjectWithCounts } from "@shared/schema";

// ─── Short name extraction ────────────────────────────────────────────────────
// Category name takes priority if it is concise. Otherwise keyword-match the
// full BOQ description to a familiar construction short name.

function extractShortName(description: string, categoryName: string | null): string {
  if (categoryName && categoryName.length <= 30) return categoryName;
  const d = description.toUpperCase();
  if (d.includes("EMBANKMENT") && (d.includes("BORROW") || d.includes("IMPORT"))) return "Embankment — Borrow Earth";
  if (d.includes("EMBANKMENT") && d.includes("CUT"))  return "Embankment — Cut Material";
  if (d.includes("EMBANKMENT"))                        return "Embankment";
  if (d.includes("SUBGRADE"))                          return "Subgrade Preparation";
  if (d.includes("CLEARING") || d.includes("GRUBBING")) return "Clearing & Grubbing";
  if (d.includes("GSB") || d.includes("GRANULAR SUB-BASE") || d.includes("GRANULAR SUBBASE")) return "GSB — Granular Sub-base";
  if (d.includes("WMM") || d.includes("WET MIX MACADAM")) return "WMM — Wet Mix Macadam";
  if (d.includes("WBM"))                               return "WBM";
  if (d.includes("PRIME COAT"))                        return "Prime Coat";
  if (d.includes("TACK COAT"))                         return "Tack Coat";
  if (d.includes("DBM") || d.includes("DENSE BITUMINOUS MACADAM")) return "DBM";
  if (d.includes("BC ") || d.includes("BITUMINOUS CONCRETE") || d.includes("WEARING COURSE")) return "BC — Wearing Course";
  if (d.includes("DRAIN") && d.includes("EXCAV"))      return "Drain Excavation";
  if (d.includes("PIPE CULVERT") && d.includes("BEDDING")) return "Pipe Culvert — Bedding";
  if (d.includes("PIPE CULVERT") && (d.includes("LAY") || d.includes("LAYING"))) return "Pipe Culvert — Pipe Laying";
  if (d.includes("PIPE CULVERT"))                      return "Pipe Culvert";
  if (d.includes("BOX CULVERT"))                       return "Box Culvert";
  if (d.includes("RETAINING WALL"))                    return "Retaining Wall";
  if (d.includes("GABION"))                            return "Gabion Work";
  if (d.includes("PCC") || (d.includes("PLAIN") && d.includes("CEMENT CONCRETE"))) return "PCC";
  if (d.includes("RCC") || (d.includes("REINFORCED") && d.includes("CEMENT CONCRETE"))) return "RCC";
  if (d.includes("REINFORCEMENT") || d.includes("REBAR")) return "Reinforcement";
  if (d.includes("BRIDGE"))                            return "Bridge";
  if (d.includes("GUARD RAIL") || d.includes("GUARD STONE")) return "Guard Rail";
  if (d.includes("KERB"))                              return "Kerb";
  if (d.includes("FOOTPATH"))                          return "Footpath";
  if (d.includes("MEDIAN"))                            return "Median";
  if (d.includes("SIGN"))                              return "Signage";
  if (d.includes("EXCAVATION"))                        return "Excavation";
  return description.length > 35 ? description.slice(0, 33) + "…" : description;
}

// ─── Types ────────────────────────────────────────────────────────────────────

type DprPhase =
  | "not-started"       // no DPR for this site+date
  | "draft-own"         // draft opened by current user
  | "submitted-own"     // submitted by current user
  | "submitted-other";  // submitted by a different user

type CheckState = "done" | "pending";

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

// ─── Sub-components ──────────────────────────────────────────────────────────

function ToDoBadge({ type, text }: {
  type: "backlog" | "ahead" | "on-track" | "pending" | "not-started";
  text: string;
}) {
  const styles: Record<string, string> = {
    backlog:      "text-red-600 bg-red-50 border border-red-100",
    ahead:        "text-blue-600 bg-blue-50 border border-blue-100",
    "on-track":   "text-teal-600 bg-teal-50 border border-teal-100",
    pending:      "text-amber-700 bg-amber-50 border border-amber-100",
    "not-started":"text-gray-500 bg-gray-100 border border-gray-200",
  };
  return (
    <span className={`inline-block text-[11px] font-semibold px-2 py-0.5 rounded-md ${styles[type] ?? styles["not-started"]}`}>
      {text}
    </span>
  );
}

function FocusRow({ item }: { item: FocusItem }) {
  const s = {
    warn:  { dot: "bg-red-400",    bg: "bg-red-50",    text: "text-red-800"   },
    alert: { dot: "bg-amber-400",  bg: "bg-amber-50",  text: "text-amber-800" },
    info:  { dot: "bg-blue-400",   bg: "bg-blue-50",   text: "text-blue-800"  },
    ok:    { dot: "bg-green-400",  bg: "bg-green-50",  text: "text-green-800" },
  }[item.level];
  return (
    <div className={`flex items-start gap-2.5 px-3 py-2.5 rounded-lg ${s.bg}`}>
      <div className={`w-2 h-2 rounded-full flex-shrink-0 mt-[5px] ${s.dot}`} />
      <p className={`text-sm leading-snug ${s.text}`}>{item.text}</p>
    </div>
  );
}

function PendingRow({ item }: { item: CheckItem }) {
  const icon = item.state === "done"
    ? <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0" />
    : <Circle       className="w-5 h-5 text-gray-300 flex-shrink-0" />;
  return (
    <div className="flex items-center gap-3 py-2.5 px-1">
      {icon}
      <div className="flex-1 min-w-0">
        <p className={`text-sm leading-tight ${item.state === "done" ? "line-through text-gray-400" : "text-gray-800"}`}>
          {item.label}
        </p>
        {item.sub && (
          <p className={`text-xs mt-0.5 ${item.state === "done" ? "text-gray-300" : "text-gray-400"}`}>{item.sub}</p>
        )}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function FieldHome({ onViewFullDashboard }: { onViewFullDashboard?: () => void }) {
  const { user, sectionVisible } = useAuth();
  const deviceType = useDeviceType();

  const todayStr    = format(new Date(), "yyyy-MM-dd");
  const todayDisplay = format(new Date(), "EEE, d MMM yyyy");
  const hour        = new Date().getHours();
  const greeting    = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const firstName   = user?.fullName?.split(" ")[0] ?? "";
  const initials    = user?.fullName
    ? user.fullName.split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2)
    : "U";
  const myName = user?.fullName ?? "";   // used to match DPR engineer field

  // ── Data fetching ────────────────────────────────────────────────────────

  const { data: sites = [] } = useQuery<any[]>({ queryKey: ["/api/sites"] });

  // NOTE: /api/dprs/with-details ignores dateFrom/dateTo params on the server.
  // We fetch all DPRs and filter by date + site in the frontend.
  const { data: allDprsWithDetails = [] } = useQuery<any[]>({
    queryKey: ["/api/dprs/with-details"],
    queryFn: () => fetch("/api/dprs/with-details").then(r => r.json()),
  });

  const { data: purchaseIndents = [] } = useQuery<any[]>({
    queryKey: ["/api/purchase-indents"],
    enabled: sectionVisible("site_procurement"),
  });

  const canRaiseIrn = sectionVisible("irn_raise");

  // ── Active sites (assigned to this user via permission filter on server) ──
  const activeSites = (sites as any[]).filter(s => s.isActive !== 0);

  // ── Multi-site: let user pick which site to view ──────────────────────────
  const [selectedSiteId, setSelectedSiteId] = useState<number | null>(null);

  const currentSiteId: number | null =
    activeSites.length === 1
      ? activeSites[0].id
      : selectedSiteId ?? (activeSites[0]?.id ?? null);

  const currentSite = activeSites.find(s => s.id === currentSiteId) ?? activeSites[0] ?? null;
  const currentSiteName: string = currentSite?.name ?? "";

  // ── BOQ projects for selected site ───────────────────────────────────────
  const { data: boqProjects = [] } = useQuery<BoqProjectWithCounts[]>({
    queryKey: ["/api/boq/projects", { siteId: currentSiteId }],
    queryFn: () =>
      fetch(`/api/boq/projects?siteId=${currentSiteId}`)
        .then(r => r.json()),
    enabled: !!currentSiteId,
  });

  // Use the first project that has bars (work programme set up)
  const activeProject = (boqProjects as BoqProjectWithCounts[]).find(p => p.barCount > 0)
    ?? (boqProjects as BoqProjectWithCounts[])[0]
    ?? null;

  const hasProgramme = !!activeProject && activeProject.barCount > 0;

  const { data: planVsActual = [] } = useQuery<PlanVsActualRow[]>({
    queryKey: ["/api/boq/projects", activeProject?.id, "plan-vs-actual", todayStr],
    queryFn: () =>
      fetch(`/api/boq/projects/${activeProject!.id}/plan-vs-actual?asOf=${todayStr}`)
        .then(r => r.json()),
    enabled: !!activeProject && hasProgramme,
  });

  // ── DPR for this site + today ────────────────────────────────────────────
  // The with-details endpoint returns ALL permitted DPRs, so we filter by:
  //   1. date === today
  //   2. site name: stored name can have " – Edited by Manager – …" appended,
  //      so we match by "starts with currentSiteName" (not exact equals)
  //   3. not superseded
  const normSite = (s: string) => s.split(" –")[0].split(" -–")[0].trim();
  const siteDprs = (allDprsWithDetails as any[]).filter(
    d =>
      d.date === todayStr &&
      normSite(d.site ?? "") === currentSiteName &&
      !d.isSuperseded
  );

  // Engineer name match: DPR stores e.g. "RAMESH - SUPERVISOR" while user.fullName
  // is "Ramesh". Split on " - " and compare the first part case-insensitively.
  const engineerBase = (eng: string) => eng.split(" - ")[0].trim().toLowerCase();
  const myNameNorm   = myName.toLowerCase();

  // Current user's DPR:
  const myDpr    = siteDprs.find(d => engineerBase(d.engineer ?? "") === myNameNorm) ?? null;
  // Any other engineer's DPR for same site+date:
  const otherDpr = siteDprs.find(d => engineerBase(d.engineer ?? "") !== myNameNorm) ?? null;

  // Phase: what does the CTA look like?
  const dprPhase: DprPhase = (() => {
    if (myDpr) {
      const submitted = myDpr.status === "submitted" || !!myDpr.submittedAt;
      return submitted ? "submitted-own" : "draft-own";
    }
    if (otherDpr) return "submitted-other";
    return "not-started";
  })();

  const activeDpr = myDpr ?? otherDpr ?? null;
  const dprId: number | null = activeDpr?.id ?? null;

  // ── Today's Site Goal rows ────────────────────────────────────────────────
  interface GoalRow {
    id: string;
    item: string;
    stretch: string;
    planned: string;       // "—" or formatted number
    completed: string;
    toDo: string;
    toDoType: "backlog" | "ahead" | "on-track" | "pending" | "not-started";
    noProgramme?: boolean;
  }

  let goalRows: GoalRow[] = [];
  let programmeState: "live" | "no-bars" | "no-project" = "no-project";

  if (hasProgramme && (planVsActual as PlanVsActualRow[]).length > 0) {
    programmeState = "live";
    goalRows = (planVsActual as PlanVsActualRow[])
      .filter(r => r.totalPlanned > 0 || r.totalActual > 0)  // only items with data
      .slice(0, 8)                                           // cap at 8 on home screen
      .map((r, i) => {
        const planned   = r.totalPlanned;
        const actual    = r.totalActual;
        const diff      = actual - planned;
        const unit      = r.unit ?? "";
        const fmt = (n: number) =>
          n === 0 ? "—" : `${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })} ${unit}`.trim();

        let toDo: string;
        let toDoType: GoalRow["toDoType"];

        if (planned === 0) {
          toDo = "No target set";
          toDoType = "not-started";
        } else if (diff > 0.01) {
          toDo = `+${fmt(diff)} ahead`;
          toDoType = "ahead";
        } else if (diff < -0.01) {
          toDo = `${fmt(Math.abs(diff))} balance`;
          toDoType = "backlog";
        } else {
          toDo = "On track";
          toDoType = "on-track";
        }

        return {
          id: `r${r.boqItemId}`,
          item: extractShortName(r.description, r.categoryName),
          stretch: "",  // no per-row chainage in plan-vs-actual; BOQ is at project level
          planned:   fmt(planned),
          completed: fmt(actual),
          toDo,
          toDoType,
        };
      });
  } else if (activeProject && !hasProgramme) {
    programmeState = "no-bars";
  } else {
    programmeState = "no-project";
  }

  // Count items behind plan
  const behindCount = goalRows.filter(r => r.toDoType === "backlog").length;

  // ── Today's Focus (user + site + date aware) ──────────────────────────────
  const focusItems: FocusItem[] = [];

  if (dprPhase === "not-started") {
    focusItems.push({ level: "alert", text: "No DPR started yet — begin today's site work to log activities." });
  } else if (dprPhase === "submitted-other") {
    const filer = otherDpr?.engineer ?? "another user";
    focusItems.push({
      level: "info",
      text: `DPR filed by ${filer}. View today's site report below.`,
    });
  } else if (dprPhase === "submitted-own") {
    focusItems.push({ level: "ok", text: "DPR submitted. No pending submission items." });
  } else {
    // draft-own: show what's missing
    const eq  = (myDpr?.equipment ?? []).length;
    const lab = (myDpr?.labour    ?? []).length;
    const mat = (myDpr?.materials ?? []).length;
    const prg = (myDpr?.progress  ?? []).length;
    if (prg === 0) focusItems.push({ level: "warn",  text: "Activity quantities not yet entered — log work done today." });
    if (eq  === 0) focusItems.push({ level: "alert", text: "Equipment logs pending — record closing meters for all equipment." });
    if (lab === 0) focusItems.push({ level: "alert", text: "Labour count not yet entered — add today's workforce details." });
    if (mat === 0) focusItems.push({ level: "info",  text: "No material trips recorded — add material received today." });
    focusItems.push({ level: "info",  text: "Material challan photo — upload photos before submitting." });
  }

  // Append pending indents note if any
  if (sectionVisible("site_procurement")) {
    const pendingPi = (purchaseIndents as any[]).filter(
      p => p.status === "pending" || p.status === "submitted" || p.status === "stores_check"
    ).length;
    if (pendingPi > 0)
      focusItems.push({ level: "warn", text: `${pendingPi} purchase indent${pendingPi > 1 ? "s" : ""} pending — follow up with manager.` });
  }

  // Cap at 5
  const visibleFocus = focusItems.slice(0, 5);

  // ── Pending Before Submit checklist ────────────────────────────────────────
  // Only shown for draft-own (makes no sense for others' DPRs or not started)
  const eq  = (myDpr?.equipment ?? []).length;
  const lab = (myDpr?.labour    ?? []).length;
  const mat = (myDpr?.materials ?? []).length;
  const prg = (myDpr?.progress  ?? []).length;

  const pendingChecks: CheckItem[] = [
    {
      id: "c1", label: "Equipment closing meter",
      state: eq > 0 ? "done" : "pending",
      sub: eq > 0 ? `${eq} equipment logged` : "No equipment recorded yet",
    },
    {
      id: "c2", label: "Final labour count",
      state: lab > 0 ? "done" : "pending",
      sub: lab > 0 ? `${lab} labour records` : "No labour entries yet",
    },
    {
      id: "c3", label: "Material challan recorded",
      state: mat > 0 ? "done" : "pending",
      sub: mat > 0 ? `${mat} material log${mat > 1 ? "s" : ""}` : "No material entries yet",
    },
    {
      id: "c4", label: "Activity quantities entered",
      state: prg > 0 ? "done" : "pending",
      sub: prg > 0 ? `${prg} activit${prg === 1 ? "y" : "ies"} logged` : "No activities recorded yet",
    },
    {
      id: "c5", label: "DPR submitted",
      state: dprPhase === "submitted-own" ? "done" : "pending",
      sub: dprPhase === "submitted-own" ? "Submitted successfully" : "Submit once all items are done",
    },
  ];

  const doneCount    = pendingChecks.filter(c => c.state === "done").length;
  const pendingCount = pendingChecks.filter(c => c.state === "pending").length;
  const donePct      = Math.round((doneCount / pendingChecks.length) * 100);

  // ── CTA config (user + site + date aware) ─────────────────────────────────
  const dprHref = myDpr
    ? (dprPhase === "submitted-own" ? `/site/report/${myDpr.id}` : `/site/edit/${myDpr.id}`)
    : otherDpr
    ? `/site/report/${otherDpr.id}`
    : "/site/new";

  interface CtaConfig {
    label: string;
    href: string;
    status: string;
    color: string;
    dotColor: string;
    badge: string | null;
    badgeColor: string;
  }

  const ctaConfig: CtaConfig = (() => {
    switch (dprPhase) {
      case "not-started":
        return {
          label: "Start Today's Site Work",
          href: "/site/new",
          status: "DPR not started yet",
          color: "bg-orange-500 hover:bg-orange-600 shadow-orange-200",
          dotColor: "bg-orange-300",
          badge: null,
          badgeColor: "",
        };
      case "draft-own":
        return {
          label: pendingCount === 0 ? "Complete Today's Site Work" : "Continue Today's Site Work",
          href: `/site/edit/${myDpr!.id}`,
          status: `Draft open · ${doneCount}/${pendingChecks.length} items done`,
          color: "bg-orange-500 hover:bg-orange-600 shadow-orange-200",
          dotColor: "bg-orange-400",
          badge: "In progress",
          badgeColor: "bg-orange-50 text-orange-600",
        };
      case "submitted-own":
        return {
          label: "View Today's Site Report",
          href: `/site/report/${myDpr!.id}`,
          status: "DPR submitted",
          color: "bg-slate-400 hover:bg-slate-500 shadow-slate-200",
          dotColor: "bg-green-400",
          badge: "Submitted",
          badgeColor: "bg-green-50 text-green-600",
        };
      case "submitted-other": {
        const filer = otherDpr?.engineer ?? "another user";
        return {
          label: "View Today's Site Report",
          href: dprId ? `/site/report/${dprId}` : "/site/hub",
          status: `Today's DPR filed by ${filer}`,
          color: "bg-slate-400 hover:bg-slate-500 shadow-slate-200",
          dotColor: "bg-green-400",
          badge: "Filed",
          badgeColor: "bg-green-50 text-green-600",
        };
      }
    }
  })();

  // ── Quick actions ──────────────────────────────────────────────────────────
  const editHref = myDpr ? `/site/edit/${myDpr.id}` : "/site/new";

  interface QuickAction { label: string; icon: any; color: string; href: string; perm?: boolean }
  const allQuickActions: QuickAction[] = [
    { label: "Activity Photo", icon: Camera,        color: "bg-slate-600", href: editHref,                                    perm: sectionVisible("site_dprs") },
    { label: "Material Trip",  icon: Truck,         color: "bg-blue-600",  href: "/site/material-trips?returnTo=/",          perm: sectionVisible("site_materials") },
    { label: "Equipment Log",  icon: Wrench,        color: "bg-amber-600", href: editHref,                                    perm: sectionVisible("site_dprs") },
    { label: "Labour Log",     icon: Users,         color: "bg-teal-600",  href: editHref,                                    perm: sectionVisible("site_dprs") },
    { label: "Site Purchase",  icon: ShoppingCart,  color: "bg-green-600", href: editHref,                                    perm: sectionVisible("site_dprs") },
    { label: "Raise PI",       icon: ShoppingBag,   color: "bg-purple-600",href: "/plant/purchase-indents?returnTo=/&from=site", perm: sectionVisible("site_procurement") },
    { label: "Raise IRN",      icon: BookOpen,      color: "bg-indigo-600",href: "/irn/new?from=site&returnTo=/",             perm: canRaiseIrn },
    { label: "Site Remark",    icon: MessageSquare, color: "bg-rose-500",  href: editHref,                                    perm: sectionVisible("site_dprs") },
  ];
  const visibleActions = allQuickActions.filter(a => a.perm !== false);

  // ── Layout width ──────────────────────────────────────────────────────────
  const containerWidth = deviceType === "mobile" ? "max-w-lg" : "max-w-2xl";

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <HubShell title="Field Home">
      <div className="min-h-screen bg-gray-50 text-gray-900">

        {/* ── Sticky header ── */}
        <div className="bg-white border-b border-gray-100 shadow-sm sticky top-0 z-40">
          <div className={`${containerWidth} mx-auto px-4 pt-3 pb-3`}>
            <div className="flex items-center justify-between gap-3">
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
                  {currentSiteName && (
                    <div className="flex items-center gap-1 mt-0.5">
                      <MapPin className="w-3 h-3 text-orange-500 flex-shrink-0" />
                      <span className="text-xs font-bold text-gray-900 truncate" data-testid="text-primary-site">
                        {currentSiteName}
                      </span>
                    </div>
                  )}
                </div>
              </div>
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

          {/* ── Multi-site tab picker (only shown when >1 site) ── */}
          {activeSites.length > 1 && (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3">
              <p className="text-xs text-gray-400 font-medium mb-2">Select site</p>
              <div className="flex flex-wrap gap-2">
                {activeSites.map((s: any) => {
                  const hasDpr = (allDprsWithDetails as any[]).some(
                    (d: any) => d.date === todayStr && normSite(d.site ?? "") === s.name && !d.isSuperseded
                  );
                  const isActive = s.id === currentSiteId;
                  return (
                    <button
                      key={s.id}
                      onClick={() => setSelectedSiteId(s.id)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                        isActive
                          ? "bg-orange-500 text-white border-orange-500"
                          : "bg-white text-gray-700 border-gray-200 hover:border-orange-300"
                      }`}
                      data-testid={`site-tab-${s.id}`}
                    >
                      {s.name}
                      {hasDpr && <CheckCircle2 className="w-3 h-3 text-green-400" />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════
              1. TODAY'S SITE GOAL
              ══════════════════════════════════════════════════════ */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                  <Target className="w-4 h-4 text-orange-500" />
                  Today's Site Goal
                </h2>
                <p className="text-xs text-gray-400 mt-0.5">Planned vs completed vs to be done</p>
              </div>
              {programmeState === "live" && behindCount > 0 && (
                <span className="text-xs font-semibold text-red-500 bg-red-50 px-2 py-0.5 rounded-full border border-red-100">
                  {behindCount} behind
                </span>
              )}
              {programmeState === "live" && (
                <Link href={`/work-program/${activeProject!.id}`}>
                  <a className="text-xs font-medium text-orange-500 flex items-center gap-0.5 ml-2">
                    View all <ChevronRight className="w-3 h-3" />
                  </a>
                </Link>
              )}
            </div>

            {/* No programme set up yet */}
            {programmeState !== "live" && (
              <div className="px-4 py-6 text-center" data-testid="text-goal-no-programme">
                <AlertCircle className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                <p className="text-sm font-medium text-gray-500">
                  {programmeState === "no-project"
                    ? "Programme link pending"
                    : "No work programme bars set up yet"}
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  {programmeState === "no-project"
                    ? "Link a BOQ project to this site to see planned vs actual targets here."
                    : "Add bars in the Work Programme to see planned quantities here."}
                </p>
                <Link href="/work-program">
                  <a className="mt-2 inline-block text-xs font-medium text-orange-500" data-testid="link-setup-programme">
                    Set up Work Programme →
                  </a>
                </Link>
              </div>
            )}

            {/* Live programme data */}
            {programmeState === "live" && goalRows.length === 0 && (
              <div className="px-4 py-6 text-center text-sm text-gray-400" data-testid="text-goal-no-data">
                No items with plan or actual data for this site.
              </div>
            )}

            {programmeState === "live" && goalRows.length > 0 && (
              <>
                {/* Column headers */}
                <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-3 px-4 py-2 bg-gray-50 border-b border-gray-100 text-[10px] font-semibold text-gray-400 uppercase tracking-wide">
                  <span>Item</span>
                  <span className="text-right w-20">Planned</span>
                  <span className="text-right w-20">Completed</span>
                  <span className="text-right w-24">To be done</span>
                </div>
                <div className="divide-y divide-gray-50">
                  {goalRows.map(row => (
                    <div
                      key={row.id}
                      className="grid grid-cols-[1fr_auto_auto_auto] gap-x-3 px-4 py-3 items-center hover:bg-gray-50/60 transition-colors"
                      data-testid={`goal-row-${row.id}`}
                    >
                      <div>
                        <p className="text-sm font-semibold text-gray-900 leading-tight">{row.item}</p>
                        {row.stretch && <p className="text-xs text-gray-400 mt-0.5">{row.stretch}</p>}
                      </div>
                      <div className="w-20 text-right">
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

          {/* ══════════════════════════════════════════════════════
              2. TODAY'S FOCUS
              ══════════════════════════════════════════════════════ */}
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

          {/* ══════════════════════════════════════════════════════
              3. TODAY'S SITE WORK — dynamic CTA
              ══════════════════════════════════════════════════════ */}
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

            {/* Flow steps */}
            <div className="flex items-center gap-1 flex-wrap">
              {["Start of Day", "Progress", "Labour", "Equipment", "Materials", "Photos", "Submit"].map((step, i, arr) => (
                <span key={step} className="flex items-center gap-1">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                    dprPhase === "submitted-own" || dprPhase === "submitted-other"
                      ? "bg-green-100 text-green-700"
                      : dprPhase === "draft-own" && i <= 1
                      ? "bg-orange-100 text-orange-700"
                      : "bg-gray-100 text-gray-400"
                  }`}>{step}</span>
                  {i < arr.length - 1 && <ChevronRight className="w-2.5 h-2.5 text-gray-300 flex-shrink-0" />}
                </span>
              ))}
            </div>

            {/* CTA */}
            <Link href={ctaConfig.href}>
              <a
                className={`w-full py-4 rounded-2xl text-white font-bold text-base flex items-center justify-center gap-2 shadow-lg transition-all active:scale-[0.98] ${ctaConfig.color}`}
                data-testid="button-site-work-cta"
              >
                <span>{ctaConfig.label}</span>
                <ArrowRight className="w-5 h-5 ml-auto" />
              </a>
            </Link>

            {/* Status + pending badge */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${ctaConfig.dotColor}`} />
                <p className="text-xs text-gray-500">{ctaConfig.status}</p>
              </div>
              {dprPhase === "draft-own" && pendingCount > 0 && (
                <span className="text-[10px] font-semibold text-amber-600 bg-amber-50 border border-amber-100 px-2 py-0.5 rounded-full flex-shrink-0">
                  {pendingCount} item{pendingCount !== 1 ? "s" : ""} pending
                </span>
              )}
            </div>
          </div>

          {/* ══════════════════════════════════════════════════════
              4. QUICK ACTIONS
              ══════════════════════════════════════════════════════ */}
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

          {/* ══════════════════════════════════════════════════════
              5. PENDING BEFORE SUBMIT
              Only meaningful when current user has an open draft.
              ══════════════════════════════════════════════════════ */}
          {(dprPhase === "draft-own" || dprPhase === "submitted-own") && (
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

              {/* Progress strip */}
              <div className="h-1 w-full bg-gray-100">
                <div
                  className={`h-full transition-all duration-500 ${donePct === 100 ? "bg-green-400" : "bg-amber-400"}`}
                  style={{ width: `${donePct}%` }}
                />
              </div>

              <div className="px-4 py-1 divide-y divide-gray-50">
                {pendingChecks.map(c => <PendingRow key={c.id} item={c} />)}
              </div>

              <div className="px-4 pb-3 pt-2">
                {dprPhase !== "submitted-own" ? (
                  <Link href={myDpr ? `/site/edit/${myDpr.id}` : "/site/new"}>
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
                  <Link href={`/site/report/${myDpr!.id}`}>
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
          )}

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

        </div>{/* /scrollable body */}

        {/* ── Bottom nav ── */}
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 shadow-lg z-50">
          <div className={`${containerWidth} mx-auto flex items-center justify-around px-4 py-2`}>
            {[
              { label: "Work",     icon: Home,      href: "/"              },
              { label: "Reports",  icon: FileText,  href: "/site/hub"      },
              { label: "Progress", icon: BarChart2, href: "/site/dashboard"},
              { label: "Profile",  icon: User,      href: "/profile"       },
            ].map(n => {
              const active = n.href === "/";
              return (
                <Link href={n.href} key={n.label}>
                  <a className="flex flex-col items-center gap-1 px-3 py-1" data-testid={`nav-tab-${n.label.toLowerCase()}`}>
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
