import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { SiteMaterialTrip } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { BulkTripArrangement } from "@/components/BulkTripArrangement";
import { filterTripsByRole } from "@/components/trip-role-utils";

type Filters = {
  dateFrom: string; dateTo: string; site: string; material: string; vehicleNumber: string;
  supplier: string; onlyUnassigned: boolean; onlyWithoutArrangement: boolean; roleFilter: string;
};
type PreviewEquipment = { id: number; name: string; registrationNumber?: string | null; ownerVendorId?: number | null; linkedVendorName?: string | null };
type PreviewRow = { trip: SiteMaterialTrip; currentRole: string; proposedEquipment: PreviewEquipment | null; equipmentChoices: PreviewEquipment[]; ownedEquipmentChoices: PreviewEquipment[]; bill: { billNo: string; status: string } | null; fingerprint: string; blockedReason: string | null };
type PreviewResponse = { rows: PreviewRow[]; excluded: { tripId: number; billNo?: string; status?: string; reason?: string }[]; sourcePlaceSuggestions?: string[] };
const REVIEW_PATH = "/site/material-trips/review";

function filtersFromSearch(search: string): Filters {
  const params = new URLSearchParams(search);
  return {
    dateFrom: params.get("dateFrom") || "", dateTo: params.get("dateTo") || "",
    site: params.get("site") || "", material: params.get("material") || "",
    vehicleNumber: params.get("vehicleNumber") || params.get("hireVehicle") || "",
    supplier: params.get("supplier") || params.get("hireSupplier") || "",
    onlyUnassigned: params.get("onlyUnassigned") === "true",
    onlyWithoutArrangement: params.get("onlyWithoutArrangement") === "true",
    roleFilter: params.get("role") || (params.get("hireRole") === "unresolved" ? "unresolved" : "all"),
  };
}
function queryFor(filters: Filters) {
  const p = new URLSearchParams();
  if (filters.dateFrom) p.set("dateFrom", filters.dateFrom);
  if (filters.dateTo) p.set("dateTo", filters.dateTo);
  if (filters.site) p.set("site", filters.site);
  if (filters.material) p.set("material", filters.material);
  if (filters.vehicleNumber) p.set("vehicleNumber", filters.vehicleNumber);
  if (filters.supplier) p.set("supplier", filters.supplier);
  if (filters.onlyUnassigned) p.set("onlyUnassigned", "true");
  if (filters.onlyWithoutArrangement) p.set("onlyWithoutArrangement", "true");
  return p;
}
function roleLabel(role: string) {
  return role.replaceAll("_", " ").replace(/\b\w/g, letter => letter.toUpperCase());
}
function ReviewToolFrame({ title, children }: { title: string; children: ReactNode }) {
  const search = useSearch();
  const { sectionCan } = useAuth();
  const filters = filtersFromSearch(search);
  const back = `${REVIEW_PATH}${search ? `?${search}` : ""}`;
  if (!sectionCan("site_materials", "edit")) return <main className="mx-auto max-w-md py-20 text-center">
    <h1 className="text-xl font-semibold">Edit permission required</h1>
    <p className="mt-2 text-sm text-muted-foreground">Trip review tools are available to users with site-material edit access.</p>
    <Link href={back} className="mt-4 inline-block text-sm underline">Back to review</Link>
  </main>;
  return <main className="mx-auto max-w-7xl space-y-5 p-4 md:p-7">
    <div className="flex items-center gap-4">
      <Link href={back} className="text-sm font-medium text-primary underline underline-offset-4">← Back to trip review</Link>
    </div>
    <header className="space-y-1 border-b pb-4">
      <p className="text-xs font-semibold uppercase tracking-[.18em] text-muted-foreground">Site materials · audit tools</p>
      <h1 className="text-2xl font-semibold">{title}</h1>
    </header><ToolFilterBar filters={filters} search={search} />{children}
  </main>;
}

function ToolFilterBar({ filters, search }: { filters: Filters; search: string }) {
  const [path, navigate] = useLocation();
  const [draft, setDraft] = useState(filters);
  useEffect(() => setDraft(filters), [filters.dateFrom, filters.dateTo, filters.site, filters.material, filters.vehicleNumber, filters.supplier, filters.onlyUnassigned, filters.onlyWithoutArrangement, filters.roleFilter]);
  const set = (key: keyof Filters, value: string | boolean) => setDraft(old => ({ ...old, [key]: value }));
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const params = new URLSearchParams(search);
    for (const key of ["dateFrom", "dateTo", "site", "material", "vehicleNumber", "supplier"] as const) {
      if (draft[key]) params.set(key, draft[key]); else params.delete(key);
    }
    if (draft.onlyUnassigned) params.set("onlyUnassigned", "true"); else params.delete("onlyUnassigned");
    if (draft.onlyWithoutArrangement) params.set("onlyWithoutArrangement", "true"); else params.delete("onlyWithoutArrangement");
    if (draft.roleFilter === "unresolved") params.set("hireRole", "unresolved"); else params.delete("hireRole");
    if (draft.roleFilter === "all") params.delete("role"); else params.set("role", draft.roleFilter);
    navigate(`${path}${params.size ? `?${params}` : ""}`);
  };
  return <form onSubmit={submit} className="grid grid-cols-1 gap-3 rounded-xl border bg-card p-4 sm:grid-cols-2 lg:grid-cols-4">
    <div><Label htmlFor="tool-date-from">From date</Label><Input id="tool-date-from" type="date" value={draft.dateFrom} onChange={event => set("dateFrom", event.target.value)} /></div>
    <div><Label htmlFor="tool-date-to">To date</Label><Input id="tool-date-to" type="date" value={draft.dateTo} onChange={event => set("dateTo", event.target.value)} /></div>
    <div><Label htmlFor="tool-site">Site</Label><Input id="tool-site" value={draft.site} onChange={event => set("site", event.target.value)} /></div>
    <div><Label htmlFor="tool-material">Material</Label><Input id="tool-material" value={draft.material} onChange={event => set("material", event.target.value)} /></div>
    <div><Label htmlFor="tool-vehicle">Vehicle number</Label><Input id="tool-vehicle" value={draft.vehicleNumber} onChange={event => set("vehicleNumber", event.target.value)} /></div>
    <div><Label htmlFor="tool-supplier">Transporter</Label><Input id="tool-supplier" value={draft.supplier} onChange={event => set("supplier", event.target.value)} /></div>
    <label className="flex items-end gap-2 pb-2 text-sm"><input type="checkbox" checked={draft.onlyUnassigned} onChange={event => set("onlyUnassigned", event.target.checked)} />Only without material source</label>
    <label className="flex items-end gap-2 pb-2 text-sm"><input type="checkbox" checked={draft.onlyWithoutArrangement} onChange={event => set("onlyWithoutArrangement", event.target.checked)} />Only without arrangement</label>
    <div><Label htmlFor="tool-role">Transport/source role</Label><select id="tool-role" className="w-full rounded-md border bg-background p-2 text-sm" value={draft.roleFilter} onChange={event => set("roleFilter", event.target.value)}><option value="all">All</option><option value="same_party">Same party</option><option value="different_parties">Different parties</option><option value="in_house">Our own vehicle</option><option value="own_source_agency">Our own source · Another transporter</option><option value="own_source_in_house">Our own source · Our own vehicle</option><option value="unresolved">Roles not confirmed</option></select></div>
    <div className="flex items-end"><Button type="submit">Update filters</Button></div>
  </form>;
}

export function TripArrangementReviewPage() {
  const search = useSearch();
  const filters = useMemo(() => filtersFromSearch(search), [search]);
  return <ReviewToolFrame title="Link to execution arrangement">
    <BulkTripArrangement filters={{
      site: filters.site || undefined, material: filters.material || undefined, supplier: filters.supplier || undefined,
      vehicleNumber: filters.vehicleNumber || undefined, dateFrom: filters.dateFrom || undefined,
      dateTo: filters.dateTo || undefined, onlyUnassigned: filters.onlyUnassigned,
      onlyWithoutArrangement: filters.onlyWithoutArrangement, roleFilter: filters.roleFilter,
    }} />
  </ReviewToolFrame>;
}

export function MaterialSourceBackfillPage() {
  const search = useSearch();
  const filters = useMemo(() => filtersFromSearch(search), [search]);
  const { toast } = useToast();
  const [source, setSource] = useState("");
  const [previewRows, setPreviewRows] = useState<SiteMaterialTrip[] | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [message, setMessage] = useState("");
  const params = useMemo(() => queryFor(filters), [filters]);
  useEffect(() => {
    setPreviewRows(null);
    setConfirmOpen(false);
  }, [params.toString()]);
  const preview = useMutation({
    mutationFn: async () => {
      if (!filters.site) throw new Error("Select one site in the review filters before backfilling.");
      if (filters.onlyWithoutArrangement) throw new Error("Clear the no-arrangement filter before using material-source backfill.");
      if (filters.roleFilter !== "all") throw new Error("Set the role filter to All before using material-source backfill.");
      const response = await apiRequest("GET", `/api/site-material-trips?${params}`);
      const trips = await response.json() as SiteMaterialTrip[];
      if (!Array.isArray(trips)) throw new Error("The server returned an invalid trip list.");
      return trips.filter(trip => trip.materialSourceType !== "own_source");
    },
    onSuccess: rows => { setPreviewRows(rows); setMessage(""); },
    onError: error => toast({ title: "Preview failed", description: error instanceof Error ? error.message : "Could not count matching trips.", variant: "destructive" }),
  });
  const mutation = useMutation({
    mutationFn: async () => {
      if (previewRows === null) throw new Error("Preview matching trips before applying.");
      if (!filters.site) throw new Error("Select one site in the review filters before backfilling.");
      if (filters.onlyWithoutArrangement) throw new Error("Clear the no-arrangement filter before using material-source backfill.");
      if (filters.roleFilter !== "all") throw new Error("Set the role filter to All before using material-source backfill.");
      if (!source.trim()) throw new Error("Enter the material source / supplier.");
      const response = await apiRequest("POST", "/api/site-material-trips/material-source/bulk", {
        dateFrom: filters.dateFrom || undefined, dateTo: filters.dateTo || undefined, site: filters.site,
        material: filters.material || undefined, vehicleNumber: filters.vehicleNumber || undefined,
        supplier: filters.supplier || undefined, onlyUnassigned: filters.onlyUnassigned,
        materialSourceSupplier: source.trim(),
      });
      return response.json() as Promise<{ updatedCount: number }>;
    },
    onSuccess: result => {
      queryClient.invalidateQueries({ predicate: query => String(query.queryKey[0]).startsWith("/api/site-material-trips") });
      setConfirmOpen(false);
      setPreviewRows(null);
      setMessage(`${result.updatedCount} trips updated. Existing transporter names were not changed.`);
      toast({ title: "Material source assigned", description: `${result.updatedCount} trips updated.` });
    },
    onError: error => {
      setConfirmOpen(false);
      toast({ title: "Backfill failed", description: error instanceof Error ? error.message : "Could not update trips.", variant: "destructive" });
    },
  });
  return <ReviewToolFrame title="Material source backfill">
    <section className="max-w-2xl space-y-4 rounded-xl border bg-card p-4">
      <p className="text-sm text-muted-foreground">Assign one material source to the trips matching the carried review filters. Transporter names and vehicle identities are not changed.</p>
      <FilterSummary filters={filters} />
      <div className="space-y-2"><Label htmlFor="backfill-source">Material source / supplier</Label><Input id="backfill-source" value={source} onChange={e => setSource(e.target.value)} /></div>
      {!filters.site && <p className="text-sm text-amber-700">A single site is required.</p>}
      {filters.roleFilter !== "all" && <p className="text-sm text-amber-700">Change the role filter to All in review before applying.</p>}
      {filters.onlyWithoutArrangement && <p className="text-sm text-amber-700">Clear the no-arrangement filter in review before applying.</p>}
      <Button onClick={() => { setPreviewRows(null); setMessage(""); preview.mutate(); }} disabled={preview.isPending || !filters.site || filters.roleFilter !== "all" || filters.onlyWithoutArrangement}>
        {preview.isPending ? "Counting matching trips…" : "Preview matching trips"}
      </Button>
      {previewRows && <div className="space-y-2 rounded-lg border bg-muted/30 p-3" data-testid="material-source-backfill-preview">
        <p className="text-sm font-medium">{previewRows.length} matching trip{previewRows.length === 1 ? "" : "s"} will receive this material source.</p>
        {previewRows.length === 0 && <p className="text-sm text-muted-foreground">No eligible trips match these filters.</p>}
        {!!source.trim() && <p className="text-sm">Source to assign: <strong>{source.trim()}</strong></p>}
        <Button onClick={() => setConfirmOpen(true)} disabled={!previewRows.length || !source.trim() || mutation.isPending}>
          Assign source to {previewRows.length} matching trip{previewRows.length === 1 ? "" : "s"}
        </Button>
      </div>}
      {message && <p role="status" className="text-sm text-emerald-800">{message}</p>}
    </section>
    <AlertDialog open={confirmOpen} onOpenChange={open => !open && !mutation.isPending && setConfirmOpen(false)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Assign material source to {previewRows?.length ?? 0} trips?</AlertDialogTitle>
          <AlertDialogDescription>
            Set <strong>{source.trim()}</strong> as the source for trips at <strong>{filters.site}</strong>.
            The existing transporter names and vehicle identities will remain untouched.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <FilterSummary filters={filters} />
        <AlertDialogFooter>
          <AlertDialogCancel disabled={mutation.isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={event => { event.preventDefault(); mutation.mutate(); }} disabled={mutation.isPending}>
            {mutation.isPending ? "Applying…" : `Assign ${previewRows?.length ?? 0} trips`}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </ReviewToolFrame>;
}

function FilterSummary({ filters }: { filters: Filters }) {
  return <dl className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-lg bg-muted/40 p-3 text-xs sm:grid-cols-3">
    <div><dt className="text-muted-foreground">Dates</dt><dd>{filters.dateFrom || "Any"} → {filters.dateTo || "Any"}</dd></div>
    <div><dt className="text-muted-foreground">Site</dt><dd>{filters.site || "All sites"}</dd></div>
    <div><dt className="text-muted-foreground">Material</dt><dd>{filters.material || "All materials"}</dd></div>
    <div><dt className="text-muted-foreground">Vehicle</dt><dd>{filters.vehicleNumber || "All"}</dd></div>
    <div><dt className="text-muted-foreground">Transporter</dt><dd>{filters.supplier || "All"}</dd></div>
  </dl>;
}

export function SourceTransportReviewPage() {
  const search = useSearch();
  const filters = useMemo(() => filtersFromSearch(search), [search]);
  const { featureCan } = useAuth();
  const { toast } = useToast();
  const canVerify = featureCan("site_materials", "verify");
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [sourceType, setSourceType] = useState<"own_source" | "vendor">("own_source");
  const [sourceLabel, setSourceLabel] = useState("");
  const [vendorId, setVendorId] = useState("");
  const [transportType, setTransportType] = useState<"agency_vendor" | "in_house">("agency_vendor");
  const [equipmentByTripId, setEquipmentByTripId] = useState<Record<string, number | null>>({});
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");
  const [sourceQuery, setSourceQuery] = useState("");
  const params = useMemo(() => queryFor(filters), [filters]);
  const tripsQuery = useQuery<SiteMaterialTrip[]>({
    queryKey: [`/api/site-material-trips${params.size ? `?${params}` : ""}`],
  });
  const roleFiltered = useMemo(() => filterTripsByRole(tripsQuery.data ?? [], filters.roleFilter as any), [tripsQuery.data, filters.roleFilter]);
  const trips = roleFiltered;
  const siteParam = encodeURIComponent(filters.site);
  const vendorsQuery = useQuery<any[]>({ queryKey: ["/api/vendor-master"], enabled: canVerify });
  const suggestionsQuery = useQuery<{ sourcePlaceSuggestions: string[] }>({
    queryKey: [`/api/site-material-trips/source-transport/options?site=${siteParam}`],
    enabled: !!filters.site,
  });
  const preview = useMutation({
    mutationFn: async (tripIds: number[]) => {
      const response = await apiRequest("POST", "/api/site-material-trips/source-transport/preview", { tripIds });
      const result = await response.json() as PreviewResponse;
      if (!Array.isArray(result.rows) || !Array.isArray(result.excluded)) throw new Error("The server returned an invalid preview.");
      return result;
    },
    onSuccess: result => {
      const next: Record<string, number | null> = {};
      const excludedIds = new Set(result.excluded.map(row => row.tripId));
      result.rows.forEach(row => {
        const trip = row.trip;
        const agencyChoices = row.equipmentChoices;
        const proposedAgency = row.proposedEquipment && agencyChoices.some(item => item.id === row.proposedEquipment?.id)
          ? row.proposedEquipment.id : null;
        const ownMatches = transportType === "in_house" ? row.ownedEquipmentChoices : [];
        next[String(trip.id)] = transportType === "in_house" ? (ownMatches.length === 1 ? ownMatches[0].id : null) : proposedAgency;
      });
      setSelectedIds(old => old.filter(id => !excludedIds.has(id) && !result.rows.some(row =>
        row.trip.id === id && (transportType === "agency_vendor"
          ? !!row.agencyBlockedReason
          : !!row.agencyBlockedReason || row.ownedEquipmentChoices.length === 0)
      )));
      setEquipmentByTripId(next);
    },
  });
  const [previewData, setPreviewData] = useState<PreviewResponse | null>(null);
  useEffect(() => { if (preview.data) setPreviewData(preview.data); }, [preview.data]);
  useEffect(() => {
    setSelectedIds([]);
    setPreviewData(null);
    setEquipmentByTripId({});
  }, [params.toString()]);
  const apply = useMutation({
    mutationFn: async () => {
      if (!previewData) throw new Error("Preview the selected trips before applying.");
      if (!reason.trim()) throw new Error("A reason is required.");
      if (sourceType === "own_source" && !sourceLabel.trim()) throw new Error("Enter an own-source label.");
      if (sourceType === "vendor" && (!vendorId || !canVerify)) throw new Error("Vendor source application requires verify permission and a Vendor Master selection.");
       const currentRows = previewData.rows.filter(row => selectedIds.includes(row.trip.id) &&
         (transportType === "agency_vendor"
           ? !row.agencyBlockedReason
           : !row.agencyBlockedReason && isInHouseEligible(row.trip) && row.ownedEquipmentChoices.length > 0));
      if (!currentRows.length) throw new Error("Select at least one eligible trip.");
      if (transportType === "in_house" && currentRows.some(row => equipmentByTripId[String(row.trip.id)] == null)) {
        throw new Error("Select the exact-match owned equipment for every in-house trip.");
      }
      const response = await apiRequest("POST", "/api/site-material-trips/source-transport/apply", {
        tripIds: currentRows.map(row => row.trip.id),
        materialSource: sourceType === "own_source"
          ? { type: "own_source", label: sourceLabel.trim() }
          : { type: "vendor", vendorId: Number(vendorId) },
        transport: { type: transportType },
        equipmentByTripId: Object.fromEntries(currentRows.map(row => [String(row.trip.id), equipmentByTripId[String(row.trip.id)] ?? null])),
        reason: reason.trim(),
        expectedFingerprints: Object.fromEntries(currentRows.map(row => [String(row.trip.id), row.fingerprint])),
      });
      const result = await response.json() as { updatedCount: number };
      if (!Number.isSafeInteger(result.updatedCount) || result.updatedCount < 0 || result.updatedCount > currentRows.length) {
        throw new Error("The server returned an invalid updated-trip count. Refresh the preview before retrying.");
      }
      return result;
    },
    onSuccess: result => {
      queryClient.invalidateQueries({ predicate: query => String(query.queryKey[0]).startsWith("/api/site-material-trips") });
      setMessage(`${result.updatedCount} trip${result.updatedCount === 1 ? "" : "s"} updated. Source and transport identities were recorded.`);
      setPreviewData(null);
      setSelectedIds([]);
      setReason("");
    },
    onError: error => toast({ title: "Source and transport not applied", description: error instanceof Error ? error.message : "The trips could not be updated.", variant: "destructive" }),
  });
  const sourceSuggestions: string[] = (() => {
    return Array.from(new Set([
      ...(suggestionsQuery.data?.sourcePlaceSuggestions ?? []),
      ...(previewData?.sourcePlaceSuggestions ?? []),
    ]));
  })();
  const vendors = (vendorsQuery.data ?? []).filter(vendor => vendor?.isActive !== false);
  const normalizedRegistration = (value: unknown) => String(value ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const isInHouseEligible = (trip: SiteMaterialTrip) => !trip.supplier?.trim() && trip.supplierVendorId == null &&
    !!normalizedRegistration(trip.vehicleNumber);
  const previewRows = previewData?.rows ?? [];
  const selectedPreviewRows = previewRows.filter(row => selectedIds.includes(row.trip.id) &&
    (transportType === "agency_vendor"
      ? !row.agencyBlockedReason
      : !row.agencyBlockedReason && isInHouseEligible(row.trip) && row.ownedEquipmentChoices.length > 0 && equipmentByTripId[String(row.trip.id)] != null));
  const selectableIds = trips.filter(trip => transportType !== "in_house" || isInHouseEligible(trip)).map(trip => trip.id);
  const toggleTrip = (id: number) => setSelectedIds(old => old.includes(id) ? old.filter(value => value !== id) : [...old, id]);
  const toggleAll = () => setSelectedIds(old => old.length === selectableIds.length ? [] : selectableIds);
  const sourceRole = sourceType === "own_source" ? "Own source" : "Vendor source";
  const newRole = `${sourceRole} → ${transportType === "in_house" ? "In-house" : "Agency/vendor"}`;
  return <ReviewToolFrame title="Set source and transport">
    <div className="space-y-5">
      <FilterSummary filters={filters} />
      {tripsQuery.isLoading ? <div className="space-y-2" role="status" aria-label="Loading trips"><div className="h-12 animate-pulse rounded bg-muted" /><div className="h-12 animate-pulse rounded bg-muted" /></div>
        : tripsQuery.isError ? <div role="alert" className="rounded-lg border border-destructive/40 p-4">Trips could not be loaded. <Button variant="outline" onClick={() => void tripsQuery.refetch()}>Retry</Button></div>
        : !trips.length ? <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">No trips match these filters.</div>
        : <section className="space-y-3 rounded-xl border bg-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><h2 className="font-semibold">Choose trips</h2><p className="text-xs text-muted-foreground">Preview is authoritative. Approved and paid bill trips are excluded by the server.</p></div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!selectableIds.length && selectableIds.every(id => selectedIds.includes(id))} onChange={toggleAll} />Select all filtered ({selectableIds.length} eligible for this transport)</label>
          </div>
          <div className="max-h-72 space-y-1 overflow-auto rounded-md border p-2">
            {trips.map(trip => <label key={trip.id} className="flex items-start gap-2 rounded px-2 py-2 hover:bg-muted/50">
              <input type="checkbox" checked={selectedIds.includes(trip.id)} disabled={transportType === "in_house" && !isInHouseEligible(trip)} onChange={() => toggleTrip(trip.id)} />
              <span className="text-sm">{trip.date} · {trip.site} · {trip.material} · Receipt {trip.receiptNumber || "—"} · {trip.vehicleNumber || "Vehicle not recorded"} · {trip.supplier || "Transporter not recorded"}</span>
              {transportType === "in_house" && !isInHouseEligible(trip) && <span className="text-xs text-muted-foreground">In-house requires blank transporter identity and an exact active owned-vehicle registration match.</span>}
            </label>)}
          </div>
          <Button onClick={() => { setPreviewData(null); setMessage(""); preview.mutate(selectedIds); }} disabled={!selectedIds.length || preview.isPending}>
            {preview.isPending ? "Preparing preview…" : `Preview ${selectedIds.length} selected trips`}
          </Button>
        </section>}
      <section className="grid grid-cols-1 gap-4 rounded-xl border bg-card p-4 md:grid-cols-2">
        <div className="space-y-3">
          <h2 className="font-semibold">Material source</h2>
          <div className="flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-2"><input type="radio" checked={sourceType === "own_source"} onChange={() => setSourceType("own_source")} />Own source</label>
            <label className="flex items-center gap-2"><input type="radio" checked={sourceType === "vendor"} disabled={!canVerify} onChange={() => setSourceType("vendor")} />Vendor (verify permission required)</label>
          </div>
          {sourceType === "own_source" ? <div className="space-y-1"><Label htmlFor="own-source-label">Source-place label</Label>
            <Input id="own-source-label" value={sourceLabel} onChange={event => { setSourceLabel(event.target.value); setSourceQuery(event.target.value); }} list="prior-source-labels" placeholder="Type or select a prior source label" />
            <datalist id="prior-source-labels">{sourceSuggestions.filter(value => !sourceQuery || value.toLowerCase().includes(sourceQuery.toLowerCase())).map(value => <option key={value} value={value} />)}</datalist>
            {suggestionsQuery.isError && <p role="alert" className="text-xs text-destructive">Prior source labels unavailable. You can still enter a label.</p>}
          </div> : <div className="space-y-1"><Label htmlFor="source-vendor">Vendor Master</Label>
            {vendorsQuery.isLoading && <div role="status" className="h-9 animate-pulse rounded bg-muted" aria-label="Loading vendors" />}
            {vendorsQuery.isError && <p role="alert" className="text-xs text-destructive">Vendor Master could not be loaded. <button type="button" className="underline" onClick={() => void vendorsQuery.refetch()}>Retry</button></p>}
            <select id="source-vendor" className="w-full rounded-md border bg-background p-2 text-sm" value={vendorId} disabled={!canVerify || vendorsQuery.isLoading || vendorsQuery.isError} onChange={event => setVendorId(event.target.value)}>
              <option value="">Choose a vendor</option>{vendors.map(vendor => <option key={vendor.id} value={vendor.id}>{vendor.name}</option>)}
            </select>{!canVerify && <p className="text-xs text-muted-foreground">Vendor source cannot be applied without site_materials verify permission.</p>}
            {vendorsQuery.isSuccess && !vendors.length && <p className="text-xs text-muted-foreground">No active Vendor Master records are available.</p>}
          </div>}
        </div>
        <div className="space-y-3">
          <h2 className="font-semibold">Transport</h2>
          <div className="flex flex-col gap-2 text-sm">
            <label className="flex items-center gap-2"><input type="radio" checked={transportType === "agency_vendor"} onChange={() => { setTransportType("agency_vendor"); setSelectedIds([]); setPreviewData(null); setEquipmentByTripId({}); }} />Agency/vendor — keep each recorded transporter name</label>
            <label className="flex items-center gap-2"><input type="radio" checked={transportType === "in_house"} onChange={() => { setTransportType("in_house"); setSelectedIds([]); setPreviewData(null); setEquipmentByTripId({}); }} />In-house — choose owned equipment</label>
          </div>
        </div>
      </section>
      {equipmentQuery.isLoading && <div role="status" aria-label="Loading Equipment Master" className="h-10 animate-pulse rounded bg-muted" />}
      {equipmentQuery.isSuccess && ownedEquipment.length === 0 && <p className="text-sm text-muted-foreground">No active owned equipment records are available for in-house matching.</p>}
      {preview?.isError && <p role="alert" className="text-sm text-destructive">The server preview failed. No trip changes have been made. Retry the preview.</p>}
      {equipmentQuery.isError && <p role="alert" className="text-sm text-destructive">Equipment Master could not be loaded. In-house matches are unavailable. <button type="button" className="underline" onClick={() => void equipmentQuery.refetch()}>Retry</button></p>}
      {previewData && <section className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2"><h2 className="text-lg font-semibold">Server preview · {previewRows.length} eligible</h2><p className="text-sm text-muted-foreground">Proposed role: {newRole}</p></div>
        {!!previewData.excluded.length && <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900" data-testid="source-transport-excluded">
           {previewData.excluded.map(item => <p key={`${item.tripId}-${item.billNo ?? item.reason}`}>Trip #{item.tripId} excluded — {item.billNo ? `${item.status} bill #${item.billNo}` : item.reason || "not eligible"}</p>)}
        </div>}
        <div className="space-y-3">
          {previewRows.map(row => {
            const trip = row.trip;
            const choices = transportType === "agency_vendor"
              ? row.equipmentChoices
              : ownedMatchesForTrip(trip)
                .map(item => ({ id: item.id, name: item.name, registrationNumber: item.registrationNumber, ownerVendorId: null, linkedVendorName: null }));
            const proposed = row.proposedEquipment;
            const unambiguous = !!proposed && choices.some(item => item.id === proposed.id);
            const chosen = equipmentByTripId[String(trip.id)];
            const chosenEquipment = choices.find(item => item.id === chosen);
            const billStatus = row.bill?.status.toLowerCase();
            const billNote = row.bill && ["draft", "verified"].includes(billStatus || "")
              ? `On ${billStatus} bill #${row.bill.billNo} — re-pull that bill's trips to update it` : "";
            const blocked = !!row.blockedReason || (transportType === "in_house" && !isInHouseEligible(trip));
            return <article key={trip.id} className={`rounded-xl border p-4 ${selectedIds.includes(trip.id) ? "bg-card" : "bg-muted/20 opacity-70"}`} data-testid={`source-transport-preview-${trip.id}`}>
              <div className="flex items-start gap-3">
                <input type="checkbox" checked={selectedIds.includes(trip.id)} disabled={blocked} onChange={() => toggleTrip(trip.id)} aria-label={`Select trip ${trip.id}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap justify-between gap-2"><strong>{roleLabel(row.currentRole)} → {newRole}</strong><span className="text-xs text-muted-foreground">{trip.date} · Trip #{trip.id}</span></div>
                  <p className="mt-1 text-sm">{trip.site} · {trip.material} · Receipt {trip.receiptNumber || "—"}</p>
                  <p className="text-sm text-muted-foreground">Recorded vehicle: {trip.vehicleNumber || "—"} · Transporter: {trip.supplier || "—"}</p>
                  <p className="mt-1 text-sm font-medium">Proposed / selected vehicle: {chosenEquipment?.registrationNumber || chosenEquipment?.name || (transportType === "agency_vendor" ? "Vehicle not matched" : "Choose owned equipment")}</p>
                  {row.blockedReason && <p className="mt-2 text-sm text-amber-800">{row.blockedReason}</p>}
                  {transportType === "in_house" && !isInHouseEligible(trip) && <p className="mt-2 text-sm text-amber-800">In-house is unavailable: saved transporter identity must be blank and the recorded vehicle must exactly match active owned equipment.</p>}
                  {transportType === "agency_vendor" && <div className="mt-2 space-y-1">
                    {!unambiguous && chosen == null && <p className="text-xs font-medium text-amber-700">Vehicle not matched — select manually to create a hired-vehicle audit link.</p>}
                    <Label htmlFor={`equipment-${trip.id}`} className="text-xs">Hired vehicle link</Label>
                    <select id={`equipment-${trip.id}`} className="w-full rounded-md border bg-background p-2 text-sm" value={chosen == null ? "" : String(chosen)} disabled={blocked} onChange={event => setEquipmentByTripId(old => ({ ...old, [String(trip.id)]: event.target.value ? Number(event.target.value) : null }))}>
                      <option value="">No vehicle link</option>{choices.map(item => <option key={item.id} value={item.id}>{item.registrationNumber || item.name} · {item.linkedVendorName || "Owner not shown"}</option>)}
                    </select>
                  </div>}
                  {transportType === "in_house" && <div className="mt-2 space-y-1">
                    <Label htmlFor={`equipment-${trip.id}`} className="text-xs">Owned equipment</Label>
                    <select id={`equipment-${trip.id}`} className="w-full rounded-md border bg-background p-2 text-sm" value={chosen == null ? "" : String(chosen)} disabled={blocked} onChange={event => setEquipmentByTripId(old => ({ ...old, [String(trip.id)]: event.target.value ? Number(event.target.value) : null }))}>
                      <option value="">Choose owned equipment</option>{choices.map(item => <option key={item.id} value={item.id}>{item.registrationNumber || item.name}</option>)}
                    </select>
                  </div>}
                  {billNote && <p className="mt-2 rounded bg-amber-50 px-2 py-1 text-xs text-amber-800">{billNote}</p>}
                  <p className="mt-2 text-xs text-muted-foreground">Billing note: {billNote || "Not on a draft or verified bill."}</p>
                </div>
              </div>
            </article>;
          })}
        </div>
        <div className="max-w-2xl space-y-2 rounded-xl border bg-card p-4">
          <Label htmlFor="source-transport-reason">Reason for this correction <span className="text-destructive">*</span></Label>
          <textarea id="source-transport-reason" className="min-h-24 w-full rounded-md border bg-background p-3 text-sm" value={reason} onChange={event => setReason(event.target.value)} placeholder="Record the evidence or reason for the role change." />
          <Button onClick={() => apply.mutate()} disabled={apply.isPending || !reason.trim() || !selectedPreviewRows.length || (sourceType === "vendor" && (!canVerify || !vendorId))}>
            {apply.isPending ? "Applying correction…" : `Apply to ${selectedPreviewRows.length} selected trip${selectedPreviewRows.length === 1 ? "" : "s"}`}
          </Button>
          <p className="text-xs text-muted-foreground">One transactional request applies the selected changes. Recorded agency transporter names remain untouched.</p>
        </div>
      </section>}
      {message && <p className="rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900" role="status">{message}</p>}
      {apply.isError && <p role="alert" className="text-sm text-destructive">Apply failed. The server did not confirm changes; review the preview and retry.</p>}
    </div>
  </ReviewToolFrame>;
}
