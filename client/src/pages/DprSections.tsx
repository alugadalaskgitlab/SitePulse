import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, useRoute, useSearch } from "wouter";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useDpr } from "@/hooks/use-dprs";
import { useDprBoqItems } from "@/hooks/use-dpr-boq-items";
import type { DprReadinessIssue } from "@shared/dprSubmitReadiness";
import { evaluateSectionReadiness } from "@/lib/dprSectionReadiness";
import { DPR_SECTIONS, normalizeDprSectionContext, type DprSection, type DprSectionContext, type DprSectionSnapshot, type DprSectionResolution } from "@shared/dprSections";
import SiteEntry from "./SiteEntry";
import SiteEdit from "./SiteEdit";
import { DPR_REGISTER_PATH, resolveReturnTo } from "@/lib/progressReportNav";
import { createDprSectionSaveAttempt } from "@/lib/dprSectionSaveAttempt";

const editorSection = (section: DprReadinessIssue["section"]): DprSection =>
  section === "activities" ? "activity" : section;

function MissingItems({ issues, onFix }: { issues: DprReadinessIssue[]; onFix: (issue: DprReadinessIssue) => void }) {
  if (!issues.length) return null;
  return <aside role="status" aria-label="Items needed before submission" className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-950 space-y-2" data-testid="section-readiness-banner">
    <h2 className="font-semibold">{issues.length} {issues.length === 1 ? "item" : "items"} to resolve before submission</h2>
    {issues.map((issue, index) => <div key={`${issue.section}-${issue.rowIndex ?? issue.rowKey ?? index}-${issue.message}`} className="flex flex-wrap items-center gap-2 text-sm">
      <span>• {issue.label}: {issue.message}</span>
      <Button type="button" size="sm" variant="outline" onClick={() => onFix(issue)}>Fix →</Button>
    </div>)}
  </aside>;
}

async function request<T>(url: string, method = "GET", body?: unknown): Promise<T> {
  const response = await fetch(url, {
    method, credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(`${response.status === 409 ? "Conflict: this DPR changed in another session. Your local edits are retained. Reload and review before saving again. " : ""}${data.message ?? data.error ?? `Request failed (${response.status})`}`);
  }
  return data;
}

/** The original registered draft URL stays valid; submitted/version edits keep their original editor. */
export function DprEditEntry() {
  const search = useSearch();
  const [, params] = useRoute("/site/edit/:id");
  const id = Number(params?.id);
  const query = useDpr(id);
  if (query.isLoading) return <p>Loading DPR…</p>;
  if (query.error || !query.data) return <p role="alert">Could not load DPR. Reload to retry.</p>;
  return query.data.dprStatus === "draft" && new URLSearchParams(search).get("combined") !== "1"
    ? <DprSections initialId={id} /> : <SiteEdit />;
}

export function DprWorkEntry() {
  const [, params] = useRoute("/site/work/:id");
  return <DprSections initialId={Number(params?.id)} />;
}

export default function DprSections({ initialId }: { initialId?: number } = {}) {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const params = new URLSearchParams(search);
  const initial = initialId ?? (Number(params.get("dprId") || params.get("draftId")) || undefined);
  const [context, setContext] = useState<DprSectionContext>(() => normalizeDprSectionContext({
    site: params.get("site") ?? "", date: params.get("date") ?? format(new Date(), "yyyy-MM-dd"),
    workType: params.get("type") === "structure" ? "structure" : "road",
    boqProjectId: params.get("boqProjectId"),
  }));
  const [engineer, setEngineer] = useState(params.get("engineer") ?? "");
  const [snapshot, setSnapshot] = useState<DprSectionSnapshot>();
  const snapshotRef = useRef<DprSectionSnapshot>();
  const saveAttempt = useRef(createDprSectionSaveAttempt());
  const [resolved, setResolved] = useState(false);
  const [candidates, setCandidates] = useState<DprSectionResolution["candidates"]>();
  const [section, setSection] = useState<DprSection>();
  const [generation, setGeneration] = useState(0);
  const [review, setReview] = useState(false);
  const [target, setTarget] = useState<{ issue: DprReadinessIssue; token: number }>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const sites = useQuery<any[]>({ queryKey: ["/api/sites"] });
  const boq = useDprBoqItems({ siteName: context.site, sites: sites.data ?? [], preferredProjectId: context.boqProjectId, recoveryEvidence: snapshot?.dpr });
  useEffect(() => {
    if (initial || resolved || context.site) return;
    const available = (sites.data ?? []).filter(site => site.isActive !== false && site.isActive !== 0);
    if (available.length === 1) setContext(current => ({ ...current, site: normalizeDprSectionContext({ site: available[0].name }).site }));
  }, [sites.data, context.site, resolved, initial]);

  const adopt = (next: DprSectionSnapshot) => {
    snapshotRef.current = next;
    setSnapshot(next);
    setContext(next.context);
    setEngineer(next.dpr.engineer ?? "");
    setResolved(true);
    setCandidates(undefined);
    const url = new URL(window.location.href);
    url.searchParams.set("dprId", String(next.dpr.id));
    window.history.replaceState(window.history.state, "", url);
  };
  const run = async (action: () => Promise<void>) => {
    setBusy(true); setError("");
    try { await action(); } catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  };
  const load = async (id: number) => adopt(await request<DprSectionSnapshot>(`/api/dpr-sections/${id}`));
  useEffect(() => { if (initial) void run(() => load(initial)); }, []);
  const resolve = async () => {
    const result = await request<DprSectionResolution>("/api/dpr-sections/resolve", "POST", { context });
    if (result.kind === "existing" && result.snapshot) adopt(result.snapshot);
    else if (result.kind === "choose") setCandidates(result.candidates);
    else { setResolved(true); setCandidates(undefined); }
  };
  const save = async (data: unknown, firstEngineer: string, recoveredProjectId?: number | null) => {
    const current = snapshotRef.current;
    if (!section) throw new Error("Choose a section first.");
    try {
      const next = await request<DprSectionSnapshot>(`/api/dpr-sections/${section}`, "PUT", saveAttempt.current({
        dprId: current?.dpr.id, context: context.boqProjectId == null && recoveredProjectId != null
          ? { ...context, boqProjectId: recoveredProjectId } : context,
        sectionToken: current?.sectionTokens[section], headerToken: current?.headerToken,
        data: { ...(data as Record<string, unknown>), ...(!current ? { engineer: firstEngineer } : {}) },
      }, section));
      adopt(next);
      setError("");
      return next;
    } catch (err) {
      setError((err as Error).message);
      throw err;
    }
  };
  const final = snapshot && (snapshot.dpr.dprStatus !== "draft" || snapshot.dpr.isDeleted || snapshot.dpr.isCancelled || snapshot.dpr.isSuperseded);
  // Never call the evaluator with unresolved BOQ items: that would incorrectly
  // report a saved roadway excavation as complete before its catalogue loads.
  const boqReady = boq.projectsLoaded && !boq.projectsLoading && !boq.projectsError && !boq.itemsLoading && !boq.itemsError
    && (boq.projectId == null || boq.itemsLoaded) && (context.boqProjectId == null || boq.projectId === context.boqProjectId)
    && (snapshot?.dpr.progress ?? []).every((row: any) => row.boqItemId == null || boq.items.some(item => Number(item.id) === Number(row.boqItemId)));
  const readiness = snapshot && boqReady ? evaluateSectionReadiness(snapshot.dpr, boq.items) : null;
  const fix = (issue: DprReadinessIssue) => {
    setReview(false);
    setTarget(previous => ({ issue, token: (previous?.token ?? 0) + 1 }));
    setSection(editorSection(issue.section));
  };
  const openCombined = async (guided: boolean) => {
    if (!resolved) {
      const result = await request<DprSectionResolution>("/api/dpr-sections/resolve", "POST", { context });
      if (result.kind === "choose") { setCandidates(result.candidates); return; }
      if (result.kind === "existing" && result.snapshot) adopt(result.snapshot);
      else setResolved(true);
    }
    const current = snapshotRef.current;
    const routeContext = current?.context ?? context;
    const routeSite = (sites.data ?? []).find(site => normalizeDprSectionContext({ site: site.name }).site === routeContext.site)?.name ?? routeContext.site;
    const back = current ? `/site/work/${current.dpr.id}?returnTo=${encodeURIComponent(resolveReturnTo(search, DPR_REGISTER_PATH))}`
      : `/site/new?${new URLSearchParams({ site: context.site, date: context.date, type: context.workType, engineer,
        ...(context.boqProjectId == null ? {} : { boqProjectId: String(context.boqProjectId) }),
        returnTo: resolveReturnTo(search, DPR_REGISTER_PATH) })}`;
    const query = new URLSearchParams({ returnTo: back, site: routeSite, date: routeContext.date,
      type: routeContext.workType, engineer: current?.dpr.engineer ?? engineer, boqProjectId: routeContext.boqProjectId == null ? "" : String(routeContext.boqProjectId) });
    if (current) {
      query.set("draftId", String(current.dpr.id));
      query.set("combined", "1");
      query.set("draft", "1");
    }
    setLocation(`${guided ? "/site/guided/combined" : current ? `/site/edit/${current.dpr.id}` : "/site/combined"}?${query}`);
  };
  return <main className="max-w-5xl mx-auto space-y-5 pb-16">
    {error && <div role="alert" className="border border-destructive rounded p-4 space-y-3">
      <p>{error}</p>
      <Button variant="outline" disabled={busy} onClick={() => {
        if (section && !window.confirm("Discard local changes and reload the persisted DPR for review?")) return;
        void run(async () => {
          if (snapshotRef.current) await load(snapshotRef.current.dpr.id);
          else await resolve();
          setSection(undefined); setReview(false); setGeneration(n => n + 1);
        });
      }}>Reload &amp; review persisted DPR</Button>
    </div>}
    {section && !final ? <SiteEntry key={`${section}-${generation}`} sectionEditor={{
      section, context, snapshot, engineer, onSave: save, onReturn: () => { setSection(undefined); setReview(false); },
      target, onFixOtherSection: fix,
    }} /> : <>
      <h1 className="text-2xl font-bold">{context.workType === "structure" ? "Structure DPR" : "Road Works DPR"}</h1>
      <Button variant="ghost" onClick={() => setLocation(resolveReturnTo(search, DPR_REGISTER_PATH))}>Back to DPRs</Button>
      <p className="text-muted-foreground">Save each section independently. Only Review &amp; Submit finalizes the DPR.</p>
      {snapshot && !final && (readiness
        ? <MissingItems issues={readiness.mandatory} onFix={fix} />
        : <p role="status" className="rounded border border-amber-200 p-3 text-sm">
          {boq.itemsError || boq.projectsError ? `BOQ items could not be loaded: ${String(boq.itemsError ?? boq.projectsError)}`
            : context.boqProjectId != null && boq.projectsLoaded && boq.projectId !== context.boqProjectId
              ? "Saved DPR BOQ project could not be resolved; submission readiness is unavailable."
              : boq.itemsLoaded && (snapshot.dpr.progress ?? []).some((row: any) => row.boqItemId != null && !boq.items.some(item => Number(item.id) === Number(row.boqItemId)))
                ? "A saved activity's BOQ item could not be resolved; submission readiness is unavailable."
              : "Checking submission readiness against BOQ items…"}
        </p>)}
      {!final && !candidates && <div className="rounded border p-4 space-y-2">
        <p className="text-sm">Prefer the earlier combined entry? These optional editors remain available. Independent sections are the default.</p>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" disabled={busy || !context.site || (!!initial && !snapshot)} onClick={() => void run(() => openCombined(false))} data-testid="open-combined-detailed">Use combined Detailed editor</Button>
          {context.workType === "road" && <Button variant="outline" disabled={busy || !context.site || (!!initial && !snapshot)} onClick={() => void run(() => openCombined(true))} data-testid="open-combined-guided">Use combined Guided editor</Button>}
        </div>
      </div>}
      {!resolved && !initial && <div className="grid sm:grid-cols-2 gap-4 rounded-lg border p-5">
        <div><Label htmlFor="dpr-site">Site</Label><select id="dpr-site" className="w-full border rounded p-2" value={context.site} onChange={e => setContext({ ...context, site: e.target.value, boqProjectId: null })}>
          <option value="">Choose site</option>{(sites.data ?? []).filter(s => s.isActive !== false && s.isActive !== 0).map(s => <option key={s.id} value={normalizeDprSectionContext({ site: s.name }).site}>{s.name}</option>)}
        </select>{sites.error && <p role="alert">Sites could not be loaded.</p>}</div>
        <div><Label htmlFor="dpr-date">Reporting date</Label><Input id="dpr-date" type="date" value={context.date} onChange={e => setContext({ ...context, date: e.target.value })} /></div>
        <div><Label htmlFor="dpr-project">BOQ project</Label><select id="dpr-project" className="w-full border rounded p-2" value={context.boqProjectId ?? ""} onChange={e => setContext({ ...context, boqProjectId: e.target.value ? Number(e.target.value) : null })}>
          <option value="">No project</option>{boq.projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>{boq.projectsError && <p role="alert">Projects could not be loaded. Retry before choosing a context.</p>}</div>
        <div><Label htmlFor="dpr-engineer">Engineer (first save)</Label><Input id="dpr-engineer" value={engineer} onChange={e => setEngineer(e.target.value)} /></div>
        <Button disabled={busy || !context.site || !context.date || !!boq.projectsError || boq.projectsLoading} onClick={() => void run(resolve)}>Open sections</Button>
      </div>}
      {candidates && <section className="rounded border p-4 space-y-3">
        <h2 className="font-semibold">Multiple matching drafts — choose explicitly</h2>
        {candidates.map(candidate => <Button key={candidate.id} variant="outline" className="block" disabled={busy} onClick={() => void run(() => load(candidate.id))}>
          DPR #{candidate.id} · {candidate.engineer} · {candidate.date} · Last edited {String(candidate.lastEditedAt ?? candidate.createdAt)}
        </Button>)}
      </section>}
      {resolved && <>
        <p className="rounded border p-4">{context.site} · {context.date} · {context.workType} · Project {context.boqProjectId ?? "none"}{snapshot ? ` · DPR #${snapshot.dpr.id}` : " · No draft created yet"}</p>
        {!snapshot && <div><Label>Engineer (required for first save)</Label><Input value={engineer} onChange={e => setEngineer(e.target.value)} /></div>}
        {final ? <p role="status">This DPR is {snapshot?.dpr.dprStatus}. Section editing is closed.</p> : <>
          <div className="grid sm:grid-cols-2 gap-4">{DPR_SECTIONS.map(name => <button key={name} className="text-left border rounded-lg p-5 space-y-2 hover:bg-muted disabled:opacity-50" disabled={busy || (!snapshot && !engineer.trim())} onClick={() => { setReview(false); setSection(name); }}>
            <h2 className="font-semibold capitalize">{name === "activity" ? "Activity / Progress" : name === "materials" ? "Materials / Site Purchases" : name}</h2>
            <p>{snapshot?.sections[name].state ?? "empty"} — {name === "equipment" && snapshot?.sections[name].issues?.some(issue => /closing|end time/i.test(issue.message))
              ? "Equipment saved — closing needed" : snapshot?.sections[name].label ?? "Not yet entered"}</p>
            {snapshot?.sections[name].issues?.map((issue, index) => <p className="text-sm text-muted-foreground" key={index}>{issue.message}</p>)}
          </button>)}</div>
          <Button disabled={busy || !snapshot} onClick={() => setReview(true)}>Review &amp; Submit</Button>
          {review && snapshot && <section className="border rounded p-5 space-y-3">
            <h2 className="text-xl font-semibold">Review persisted DPR</h2>
            <p>Only saved sections are included. Submission rechecks every section version on the server.</p>
            {readiness?.mandatory.map((issue, index) => <p key={index}>{issue.label}: {issue.message}</p>)}
            <Button disabled={busy || !readiness?.ready} onClick={() => void run(async () => {
              const current = snapshotRef.current!;
              const next = await request<DprSectionSnapshot>(`/api/dpr-sections/${current.dpr.id}/submit`, "POST", {
                sectionTokens: current.sectionTokens, headerToken: current.headerToken,
                clientTimestamp: format(new Date(), "yyyy-MM-dd HH:mm:ss"),
              });
              // The shared legacy submit handler returns a DPR; section-aware
              // handlers may return a snapshot. Both close editing immediately.
              adopt(next.dpr ? next : { ...current, dpr: next }); setReview(false);
            })}>Submit DPR</Button>
          </section>}
        </>}
      </>}
    </>}
  </main>;
}