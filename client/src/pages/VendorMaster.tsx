import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth-context";
import { getBillFinancialTotals } from "@shared/vendorBillFinancialReport";
import { billReviewAmounts } from "@shared/vendorBillReview";

type Vendor = {
  id: number; name: string; businessName: string | null; gstNumber: string | null; panNumber: string | null;
  address: string | null; bankAccountName?: string | null; bankAccountNumber?: string | null;
  bankIfsc?: string | null; bankName?: string | null; contactPersonName: string | null;
  contactPhone: string | null; contactEmail: string | null; isActive: boolean;
};
type Proposal = { role: string; name: string; ids: number[]; count: number; hint: string | null; suggestionId: number | null;
  registration?: string; version?: number | null; linkedVendorId?: number | null; conflict?: string | null;
  linkedVendorName?: string | null; confirmedBy?: string; confirmedAt?: string; confirmationReason?: string };
type Activity = { vendor: Vendor; sites: { site: string; equipment: number; material: number; transport: number; labour: number }[] };
type FinancialBill = Record<string, any> & { id: number };
const keys = ["name", "businessName", "gstNumber", "panNumber", "address", "contactPersonName", "contactPhone", "contactEmail", "bankAccountName", "bankAccountNumber", "bankIfsc", "bankName"] as const;
const labels: Record<string, string> = {
  name: "Display name", businessName: "Business name", gstNumber: "GST number", panNumber: "PAN number",
  address: "Address", contactPersonName: "Contact person", contactPhone: "Phone", contactEmail: "Email",
  bankAccountName: "Account holder", bankAccountNumber: "Account number", bankIfsc: "IFSC", bankName: "Bank name",
};
const roleLabels: Record<string, string> = {
  equipment: "Hired equipment owner", bills: "Vendor bills", rates: "Rate cards", indents: "Bulk material purchase indents", transport: "Trip transporter", materialSource: "Trip material source",
};
const empty = () => Object.fromEntries(keys.map(k => [k, ""])) as Record<typeof keys[number], string>;
const reviewRoles = Object.keys(roleLabels) as (keyof typeof roleLabels)[];
const money = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2, maximumFractionDigits: 2 });
function normalizeProposalName(name: string) {
  return name.toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();
}
function isSelfPlaceholder(name: string) {
  const normalized = normalizeProposalName(name);
  const words = normalized.split(" ").filter(Boolean);
  if (!words.length) return false;
  if (words.includes("HLC") || /(^| )H L C( |$)/.test(normalized) || /(^| )HIGH LANE CONSTRUCTIONS?( |$)/.test(normalized)) return true;
  const placeholderWords = new Set(["SELF", "OWN", "SUPPLIER", "VENDOR", "SOURCE", "MATERIAL", "TRANSPORT", "PARTY", "COMPANY"]);
  return words.some(word => word === "SELF" || word === "OWN") && words.every(word => placeholderWords.has(word));
}
function proposalKey(p: Proposal) {
  return `${p.role}:${p.name}:${p.ids.join(",")}`;
}
function emptyNewVendor(name: string): Record<string, string | boolean> {
  return { ...Object.fromEntries(keys.map(key => [key, ""])), name, businessName: name, isActive: true };
}
function readableError(error: unknown) {
  if (!(error instanceof Error)) return "Operation failed.";
  const separator = error.message.indexOf(": ");
  if (separator < 0) return error.message;
  const body = error.message.slice(separator + 2);
  try {
    const parsed = JSON.parse(body);
    if (typeof parsed.message === "string") return parsed.message;
  } catch { /* Keep the server's plain-text error. */ }
  return body || error.message;
}
function Editor({ initial, onSave, onCancel, busy }: {
  initial: Partial<Vendor> | null; onSave: (data: Record<string, string | boolean>) => void; onCancel: () => void; busy: boolean;
}) {
  const [form, setForm] = useState<Record<string, string | boolean>>({
    ...Object.fromEntries(keys.map(k => [k, initial?.[k] ?? ""])), isActive: initial?.isActive ?? true,
  });
  return <form onSubmit={e => { e.preventDefault(); onSave(form); }} className="rounded-xl border bg-white p-5 space-y-4">
    <div className="flex justify-between items-center"><h2 className="text-lg font-semibold">{initial?.id ? "Edit vendor" : "New vendor"}</h2><button type="button" className="text-sm underline" onClick={onCancel}>Cancel</button></div>
    <div className="grid sm:grid-cols-2 gap-4">
      {keys.map(k => <label key={k} className={k === "address" ? "sm:col-span-2 text-sm" : "text-sm"}>
        <span className="block font-medium mb-1">{labels[k]}{k === "name" ? " *" : ""}</span>
        <input className={`w-full border rounded-md px-3 py-2${k === "name" || k === "businessName" ? " vendor-master-name-input" : ""}`} required={k === "name"} value={String(form[k] ?? "")} onChange={e => setForm({ ...form, [k]: e.target.value })}
          type={k === "contactEmail" ? "email" : "text"} autoComplete="off" />
      </label>)}
    </div>
    <label className="flex gap-2 items-center text-sm"><input type="checkbox" checked={Boolean(form.isActive)} onChange={e => setForm({ ...form, isActive: e.target.checked })} />Active</label>
    <button disabled={busy} className="rounded-md bg-blue-700 text-white px-4 py-2 disabled:opacity-50">Save vendor</button>
  </form>;
}

export default function VendorMaster() {
  const { isAdmin: admin, isOwner, user } = useAuth();
  const isAdmin = admin || isOwner;
  const qc = useQueryClient();
  const [tab, setTab] = useState<"master" | "review">("master");
  const [reviewStatus, setReviewStatus] = useState<"pending" | "confirmed">("pending");
  const [roleFilter, setRoleFilter] = useState<"all" | keyof typeof roleLabels>("all");
  const [reviewSearch, setReviewSearch] = useState("");
  const [selectedProposalKeys, setSelectedProposalKeys] = useState<string[]>([]);
  const [masterSearch, setMasterSearch] = useState("");
  const [editing, setEditing] = useState<Partial<Vendor> | null>(null);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [chosen, setChosen] = useState<Record<string, string>>({});
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [creating, setCreating] = useState<Proposal | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const vendors = useQuery<Vendor[]>({ queryKey: ["/api/vendor-master"] });
  const review = useQuery<Proposal[]>({ queryKey: [`/api/vendor-master/review?status=${reviewStatus}`], enabled: tab === "review" && isAdmin });
  const financialReview = useQuery<FinancialBill[]>({
    queryKey: ["/api/vendor-bills", "vendor-link-financial-review", user?.id],
    queryFn: async () => {
      const response = await fetch("/api/vendor-bills/financial-review", { credentials: "include", cache: "no-store" });
      if (!response.ok) throw new Error("Financial information is not available.");
      return response.json();
    },
    enabled: tab === "review" && isAdmin && reviewStatus === "pending" && (review.data || []).some(p => p.role === "bills"),
    retry: false, staleTime: 0, gcTime: 0,
  });
  const activity = useQuery<Activity>({ queryKey: [`/api/vendor-master/${detailId}/activity`], enabled: !!detailId });
  const refresh = () => { qc.invalidateQueries({ queryKey: ["/api/vendor-master"] }); qc.invalidateQueries({ predicate: q => typeof q.queryKey[0] === "string" && q.queryKey[0].startsWith("/api/vendor-master/review") }); if (detailId) qc.invalidateQueries({ queryKey: [`/api/vendor-master/${detailId}/activity`] }); };
  const run = async (fn: () => Promise<void>) => { setBusy(true); setMessage(""); try { await fn(); refresh(); } catch (e) { setMessage(e instanceof Error ? e.message : "Operation failed"); } finally { setBusy(false); } };
  const confirm = (p: Proposal, vendorId?: number, newVendor?: Record<string, string | boolean>) => run(async () => {
    await apiRequest("POST", "/api/vendor-master/review/confirm", { role: p.role, name: p.name, ids: p.ids,
      version: p.version, reason: reasons[`${p.role}:${p.ids.join(",")}`], ...(vendorId ? { vendorId } : { newVendor }) });
    qc.invalidateQueries({ predicate: q => typeof q.queryKey[0] === "string" &&
      (q.queryKey[0].startsWith("/api/vendor-bills") || q.queryKey[0].startsWith("/api/site-material-trips") || q.queryKey[0].startsWith("/api/plant-module/equipment")) });
    setCreating(null);
    setMessage(`Confirmed ${p.count} ${roleLabels[p.role]} link(s) for ${p.name}. Free-text names remain unchanged.`);
  });
  const available = vendors.data || [];
  const masterQuery = masterSearch.trim().toLowerCase();
  const masterVendors = [...available].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" }) || a.id - b.id,
  );
  const filteredMasterVendors = masterQuery
    ? masterVendors.filter(vendor =>
      [vendor.name, vendor.businessName, vendor.gstNumber, vendor.contactPhone]
        .some(value => String(value ?? "").toLowerCase().includes(masterQuery)),
    )
    : masterVendors;
  const searchFilteredProposals = (review.data || []).filter(p => [p.name, p.registration, p.linkedVendorName].filter(Boolean).join(" ").toUpperCase().includes(reviewSearch.trim().toUpperCase()));
  const proposals = searchFilteredProposals.filter(p => roleFilter === "all" || p.role === roleFilter);
  const proposalGroups = useMemo(() => {
    const groups = new Map<string, Proposal[]>();
    for (const proposal of proposals) {
      const normalized = normalizeProposalName(proposal.name);
      const group = groups.get(normalized) || [];
      group.push(proposal);
      groups.set(normalized, group);
    }
    return Array.from(groups.values());
  }, [proposals]);
  const visiblePendingProposals = reviewStatus === "pending" ? proposalGroups.flat() : [];
  const selectedProposals = visiblePendingProposals.filter(p => selectedProposalKeys.includes(proposalKey(p)));
  const bulkEligibleVisible = visiblePendingProposals.filter(p =>
    roleFilter !== "all" && roleFilter !== "equipment" && !p.suggestionId && !p.linkedVendorId && !isSelfPlaceholder(p.name),
  );
  const allEligibleSelected = bulkEligibleVisible.length > 0 && bulkEligibleVisible.every(p => selectedProposalKeys.includes(proposalKey(p)));
  const roleCounts = (review.data || []).reduce<Record<string, number>>((counts, proposal) => {
    counts[proposal.role] = (counts[proposal.role] || 0) + 1;
    return counts;
  }, {});
  const financialBillById = useMemo(() => new Map((financialReview.data || []).map(bill => [Number(bill.id), bill])), [financialReview.data]);
  const billBilledTotal = (proposal: Proposal) => {
    if (financialReview.isError || !financialReview.data) return null;
    const bills = proposal.ids.map(id => financialBillById.get(Number(id)));
    if (bills.some(bill => !bill)) return null;
    return bills.reduce((sum, bill) => sum + billReviewAmounts(bill!, getBillFinancialTotals(bill!)).net, 0);
  };
  const selectedBillProposals = selectedProposals.filter(p => p.role === "bills");
  const billTotalsReady = selectedBillProposals.every(p => billBilledTotal(p) != null);
  const invalidateLinkedRecords = () => qc.invalidateQueries({ predicate: q => typeof q.queryKey[0] === "string" &&
    (q.queryKey[0].startsWith("/api/vendor-bills") || q.queryKey[0].startsWith("/api/site-material-trips") || q.queryKey[0].startsWith("/api/plant-module/equipment")) });
  const confirmBulk = async () => {
    if (busy || roleFilter === "all" || roleFilter === "equipment" || !selectedProposals.length) return;
    setBusy(true);
    setMessage("");
    const completed: Proposal[] = [];
    let failed: { proposal: Proposal; reason: string } | null = null;
    try {
      for (let index = 0; index < selectedProposals.length; index++) {
        const proposal = selectedProposals[index];
        if (isSelfPlaceholder(proposal.name)) {
          failed = { proposal, reason: "HLC/self/own placeholder names cannot be added to the Vendor Master." };
          break;
        }
        try {
          await apiRequest("POST", "/api/vendor-master/review/confirm", {
            role: proposal.role, name: proposal.name, ids: proposal.ids, version: proposal.version,
            newVendor: emptyNewVendor(proposal.name),
          });
          completed.push(proposal);
        } catch (error) {
          failed = { proposal, reason: readableError(error) };
          break;
        }
      }
      const notAttempted = failed ? selectedProposals.slice(completed.length + 1) : [];
      const lines = [
        completed.length ? `Created and linked: ${completed.map(p => `${p.name} (${p.count} record${p.count === 1 ? "" : "s"})`).join("; ")}.` : "",
        failed ? `Failed: ${failed.proposal.name} — ${failed.reason}` : "",
        notAttempted.length ? `Not attempted: ${notAttempted.map(p => p.name).join("; ")}.` : "",
        !failed ? "All selected proposals were processed." : "",
      ].filter(Boolean);
      setMessage(lines.join("\n"));
      if (completed.length) {
        refresh();
        void invalidateLinkedRecords();
      }
    } finally {
      setSelectedProposalKeys([]);
      setBusy(false);
    }
  };
  return <main className="max-w-6xl mx-auto p-5 space-y-5">
    <Link href="/masters/hub" className="text-sm text-blue-700 hover:underline">← Master Data</Link>
    <div><h1 className="text-2xl font-bold">Vendor Master</h1><p className="text-sm text-slate-600">One party, one Vendor Master. Material supplier, transporter and equipment owner remain separate roles. Linking preserves recorded names and existing bills.</p></div>
    <div className="flex gap-2 border-b">{(["master", "review"] as const).map(t => <button key={t} onClick={() => { setTab(t); setMessage(""); }} className={`px-4 py-2 ${tab === t ? "border-b-2 border-blue-700 font-semibold" : ""}`}>{t === "master" ? "Vendors" : "Link Vendors"}</button>)}</div>
     {message && <p role="alert" className="rounded border bg-amber-50 p-3 text-sm whitespace-pre-line">{message}</p>}
    {tab === "master" ? <>
      {isAdmin && <button className="bg-blue-700 text-white rounded-md px-4 py-2" onClick={() => setEditing({})}>Create vendor</button>}
      {editing && <Editor key={editing.id || "new"} initial={editing} busy={busy} onCancel={() => setEditing(null)} onSave={form => run(async () => {
        await apiRequest(editing.id ? "PATCH" : "POST", editing.id ? `/api/vendor-master/${editing.id}` : "/api/vendor-master", form);
        setEditing(null);
        setMessage("Vendor saved.");
      })} />}
      {vendors.isError && <p role="alert">Unable to load vendors: {String(vendors.error)}</p>}
      <label className="block text-sm">Search vendors
        <input
          className="mt-1 w-full rounded-md border bg-background p-2"
          placeholder="Vendor name, business name, GST or phone"
          value={masterSearch}
          onChange={event => setMasterSearch(event.target.value)}
        />
      </label>
      {!vendors.isLoading && !vendors.isError && <p role="status" className="text-sm text-slate-600">
        {masterQuery
          ? `Showing ${filteredMasterVendors.length} of ${available.length} vendors`
          : `Showing ${available.length} vendors`}
      </p>}
      {masterQuery && filteredMasterVendors.length === 0
        ? <p role="status" className="rounded-lg border bg-muted/20 p-6 text-sm">No vendors match “{masterSearch.trim()}”.</p>
        : <div className="grid md:grid-cols-2 gap-3">{filteredMasterVendors.map(v => <div key={v.id} className="rounded-lg border bg-white p-4">
        <div className="flex justify-between gap-2"><button className="font-semibold text-blue-700 text-left" onClick={() => setDetailId(v.id)}>{v.name}</button><span className="text-xs">{v.isActive ? "Active" : "Inactive"}</span></div>
        <p className="text-sm text-slate-600">{[v.businessName, v.gstNumber && `GST ${v.gstNumber}`, v.contactPhone].filter(Boolean).join(" · ")}</p>
        {isAdmin && <button className="text-sm underline mt-2" onClick={() => { setEditing(v); setDetailId(v.id); }}>Edit</button>}
      </div>)}</div>}
      {detailId && <section className="rounded-xl border bg-white p-5 space-y-3">
        <div className="flex justify-between"><h2 className="text-lg font-semibold">{activity.data?.vendor.name || "Vendor activity"}</h2><button className="underline text-sm" onClick={() => setDetailId(null)}>Close</button></div>
        {activity.isError && <p role="alert">Unable to load activity: {String(activity.error)}</p>}
        {activity.data && <>
          <div className="text-sm grid sm:grid-cols-2 gap-2">{keys.filter(k => k !== "name").map(k => activity.data!.vendor[k] ? <p key={k}><strong>{labels[k]}:</strong> {activity.data!.vendor[k]}</p> : null)}</div>
          <h3 className="font-medium pt-2">Linked activity by site</h3>
          {!activity.data.sites.length && <p className="text-sm text-slate-500">No linked site activity yet. Unlinked names are not counted.</p>}
          {activity.data.sites.map(s => <div key={s.site} className="rounded-md border p-3 text-sm"><strong>{s.site}</strong><p>Equipment hire {s.equipment} · Material supply {s.material} · Transport {s.transport} · Labour {s.labour}</p></div>)}
        </>}
      </section>}
    </> : isAdmin ? <>
      <h2 className="text-lg font-semibold">Review vendor identities</h2>
      <p className="text-sm text-slate-600">Review equipment owners, trip roles, unlinked bills, rate cards and bulk purchase indents. Several vehicles can share one vendor. Suggestions are not confirmations; verify each identity. Existing bill-specific references remain unchanged.</p>
      <div className="flex flex-wrap gap-2" aria-label="Link status">
         {(["pending", "confirmed"] as const).map(status => <button key={status} aria-pressed={reviewStatus === status} className={`rounded-md border px-4 py-2 text-sm ${reviewStatus === status ? "bg-primary text-primary-foreground" : "bg-card"}`} onClick={() => { setReviewStatus(status); setMessage(""); setCreating(null); setSelectedProposalKeys([]); }}>{status === "pending" ? "Pending Links" : "Confirmed Links"}</button>)}
      </div>
      <label className="block text-sm">Search vendor or registration
         <input className="mt-1 w-full rounded-md border bg-background p-2" placeholder="Vendor name or TS15UE4470" value={reviewSearch} onChange={e => { setReviewSearch(e.target.value); setSelectedProposalKeys([]); setMessage(""); }} />
      </label>
      <>
       <label className="block text-sm">Filter by role
         <select className="mt-1 w-full rounded-md border bg-background p-2" aria-label="Filter vendor links by role" value={roleFilter}
           onChange={event => { setRoleFilter(event.target.value as typeof roleFilter); setSelectedProposalKeys([]); setMessage(""); setCreating(null); }}>
           <option value="all">All ({review.data?.length || 0})</option>
           {reviewRoles.map(role => <option key={role} value={role}>{roleLabels[role]} ({roleCounts[role] || 0})</option>)}
         </select>
       </label>
       {review.isLoading && <div role="status" aria-label="Loading vendor links" className="h-32 rounded-lg bg-muted animate-pulse" />}
      {review.isError && <p role="alert">Unable to load proposals: {String(review.error)} <button className="underline" onClick={() => review.refetch()}>Retry</button></p>}
       {!review.isLoading && !review.isError && !proposals.length && <div className="rounded-lg border bg-muted/20 p-6"><h3 className="font-semibold">{reviewSearch ? "No matching links" : roleFilter !== "all" ? `No ${roleLabels[roleFilter]} links` : reviewStatus === "confirmed" ? "No confirmed links yet" : "No vendor identities need review"}</h3><p className="mt-1 text-sm text-muted-foreground">{reviewSearch ? "Try another vendor spelling or registration." : "Confirmed associations are kept separately from the pending queue."}</p></div>}
       {reviewStatus === "pending" && roleFilter !== "all" && roleFilter !== "equipment" && <>
         <label className="flex items-center gap-2 rounded border bg-white p-3 text-sm">
           <input type="checkbox" aria-label="Select all visible proposals" checked={allEligibleSelected} disabled={!bulkEligibleVisible.length || busy}
             onChange={event => {
               const visibleKeys = bulkEligibleVisible.map(proposalKey);
               setSelectedProposalKeys(current => event.target.checked
                 ? Array.from(new Set([...current, ...visibleKeys]))
                 : current.filter(key => !visibleKeys.includes(key)));
             }} />
           Select all visible proposals ({bulkEligibleVisible.length}; suggested matches and placeholders excluded)
         </label>
       </>}
       {proposalGroups.map(group => {
         const variants = new Set(group.map(p => p.name));
         const hasNearDuplicate = variants.size > 1;
         return <section key={normalizeProposalName(group[0].name)} className="space-y-3">
         {hasNearDuplicate && <p role="note" className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
           Similar typed names are grouped for review only; punctuation, spacing and case are unchanged, and these proposals are not merged: {Array.from(variants).join(" · ")}.
         </p>}
         {group.map(p => {
        const key = `${p.role}:${p.ids.join(",")}`;
         const selectKey = proposalKey(p);
        const target = chosen[key] ?? String(p.linkedVendorId ?? p.suggestionId ?? "");
         const suggestedVendorId = p.linkedVendorId ?? p.suggestionId;
         const suggestedVendorName = p.linkedVendorName || available.find(v => v.id === suggestedVendorId)?.name;
         const blockedPlaceholder = isSelfPlaceholder(p.name);
        return <div key={key} className="rounded-lg border bg-white p-4 flex flex-wrap items-center gap-4">
           {reviewStatus === "pending" && roleFilter !== "all" && roleFilter !== "equipment" && <input type="checkbox" aria-label={`Select ${p.name}`} checked={selectedProposalKeys.includes(selectKey)}
             disabled={busy || blockedPlaceholder} onChange={event => setSelectedProposalKeys(current =>
               event.target.checked ? Array.from(new Set([...current, selectKey])) : current.filter(item => item !== selectKey))} />}
          <div className="flex-1 min-w-52"><strong>{p.name || "Owner name missing"}</strong><p className="text-sm text-slate-600">{roleLabels[p.role]} · {p.count} record(s) · {p.registration}{p.linkedVendorId ? " · Linked" : " · Unlinked"}{p.hint ? ` · Alias hint: ${p.hint}` : ""}</p>
            {p.registration && <p className="mt-1 font-mono font-semibold">{p.registration}</p>}
            {p.linkedVendorId && <p className="text-sm font-medium">Vendor Master: {p.linkedVendorName || available.find(v => v.id === p.linkedVendorId)?.name || `#${p.linkedVendorId}`}</p>}
             {suggestedVendorId && <p className="text-sm font-medium text-blue-800">Suggested existing master: {suggestedVendorName || `#${suggestedVendorId}`} — excluded from select-all; select deliberately.</p>}
             {blockedPlaceholder && <p className="text-sm font-medium text-red-700">Not eligible: HLC/self/own placeholder names cannot be added to the Vendor Master.</p>}
            {p.conflict && <p className="text-sm text-amber-700">{p.conflict}</p>}
            {p.confirmedBy && <p className="text-xs text-slate-600">Confirmed by {p.confirmedBy}{p.confirmedAt ? ` · ${new Date(p.confirmedAt).toLocaleString()}` : ""} · {p.confirmationReason}</p>}</div>
          {reviewStatus === "pending" && isAdmin && <>
          <select aria-label={`Master match for ${p.name} ${p.role}`} className="border rounded px-2 py-2" value={target} onChange={e => setChosen({ ...chosen, [key]: e.target.value })}>
            <option value="">Select master vendor</option>{available.filter(v => v.isActive).map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
          {p.role === "equipment" && <input aria-label={`Verification reason ${p.registration}`} className="border rounded p-2" placeholder="Identity verification reason" value={reasons[key] || ""} onChange={e => setReasons({ ...reasons, [key]: e.target.value })} />}
          <button disabled={!target || busy || (p.role === "equipment" && (reasons[key] || "").trim().length < 3)} className="bg-blue-700 text-white rounded px-3 py-2 disabled:opacity-40" onClick={() => confirm(p, Number(target))}>Confirm link</button>
           {p.role !== "equipment" && !blockedPlaceholder && <button className="border rounded px-3 py-2" onClick={() => setCreating(p)}>Create new</button>}
           {p.role !== "equipment" && blockedPlaceholder && <span className="text-sm text-red-700">Creation refused</span>}
          </>}
        </div>;
       })}</section>;
       })}
      </>
       {selectedProposals.length > 0 && <section aria-label="Selected proposals" className="rounded-xl border bg-slate-50 p-4 space-y-3">
         <h3 className="font-semibold">Review selected proposals before creating</h3>
         <ul className="space-y-2 text-sm">{selectedProposals.map(p => {
           const total = p.role === "bills" ? billBilledTotal(p) : null;
           return <li key={proposalKey(p)}>
             <strong>{p.name}</strong> · {p.count} record(s)
             {p.role === "bills" && <span> · Billed total: {total == null ? financialReview.isError ? "unavailable — financial access is required" : "loading or unavailable" : money.format(total)}</span>}
           </li>;
         })}</ul>
         {financialReview.isError && selectedBillProposals.length > 0 && <p role="status" className="text-sm text-amber-800">Bill totals are hidden because financial review access is unavailable. No financial permissions have been changed. <button className="underline" onClick={() => void financialReview.refetch()}>Retry</button></p>}
         <button disabled={busy || roleFilter === "equipment" || !billTotalsReady} className="rounded-md bg-blue-700 text-white px-4 py-2 disabled:opacity-40" onClick={() => void confirmBulk()}>
           {busy ? "Processing proposals…" : "Create master and link"}
         </button>
       </section>}
      {creating && <div className="fixed inset-0 bg-black/40 z-50 overflow-auto p-4 flex items-start justify-center"><div className="w-full max-w-2xl mt-8">
        <p className="bg-white px-5 pt-4 font-medium">Create & link: {creating.name} ({roleLabels[creating.role]})</p>
         <Editor key={`${creating.role}:${creating.name}`} initial={{ name: creating.name, businessName: creating.name }} busy={busy} onCancel={() => setCreating(null)} onSave={form => {
           if (isSelfPlaceholder(String(form.name || creating.name))) {
             setMessage("This HLC/self/own placeholder name was not created.");
             setCreating(null);
             return;
           }
           confirm(creating, undefined, form);
         }} />
      </div></div>}
    </> : <p role="alert">Only Administrator / Owner reviewers can view pending or confirmed vendor identity reviews. Operational trip links are available in Trip Details / Review Links.</p>}
  </main>;
}