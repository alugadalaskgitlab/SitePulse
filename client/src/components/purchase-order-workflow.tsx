import { useState } from "react";
import { formatPiTimestamp } from "@shared/piTimeline";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

type Fields = {
  orderNo: string;
  vendorId: number | null;
  vendorName: string;
  description: string;
  spec: string;
  quantity: number;
  unit: string;
  rate: number | null;
  expectedDelivery: string;
  paymentTerms: string;
  destination: string;
};
type Order = Fields & {
  id: number;
  status: "draft" | "submitted" | "approved" | "rejected";
  raisedByName: string | null;
  approvedByName: string | null;
  raisedAt: string;
  submittedAt: string | null;
  approvedAt: string | null;
  rejectionReason: string | null;
  linkedVendorName?: string | null;
};

export function PurchaseOrderWorkflow({ indentId, itemId, canRaise, allowNew, canApprove, onPreview }: {
  indentId: number; itemId: number; canRaise: boolean; allowNew: boolean; canApprove: boolean; onPreview: () => void;
}) {
  const { toast } = useToast();
  const cache = useQueryClient();
  const url = `/api/purchase-indents/${indentId}/items/${itemId}/purchase-order`;
  const { data, isLoading } = useQuery<{
    order: Order | null;
    defaults: Fields;
    vendorContext: { vendorId: number | null; linkedVendorName: string | null; aliases: string[] };
  }>({
    queryKey: [url],
    queryFn: async () => {
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error((await res.json()).message || "Could not load Purchase Order");
      return res.json();
    },
  });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Fields | null>(null);
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState("");
  const order = data?.order;
  const editable = canRaise && ((allowNew && !order) || order?.status === "draft");
  const show = () => {
    if (!data) return;
    setForm(order ? Object.fromEntries((Object.keys(data.defaults) as (keyof Fields)[]).map(key => [key, order[key]])) as Fields : data.defaults);
    setOpen(true);
  };
  const action = async (path: string, method: "POST" | "PATCH", body: object) => {
    setBusy(true);
    try {
      const res = await fetch(url + path, {
        method, credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json()).message || `PO request failed (${res.status})`);
      await cache.invalidateQueries({ queryKey: [url] });
      await cache.invalidateQueries({ queryKey: ["/api/purchase-orders/pending"] });
      if (!path) setOpen(false);
      toast({ title: path === "/decision" ? "Purchase Order reviewed" : path === "/submit" ? "Sent for approval" : "PO draft saved" });
    } catch (err) {
      toast({ title: "Purchase Order not saved", description: (err as Error).message, variant: "destructive" });
    } finally { setBusy(false); }
  };
  const normaliseVendor = (value: string) => value.trim().replace(/\s+/g, " ").toUpperCase();
  const vendorNameMatchesLinkedMaster = (value: string) => {
    const name = normaliseVendor(value);
    return !!name && [data?.vendorContext.linkedVendorName, ...(data?.vendorContext.aliases || [])]
      .filter((candidate): candidate is string => !!candidate)
      .some(candidate => normaliseVendor(candidate) === name);
  };
  const vendorNameWasEdited = !!order && form?.vendorName !== order.vendorName;
  const vendorSnapshotInvalid = !!form?.vendorName.trim() && (
    order
      ? !!order.vendorId && vendorNameWasEdited && !vendorNameMatchesLinkedMaster(form.vendorName)
      : !!data?.vendorContext.vendorId && !vendorNameMatchesLinkedMaster(form.vendorName)
  );
  const input = (label: string, key: keyof Fields, type = "text") => (
    <div className="space-y-1">
      <Label>{label}</Label>
      <Input type={type} value={form?.[key] ?? ""} disabled={!editable || busy}
        onChange={e => setForm(prev => prev ? {
          ...prev,
          [key]: type === "number" ? (e.target.value === "" ? null : Number(e.target.value)) : e.target.value,
          ...(key === "vendorName" ? {
            vendorId: !order && vendorNameMatchesLinkedMaster(e.target.value)
              ? data?.vendorContext.vendorId ?? null
              : order && prev.vendorId != null && vendorNameMatchesLinkedMaster(e.target.value)
                ? prev.vendorId
                : null,
          } : {}),
        } : prev)} data-testid={`po-field-${key}`} />
    </div>
  );
  return (
    <>
      <Button variant="outline" size="sm" onClick={show} disabled={isLoading || !data || (!order && (!canRaise || !allowNew))} data-testid={`button-po-open-${itemId}`}>
        {order ? `PO · ${order.status.toUpperCase()}` : "Raise PO"}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="dialog-po-workflow">
          <DialogHeader><DialogTitle>Purchase Order {order ? `#${order.id} · ${order.status.toUpperCase()}` : "· New Draft"}</DialogTitle></DialogHeader>
          {form && <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Optional PO snapshot — recording an order against the indent does not require a PO.</p>
            {data?.vendorContext.linkedVendorName && (
              <div className="rounded border bg-muted/40 p-3 text-sm space-y-1" data-testid="po-vendor-master-context">
                <p className="font-medium">{order && !order.vendorId ? "Indent Vendor Master:" : "Vendor Master:"} {order?.linkedVendorName || data.vendorContext.linkedVendorName}</p>
                {order && !order.vendorId && <p className="text-muted-foreground">This saved PO has no Vendor Master link; it will remain unchanged.</p>}
                {!order && <p className="text-muted-foreground">New PO entries use the Vendor Master link reviewed on this indent item.</p>}
              </div>
            )}
            {data?.vendorContext.vendorId != null && !order && (
              <div className="space-y-1">
                <Label>Vendor Master selection</Label>
                <Select value={String(form.vendorId ?? "")} onValueChange={value => {
                  if (Number(value) === data.vendorContext.vendorId) setForm(prev => prev ? {
                    ...prev, vendorId: data.vendorContext.vendorId,
                    vendorName: prev.vendorName || data.vendorContext.linkedVendorName || "",
                  } : prev);
                }} disabled={!editable || busy}>
                  <SelectTrigger data-testid="po-vendor-master-select"><SelectValue placeholder="Select the reviewed Vendor Master link" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={String(data.vendorContext.vendorId)}>{data.vendorContext.linkedVendorName}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              {input("PO / Order No.", "orderNo")}
              {input(data?.vendorContext.vendorId ? "Recorded vendor name (snapshot)" : "Vendor", "vendorName")}
            </div>
            {vendorSnapshotInvalid && <div role="status" className="rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
              This name is not a known Vendor Master name or alias. Add an alias through <a className="underline" href="/plant/vendor-bills" target="_blank" rel="noreferrer">Vendor Bills</a> or review it in <a className="underline" href="/masters/vendors" target="_blank" rel="noreferrer">Vendor Master</a>.
            </div>}
            {input("Description", "description")}
            {input("Specification", "spec")}
            <div className="grid grid-cols-3 gap-3">
              {input("Quantity", "quantity", "number")}
              {input("Unit", "unit")}
              {input("Rate per unit", "rate", "number")}
            </div>
            <div className="grid grid-cols-2 gap-3">
              {input("Expected delivery / duration", "expectedDelivery")}
              {input("Payment terms", "paymentTerms")}
            </div>
            {input("Delivery destination", "destination")}
            {order && <div className="rounded border bg-muted/40 p-3 text-sm space-y-1">
              <p>Raised by: {order.raisedByName || "User record unavailable"} · {formatPiTimestamp(order.raisedAt)}</p>
              {order.submittedAt && <p>Submitted: {formatPiTimestamp(order.submittedAt)}</p>}
              {order.approvedAt && <p>Approved by: {order.approvedByName || "User record unavailable"} · {formatPiTimestamp(order.approvedAt)}</p>}
              {order.rejectionReason && <p>Rejection reason: {order.rejectionReason}</p>}
            </div>}
            <div className="flex flex-wrap gap-2">
              {editable && <Button disabled={busy || (!order && !!data?.vendorContext.vendorId && (!form.vendorName.trim() || (form.vendorId != null && (form.vendorId !== data.vendorContext.vendorId || vendorSnapshotInvalid)))) || (!!order?.vendorId && vendorSnapshotInvalid)} onClick={() => action("", order ? "PATCH" : "POST", {
                ...form, quantity: Number(form.quantity), rate: form.rate === null ? null : Number(form.rate),
              })} data-testid="button-po-save">Save Draft</Button>}
              {order?.status === "draft" && canRaise && <Button disabled={busy} variant="outline" onClick={() => action("/submit", "POST", {})} data-testid="button-po-submit">Submit for Approval</Button>}
              {order?.status === "submitted" && canApprove && <>
                <Button disabled={busy} onClick={() => action("/decision", "POST", { action: "approve" })} data-testid="button-po-approve">Approve PO</Button>
                <Input value={reason} onChange={e => setReason(e.target.value)} placeholder="Reason for rejection" className="max-w-52" data-testid="po-rejection-reason" />
                <Button disabled={busy || !reason.trim()} variant="destructive" onClick={() => action("/decision", "POST", { action: "reject", reason })} data-testid="button-po-reject">Reject</Button>
              </>}
              {order?.status === "approved" && <>
                <Button variant="outline" onClick={onPreview} data-testid={`button-po-preview-${itemId}`}>Preview approved PDF</Button>
                <a href={`${url}.pdf`} className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground" data-testid="button-po-download">Download PO (PDF)</a>
              </>}
            </div>
          </div>}
        </DialogContent>
      </Dialog>
    </>
  );
}