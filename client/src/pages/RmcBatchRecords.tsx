import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { ArrowLeft, Plus, Pencil, Trash2, Printer, FlaskConical, FileDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth-context";
import type { RmcBatchRecordWithDesign, RmcMixDesign } from "@shared/schema";

const today = new Date().toISOString().slice(0, 10);

function defaultForm(plantName: string) {
  return {
    date: today,
    plantName,
    mixDesignId: "",
    batchesCount: "",
    totalVolumeM3: "",
    truckNumber: "",
    dcNumber: "",
    customerName: "",
    deliverySite: "",
    remarks: "",
  };
}

function DCPrintView({ record, onClose }: { record: RmcBatchRecordWithDesign; onClose: () => void }) {
  const handlePrint = () => window.print();
  return (
    <div>
      <div className="flex gap-2 mb-4 print:hidden">
        <Button onClick={handlePrint}><Printer className="w-4 h-4 mr-2" />Print DC</Button>
        <Button variant="outline" onClick={onClose}>Close</Button>
      </div>
      <div className="border rounded-lg p-6 text-sm space-y-4 print:border-0">
        <div className="text-center border-b pb-3">
          <h2 className="text-lg font-bold">DELIVERY CHALLAN</h2>
          <p className="text-muted-foreground">Ready Mix Concrete Plant</p>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-muted-foreground text-sm">DC Number</p>
            <p className="font-semibold">{record.dcNumber || "—"}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-sm">Date</p>
            <p className="font-semibold">{record.date}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-sm">Customer / Client</p>
            <p className="font-semibold">{record.customerName || "—"}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-sm">Delivery Site</p>
            <p className="font-semibold">{record.deliverySite || "—"}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-sm">Truck Number</p>
            <p className="font-semibold">{record.truckNumber || "—"}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-sm">Plant</p>
            <p className="font-semibold">{record.plantName}</p>
          </div>
        </div>
        <table className="w-full border-collapse border text-sm mt-4">
          <thead>
            <tr className="bg-muted">
              <th className="border p-2 text-left">Grade</th>
              <th className="border p-2 text-right">Batches</th>
              <th className="border p-2 text-right">Volume (m³)</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="border p-2">{record.grade}</td>
              <td className="border p-2 text-right">{record.batchesCount ?? "—"}</td>
              <td className="border p-2 text-right font-semibold">{record.totalVolumeM3.toFixed(2)}</td>
            </tr>
          </tbody>
        </table>
        {record.remarks && (
          <div>
            <p className="text-muted-foreground text-sm">Remarks</p>
            <p>{record.remarks}</p>
          </div>
        )}
        <div className="grid grid-cols-3 gap-4 pt-8 border-t">
          <div className="text-center">
            <div className="border-t border-black w-full mt-8 pt-1 text-sm">Prepared By</div>
          </div>
          <div className="text-center">
            <div className="border-t border-black w-full mt-8 pt-1 text-sm">Checked By</div>
          </div>
          <div className="text-center">
            <div className="border-t border-black w-full mt-8 pt-1 text-sm">Customer Signature</div>
          </div>
        </div>
      </div>
    </div>
  );
}

const ALL_PLANTS = "__ALL__";

export default function RmcBatchRecords() {
  const { toast } = useToast();
  const { sectionCan, isAdmin } = useAuth();
  const canCreate = sectionCan("plant_production", "create");
  const canEdit = sectionCan("plant_production", "edit");

  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(defaultForm("Main Plant"));
  const [printRecord, setPrintRecord] = useState<RmcBatchRecordWithDesign | null>(null);
  const [dateFrom, setDateFrom] = useState(() => localStorage.getItem("rmc_batch_date_from") ?? today);
  const [dateTo, setDateTo] = useState(() => localStorage.getItem("rmc_batch_date_to") ?? today);
  const [plantSelect, setPlantSelect] = useState(() => localStorage.getItem("rmc_plant_filter") ?? ALL_PLANTS);
  const plantName = plantSelect === ALL_PLANTS ? "" : plantSelect;

  function handlePlantChange(value: string) {
    setPlantSelect(value);
    localStorage.setItem("rmc_plant_filter", value);
  }

  const { data: plantNames = [] } = useQuery<string[]>({
    queryKey: ["/api/rmc/plants"],
    queryFn: () => apiRequest("GET", "/api/rmc/plants").then(r => r.json()),
  });

  const plantParam = plantName ? `&plantName=${encodeURIComponent(plantName)}` : "";

  const { data: designs = [] } = useQuery<RmcMixDesign[]>({
    queryKey: ["/api/rmc/mix-designs"],
  });

  const { data: records = [], isLoading } = useQuery<RmcBatchRecordWithDesign[]>({
    queryKey: ["/api/rmc/batch-records", dateFrom, dateTo, plantName],
    queryFn: () =>
      apiRequest("GET", `/api/rmc/batch-records?dateFrom=${dateFrom}&dateTo=${dateTo}${plantParam}`)
        .then(r => r.json()),
  });

  const upsertMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = editingId
        ? await apiRequest("PATCH", `/api/rmc/batch-records/${editingId}`, payload)
        : await apiRequest("POST", "/api/rmc/batch-records", payload);
      if (!res.ok) { const e = await res.json(); throw new Error(e.message || "Failed"); }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/rmc/batch-records"] });
      toast({ title: editingId ? "Batch record updated" : "Batch record saved" });
      setOpen(false);
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("DELETE", `/api/rmc/batch-records/${id}`);
      if (!res.ok) { const e = await res.json(); throw new Error(e.message || "Failed"); }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/rmc/batch-records"] });
      toast({ title: "Record deleted" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  function openCreate() {
    setEditingId(null);
    setForm(defaultForm("Main Plant"));
    setOpen(true);
  }

  function openEdit(r: RmcBatchRecordWithDesign) {
    setEditingId(r.id);
    setForm({
      date: r.date,
      plantName: r.plantName,
      mixDesignId: r.mixDesignId.toString(),
      batchesCount: r.batchesCount?.toString() ?? "",
      totalVolumeM3: r.totalVolumeM3.toString(),
      truckNumber: r.truckNumber ?? "",
      dcNumber: r.dcNumber ?? "",
      customerName: r.customerName ?? "",
      deliverySite: r.deliverySite ?? "",
      remarks: r.remarks ?? "",
    });
    setOpen(true);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.mixDesignId) return toast({ title: "Select a mix grade", variant: "destructive" });
    upsertMutation.mutate({
      date: form.date,
      plantName: form.plantName,
      mixDesignId: Number(form.mixDesignId),
      batchesCount: form.batchesCount ? Number(form.batchesCount) : null,
      totalVolumeM3: Number(form.totalVolumeM3),
      truckNumber: form.truckNumber || null,
      dcNumber: form.dcNumber || null,
      customerName: form.customerName || null,
      deliverySite: form.deliverySite || null,
      remarks: form.remarks || null,
    });
  }

  const totalVol = records.reduce((s, r) => s + r.totalVolumeM3, 0);

  if (printRecord) {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <DCPrintView record={printRecord} onClose={() => setPrintRecord(null)} />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Link href="/plant/rmc">
            <Button variant="ghost" size="icon" data-testid="btn-back"><ArrowLeft className="w-5 h-5" /></Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold">RMC Batch Records</h1>
            <p className="text-sm text-muted-foreground">Log concrete batches & generate delivery challans</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); localStorage.setItem("rmc_batch_date_from", e.target.value); }} className="w-36" data-testid="input-date-from" />
          <span className="text-muted-foreground text-sm">to</span>
          <Input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); localStorage.setItem("rmc_batch_date_to", e.target.value); }} className="w-36" data-testid="input-date-to" />
          {plantNames.length > 0 && (
            <Select value={plantSelect} onValueChange={handlePlantChange}>
              <SelectTrigger className="w-40" data-testid="select-plant-name">
                <SelectValue placeholder="All plants" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_PLANTS}>All plants</SelectItem>
                {plantNames.map(name => (
                  <SelectItem key={name} value={name} data-testid={`option-plant-${name}`}>{name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {records.length > 0 && (
            <Button
              variant="outline"
              onClick={() => {
                const params = new URLSearchParams({ dateFrom, dateTo });
                if (plantName) params.set("plantName", plantName);
                window.location.href = `/api/rmc/batch-records/export?${params}`;
              }}
              data-testid="btn-export-excel"
            >
              <FileDown className="w-4 h-4 mr-2" />Export Excel
            </Button>
          )}
          {canCreate && (
            <Button onClick={openCreate} data-testid="btn-add-batch">
              <Plus className="w-4 h-4 mr-2" />Add Batch
            </Button>
          )}
        </div>
      </div>

      {records.length > 0 && (
        <Card className="bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800">
          <CardContent className="p-4 flex gap-6">
            <div>
              <p className="text-sm text-muted-foreground">Total Volume</p>
              <p className="text-xl font-bold text-blue-700 dark:text-blue-300">{totalVol.toFixed(2)} m³</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Dispatches</p>
              <p className="text-xl font-bold">{records.length}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Loading…</div>
      ) : records.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 gap-3">
            <FlaskConical className="w-10 h-10 text-muted-foreground" />
            <p className="text-muted-foreground">No batch records for this period.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {records.map(r => (
            <Card key={r.id} data-testid={`card-batch-${r.id}`}>
              <CardContent className="p-4 flex flex-wrap items-center gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge className="text-sm font-bold">{r.grade}</Badge>
                    <span className="font-semibold text-blue-600 dark:text-blue-400">{r.totalVolumeM3.toFixed(2)} m³</span>
                    {r.batchesCount && <span className="text-sm text-muted-foreground">{r.batchesCount} batches</span>}
                    {r.dcNumber && <span className="text-sm bg-muted px-2 py-0.5 rounded">DC: {r.dcNumber}</span>}
                  </div>
                  <div className="text-sm text-muted-foreground mt-1 flex flex-wrap gap-3">
                    <span>{r.date}</span>
                    {r.customerName && <span>{r.customerName}</span>}
                    {r.deliverySite && <span>→ {r.deliverySite}</span>}
                    {r.truckNumber && <span>🚚 {r.truckNumber}</span>}
                  </div>
                  {r.remarks && <p className="text-sm text-muted-foreground mt-1">{r.remarks}</p>}
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setPrintRecord(r)} data-testid={`btn-print-dc-${r.id}`}>
                    <Printer className="w-4 h-4" />
                  </Button>
                  {canEdit && (
                    <Button variant="outline" size="sm" onClick={() => openEdit(r)} data-testid={`btn-edit-batch-${r.id}`}>
                      <Pencil className="w-4 h-4" />
                    </Button>
                  )}
                  {isAdmin && (
                    <Button
                      variant="outline" size="sm"
                      className="text-destructive hover:bg-destructive/10"
                      onClick={() => { if (confirm("Delete this batch record?")) deleteMutation.mutate(r.id); }}
                      data-testid={`btn-delete-batch-${r.id}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Batch Record" : "New Batch Record"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Date *</Label>
                <Input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} data-testid="input-date" required />
              </div>
              <div className="space-y-1">
                <Label>Mix Grade *</Label>
                <Select value={form.mixDesignId} onValueChange={v => setForm(f => ({ ...f, mixDesignId: v }))}>
                  <SelectTrigger data-testid="select-mix-design">
                    <SelectValue placeholder="Select grade" />
                  </SelectTrigger>
                  <SelectContent>
                    {designs.map(d => <SelectItem key={d.id} value={d.id.toString()}>{d.grade}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Total Volume (m³) *</Label>
                <Input type="number" step="0.01" value={form.totalVolumeM3} onChange={e => setForm(f => ({ ...f, totalVolumeM3: e.target.value }))} required data-testid="input-volume" />
              </div>
              <div className="space-y-1">
                <Label>No. of Batches</Label>
                <Input type="number" value={form.batchesCount} onChange={e => setForm(f => ({ ...f, batchesCount: e.target.value }))} data-testid="input-batches" />
              </div>
              <div className="space-y-1">
                <Label>DC Number</Label>
                <Input value={form.dcNumber} onChange={e => setForm(f => ({ ...f, dcNumber: e.target.value }))} data-testid="input-dc-number" />
              </div>
              <div className="space-y-1">
                <Label>Truck Number</Label>
                <Input value={form.truckNumber} onChange={e => setForm(f => ({ ...f, truckNumber: e.target.value }))} data-testid="input-truck-number" />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Customer / Client</Label>
              <Input value={form.customerName} onChange={e => setForm(f => ({ ...f, customerName: e.target.value }))} data-testid="input-customer" />
            </div>
            <div className="space-y-1">
              <Label>Delivery Site</Label>
              <Input value={form.deliverySite} onChange={e => setForm(f => ({ ...f, deliverySite: e.target.value }))} data-testid="input-delivery-site" />
            </div>
            <div className="space-y-1">
              <Label>Remarks</Label>
              <Textarea value={form.remarks} onChange={e => setForm(f => ({ ...f, remarks: e.target.value }))} rows={2} data-testid="textarea-remarks" />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={upsertMutation.isPending} data-testid="btn-save-batch">
                {upsertMutation.isPending ? "Saving…" : "Save"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
