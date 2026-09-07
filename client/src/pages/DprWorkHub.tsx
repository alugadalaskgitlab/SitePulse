import { Link, useRoute, useSearch } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Activity, ClipboardCheck, HardHat, Package, Users, ChevronLeft, ArrowRight } from "lucide-react";
import { dprSectionCounts, dprWorkSectionHref, type WorkHubSection } from "@/lib/dprWorkHub";
import { DPR_REGISTER_PATH, resolveReturnTo } from "@/lib/progressReportNav";

const cards: Array<{ section: WorkHubSection; title: string; detail: string; icon: typeof Activity; count: keyof ReturnType<typeof dprSectionCounts>; tone: string }> = [
  { section: "activities", title: "Activity Progress", detail: "Work done, chainage and quantities", icon: Activity, count: "activities", tone: "bg-amber-100 text-amber-900" },
  { section: "equipment", title: "Equipment", detail: "Meters, hours and diesel", icon: HardHat, count: "equipment", tone: "bg-sky-100 text-sky-900" },
  { section: "labour", title: "Labour", detail: "Crew counts and tasks", icon: Users, count: "labour", tone: "bg-teal-100 text-teal-900" },
  { section: "materials", title: "Materials", detail: "Receipts, issues and challans", icon: Package, count: "materials", tone: "bg-rose-100 text-rose-900" },
  { section: "review", title: "Review & Submit", detail: "Check the report before filing", icon: ClipboardCheck, count: "activities", tone: "bg-slate-200 text-slate-900" },
];

export default function DprWorkHub() {
  const [, params] = useRoute("/site/work/:id");
  const search = useSearch();
  const draftId = Number(params?.id);
  const returnTo = resolveReturnTo(search, DPR_REGISTER_PATH);
  const { data: dpr, isLoading, isError } = useQuery<any>({
    queryKey: ["/api/dprs", draftId],
    queryFn: async () => {
      const response = await fetch(`/api/dprs/${draftId}`, { credentials: "include" });
      if (!response.ok) throw new Error("Unable to load today's draft");
      return response.json();
    },
    enabled: Number.isInteger(draftId) && draftId > 0,
  });
  const counts = dprSectionCounts(dpr);

  if (isLoading) return <div className="space-y-3 animate-pulse"><div className="h-10 w-48 rounded bg-muted" /><div className="h-28 rounded-xl bg-muted" /><div className="h-28 rounded-xl bg-muted" /></div>;
  if (isError || !dpr) return <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-6"><p className="font-semibold">Today’s draft could not be opened.</p><Link href={returnTo} className="mt-4 inline-flex items-center gap-2 text-sm underline">Return to DPR register</Link></div>;

  return (
    <main className="mx-auto max-w-2xl pb-10">
      <Link href={returnTo} className="mb-5 inline-flex items-center gap-1 text-sm font-semibold text-muted-foreground"><ChevronLeft className="h-4 w-4" /> DPR register</Link>
      <section className="rounded-3xl bg-slate-900 px-5 py-6 text-stone-50 shadow-lg md:px-7">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-300">Today’s work draft</p>
        <h1 className="mt-2 text-2xl font-bold">{String(dpr.site ?? "Site work")}</h1>
        <p className="mt-1 text-sm text-slate-300">{String(dpr.date ?? "")} · Saved sections remain safe when you switch tasks.</p>
      </section>
      <p className="mt-6 text-sm font-medium text-muted-foreground">Choose one task. Save returns you here.</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {cards.map((card) => {
          const Icon = card.icon;
          const count = card.section === "review" ? null : counts[card.count];
          return <Link key={card.section} href={dprWorkSectionHref(draftId, card.section, returnTo)} className="group rounded-2xl border border-border bg-card p-4 shadow-sm transition-transform hover:-translate-y-0.5 hover:border-slate-400">
            <div className="flex items-start gap-3">
              <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${card.tone}`}><Icon className="h-5 w-5" /></span>
              <span className="min-w-0 flex-1"><span className="flex items-center justify-between gap-2 font-bold">{card.title}<ArrowRight className="h-4 w-4 opacity-45 transition-transform group-hover:translate-x-0.5" /></span><span className="mt-1 block text-xs text-muted-foreground">{card.detail}</span>{count != null && <span className="mt-3 inline-block rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">{count} recorded</span>}</span>
            </div>
          </Link>;
        })}
      </div>
    </main>
  );
}