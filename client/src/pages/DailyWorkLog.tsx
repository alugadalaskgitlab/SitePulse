import { useMemo, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { ArrowLeft, FileText, Plus, Trash2, Pencil, X, Upload } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useUpload } from "@/hooks/use-upload";
import { apiRequest } from "@/lib/queryClient";
import { AttachmentViewer } from "@/components/AttachmentViewer";

type WorkEntry = {
  id: number; personnelId: number; personName: string; createdByUserId: number;
  workDate: string; place: string; workType: string; siteId: number | null;
  siteName: string | null; durationMinutes: number | null; details: string;
};
type Visit = {
  id: number; recordedByPersonnelId: number; personName: string; recordedByUserId: number;
  visitDate: string; place: string; visitorName: string; visitorDesignation: string | null;
  organisation: string | null; purpose: string; pointsDiscussed: string;
  attachment: { fileName: string; objectPath: string; mimeType: string | null; fileSize: number | null } | null;
};
type DprActivity = {
  id: number; dprId: number; date: string; site: string; personnelId: number; personName: string;
  type: string; title: string; details: string; resultPass: boolean | null; href: string; place: string;
};
type DayData = {
  date: string; view: "personal" | "team"; workEntries: WorkEntry[];
  visits: Visit[]; dprActivities: DprActivity[]; totalDurationMinutes: number;
};
type ContextData = {
  linked: boolean; personName?: string | null; teamViewAllowed: boolean;
  sites: Array<{ id: number; name: string }>;
};
type WorkDraft = {
  workDate: string; place: string; workType: string; siteId: string;
  siteName: string; duration: string; details: string;
};
type VisitDraft = {
  visitDate: string; place: string; visitorName: string; visitorDesignation: string;
  organisation: string; purpose: string; pointsDiscussed: string;
  attachment: Visit["attachment"];
};

const WORK_PLACES = ["Site office", "Plant office", "Head office"];
const WORK_TYPES = [
  "MB entry", "RA bill preparation", "Drawings / cross sections", "Reports",
  "Letters / correspondence", "Stores / records", "Accounts", "Purchase", "Other",
];
const VISIT_PLACES = ["HLC plant", "Head office"];
const VISIT_PURPOSES = ["Inspection", "Meeting", "Audit", "Other"];

function indiaToday() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
}
function formatMinutes(value: number | null | undefined) {
  if (!Number.isFinite(Number(value)) || value == null) return "";
  return `${Math.floor(Number(value) / 60)}:${String(Number(value) % 60).padStart(2, "0")}`;
}
function parseDuration(value: string) {
  if (!value.trim()) return null;
  const match = value.trim().match(/^(\d{1,2}):([0-5]\d)$/);
  return match ? Number(match[1]) * 60 + Number(match[2]) : NaN;
}
async function readResponse(response: Response) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.message || payload.error || `Request failed (${response.status}).`);
  return payload;
}
function useMutationState(isPending: boolean) {
  return isPending ? "Saving…" : "Save";
}
function todayOrYesterday(date: string) {
  const today = indiaToday();
  const previous = new Date(`${today}T00:00:00Z`);
  previous.setUTCDate(previous.getUTCDate() - 1);
  return date === today || date === previous.toISOString().slice(0, 10);
}

export default function DailyWorkLog() {
  const { user, sectionCan, sectionVisible } = useAuth();
  const queryClient = useQueryClient();
  const { uploadFile, isUploading } = useUpload();
  const [date, setDate] = useState(indiaToday);
  const [tab, setTab] = useState<"day" | "visits" | "team">("day");
  const [personFilter, setPersonFilter] = useState("");
  const [placeFilter, setPlaceFilter] = useState("");
  const [workId, setWorkId] = useState<number | null>(null);
  const [visitId, setVisitId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [viewingAttachment, setViewingAttachment] = useState<any>(null);
  const [visitFile, setVisitFile] = useState<File | null>(null);
  const [workDraft, setWorkDraft] = useState<WorkDraft>({
    workDate: indiaToday(), place: "Site office", workType: "Other", siteId: "", siteName: "", duration: "", details: "",
  });
  const [visitDraft, setVisitDraft] = useState<VisitDraft>({
    visitDate: indiaToday(), place: "HLC plant", visitorName: "", visitorDesignation: "",
    organisation: "", purpose: "Inspection", pointsDiscussed: "", attachment: null,
  });
  const contextQuery = useQuery<ContextData>({
    queryKey: ["/api/daily-work-log/context"],
    queryFn: async () => readResponse(await fetch("/api/daily-work-log/context", { credentials: "include" })),
  });
  const context = contextQuery.data;
  const canCreate = sectionCan("daily_work_log", "create");
  const canEdit = sectionCan("daily_work_log", "edit");
  const canDelete = sectionCan("daily_work_log", "delete");
  const isOwner = !!user?.isOwner;
  const teamAllowed = !!context?.teamViewAllowed;
  const teamView = tab === "team";
  const dayQuery = useQuery<DayData>({
    queryKey: ["/api/daily-work-log", date, teamView ? "team" : "personal", personFilter, placeFilter],
    queryFn: async () => {
      const params = new URLSearchParams({ date, view: teamView ? "team" : "personal" });
      if (teamView && personFilter) params.set("personnelId", personFilter);
      if (teamView && placeFilter) params.set("place", placeFilter);
      return readResponse(await fetch(`/api/daily-work-log?${params}`, { credentials: "include" }));
    },
    enabled: !!context?.linked && (!teamView || teamAllowed),
  });
  const data = dayQuery.data;
  const workEntries = data?.workEntries ?? [];
  const visits = data?.visits ?? [];
  const dprActivities = data?.dprActivities ?? [];
  const people = useMemo(() => {
    const byId = new Map<number, string>();
    for (const row of [...workEntries, ...visits.map(row => ({
      personnelId: row.recordedByPersonnelId, personName: row.personName,
    })), ...dprActivities.map(row => ({
      personnelId: row.personnelId, personName: row.personName,
    }))]) {
      byId.set(row.personnelId, row.personName);
    }
    return Array.from(byId.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [workEntries, visits, dprActivities]);
  const places = useMemo(() => Array.from(new Set([
    ...workEntries.map(row => row.place),
    ...visits.map(row => row.place),
    ...dprActivities.map(row => row.place),
  ])).sort(), [workEntries, visits, dprActivities]);
  const canChangeWork = (row: WorkEntry) =>
    isOwner || (row.createdByUserId === user?.id && todayOrYesterday(row.workDate));
  const canChangeVisit = (row: Visit) =>
    isOwner || (row.recordedByUserId === user?.id && todayOrYesterday(row.visitDate));

  const clearWork = () => {
    setWorkId(null);
    setError("");
    setWorkDraft({ workDate: date, place: "Site office", workType: "Other", siteId: "", siteName: "", duration: "", details: "" });
  };
  const clearVisit = () => {
    setVisitId(null);
    setVisitFile(null);
    setError("");
    setVisitDraft({
      visitDate: date, place: "HLC plant", visitorName: "", visitorDesignation: "",
      organisation: "", purpose: "Inspection", pointsDiscussed: "", attachment: null,
    });
  };
  const refreshDay = async () => queryClient.invalidateQueries({ queryKey: ["/api/daily-work-log"] });
  const workSave = useMutation({
    mutationFn: async () => {
      const durationMinutes = parseDuration(workDraft.duration);
      if (Number.isNaN(durationMinutes)) throw new Error("Enter duration as h:mm, for example 1:30.");
      const payload = {
        workDate: workDraft.workDate, place: workDraft.place, workType: workDraft.workType,
        siteId: workDraft.siteId || null, durationMinutes, details: workDraft.details,
      };
      const editing = workId != null && workId > 0;
      const response = await apiRequest(editing ? "PATCH" : "POST",
        editing ? `/api/daily-work-log/entries/${workId}` : "/api/daily-work-log/entries", payload);
      return readResponse(response);
    },
    onSuccess: async () => { clearWork(); await refreshDay(); },
    onError: (cause: any) => setError(cause?.message ?? "The entry could not be saved."),
  });
  const visitSave = useMutation({
    mutationFn: async () => {
      let attachment = visitDraft.attachment;
      if (visitFile) {
        const uploaded = await uploadFile(visitFile);
        if (!uploaded) throw new Error("The attachment could not be uploaded.");
        attachment = {
          fileName: visitFile.name, objectPath: uploaded.objectPath,
          mimeType: visitFile.type || (visitFile.name.toLowerCase().endsWith(".pdf") ? "application/pdf" : "image/jpeg"),
          fileSize: visitFile.size,
        };
      }
      const editing = visitId != null && visitId > 0;
      const response = await apiRequest(editing ? "PATCH" : "POST",
        editing ? `/api/daily-work-log/visits/${visitId}` : "/api/daily-work-log/visits",
        { ...visitDraft, attachment });
      return readResponse(response);
    },
    onSuccess: async () => { clearVisit(); await refreshDay(); },
    onError: (cause: any) => setError(cause?.message ?? "The visit could not be saved."),
  });
  const removeMutation = useMutation({
    mutationFn: async ({ kind, id }: { kind: "entries" | "visits"; id: number }) =>
      readResponse(await apiRequest("DELETE", `/api/daily-work-log/${kind}/${id}`)),
    onSuccess: refreshDay,
    onError: (cause: any) => setError(cause?.message ?? "The record could not be removed."),
  });

  function submitWork(event: FormEvent) {
    event.preventDefault();
    setError("");
    workSave.mutate();
  }
  async function submitVisit(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (visitFile && (!visitFile.type.startsWith("image/") && visitFile.type !== "application/pdf")) {
      setError("Choose an image or PDF.");
      return;
    }
    if (visitFile && visitFile.size > 15 * 1024 * 1024) {
      setError("The file must be 15 MB or smaller.");
      return;
    }
    visitSave.mutate();
  }
  function beginWorkEdit(row: WorkEntry) {
    setWorkId(row.id);
    setError("");
    setWorkDraft({
      workDate: row.workDate, place: row.place, workType: row.workType,
      siteId: row.siteId == null ? "" : String(row.siteId),
      siteName: row.siteName ?? "",
      duration: formatMinutes(row.durationMinutes), details: row.details,
    });
  }
  function beginVisitEdit(row: Visit) {
    setVisitId(row.id);
    setVisitFile(null);
    setError("");
    setVisitDraft({
      visitDate: row.visitDate, place: row.place, visitorName: row.visitorName,
      visitorDesignation: row.visitorDesignation ?? "", organisation: row.organisation ?? "",
      purpose: row.purpose, pointsDiscussed: row.pointsDiscussed, attachment: row.attachment,
    });
  }

  if (contextQuery.isLoading) return <p className="p-4 text-sm text-muted-foreground">Loading your work log…</p>;
  if (contextQuery.isError) return <p className="p-4 text-sm text-destructive">{(contextQuery.error as Error).message}</p>;
  if (!context?.linked) return (
    <main className="mx-auto max-w-3xl space-y-4 p-4">
      <Link href="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground"><ArrowLeft className="h-4 w-4" />Back</Link>
      <h1 className="text-xl font-semibold">Daily work log</h1>
      <p role="alert" className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm">
        Your login is not linked to a person in the Personnel master — ask the Owner
      </p>
    </main>
  );

  const readOnlyDate = !isOwner && !todayOrYesterday(date);
  const activeFormDisabled = !canCreate && !workId && !visitId;

  return (
    <main className="mx-auto max-w-4xl space-y-4 pb-10" data-testid="daily-work-log">
      <div className="flex items-center justify-between gap-3">
        <Link href="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground"><ArrowLeft className="h-4 w-4" />Back</Link>
        <div className="flex items-center gap-2">
          <label htmlFor="daily-work-date" className="text-sm">Date</label>
          <input id="daily-work-date" type="date" value={date} onChange={event => {
            setDate(event.target.value); clearWork(); clearVisit();
          }} className="rounded-md border bg-background px-2 py-1.5 text-sm" />
        </div>
      </div>
      <header>
        <h1 className="text-xl font-semibold">Daily work log</h1>
        <p className="text-sm text-muted-foreground">{context.personName?.toLocaleUpperCase("en")}</p>
      </header>
      <nav className="flex flex-wrap gap-2 border-b pb-2" aria-label="Daily work log views">
        <button type="button" onClick={() => setTab("day")} aria-current={tab === "day" ? "page" : undefined} className={`rounded-md px-3 py-2 text-sm ${tab === "day" ? "bg-primary text-primary-foreground" : "border"}`}>My day</button>
        <button type="button" onClick={() => setTab("visits")} aria-current={tab === "visits" ? "page" : undefined} className={`rounded-md px-3 py-2 text-sm ${tab === "visits" ? "bg-primary text-primary-foreground" : "border"}`}>Visits &amp; inspections</button>
        {teamAllowed && <button type="button" onClick={() => setTab("team")} aria-current={tab === "team" ? "page" : undefined} className={`rounded-md px-3 py-2 text-sm ${tab === "team" ? "bg-primary text-primary-foreground" : "border"}`}>Team view</button>}
      </nav>

      {teamView && teamAllowed && (
        <section className="grid gap-3 rounded-lg border bg-muted/20 p-3 sm:grid-cols-2" aria-label="Team filters">
          <label className="grid gap-1 text-sm">Person
            <select value={personFilter} onChange={event => setPersonFilter(event.target.value)} className="rounded-md border bg-background px-3 py-2">
              <option value="">Everyone</option>
              {people.map(([id, name]) => <option key={id} value={id}>{name.toLocaleUpperCase("en")}</option>)}
            </select>
          </label>
          <label className="grid gap-1 text-sm">Place
            <select value={placeFilter} onChange={event => setPlaceFilter(event.target.value)} className="rounded-md border bg-background px-3 py-2">
              <option value="">All places</option>
              {places.map(place => <option key={place} value={place}>{place}</option>)}
            </select>
          </label>
        </section>
      )}

      {readOnlyDate && <p className="rounded border bg-muted/20 p-3 text-sm text-muted-foreground">This date is read-only. You can add or change your own records for today and yesterday.</p>}
      {error && <p role="alert" className="rounded border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">{error}</p>}
      {dayQuery.isError && <p role="alert" className="rounded border border-destructive/40 p-3 text-sm text-destructive">{(dayQuery.error as Error).message}</p>}

      {tab === "day" && !teamView && <>
        {canCreate && !readOnlyDate && !workId && <button type="button" onClick={() => {
          setWorkDraft(draft => ({ ...draft, workDate: date })); setWorkId(-1);
        }} className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground"><Plus className="h-4 w-4" />Add work</button>}
        {workId !== null && <form onSubmit={submitWork} className="grid gap-3 rounded-lg border p-4 sm:grid-cols-2" aria-label="Daily work entry form">
          <h2 className="text-base font-semibold sm:col-span-2">{workId === -1 ? "Add work" : "Edit work"}</h2>
          <label className="grid gap-1 text-sm">Where
            <select required value={workDraft.place} onChange={event => setWorkDraft({ ...workDraft, place: event.target.value })} className="rounded-md border bg-background px-3 py-2">
              {WORK_PLACES.map(value => <option key={value}>{value}</option>)}
            </select>
          </label>
          <label className="grid gap-1 text-sm">Work
            <select required value={workDraft.workType} onChange={event => setWorkDraft({ ...workDraft, workType: event.target.value })} className="rounded-md border bg-background px-3 py-2">
              {WORK_TYPES.map(value => <option key={value}>{value}</option>)}
            </select>
          </label>
          <label className="grid gap-1 text-sm">For site <span className="text-xs text-muted-foreground">Optional</span>
            <select value={workDraft.siteId} onChange={event => {
              const site = context.sites.find(item => String(item.id) === event.target.value);
              setWorkDraft({ ...workDraft, siteId: event.target.value, siteName: site?.name ?? "" });
            }} className="rounded-md border bg-background px-3 py-2">
              <option value="">No site</option>
              {workDraft.siteId && !context.sites.some(site => String(site.id) === workDraft.siteId) &&
                <option value={workDraft.siteId}>{workDraft.siteName || "Saved site"} (inactive)</option>}
              {context.sites.map(site => <option key={site.id} value={site.id}>{site.name.toLocaleUpperCase("en")}</option>)}
            </select>
          </label>
          <label className="grid gap-1 text-sm">Duration <span className="text-xs text-muted-foreground">Optional, h:mm</span>
            <input inputMode="numeric" placeholder="1:30" value={workDraft.duration} onChange={event => setWorkDraft({ ...workDraft, duration: event.target.value })} className="rounded-md border bg-background px-3 py-2" />
          </label>
          <label className="grid gap-1 text-sm sm:col-span-2">What was done
            <textarea required maxLength={1000} value={workDraft.details} onChange={event => setWorkDraft({ ...workDraft, details: event.target.value })} className="min-h-24 rounded-md border bg-background px-3 py-2" />
          </label>
          <div className="flex gap-2 sm:col-span-2">
            <button disabled={workSave.isPending || activeFormDisabled} className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground">{useMutationState(workSave.isPending)}</button>
            <button type="button" onClick={clearWork} className="inline-flex items-center gap-1 rounded-md border px-3 py-2 text-sm"><X className="h-4 w-4" />Cancel</button>
          </div>
        </form>}
        <section className="space-y-3" aria-label="Work entries">
          <h2 className="font-semibold">Work done</h2>
          {workEntries.length === 0 && <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">No work entries for this date.</p>}
          {workEntries.map(row => <article key={row.id} className="rounded-lg border bg-background p-3" data-testid={`work-entry-${row.id}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                {teamView && <p className="text-xs font-semibold uppercase">{row.personName}</p>}
                <p className="font-medium">{row.workType}</p>
                <p className="text-sm text-muted-foreground">{row.place.toLocaleUpperCase("en")}{row.siteName ? ` · ${row.siteName.toLocaleUpperCase("en")}` : ""}{row.durationMinutes ? ` · ${formatMinutes(row.durationMinutes)}` : ""}</p>
                <p className="mt-2 whitespace-pre-wrap text-sm">{row.details}</p>
              </div>
              {canEdit && canChangeWork(row) && !readOnlyDate && <div className="flex shrink-0 gap-1">
                <button type="button" aria-label="Edit work entry" onClick={() => beginWorkEdit(row)} className="rounded border p-2"><Pencil className="h-4 w-4" /></button>
                {canDelete && <button type="button" aria-label="Delete work entry" onClick={() => removeMutation.mutate({ kind: "entries", id: row.id })} className="rounded border p-2 text-destructive"><Trash2 className="h-4 w-4" /></button>}
              </div>}
            </div>
          </article>)}
        </section>
        <section className="space-y-3" aria-label="DPR site activities">
          <h2 className="font-semibold">DPR Site activities</h2>
          {dprActivities.length === 0 && <p className="text-sm text-muted-foreground">No linked DPR Site activities for this date.</p>}
          {dprActivities.map(row => <article key={`${row.dprId}-${row.id}`} className="rounded-lg border bg-muted/10 p-3">
            {teamView && <p className="text-xs font-semibold uppercase">{row.personName}</p>}
            <p className="text-xs font-medium text-muted-foreground">{row.type} · {row.site.toLocaleUpperCase("en")}</p>
            <p className="font-medium">{row.title}</p>
            {row.details && <p className="mt-1 text-sm text-muted-foreground">{row.details}</p>}
            {row.resultPass != null && <p className="mt-1 text-sm font-bold">{row.resultPass ? "Pass" : "Fail"}</p>}
            {sectionVisible("site_dprs") && <Link href={row.href} className="mt-2 inline-block text-sm underline">Open DPR</Link>}
          </article>)}
        </section>
      </>}

      {tab === "visits" && !teamView && <>
        <div className="flex items-center justify-between gap-3">
          <div><h2 className="font-semibold">Visits &amp; inspections</h2><p className="text-sm text-muted-foreground">Site visits are recorded in the DPR.</p></div>
          {canCreate && !readOnlyDate && !visitId && <button type="button" onClick={() => {
            setVisitDraft(draft => ({ ...draft, visitDate: date })); setVisitId(-1);
          }} className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground"><Plus className="h-4 w-4" />Add visit</button>}
        </div>
        {visitId !== null && <form onSubmit={submitVisit} className="grid gap-3 rounded-lg border p-4 sm:grid-cols-2" aria-label="Visit form">
          <h2 className="text-base font-semibold sm:col-span-2">{visitId === -1 ? "Add visit" : "Edit visit"}</h2>
          <label className="grid gap-1 text-sm">Place
            <select required value={visitDraft.place} onChange={event => setVisitDraft({ ...visitDraft, place: event.target.value })} className="rounded-md border bg-background px-3 py-2">
              {VISIT_PLACES.map(value => <option key={value}>{value}</option>)}
            </select>
          </label>
          <label className="grid gap-1 text-sm">Purpose
            <select required value={visitDraft.purpose} onChange={event => setVisitDraft({ ...visitDraft, purpose: event.target.value })} className="rounded-md border bg-background px-3 py-2">
              {VISIT_PURPOSES.map(value => <option key={value}>{value}</option>)}
            </select>
          </label>
          <label className="grid gap-1 text-sm">Visitor
            <input required maxLength={160} value={visitDraft.visitorName} onChange={event => setVisitDraft({ ...visitDraft, visitorName: event.target.value })} className="rounded-md border bg-background px-3 py-2" />
          </label>
          <label className="grid gap-1 text-sm">Designation
            <input maxLength={160} value={visitDraft.visitorDesignation} onChange={event => setVisitDraft({ ...visitDraft, visitorDesignation: event.target.value })} className="rounded-md border bg-background px-3 py-2" />
          </label>
          <label className="grid gap-1 text-sm">Organisation
            <input maxLength={160} value={visitDraft.organisation} onChange={event => setVisitDraft({ ...visitDraft, organisation: event.target.value })} className="rounded-md border bg-background px-3 py-2" />
          </label>
          <label className="grid gap-1 text-sm">Photo / sheet <span className="text-xs text-muted-foreground">Optional image or PDF, up to 15 MB</span>
            <input type="file" accept="image/*,application/pdf" onChange={event => setVisitFile(event.target.files?.[0] ?? null)} className="rounded-md border bg-background px-3 py-2 text-xs" />
            {visitDraft.attachment && !visitFile && <button type="button" onClick={() => setVisitDraft({ ...visitDraft, attachment: null })} className="text-left text-xs underline">Remove {visitDraft.attachment.fileName}</button>}
          </label>
          <label className="grid gap-1 text-sm sm:col-span-2">Instructions given / points discussed
            <textarea required maxLength={2000} value={visitDraft.pointsDiscussed} onChange={event => setVisitDraft({ ...visitDraft, pointsDiscussed: event.target.value })} className="min-h-24 rounded-md border bg-background px-3 py-2" />
          </label>
          <div className="flex gap-2 sm:col-span-2">
            <button disabled={visitSave.isPending || isUploading || activeFormDisabled} className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground">{visitSave.isPending || isUploading ? "Saving…" : "Save"}</button>
            <button type="button" onClick={clearVisit} className="inline-flex items-center gap-1 rounded-md border px-3 py-2 text-sm"><X className="h-4 w-4" />Cancel</button>
          </div>
        </form>}
        {visits.length === 0 && <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">No visits recorded for this date.</p>}
        {visits.map(row => <article key={row.id} className="rounded-lg border bg-background p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase">{row.personName} · {row.place}</p>
              <p className="font-medium">{row.visitorName.toLocaleUpperCase("en")} · {row.purpose}</p>
              <p className="text-sm text-muted-foreground">{[row.visitorDesignation, row.organisation].filter(Boolean).join(" · ")}</p>
              <p className="mt-2 whitespace-pre-wrap text-sm">{row.pointsDiscussed}</p>
              {row.attachment && <button type="button" onClick={() => setViewingAttachment({
                id: row.id, fileName: row.attachment!.fileName, objectPath: row.attachment!.objectPath,
                mimeType: row.attachment!.mimeType ?? undefined, fileSize: row.attachment!.fileSize ?? undefined,
              })} className="mt-2 inline-flex items-center gap-1 text-sm underline"><Upload className="h-4 w-4" />{row.attachment.fileName}</button>}
            </div>
            {canEdit && canChangeVisit(row) && !readOnlyDate && <div className="flex shrink-0 gap-1">
              <button type="button" aria-label="Edit visit" onClick={() => beginVisitEdit(row)} className="rounded border p-2"><Pencil className="h-4 w-4" /></button>
              {canDelete && <button type="button" aria-label="Delete visit" onClick={() => removeMutation.mutate({ kind: "visits", id: row.id })} className="rounded border p-2 text-destructive"><Trash2 className="h-4 w-4" /></button>}
            </div>}
          </div>
        </article>)}
      </>}

      {teamView && teamAllowed && <>
        <section className="rounded-lg border bg-background p-3" aria-label="Team hours">
          <p className="text-sm text-muted-foreground">Hours recorded</p>
          <p className="text-xl font-semibold">{Math.floor((data?.totalDurationMinutes ?? 0) / 60)}:{String((data?.totalDurationMinutes ?? 0) % 60).padStart(2, "0")}</p>
        </section>
        <section className="space-y-3">
          <h2 className="font-semibold">Work entries</h2>
          {workEntries.length === 0 && <p className="text-sm text-muted-foreground">No team work entries for this date.</p>}
          {workEntries.map(row => <article key={row.id} className="rounded-lg border p-3">
            <p className="text-xs font-semibold uppercase">{row.personName}</p>
            <p className="font-medium">{row.workType}</p>
            <p className="text-sm text-muted-foreground">{row.place.toLocaleUpperCase("en")}{row.siteName ? ` · ${row.siteName.toLocaleUpperCase("en")}` : ""}{row.durationMinutes ? ` · ${formatMinutes(row.durationMinutes)}` : ""}</p>
            <p className="mt-2 whitespace-pre-wrap text-sm">{row.details}</p>
            {canChangeWork(row) && !readOnlyDate && <div className="mt-2 flex gap-3">
              {canEdit && <button type="button" onClick={() => { setTab("day"); beginWorkEdit(row); }} className="text-sm underline">Edit</button>}
              {canDelete && <button type="button" onClick={() => removeMutation.mutate({ kind: "entries", id: row.id })} className="text-sm text-destructive underline">Delete</button>}
            </div>}
          </article>)}
        </section>
        <section className="space-y-3">
          <h2 className="font-semibold">DPR Site activities</h2>
          {dprActivities.map(row => <article key={`${row.dprId}-${row.id}`} className="rounded-lg border p-3">
            <p className="text-xs font-semibold uppercase">{row.personName} · {row.site}</p>
            <p className="font-medium">{row.title}</p>
            {row.details && <p className="text-sm text-muted-foreground">{row.details}</p>}
            {row.resultPass != null && <p className="text-sm font-bold">{row.resultPass ? "Pass" : "Fail"}</p>}
            {sectionVisible("site_dprs") && <Link href={row.href} className="mt-2 inline-block text-sm underline">Open DPR</Link>}
          </article>)}
        </section>
        <section className="space-y-3">
          <h2 className="font-semibold">Visits recorded</h2>
          {visits.map(row => <article key={row.id} className="rounded-lg border p-3">
            <p className="text-xs font-semibold uppercase">{row.personName} · {row.place}</p>
            <p className="font-medium">{row.visitorName.toLocaleUpperCase("en")} · {row.purpose}</p>
            <p className="whitespace-pre-wrap text-sm">{row.pointsDiscussed}</p>
            {row.attachment && <button type="button" onClick={() => setViewingAttachment({
              id: row.id, fileName: row.attachment!.fileName, objectPath: row.attachment!.objectPath,
              mimeType: row.attachment!.mimeType ?? undefined, fileSize: row.attachment!.fileSize ?? undefined,
            })} className="mt-2 text-sm underline">{row.attachment.fileName}</button>}
            {canChangeVisit(row) && !readOnlyDate && <div className="mt-2 flex gap-3">
              {canEdit && <button type="button" onClick={() => { setTab("visits"); beginVisitEdit(row); }} className="text-sm underline">Edit</button>}
              {canDelete && <button type="button" onClick={() => removeMutation.mutate({ kind: "visits", id: row.id })} className="text-sm text-destructive underline">Delete</button>}
            </div>}
          </article>)}
        </section>
      </>}

      {viewingAttachment && <AttachmentViewer attachment={viewingAttachment} onClose={() => setViewingAttachment(null)} />}
    </main>
  );
}
