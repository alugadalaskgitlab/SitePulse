import { useState } from "react";
import { Download, FileText, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requestPayablesPreview, usePayablesPreview } from "@/hooks/use-payables-preview";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { PAYABLES_CATEGORIES, type PayablesItem, type PayablesTotals, type PreviewGstRates, type VendorPayablesPreviewRequest } from "@shared/vendorPayablesPreview";
import type { Site } from "@shared/schema";
import HireActivityBreakdownCalendar from "./HireActivityBreakdownCalendar";
import { exportPayablesPreview } from "./payablesPreviewExport";

const labels = { equipment: "Equipment hire", material: "Materials", transport: "Transport", labour: "Labour", other: "Other" };
const cash = (value: number | null) => value === null ? "Incomplete" : `₹${value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
function Totals({ totals, primary = false }: { totals: PayablesTotals; primary?: boolean }) {
  return <div className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
    <div><span className="block text-xs text-muted-foreground">Pre-tax</span><strong className={primary ? "text-2xl" : ""}>{cash(totals.preTax)}</strong></div>
    <div><span className="block text-xs text-muted-foreground">GST (indicative)</span><strong>{cash(totals.gst)}</strong></div>
    <div><span className="block text-xs text-muted-foreground">With GST</span><strong>{cash(totals.withGst)}</strong></div>
  </div>;
}
function Items({ items }: { items: PayablesItem[] }) {
  return <div className="overflow-x-auto"><table className="w-full min-w-[660px] text-xs">
    <thead className="bg-muted text-left"><tr>{["Date", "Description / allocation", "Quantity", "Rate", "Pre-tax"].map(h => <th className="px-3 py-2" key={h}>{h}</th>)}</tr></thead>
    <tbody>{items.map((item, index) => <tr className="border-b align-top" key={`${item.source}-${index}`}>
      <td className="px-3 py-2 whitespace-nowrap">{item.date}</td><td className="px-3 py-2">{item.description}<span className="block text-muted-foreground">{item.siteName || "Not allocated to a site"}</span>
        {item.unallocatedReason && <span className="block text-amber-700 dark:text-amber-400">{item.unallocatedReason}</span>}
        {item.warning && <span className="block text-amber-700 dark:text-amber-400">{item.warning}</span>}</td>
      <td className="px-3 py-2">{item.qty} {item.unit}</td><td className="px-3 py-2">{item.rate === null ? "Unknown" : cash(item.rate)}</td><td className="px-3 py-2 font-semibold">{cash(item.amount)}</td>
    </tr>)}</tbody>
  </table></div>;
}
export default function PayablesPreviewPanel({ vendors, sites }: { vendors: string[]; sites: Site[] }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const today = new Date().toISOString().slice(0, 10);
  const [vendor, setVendor] = useState("");
  const [from, setFrom] = useState(`${today.slice(0, 7)}-01`);
  const [to, setTo] = useState(today);
  const [siteId, setSiteId] = useState("");
  const [gstOverrides, setGstOverrides] = useState<Partial<PreviewGstRates>>({});
  const [request, setRequest] = useState<VendorPayablesPreviewRequest | null>(null);
  const [exporting, setExporting] = useState(false);
  const preview = usePayablesPreview(request);
  const data = preview.data;
  const currentRequest = (): VendorPayablesPreviewRequest => ({ vendorName: vendor, periodFrom: from, periodTo: to, siteId: siteId ? Number(siteId) : null, gstRates: gstOverrides });
  const dirty = !!request && JSON.stringify(currentRequest()) !== JSON.stringify(request);
  const ready = !!vendor && !!from && !!to && from <= to;
  const download = async (format: "xlsx" | "pdf") => {
    if (!request || dirty) return;
    setExporting(true);
    try {
      // Permission/site scope and duplicates are revalidated BEFORE any file is created.
      const fresh = await requestPayablesPreview(request);
      queryClient.setQueryData(["/api/vendor-bills/payables-preview", request], fresh);
      exportPayablesPreview(fresh, format);
    } catch (error) {
      toast({ title: "Preview export unavailable", description: error instanceof Error ? error.message : "Retry the preview.", variant: "destructive" });
    } finally { setExporting(false); }
  };
  return <Card className="border-amber-300 dark:border-amber-800" data-testid="payables-preview-panel">
    <CardHeader className="py-4">
      <Button variant="ghost" className="h-auto justify-between px-0 hover:bg-transparent" onClick={() => setOpen(v => !v)} aria-expanded={open}>
        <div className="text-left"><CardTitle className="text-base">Payables preview (not saved)</CardTitle><p className="mt-1 text-xs font-normal text-muted-foreground">Plan vendor payables without creating a bill or changing records.</p></div>
        <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
      </Button>
    </CardHeader>
    {open && <CardContent className="space-y-5">
      <form onSubmit={e => { e.preventDefault(); if (ready) setRequest(currentRequest()); }} className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <div><Label htmlFor="preview-vendor">Vendor</Label><select id="preview-vendor" className="mt-1 h-10 w-full rounded-md border bg-background px-2 text-sm" value={vendor} onChange={e => { setVendor(e.target.value); setGstOverrides({}); }}>
          <option value="">Select a vendor</option>{vendors.map(name => <option key={name} value={name}>{name}</option>)}</select></div>
        <div><Label htmlFor="preview-from">Period from</Label><Input id="preview-from" type="date" value={from} onChange={e => setFrom(e.target.value)} /></div>
        <div><Label htmlFor="preview-to">Period to</Label><Input id="preview-to" type="date" value={to} onChange={e => setTo(e.target.value)} /></div>
        <div><Label htmlFor="preview-site">Site (optional)</Label><select id="preview-site" className="mt-1 h-10 w-full rounded-md border bg-background px-2 text-sm" value={siteId} onChange={e => setSiteId(e.target.value)}>
          <option value="">All authorized sites</option>{sites.map(site => <option key={site.id} value={site.id}>{site.name}</option>)}</select></div>
        <Button type="submit" disabled={!ready || preview.isFetching || exporting} className="md:col-span-4 md:justify-self-start">Generate preview</Button>
      </form>
      {!request && <div className="rounded border border-dashed px-4 py-6 text-sm text-muted-foreground">Choose a vendor and period. Saved drafts and issued bills will be excluded from this forecast.</div>}
      {preview.isFetching && <div role="status" aria-label="Loading preview" className="space-y-3">{[1, 2, 3].map(n => <div key={n} className="h-12 animate-pulse rounded bg-muted" />)}</div>}
      {preview.isError && <div role="alert" className="rounded border border-destructive/30 p-4 text-sm"><p>{preview.error.message}</p><Button variant="outline" className="mt-2" onClick={() => preview.refetch()}>Retry preview</Button></div>}
      {data && !preview.isFetching && !preview.isError && <>
        <div className="rounded border bg-amber-50/60 p-4 dark:bg-amber-950/20">
          <p className="font-bold">{data.label}</p><p className="mt-1 text-xs text-muted-foreground">{data.vendorName} · {data.periodFrom} to {data.periodTo} · Generated {new Date(data.generatedAt).toLocaleString()}</p>
          <div className="mt-4"><Totals totals={data.grandTotal} primary /></div>
          <p className="mt-3 text-xs">{data.excludedCount} already-billed items / monthly segments excluded · {data.unpricedCount} unpriced items</p>
        </div>
        <div className="rounded border p-3"><p className="text-sm font-semibold">Indicative GST — unsaved inputs</p>
          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-4">{PAYABLES_CATEGORIES.map(category => {
            const value = Object.prototype.hasOwnProperty.call(gstOverrides, category) ? gstOverrides[category] : data.gstRates[category];
            const source = Object.prototype.hasOwnProperty.call(gstOverrides, category) ? (value === null ? "missing" : "entered") : data.gstSources[category];
            return <div key={category}><Label htmlFor={`preview-gst-${category}`}>{labels[category]} %</Label>
              <Input id={`preview-gst-${category}`} type="number" min="0" max="100" step="0.01" className={value == null ? "border-amber-400 bg-amber-50 dark:bg-amber-950/20" : ""} value={value ?? ""} placeholder="Unknown"
                onChange={e => setGstOverrides(prev => ({ ...prev, [category]: e.target.value === "" ? null : Number(e.target.value) }))} />
              <p className={`mt-1 text-xs ${value == null ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground"}`}>{source === "missing" ? "Unknown — GST incomplete if applicable" : source}</p>
            </div>;
          })}</div>
          {dirty && <p className="mt-3 text-xs text-amber-700 dark:text-amber-400">Inputs changed. Generate preview again to update figures and enable exports.</p>}
        </div>
        {data.warnings.map(warning => <p key={warning} className="text-xs text-amber-800 dark:text-amber-300">{warning}</p>)}
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" disabled={dirty || exporting} onClick={() => download("xlsx")}><Download className="mr-2 h-4 w-4" />Export Excel</Button>
          <Button variant="outline" disabled={dirty || exporting} onClick={() => download("pdf")}><FileText className="mr-2 h-4 w-4" />Export PDF</Button>
          {exporting && <span role="status" className="self-center text-xs text-muted-foreground">Revalidating report access and source data…</span>}
        </div>
        <section className="space-y-2"><h3 className="text-sm font-semibold">Authorized site subtotal · excludes unallocated charges</h3><Totals totals={data.siteTotal} /></section>
        {data.categories.map(category => <section key={category.category} className="overflow-hidden rounded border">
          <div className="flex flex-wrap items-center justify-between gap-3 bg-muted/30 px-3 py-3"><h3 className="text-sm font-bold">{labels[category.category]}</h3><Totals totals={category.totals} /></div>
          {category.items.filter(item => !item.unallocatedReason).length ? <Items items={category.items.filter(item => !item.unallocatedReason)} /> : <p className="p-3 text-xs text-muted-foreground">No unbilled site-allocated items for this type.</p>}
        </section>)}
        <section className="rounded border border-amber-300 p-3 dark:border-amber-800"><h3 className="text-sm font-bold">Not allocated to a site</h3>
          <p className="my-2 text-xs text-muted-foreground">Excluded from site subtotal. Included once in the authorized vendor grand total. No site proration is inferred.</p>
          <Totals totals={data.unallocatedTotal} />
          {data.categories.flatMap(c => c.items).some(item => item.unallocatedReason) ? <div className="mt-3"><Items items={data.categories.flatMap(c => c.items).filter(item => !!item.unallocatedReason)} /></div> : <p className="mt-3 text-xs text-muted-foreground">No authorized unallocated charges available.</p>}
        </section>
        {data.hireGroups.map(group => <section key={group.id}><h3 className="text-sm font-bold">{group.equipmentName} · {group.periodFrom} to {group.periodTo}</h3>
          <p className="mt-1 text-xs text-muted-foreground">Day-by-day hire activity / breakdown calendar · evidence, not additional charges</p>
          <HireActivityBreakdownCalendar days={group.result.workingSheet} consumptionNorm={group.consumptionNorm} meterType={group.meterType} tripApplicable={group.basis === "trip"} showFuel={group.dieselResponsibility !== "vendor"} formatDate={date => date} />
        </section>)}
      </>}
    </CardContent>}
  </Card>;
}