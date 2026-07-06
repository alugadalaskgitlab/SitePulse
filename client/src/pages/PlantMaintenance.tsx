import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
import { useOrigin } from "@/hooks/use-origin";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { AttachmentUploader } from "@/components/AttachmentUploader";
import { AttachmentGallery } from "@/components/AttachmentGallery";
import { useUpload } from "@/hooks/use-upload";
import type { EquipmentMasterType, StoreItem, StoreStockBalance } from "@shared/schema";
import { ChevronLeft, Plus, Wrench, AlertTriangle, CheckCircle2, Clock, Package, Trash2, ChevronDown, ChevronUp, Activity, X, Pencil, Camera, ImagePlus } from "lucide-react";
import { format } from "date-fns";

type Part = { storeItemId: number; qty: number; uom: string };

type MaintenanceLog = {
  id: number;
  date: string;
  equipmentId: number;
  equipmentName: string;
  eventType: string;
  description: string;
  downtimeHours: number | null;
  status: string;
  nextServiceDue: string | null;
  servicedBy: string | null;
  remarks: string | null;
  reportedBy: string | null;
  resolvedAt: string | null;
  autoIssueId: number | null;
  autoIssueNumber: string | null;
  parts: { id: number; storeItemId: number; itemName: string; category: string; qty: number; uom: string }[];
};

type HealthSummary = {
  equipmentId: number;
  equipmentName: string;
  registrationNumber: string | null;
  lastServiceDate: string | null;
  nextServiceDue: string | null;
  openBreakdowns: number;
  downtimeHoursThisMonth: number;
  totalMaintenanceEvents: number;
};

const EVENT_TYPE_LABELS: Record<string, string> = {
  breakdown: "Breakdown",
  service: "Scheduled Service",
  pm: "Preventive Maintenance",
};

function eventTypeBadge(type: string) {
  const cls =
    type === "breakdown" ? "bg-red-100 text-red-700 border-red-300 dark:bg-red-900/30 dark:text-red-400" :
    type === "service" ? "bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-900/30 dark:text-blue-400" :
    "bg-green-100 text-green-700 border-green-300 dark:bg-green-900/30 dark:text-green-400";
  return <span className={`text-sm px-2 py-0.5 rounded-full border font-medium ${cls}`}>{EVENT_TYPE_LABELS[type] ?? type}</span>;
}

function statusBadge(status: string) {
  if (status === "open") return <Badge variant="destructive" className="text-sm">Open</Badge>;
  return <Badge variant="outline" className="text-sm text-green-700 border-green-500">Resolved</Badge>;
}

const TODAY = format(new Date(), "yyyy-MM-dd");

function PartSelector({
  storeItems,
  stockMap,
  partItemId,
  setPartItemId,
  partQty,
  setPartQty,
  partUom,
  setPartUom,
  onAdd,
  addLabel = "Add",
}: {
  storeItems: StoreItem[];
  stockMap: Record<number, number>;
  partItemId: string;
  setPartItemId: (v: string) => void;
  partQty: string;
  setPartQty: (v: string) => void;
  partUom: string;
  setPartUom: (v: string) => void;
  onAdd: () => void;
  addLabel?: string;
}) {
  const selectedItem = storeItems.find(s => s.id === Number(partItemId));
  const available = partItemId ? (stockMap[Number(partItemId)] ?? 0) : null;
  const exceeds = available !== null && Number(partQty) > available;

  return (
    <div className="space-y-1">
      <div className="flex gap-2 items-end">
        <div className="flex-1 space-y-1">
          <Label className="text-sm">Item</Label>
          <Select value={partItemId} onValueChange={v => { setPartItemId(v); const it = storeItems.find(s => s.id === Number(v)); if (it) setPartUom(it.uom); }}>
            <SelectTrigger data-testid="select-part-item"><SelectValue placeholder="Select item..." /></SelectTrigger>
            <SelectContent>
              {storeItems.map(s => {
                const bal = stockMap[s.id] ?? 0;
                return (
                  <SelectItem key={s.id} value={String(s.id)}>
                    <span>{s.name}</span>
                    <span className={`ml-2 text-sm ${bal <= 0 ? "text-red-500" : "text-muted-foreground"}`}>({bal} {s.uom} avail.)</span>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
          {available !== null && (
            <p className={`text-sm ${available <= 0 ? "text-red-600" : "text-muted-foreground"}`}>
              Stock available: {available} {selectedItem?.uom ?? ""}
            </p>
          )}
        </div>
        <div className="w-20 space-y-1">
          <Label className="text-sm">Qty</Label>
          <Input className={`h-9 ${exceeds ? "border-red-400" : ""}`} type="number" min="0.01" step="0.01" value={partQty} onChange={e => setPartQty(e.target.value)} placeholder="0" data-testid="input-part-qty" />
        </div>
        <div className="w-20 space-y-1">
          <Label className="text-sm">UOM</Label>
          <Input className="h-9" value={partUom || selectedItem?.uom || ""} onChange={e => setPartUom(e.target.value)} placeholder="Nos" data-testid="input-part-uom" />
        </div>
        <Button type="button" variant="outline" size="sm" className="h-9" onClick={onAdd} disabled={!partItemId || !partQty || exceeds} data-testid="button-add-part">{addLabel}</Button>
      </div>
      {exceeds && (
        <p className="text-sm text-red-600 flex items-center gap-1">
          <AlertTriangle className="w-3 h-3" /> Requested qty ({partQty}) exceeds available stock ({available}).
        </p>
      )}
    </div>
  );
}

function LogForm({
  equipment,
  storeItems,
  stockMap,
  onClose,
  onSaved,
  initial,
}: {
  equipment: EquipmentMasterType[];
  storeItems: StoreItem[];
  stockMap: Record<number, number>;
  onClose: () => void;
  onSaved: () => void;
  initial?: { eventType?: string };
}) {
  const { toast } = useToast();
  const { user } = useAuth();

  const [date, setDate] = useState(TODAY);
  const [equipmentId, setEquipmentId] = useState("");
  const [eventType, setEventType] = useState(initial?.eventType ?? "breakdown");
  const [description, setDescription] = useState("");
  const [downtimeHours, setDowntimeHours] = useState("");
  const [status, setStatus] = useState("open");
  const [nextServiceDue, setNextServiceDue] = useState("");
  const [servicedBy, setServicedBy] = useState("");
  const [remarks, setRemarks] = useState("");
  const [reportedBy, setReportedBy] = useState(user?.fullName ?? "");
  const [resolvedAt, setResolvedAt] = useState("");
  const [parts, setParts] = useState<Part[]>([]);
  const [partItemId, setPartItemId] = useState("");
  const [partQty, setPartQty] = useState("");
  const [partUom, setPartUom] = useState("");
  // Photos are staged locally while creating a new log (no DB id yet to link
  // an attachment to), then uploaded in one batch once the log is saved.
  const [stagedPhotos, setStagedPhotos] = useState<File[]>([]);
  const { uploadFile } = useUpload();

  const addStagedPhotos = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const MAX_FILE_SIZE = 15 * 1024 * 1024;
    const valid = Array.from(files).filter((f) => {
      if (f.size > MAX_FILE_SIZE) {
        toast({ title: "File too large", description: `${f.name} exceeds 15MB.`, variant: "destructive" });
        return false;
      }
      if (!f.type.startsWith("image/") && f.type !== "application/pdf") {
        toast({ title: "Unsupported file", description: `${f.name} must be an image or PDF.`, variant: "destructive" });
        return false;
      }
      return true;
    });
    setStagedPhotos((prev) => [...prev, ...valid]);
  };
  const removeStagedPhoto = (idx: number) => setStagedPhotos((prev) => prev.filter((_, i) => i !== idx));
  const uploadStagedPhotos = async (logId: number, logEventType: string) => {
    for (const file of stagedPhotos) {
      const uploadResponse = await uploadFile(file);
      if (!uploadResponse) continue;
      try {
        await apiRequest("POST", "/api/attachments", {
          moduleType: logEventType === "breakdown" ? "equipment_breakdown" : "equipment_maintenance",
          linkedRecordId: logId,
          equipmentId: equipmentId ? Number(equipmentId) : null,
          fileName: file.name,
          objectPath: uploadResponse.objectPath,
          mimeType: file.type || "application/octet-stream",
          fileSize: file.size,
        });
      } catch {
        toast({ title: "Some photos failed to attach", description: file.name, variant: "destructive" });
      }
    }
  };

  const createMutation = useMutation({
    mutationFn: async (body: any) => {
      const res = await apiRequest("POST", "/api/maintenance/logs", body);
      return res.json();
    },
    onSuccess: async (log: any) => {
      if (stagedPhotos.length > 0 && log?.id) {
        await uploadStagedPhotos(log.id, eventType);
        queryClient.invalidateQueries({ queryKey: ["/api/attachments", eventType === "breakdown" ? "equipment_breakdown" : "equipment_maintenance", log.id] });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/maintenance/logs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/maintenance/health-summary"] });
      queryClient.invalidateQueries({ queryKey: ["/api/maintenance/open-count"] });
      toast({ title: "Maintenance log created" });
      onSaved();
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  function addPart() {
    if (!partItemId || !partQty) return;
    const item = storeItems.find(s => s.id === Number(partItemId));
    setParts(prev => [...prev, { storeItemId: Number(partItemId), qty: Number(partQty), uom: partUom || item?.uom || "" }]);
    setPartItemId(""); setPartQty(""); setPartUom("");
  }

  function removePart(idx: number) {
    setParts(prev => prev.filter((_, i) => i !== idx));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!equipmentId || !description) {
      toast({ title: "Equipment and description are required", variant: "destructive" });
      return;
    }
    createMutation.mutate({
      date,
      equipmentId: Number(equipmentId),
      eventType,
      description,
      downtimeHours: downtimeHours ? Number(downtimeHours) : null,
      status,
      nextServiceDue: nextServiceDue || null,
      servicedBy: servicedBy || null,
      remarks: remarks || null,
      reportedBy: reportedBy || null,
      resolvedAt: resolvedAt || null,
      parts,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-h-[75vh] overflow-y-auto pr-1">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>Date *</Label>
          <Input type="date" value={date} onChange={e => setDate(e.target.value)} data-testid="input-maint-date" />
        </div>
        <div className="space-y-1">
          <Label>Event Type *</Label>
          <Select value={eventType} onValueChange={setEventType}>
            <SelectTrigger data-testid="select-maint-event-type"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="breakdown">Breakdown</SelectItem>
              <SelectItem value="service">Scheduled Service</SelectItem>
              <SelectItem value="pm">Preventive Maintenance</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-1">
        <Label>Equipment *</Label>
        <Select value={equipmentId} onValueChange={setEquipmentId}>
          <SelectTrigger data-testid="select-maint-equipment"><SelectValue placeholder="Select equipment..." /></SelectTrigger>
          <SelectContent>
            {equipment.map(e => (
              <SelectItem key={e.id} value={String(e.id)}>{e.name}{e.registrationNumber ? ` (${e.registrationNumber})` : ""}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <Label>Description *</Label>
        <Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Describe the issue or work done..." data-testid="textarea-maint-description" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>Status</Label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger data-testid="select-maint-status"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="resolved">Resolved</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {eventType === "breakdown" && (
          <div className="space-y-1">
            <Label>Downtime Hours</Label>
            <Input type="number" min="0" step="0.5" value={downtimeHours} onChange={e => setDowntimeHours(e.target.value)} placeholder="e.g. 4" data-testid="input-maint-downtime" />
          </div>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>Serviced By</Label>
          <Input value={servicedBy} onChange={e => setServicedBy(e.target.value)} placeholder="Technician name" data-testid="input-maint-serviced-by" />
        </div>
        <div className="space-y-1">
          <Label>Reported By</Label>
          <Input value={reportedBy} onChange={e => setReportedBy(e.target.value)} placeholder="Your name" data-testid="input-maint-reported-by" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>Next Service Due</Label>
          <Input type="date" value={nextServiceDue} onChange={e => setNextServiceDue(e.target.value)} data-testid="input-maint-next-service" />
        </div>
        {status === "resolved" && (
          <div className="space-y-1">
            <Label>Resolved At</Label>
            <Input type="date" value={resolvedAt} onChange={e => setResolvedAt(e.target.value)} data-testid="input-maint-resolved-at" />
          </div>
        )}
      </div>
      <div className="space-y-1">
        <Label>Remarks</Label>
        <Textarea value={remarks} onChange={e => setRemarks(e.target.value)} placeholder="Additional notes..." data-testid="textarea-maint-remarks" />
      </div>
      <div className="space-y-1.5">
        <Label>Attachments <span className="text-muted-foreground text-sm">(photos of the issue / work done)</span></Label>
        <input
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          id="maint-photo-camera"
          data-testid="input-maint-photo-camera"
          onChange={(e) => { addStagedPhotos(e.target.files); e.target.value = ""; }}
        />
        <input
          type="file"
          accept="image/*,application/pdf"
          multiple
          className="hidden"
          id="maint-photo-gallery"
          data-testid="input-maint-photo-gallery"
          onChange={(e) => { addStagedPhotos(e.target.files); e.target.value = ""; }}
        />
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => document.getElementById("maint-photo-camera")?.click()} data-testid="button-maint-photo-camera">
            <Camera className="w-4 h-4" /> Camera
          </Button>
          <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => document.getElementById("maint-photo-gallery")?.click()} data-testid="button-maint-photo-gallery">
            <ImagePlus className="w-4 h-4" /> Gallery
          </Button>
        </div>
        {stagedPhotos.length > 0 && (
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
            {stagedPhotos.map((file, idx) => (
              <div key={idx} className="relative border rounded-md overflow-hidden bg-muted aspect-square" data-testid={`card-staged-maint-photo-${idx}`}>
                {file.type.startsWith("image/") ? (
                  <img src={URL.createObjectURL(file)} alt={file.name} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex items-center justify-center h-full w-full text-xs text-center p-1 truncate">{file.name}</div>
                )}
                <button
                  type="button"
                  className="absolute top-1 right-1 bg-background/90 rounded-full p-1"
                  onClick={() => removeStagedPhoto(idx)}
                  data-testid={`button-remove-staged-maint-photo-${idx}`}
                >
                  <X className="h-3.5 w-3.5 text-destructive" />
                </button>
              </div>
            ))}
          </div>
        )}
        <p className="text-xs text-muted-foreground">Photos are uploaded once you save the log.</p>
      </div>
      {storeItems.length > 0 && (
        <div className="space-y-2 border rounded-lg p-3 bg-muted/30">
          <h4 className="font-medium text-sm flex items-center gap-2"><Package className="w-4 h-4" /> Parts Used (auto-deducted from Stores)</h4>
          {parts.map((p, idx) => {
            const item = storeItems.find(s => s.id === p.storeItemId);
            return (
              <div key={idx} className="flex items-center gap-2 text-sm bg-background rounded p-2">
                <span className="flex-1">{item?.name ?? `Item #${p.storeItemId}`}</span>
                <span className="text-muted-foreground">{p.qty} {p.uom}</span>
                <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={() => removePart(idx)} data-testid={`button-remove-part-${idx}`}><X className="w-3 h-3" /></Button>
              </div>
            );
          })}
          <PartSelector
            storeItems={storeItems}
            stockMap={stockMap}
            partItemId={partItemId}
            setPartItemId={setPartItemId}
            partQty={partQty}
            setPartQty={setPartQty}
            partUom={partUom}
            setPartUom={setPartUom}
            onAdd={addPart}
          />
        </div>
      )}
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
        <Button type="submit" disabled={createMutation.isPending} data-testid="button-submit-maint-log">
          {createMutation.isPending ? "Saving..." : "Save Log"}
        </Button>
      </div>
    </form>
  );
}

function EditLogForm({
  log,
  onClose,
  onSaved,
}: {
  log: MaintenanceLog;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [date, setDate] = useState(log.date);
  const [eventType, setEventType] = useState(log.eventType);
  const [description, setDescription] = useState(log.description);
  const [downtimeHours, setDowntimeHours] = useState(String(log.downtimeHours ?? ""));
  const [status, setStatus] = useState(log.status);
  const [nextServiceDue, setNextServiceDue] = useState(log.nextServiceDue ?? "");
  const [servicedBy, setServicedBy] = useState(log.servicedBy ?? "");
  const [remarks, setRemarks] = useState(log.remarks ?? "");
  const [reportedBy, setReportedBy] = useState(log.reportedBy ?? "");
  const [resolvedAt, setResolvedAt] = useState(log.resolvedAt ?? "");

  const editMutation = useMutation({
    mutationFn: async (body: any) => {
      const res = await apiRequest("PATCH", `/api/maintenance/logs/${log.id}`, body);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/maintenance/logs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/maintenance/health-summary"] });
      queryClient.invalidateQueries({ queryKey: ["/api/maintenance/open-count"] });
      toast({ title: "Log updated" });
      onSaved();
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!description) {
      toast({ title: "Description is required", variant: "destructive" });
      return;
    }
    editMutation.mutate({
      date,
      eventType,
      description,
      downtimeHours: downtimeHours ? Number(downtimeHours) : null,
      status,
      nextServiceDue: nextServiceDue || null,
      servicedBy: servicedBy || null,
      remarks: remarks || null,
      reportedBy: reportedBy || null,
      resolvedAt: resolvedAt || null,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-h-[75vh] overflow-y-auto pr-1">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>Date</Label>
          <Input type="date" value={date} onChange={e => setDate(e.target.value)} data-testid="input-edit-date" />
        </div>
        <div className="space-y-1">
          <Label>Event Type</Label>
          <Select value={eventType} onValueChange={setEventType}>
            <SelectTrigger data-testid="select-edit-event-type"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="breakdown">Breakdown</SelectItem>
              <SelectItem value="service">Scheduled Service</SelectItem>
              <SelectItem value="pm">Preventive Maintenance</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-1 text-sm text-muted-foreground bg-muted/30 rounded p-2">
        Equipment: <strong className="text-foreground">{log.equipmentName}</strong> (cannot be changed after creation)
      </div>
      <div className="space-y-1">
        <Label>Description *</Label>
        <Textarea value={description} onChange={e => setDescription(e.target.value)} data-testid="textarea-edit-description" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>Status</Label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger data-testid="select-edit-status"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="resolved">Resolved</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {eventType === "breakdown" && (
          <div className="space-y-1">
            <Label>Downtime Hours</Label>
            <Input type="number" min="0" step="0.5" value={downtimeHours} onChange={e => setDowntimeHours(e.target.value)} data-testid="input-edit-downtime" />
          </div>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>Serviced By</Label>
          <Input value={servicedBy} onChange={e => setServicedBy(e.target.value)} data-testid="input-edit-serviced-by" />
        </div>
        <div className="space-y-1">
          <Label>Reported By</Label>
          <Input value={reportedBy} onChange={e => setReportedBy(e.target.value)} data-testid="input-edit-reported-by" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>Next Service Due</Label>
          <Input type="date" value={nextServiceDue} onChange={e => setNextServiceDue(e.target.value)} data-testid="input-edit-next-service" />
        </div>
        {status === "resolved" && (
          <div className="space-y-1">
            <Label>Resolved At</Label>
            <Input type="date" value={resolvedAt} onChange={e => setResolvedAt(e.target.value)} data-testid="input-edit-resolved-at" />
          </div>
        )}
      </div>
      <div className="space-y-1">
        <Label>Remarks</Label>
        <Textarea value={remarks} onChange={e => setRemarks(e.target.value)} data-testid="textarea-edit-remarks" />
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
        <Button type="submit" disabled={editMutation.isPending} data-testid="button-submit-edit-log">
          {editMutation.isPending ? "Saving..." : "Update Log"}
        </Button>
      </div>
    </form>
  );
}

function LogCard({
  log,
  canEdit,
  canDelete,
  storeItems,
  stockMap,
  onRefresh,
}: {
  log: MaintenanceLog;
  canEdit: boolean;
  canDelete: boolean;
  storeItems: StoreItem[];
  stockMap: Record<number, number>;
  onRefresh: () => void;
}) {
  const { toast } = useToast();
  const [expanded, setExpanded] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [addPartOpen, setAddPartOpen] = useState(false);
  const [partItemId, setPartItemId] = useState("");
  const [partQty, setPartQty] = useState("");
  const [partUom, setPartUom] = useState("");

  const deleteMutation = useMutation({
    mutationFn: async () => { await apiRequest("DELETE", `/api/maintenance/logs/${log.id}`); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/maintenance/logs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/maintenance/health-summary"] });
      queryClient.invalidateQueries({ queryKey: ["/api/maintenance/open-count"] });
      toast({ title: "Log deleted" });
      onRefresh();
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const resolveToggleMutation = useMutation({
    mutationFn: async () => {
      const newStatus = log.status === "open" ? "resolved" : "open";
      const res = await apiRequest("PATCH", `/api/maintenance/logs/${log.id}`, {
        status: newStatus,
        resolvedAt: newStatus === "resolved" ? TODAY : null,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/maintenance/logs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/maintenance/health-summary"] });
      queryClient.invalidateQueries({ queryKey: ["/api/maintenance/open-count"] });
      toast({ title: log.status === "open" ? "Marked as resolved" : "Re-opened" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const addPartMutation = useMutation({
    mutationFn: async () => {
      const selectedItem = storeItems.find(s => s.id === Number(partItemId));
      const res = await apiRequest("POST", `/api/maintenance/logs/${log.id}/parts`, {
        parts: [{ storeItemId: Number(partItemId), qty: Number(partQty), uom: partUom || selectedItem?.uom || "" }],
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/maintenance/logs"] });
      toast({ title: "Part added and issued from stores" });
      setAddPartOpen(false);
      setPartItemId(""); setPartQty(""); setPartUom("");
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const removePartMutation = useMutation({
    mutationFn: async (partId: number) => { await apiRequest("DELETE", `/api/maintenance/parts/${partId}`); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/maintenance/logs"] });
      toast({ title: "Part removed" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  return (
    <>
      <Card className={`hover:shadow-md transition-shadow ${log.status === "open" && log.eventType === "breakdown" ? "border-red-200 dark:border-red-800" : ""}`} data-testid={`card-maint-log-${log.id}`}>
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
              log.eventType === "breakdown" ? "bg-red-100 dark:bg-red-900/30" :
              log.eventType === "service" ? "bg-blue-100 dark:bg-blue-900/30" :
              "bg-green-100 dark:bg-green-900/30"
            }`}>
              {log.eventType === "breakdown" ? <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400" /> :
               log.eventType === "service" ? <Wrench className="w-5 h-5 text-blue-600 dark:text-blue-400" /> :
               <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <span className="font-semibold text-sm truncate">{log.equipmentName}</span>
                {eventTypeBadge(log.eventType)}
                {statusBadge(log.status)}
                {log.eventType === "breakdown" && log.downtimeHours ? (
                  <span className="text-sm text-muted-foreground flex items-center gap-1"><Clock className="w-3 h-3" />{log.downtimeHours}h downtime</span>
                ) : null}
              </div>
              <p className="text-sm text-foreground line-clamp-2">{log.description}</p>
              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-sm text-muted-foreground">
                <span>{log.date}</span>
                {log.servicedBy && <span>By: {log.servicedBy}</span>}
                {log.nextServiceDue && <span>Next service: {log.nextServiceDue}</span>}
                {log.autoIssueNumber && (
                  <Link href={`/stores/issues/${log.autoIssueId}`}>
                    <span className="text-blue-600 hover:underline cursor-pointer">{log.autoIssueNumber}</span>
                  </Link>
                )}
                {log.parts.length > 0 && <span>{log.parts.length} part{log.parts.length !== 1 ? "s" : ""} used</span>}
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {canEdit && (
                <Button variant="ghost" size="sm" className="text-sm h-7 px-2" onClick={() => resolveToggleMutation.mutate()} disabled={resolveToggleMutation.isPending} data-testid={`button-toggle-status-${log.id}`}>
                  {log.status === "open" ? "Resolve" : "Re-open"}
                </Button>
              )}
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setExpanded(p => !p)} data-testid={`button-expand-log-${log.id}`}>
                {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </Button>
            </div>
          </div>

          {expanded && (
            <div className="mt-3 pt-3 border-t space-y-3">
              {log.remarks && <p className="text-sm text-muted-foreground"><span className="font-medium">Remarks:</span> {log.remarks}</p>}
              {log.reportedBy && <p className="text-sm text-muted-foreground"><span className="font-medium">Reported by:</span> {log.reportedBy}</p>}
              {log.resolvedAt && <p className="text-sm text-muted-foreground"><span className="font-medium">Resolved:</span> {log.resolvedAt}</p>}

              {log.parts.length > 0 && (
                <div>
                  <p className="text-sm font-medium mb-1 flex items-center gap-1"><Package className="w-4 h-4" /> Parts Used</p>
                  <div className="space-y-1">
                    {log.parts.map(p => (
                      <div key={p.id} className="flex items-center gap-2 text-sm bg-muted/30 rounded px-3 py-1">
                        <span className="flex-1">{p.itemName}</span>
                        <span className="text-muted-foreground">{p.qty} {p.uom}</span>
                        {canEdit && (
                          <Button type="button" variant="ghost" size="icon" className="h-5 w-5" onClick={() => removePartMutation.mutate(p.id)} data-testid={`button-remove-used-part-${p.id}`}>
                            <X className="w-3 h-3" />
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                {canEdit && (
                  <Button type="button" variant="outline" size="sm" className="gap-1 h-7" onClick={() => setEditOpen(true)} data-testid={`button-edit-log-${log.id}`}>
                    <Pencil className="w-3 h-3" /> Edit
                  </Button>
                )}
                {canEdit && (
                  <Button type="button" variant="outline" size="sm" className="gap-1 h-7" onClick={() => setAddPartOpen(p => !p)} data-testid={`button-add-part-toggle-${log.id}`}>
                    <Plus className="w-3 h-3" /> Add Part
                  </Button>
                )}
                {canDelete && (
                  <Button type="button" variant="ghost" size="sm" className="gap-1 h-7 text-destructive hover:text-destructive" onClick={() => setDeleteOpen(true)} data-testid={`button-delete-log-${log.id}`}>
                    <Trash2 className="w-3 h-3" /> Delete
                  </Button>
                )}
              </div>

              {addPartOpen && (
                <div className="border rounded-lg p-3 bg-muted/20 space-y-2">
                  <p className="text-sm font-medium">Add part (auto-issued from Stores)</p>
                  <PartSelector
                    storeItems={storeItems}
                    stockMap={stockMap}
                    partItemId={partItemId}
                    setPartItemId={setPartItemId}
                    partQty={partQty}
                    setPartQty={setPartQty}
                    partUom={partUom}
                    setPartUom={setPartUom}
                    onAdd={() => addPartMutation.mutate()}
                    addLabel={addPartMutation.isPending ? "Adding..." : "Add"}
                  />
                </div>
              )}

              <div className="space-y-1.5">
                <p className="text-sm font-medium">Attachments</p>
                <AttachmentUploader
                  moduleType={log.eventType === "breakdown" ? "equipment_breakdown" : "equipment_maintenance"}
                  linkedRecordId={log.id}
                  equipmentId={log.equipmentId}
                />
                <AttachmentGallery
                  moduleType={log.eventType === "breakdown" ? "equipment_breakdown" : "equipment_maintenance"}
                  linkedRecordId={log.id}
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Maintenance Log #{log.id}</DialogTitle>
          </DialogHeader>
          <EditLogForm log={log} onClose={() => setEditOpen(false)} onSaved={() => setEditOpen(false)} />
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this log?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the maintenance log and reverse any associated store issue. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteMutation.mutate()} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function HealthSummaryTab({ summary }: { summary: HealthSummary[] }) {
  const overdue = summary.filter(s => s.nextServiceDue && s.nextServiceDue < TODAY);
  const openBreakdowns = summary.filter(s => s.openBreakdowns > 0);

  return (
    <div className="space-y-4">
      {(overdue.length > 0 || openBreakdowns.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {openBreakdowns.length > 0 && (
            <Card className="border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/10">
              <CardContent className="p-4 flex items-center gap-3">
                <AlertTriangle className="w-6 h-6 text-red-600 dark:text-red-400 shrink-0" />
                <div>
                  <p className="font-semibold text-sm text-red-700 dark:text-red-400">{openBreakdowns.length} equipment with open breakdown{openBreakdowns.length !== 1 ? "s" : ""}</p>
                  <p className="text-sm text-muted-foreground">{openBreakdowns.map(s => s.equipmentName).join(", ")}</p>
                </div>
              </CardContent>
            </Card>
          )}
          {overdue.length > 0 && (
            <Card className="border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-900/10">
              <CardContent className="p-4 flex items-center gap-3">
                <Clock className="w-6 h-6 text-orange-600 dark:text-orange-400 shrink-0" />
                <div>
                  <p className="font-semibold text-sm text-orange-700 dark:text-orange-400">{overdue.length} service{overdue.length !== 1 ? "s" : ""} overdue</p>
                  <p className="text-sm text-muted-foreground">{overdue.map(s => s.equipmentName).join(", ")}</p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {summary.map(s => {
          const isOverdue = s.nextServiceDue && s.nextServiceDue < TODAY;
          const hasBd = s.openBreakdowns > 0;
          return (
            <Card
              key={s.equipmentId}
              className={`${hasBd ? "border-red-200 dark:border-red-800" : isOverdue ? "border-orange-200 dark:border-orange-800" : ""}`}
              data-testid={`card-health-${s.equipmentId}`}
            >
              <CardContent className="p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-sm">{s.equipmentName}</p>
                    {s.registrationNumber && <p className="text-sm text-muted-foreground">{s.registrationNumber}</p>}
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    {hasBd && <Badge variant="destructive" className="text-sm">{s.openBreakdowns} open</Badge>}
                    {isOverdue && <Badge className="text-sm bg-orange-500 hover:bg-orange-600">Overdue</Badge>}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm text-muted-foreground">
                  <span>Last service:</span>
                  <span className="text-foreground">{s.lastServiceDate ?? "—"}</span>
                  <span>Next due:</span>
                  <span className={`${isOverdue ? "text-orange-600 font-medium" : "text-foreground"}`}>{s.nextServiceDue ?? "—"}</span>
                  <span>Downtime (month):</span>
                  <span className="text-foreground">{s.downtimeHoursThisMonth > 0 ? `${s.downtimeHoursThisMonth}h` : "—"}</span>
                  <span>Total events:</span>
                  <span className="text-foreground">{s.totalMaintenanceEvents}</span>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
      {summary.length === 0 && (
        <div className="text-center py-12 text-muted-foreground text-sm">No active equipment found. Add equipment in Plant → Masters → Equipment.</div>
      )}
    </div>
  );
}

export default function PlantMaintenance() {
  const { sectionVisible, sectionCan, isAdmin } = useAuth();
  const { getBackLink } = useOrigin();
  const backLink = getBackLink("/plant/dashboard");

  const [activeTab, setActiveTab] = useState("all");
  const [filterEquipmentId, setFilterEquipmentId] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [showNewForm, setShowNewForm] = useState(false);
  const [newFormEventType, setNewFormEventType] = useState("breakdown");

  const { data: equipment = [] } = useQuery<EquipmentMasterType[]>({
    queryKey: ["/api/plant-module/equipment"],
  });

  const { data: storeItems = [] } = useQuery<StoreItem[]>({
    queryKey: ["/api/stores/items"],
  });

  const { data: stockSummary = [] } = useQuery<StoreStockBalance[]>({
    queryKey: ["/api/stores/stock-summary"],
  });

  const stockMap: Record<number, number> = Object.fromEntries(stockSummary.map(s => [s.itemId, s.balance]));

  const params = new URLSearchParams();
  if (filterEquipmentId && filterEquipmentId !== "all") params.set("equipmentId", filterEquipmentId);
  if (activeTab !== "all" && activeTab !== "health") params.set("eventType", activeTab);
  if (filterStatus && filterStatus !== "all") params.set("status", filterStatus);
  if (filterDateFrom) params.set("dateFrom", filterDateFrom);
  if (filterDateTo) params.set("dateTo", filterDateTo);

  const { data: logs = [], isLoading, refetch } = useQuery<MaintenanceLog[]>({
    queryKey: ["/api/maintenance/logs", activeTab, filterEquipmentId, filterStatus, filterDateFrom, filterDateTo],
    queryFn: async () => {
      const res = await fetch(`/api/maintenance/logs?${params.toString()}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: activeTab !== "health",
  });

  const { data: healthSummary = [] } = useQuery<HealthSummary[]>({
    queryKey: ["/api/maintenance/health-summary"],
    enabled: activeTab === "health",
  });

  const openBreakdownCount = logs.filter(l => l.eventType === "breakdown" && l.status === "open").length;

  if (!sectionVisible("plant_equipment")) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <Wrench className="w-12 h-12 text-muted-foreground" />
        <p className="text-muted-foreground">You don't have access to equipment maintenance.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-4">
          <Link href={backLink}>
            <Button variant="ghost" size="icon" data-testid="button-back-maintenance"><ChevronLeft className="w-5 h-5" /></Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold font-display tracking-tight">Equipment Maintenance</h1>
            <p className="text-sm text-muted-foreground">Breakdown register, service logs, and equipment health</p>
          </div>
        </div>
        {sectionCan("plant_equipment", "create") && (
          <div className="flex gap-2">
            <Button variant="destructive" size="sm" className="gap-2" onClick={() => { setNewFormEventType("breakdown"); setShowNewForm(true); }} data-testid="button-new-breakdown">
              <AlertTriangle className="w-4 h-4" /> Log Breakdown
            </Button>
            <Button variant="outline" size="sm" className="gap-2" onClick={() => { setNewFormEventType("service"); setShowNewForm(true); }} data-testid="button-new-service">
              <Wrench className="w-4 h-4" /> Log Service / PM
            </Button>
          </div>
        )}
      </div>

      {activeTab !== "health" && (
        <div className="flex flex-wrap gap-3">
          <Select value={filterEquipmentId} onValueChange={setFilterEquipmentId}>
            <SelectTrigger className="w-44" data-testid="filter-equipment"><SelectValue placeholder="All equipment" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All equipment</SelectItem>
              {equipment.map(e => <SelectItem key={e.id} value={String(e.id)}>{e.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-36" data-testid="filter-status"><SelectValue placeholder="All status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All status</SelectItem>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="resolved">Resolved</SelectItem>
            </SelectContent>
          </Select>
          <Input type="date" className="w-36" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)} placeholder="From" data-testid="filter-date-from" />
          <Input type="date" className="w-36" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)} placeholder="To" data-testid="filter-date-to" />
          {(filterEquipmentId !== "all" || filterStatus !== "all" || filterDateFrom || filterDateTo) && (
            <Button variant="ghost" size="sm" onClick={() => { setFilterEquipmentId("all"); setFilterStatus("all"); setFilterDateFrom(""); setFilterDateTo(""); }} data-testid="button-clear-filters">Clear</Button>
          )}
        </div>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid grid-cols-4 w-full sm:w-auto">
          <TabsTrigger value="all" data-testid="tab-all-logs">All</TabsTrigger>
          <TabsTrigger value="breakdown" className="gap-1" data-testid="tab-breakdowns">
            Breakdowns
            {openBreakdownCount > 0 && activeTab !== "breakdown" && <Badge variant="destructive" className="text-sm h-4 px-1 ml-1">{openBreakdownCount}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="service" data-testid="tab-services">Services</TabsTrigger>
          <TabsTrigger value="health" className="gap-1" data-testid="tab-health"><Activity className="w-4 h-4" /><span className="hidden sm:inline">Health</span></TabsTrigger>
        </TabsList>

        {["all", "breakdown", "service"].map(tab => (
          <TabsContent key={tab} value={tab} className="mt-4">
            {isLoading ? (
              <div className="text-center py-12 text-muted-foreground text-sm">Loading...</div>
            ) : logs.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground text-sm space-y-2">
                <Wrench className="w-10 h-10 mx-auto opacity-30" />
                <p>No {tab === "breakdown" ? "breakdown" : tab === "service" ? "service" : "maintenance"} logs found.</p>
                {sectionCan("plant_equipment", "create") && (
                  <Button variant="outline" size="sm" onClick={() => { setNewFormEventType(tab === "service" ? "service" : "breakdown"); setShowNewForm(true); }} data-testid="button-new-from-empty">
                    <Plus className="w-4 h-4 mr-1" /> Create First Log
                  </Button>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {logs.map(log => (
                  <LogCard
                    key={log.id}
                    log={log}
                    canEdit={sectionCan("plant_equipment", "edit")}
                    canDelete={isAdmin}
                    storeItems={storeItems}
                    stockMap={stockMap}
                    onRefresh={refetch}
                  />
                ))}
              </div>
            )}
          </TabsContent>
        ))}

        <TabsContent value="health" className="mt-4">
          <HealthSummaryTab summary={healthSummary} />
        </TabsContent>
      </Tabs>

      <Dialog open={showNewForm} onOpenChange={setShowNewForm}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{newFormEventType === "breakdown" ? "Log Breakdown" : newFormEventType === "service" ? "Log Scheduled Service" : "Log PM Event"}</DialogTitle>
          </DialogHeader>
          <LogForm
            equipment={equipment.filter(e => e.isActive)}
            storeItems={storeItems}
            stockMap={stockMap}
            initial={{ eventType: newFormEventType }}
            onClose={() => setShowNewForm(false)}
            onSaved={() => setShowNewForm(false)}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
