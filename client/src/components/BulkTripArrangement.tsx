import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel } from "@/components/ui/alert-dialog";
import { hasValidTripLinkPeriod, tripArrangementLabel, type ArrangementOption, type TripArrangementPreview } from "@shared/tripArrangementLink";

type Filters = {
  site?: string; material?: string; supplier?: string; vehicleNumber?: string;
  dateFrom?: string; dateTo?: string; onlyUnassigned: boolean;
  onlyWithoutArrangement: boolean; roleFilter: string;
};
export function BulkTripArrangement({filters}: {filters: Filters}) {
  const [arrangementId, setArrangementId] = useState("");
  const [onlyUnlinked, setOnlyUnlinked] = useState(true);
  const [confirmation, setConfirmation] = useState<TripArrangementPreview | null>(null);
  const [message, setMessage] = useState("");
  const [expanded, setExpanded] = useState(false);
  const options = useQuery<ArrangementOption[]>({
    queryKey:["/api/site-material-trips/arrangement-options",filters.site],
    queryFn: async () => {
      const rows = await (await apiRequest("GET",`/api/site-material-trips/arrangement-options?site=${encodeURIComponent(filters.site!)}`)).json();
      if (!Array.isArray(rows)) throw Error("Invalid arrangement response.");
      return rows;
    },
    enabled:expanded && !!filters.site,
  });
  useEffect(() => {setArrangementId("");},[filters.site]);
  const payload = {...filters, onlyUnlinked, earthworkArrangementId:Number(arrangementId)};
  const selectionKey = JSON.stringify(payload);
  useEffect(() => {setConfirmation(null); setMessage("");},[selectionKey]);
  const ready = !!filters.site && filters.roleFilter === "all" && !!arrangementId && options.data?.some(a=>a.id===Number(arrangementId));
  const preview = useQuery<TripArrangementPreview>({
    queryKey:["trip-arrangement-preview",payload],
    queryFn:async ()=>(await apiRequest("POST","/api/site-material-trips/arrangement/preview",payload)).json(),
    enabled:!!ready,
  });
  const save = useMutation({
    mutationFn:async ()=>{
      if(!confirmation || !ready) throw Error("Review the current filters before linking.");
      return (await apiRequest("POST","/api/site-material-trips/arrangement/bulk",{...payload,previewToken:confirmation.previewToken})).json();
    },
    onSuccess:result=>{
      setConfirmation(null);
      setMessage(`Linked ${result.updatedCount} trips. ${result.exclusionMessage || ""} No other trip fields were changed.`);
      queryClient.invalidateQueries({predicate:q=>String(q.queryKey[0]).startsWith("/api/site-material-trips")});
      queryClient.invalidateQueries({queryKey:["trip-arrangement-preview"]});
      queryClient.invalidateQueries({predicate:q=>String(q.queryKey[0]).startsWith("/api/materials-received")});
    },
    onError:error=>{setConfirmation(null);setMessage(error.message);void preview.refetch();},
  });
  const selected = options.data?.find(a=>a.id===Number(arrangementId));
  const filterSummary = <ul className="space-y-1 text-xs">
    <li>Site: {filters.site || "Select one site"}</li>
    <li>Material: {filters.material || "All"}</li>
    <li>Transporter: {filters.supplier || "All"}</li>
    <li>Vehicle: {filters.vehicleNumber || "All"}</li>
    <li>Dates: {filters.dateFrom || "Any start"} to {filters.dateTo || "Any end"}</li>
    <li>Only without a material source: {filters.onlyUnassigned ? "Yes" : "No"}</li>
    <li>No-arrangement list filter: {filters.onlyWithoutArrangement ? "Yes" : "No"}</li>
    <li>Only not yet linked: {onlyUnlinked ? "Yes — existing links excluded" : "No — replacing other links is allowed"}</li>
    <li>Role filter: {filters.roleFilter === "all" ? "All" : "Active — bulk linking blocked"}</li>
  </ul>;
  return <details className="my-3 rounded-md border p-3" data-testid="bulk-arrangement-tool" onToggle={e=>setExpanded(e.currentTarget.open)}>
    <summary className="cursor-pointer text-sm font-medium">Bulk link to an Execution Arrangement</summary>
    <div className="space-y-3 pt-3">
      <p className="text-xs">Only the arrangement link changes. Own-source trips are included. No quantities, roles or progress are changed.</p>
      {!filters.site && <p>Select one site before linking.</p>}
      {filters.roleFilter !== "all" && <p role="alert">Select All in the role filter before bulk linking.</p>}
      {options.isError && <p role="alert">Arrangements could not be loaded. <button onClick={()=>void options.refetch()}>Retry</button></p>}
      <label className="block text-sm">Execution Arrangement
        <select className="mt-1 w-full rounded border bg-background p-2" aria-label="Bulk Execution Arrangement" value={arrangementId} disabled={!filters.site || options.isFetching || save.isPending} onChange={e=>setArrangementId(e.target.value)}>
          <option value="">Choose an arrangement explicitly</option>
          {options.data?.map(a=><option key={a.id} value={a.id} disabled={!hasValidTripLinkPeriod({...a,status:a.status ?? ""})}>{tripArrangementLabel(a)}{!hasValidTripLinkPeriod({...a,status:a.status ?? ""}) ? " · Not available for new links" : " · Checked against each trip date"}</option>)}
        </select>
      </label>
      {filters.site && options.isSuccess && !options.data.length && <p>No arrangements exist for this site's BOQ project.</p>}
      <label className="flex gap-2 text-sm"><input type="checkbox" checked={onlyUnlinked} disabled={save.isPending} onChange={e=>setOnlyUnlinked(e.target.checked)} />Only trips not yet linked to an arrangement</label>
      {!onlyUnlinked && <p className="text-sm text-amber-700">Overwrite mode: existing links to another arrangement may be replaced. Review the separate count before confirming.</p>}
      {preview.isError && <p role="alert">Could not count eligible trips. <button onClick={()=>void preview.refetch()}>Retry</button></p>}
      {ready && !preview.isFetching && preview.data?.excludedCount ? <p role="alert" data-testid="arrangement-excluded-count">{preview.data.exclusionMessage}</p> : null}
      {ready && preview.data && !preview.isFetching && <p className="text-sm" data-testid="arrangement-eligible-count">
        {preview.data.eligibleCount} eligible trips · {preview.data.overwriteCount} already point at another arrangement.
        {" "}{preview.data.alreadyLinkedCount} matching trips already have a link; {onlyUnlinked || filters.onlyWithoutArrangement ? "they are excluded" : "links already pointing at the chosen arrangement are excluded"}.
      </p>}
      <Button disabled={!ready || !preview.data?.eligibleCount || preview.isFetching || preview.isError || save.isPending} onClick={()=>setConfirmation(preview.data!)}>Link {ready && !preview.isFetching ? preview.data?.eligibleCount ?? 0 : 0} eligible trips</Button>
      {message && <p role="status" className="text-sm">{message}</p>}
    </div>
    <AlertDialog open={!!confirmation} onOpenChange={open=>!open&&!save.isPending&&setConfirmation(null)}>
      <AlertDialogContent>
        <AlertDialogHeader><AlertDialogTitle>Link {confirmation?.eligibleCount} trips?</AlertDialogTitle>
          <AlertDialogDescription>Only the explicitly selected arrangement will be written. Other trip fields stay unchanged.</AlertDialogDescription>
        </AlertDialogHeader>
        <p className="text-sm font-medium">{selected && tripArrangementLabel(selected)}</p>
        {filterSummary}
        <p className="text-sm font-medium">{confirmation?.overwriteCount} of these {confirmation?.eligibleCount} already point at another arrangement{confirmation?.overwriteCount ? " — those links will be replaced." : "."}</p>
        {confirmation?.excludedCount ? <p role="alert">{confirmation.exclusionMessage}</p> : null}
        <AlertDialogFooter><AlertDialogCancel disabled={save.isPending}>Cancel</AlertDialogCancel><Button disabled={save.isPending} onClick={()=>save.mutate()}>{save.isPending?"Linking…":"Confirm arrangement links"}</Button></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </details>;
}
