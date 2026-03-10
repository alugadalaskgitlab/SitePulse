import { useState, useEffect } from "react";
import { useLocation, useRoute, Link } from "wouter";
import { useOrigin } from "@/hooks/use-origin";
import { ChevronLeft, Plus, Trash2, Save, Loader2, UserPlus, X, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { format } from "date-fns";
import { useDpr } from "@/hooks/use-dprs";
import { PinAuth } from "@/components/PinAuth";
import type { EquipmentMasterType, Site, Personnel } from "@shared/schema";
import { PERSONNEL_ROLES } from "@shared/schema";

interface ProgressEntry {
  activity: string;
  side: string;
  chainageFrom: string;
  chainageTo: string;
  length: number | null;
  width: number | null;
  thickness: number | null;
  quantity: number | null;
  uom: string;
  noSiteWork: boolean;
  noSiteWorkDescription: string;
  personnelIds: number[];
}

interface EquipmentEntry {
  machine: string;
  vehicleNo: string;
  operator: string;
  task: string;
  entryType: string;
  startTime: string;
  endTime: string;
  openingReading: number | null;
  closingReading: number | null;
  diesel: number | null;
  equipmentId: number | null;
  dieselSource: string;
  fuelStation: string;
  billNumber: string;
  amountPaid: number | null;
  numberOfTrips: number | null;
  tripDistance: number | null;
  totalKm: number | null;
}

interface LabourEntry {
  category: string;
  gender: string;
  count: number;
  task: string;
  contractor: string;
}

interface MaterialEntry {
  type: string;
  material: string;
  quantity: number | null;
  uom: string;
  vehicleNumber: string;
  supplier: string;
  location: string;
  receiptNumber: string;
}

interface SitePurchaseEntry {
  itemDescription: string;
  vendor: string;
  billNo: string;
  amount: number | null;
  quantity: number | null;
  uom: string;
}

const SIDE_OPTIONS = ["LHS", "RHS", "Full Width"];
const UOM_OPTIONS = ["SQM", "CUM", "RMT", "MT", "NOS"];
const LABOUR_CATEGORIES = ["Skilled", "Semi-Skilled", "Unskilled"];
const GENDER_OPTIONS = ["Male", "Female"];

// Helper to parse chainage like "0+500" or "1+250" into meters
function parseChainageToMeters(chainage: string): number | null {
  if (!chainage) return null;
  const match = chainage.match(/^(\d+)\+(\d+)$/);
  if (match) {
    const km = parseInt(match[1], 10);
    const m = parseInt(match[2], 10);
    return km * 1000 + m;
  }
  // Try parsing as plain number
  const num = parseFloat(chainage);
  return isNaN(num) ? null : num;
}

// Calculate length from chainage difference
function calculateLengthFromChainage(from: string, to: string): number | null {
  const fromMeters = parseChainageToMeters(from);
  const toMeters = parseChainageToMeters(to);
  if (fromMeters !== null && toMeters !== null) {
    return Math.abs(toMeters - fromMeters);
  }
  return null;
}

export default function SiteEdit() {
  const [, params] = useRoute("/site/edit/:id");
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { getBackLink, appendOrigin } = useOrigin();
  const id = parseInt(params?.id || "0");
  const backToReport = appendOrigin(`/site/report/${id}`);

  const isCompleteMode = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('complete');

  // Get PIN and role from sessionStorage (set by SiteReport before navigating)
  // Keep credentials in sessionStorage until successful save to handle page refresh
  const [pin] = useState(() => {
    if (isCompleteMode) return "complete";
    return sessionStorage.getItem(`edit_pin_${id}`) || "";
  });
  
  const [role] = useState<"manager" | "admin" | "engineer">(() => {
    if (isCompleteMode) return "engineer";
    const storedRole = sessionStorage.getItem(`auth_role_${id}`) || "manager";
    return storedRole as "manager" | "admin";
  });
  
  // Clear credentials after successful save
  const clearCredentials = () => {
    sessionStorage.removeItem(`edit_pin_${id}`);
    sessionStorage.removeItem(`auth_role_${id}`);
  };

  const { data: dpr, isLoading } = useDpr(id);

  const { data: equipmentMaster } = useQuery<EquipmentMasterType[]>({
    queryKey: ["/api/plant-module/equipment", "all"],
    queryFn: async () => {
      const res = await fetch("/api/plant-module/equipment?includeInactive=true");
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });
  const activeEquipment = equipmentMaster?.filter(e => e.isActive) || [];

  const { data: sitesList = [] } = useQuery<Site[]>({
    queryKey: ["/api/sites"],
  });
  const activeSites = sitesList.filter(s => s.isActive);

  const [header, setHeader] = useState({
    date: format(new Date(), "yyyy-MM-dd"),
    site: "",
    engineer: "",
  });

  const { data: personnelList } = useQuery<Personnel[]>({
    queryKey: ["/api/personnel"],
  });

  const [addPersonnelOpen, setAddPersonnelOpen] = useState(false);
  const [showAddPersonnelPin, setShowAddPersonnelPin] = useState(false);
  const [newPersonnelName, setNewPersonnelName] = useState("");
  const [newPersonnelRole, setNewPersonnelRole] = useState("Engineer");
  const [newPersonnelPhone, setNewPersonnelPhone] = useState("");

  const createPersonnelMutation = useMutation({
    mutationFn: (data: { name: string; role: string; phone?: string }) =>
      apiRequest("POST", "/api/personnel", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/personnel"] });
      setAddPersonnelOpen(false);
      setNewPersonnelName("");
      setNewPersonnelRole("Engineer");
      setNewPersonnelPhone("");
      toast({ title: "Personnel added" });
    },
  });

  const [progress, setProgress] = useState<ProgressEntry[]>([
    { activity: "", side: "", chainageFrom: "", chainageTo: "", length: null, width: null, thickness: null, quantity: null, uom: "SQM", noSiteWork: false, noSiteWorkDescription: "", personnelIds: [] }
  ]);

  const [equipment, setEquipment] = useState<EquipmentEntry[]>([
    { machine: "", vehicleNo: "", operator: "", task: "", startTime: "", endTime: "", openingReading: null, closingReading: null, diesel: null, equipmentId: null, dieselSource: "plant_stock", fuelStation: "", billNumber: "", amountPaid: null }
  ]);

  const [labour, setLabour] = useState<LabourEntry[]>([
    { category: "Skilled", gender: "Male", count: 0, task: "", contractor: "" }
  ]);

  // Materials are now managed separately in the Materials Received tab
  const [materials] = useState<MaterialEntry[]>([]);

  const [sitePurchases, setSitePurchases] = useState<SitePurchaseEntry[]>([]);

  useEffect(() => {
    if (dpr) {
      const baseSite = dpr.site.replace(/ – (Edited by|Copy by) .+$/, '').trim();
      setHeader({
        date: dpr.date,
        site: baseSite,
        engineer: dpr.engineer,
      });

      if (dpr.progress?.length) {
        setProgress(dpr.progress.map((p: any) => ({
          activity: p.activity || "",
          side: p.side || "",
          chainageFrom: p.chainageFrom || "",
          chainageTo: p.chainageTo || "",
          length: p.length,
          width: p.width,
          thickness: p.thickness,
          quantity: p.quantity,
          uom: p.uom || "SQM",
          noSiteWork: p.noSiteWork || false,
          noSiteWorkDescription: p.noSiteWorkDescription || "",
          personnelIds: p.personnelIds || [],
        })));
      }

      if (dpr.equipment?.length) {
        setEquipment(dpr.equipment.map(e => ({
          machine: e.machine || "",
          vehicleNo: e.vehicleNo || "",
          operator: e.operator || "",
          task: e.task || "",
          entryType: (e as any).entryType ?? "time_meter",
          startTime: e.startTime || "",
          endTime: e.endTime || "",
          openingReading: e.openingReading ?? null,
          closingReading: e.closingReading ?? null,
          diesel: e.diesel,
          equipmentId: e.equipmentId ?? null,
          dieselSource: e.dieselSource ?? "plant_stock",
          fuelStation: e.fuelStation ?? "",
          billNumber: e.billNumber ?? "",
          amountPaid: e.amountPaid ?? null,
          numberOfTrips: (e as any).numberOfTrips ?? null,
          tripDistance: (e as any).tripDistance ?? null,
          totalKm: (e as any).totalKm ?? null,
        })));
      }

      if (dpr.labour?.length) {
        setLabour(dpr.labour.map(l => ({
          category: l.category || "Skilled",
          gender: l.gender || "Male",
          count: l.count,
          task: l.task || "",
          contractor: (l as any).contractor || "",
        })));
      }

      // Materials are now managed separately in the Materials Received tab

      if (dpr.sitePurchases) {
        setSitePurchases(dpr.sitePurchases.map((sp: any) => ({
          itemDescription: sp.itemDescription || "",
          vendor: sp.vendor || "",
          billNo: sp.billNo || "",
          amount: sp.amount != null ? Number(sp.amount) : null,
          quantity: sp.quantity != null ? Number(sp.quantity) : null,
          uom: sp.uom || "",
        })));
      }
    }
  }, [dpr]);

  const updateMutation = useMutation({
    mutationFn: async (data: any) => {
      // Create a new version instead of overwriting original
      // Send client's local timestamp for accurate time display
      const clientTimestamp = format(new Date(), "yyyy-MM-dd HH:mm:ss");
      
      const response = await apiRequest("POST", `/api/dprs/${id}/version`, { 
        pin, 
        editedBy: role,
        data,
        clientTimestamp,
      });
      return response.json();
    },
    onSuccess: (newVersion) => {
      // Clear credentials after successful save
      clearCredentials();
      queryClient.invalidateQueries({ queryKey: ["/api/dprs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dprs/:id", id] });
      queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0]?.toString().startsWith("/api/site-purchases") || false });
      queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0]?.toString().startsWith("/api/plant-module/stock-ledger") || false });
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/stock-balances"] });
      toast({
        title: "New Version Created",
        description: "Your edited version has been saved successfully.",
      });
      // Redirect to the new version's report
      setLocation(appendOrigin(`/site/report/${newVersion.id}`));
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to save changes",
        variant: "destructive",
      });
    },
  });

  // Calculate length from chainage if not manually entered
  const getEffectiveLength = (entry: ProgressEntry): number | null => {
    // If length is manually entered, use it
    if (entry.length !== null && entry.length > 0) {
      return entry.length;
    }
    // Otherwise calculate from chainage
    return calculateLengthFromChainage(entry.chainageFrom, entry.chainageTo);
  };

  const calculateQuantity = (entry: ProgressEntry): number | null => {
    const length = getEffectiveLength(entry);
    if (!length || !entry.width) return null;
    if (entry.uom === "SQM") {
      return length * entry.width;
    } else if (entry.uom === "CUM" && entry.thickness) {
      return length * entry.width * entry.thickness;
    }
    return null;
  };

  const calculateHours = (start: string, end: string): number => {
    if (!start || !end) return 0;
    const [sh, sm] = start.split(':').map(Number);
    const [eh, em] = end.split(':').map(Number);
    const diff = (eh * 60 + em) - (sh * 60 + sm);
    return diff > 0 ? diff / 60 : 0;
  };

  const calculateMeterHours = (openingReading: number | null, closingReading: number | null): number | null => {
    if (openingReading === null || closingReading === null) return null;
    const diff = closingReading - openingReading;
    return diff >= 0 ? diff : null;
  };

  const getWorkingHours = (entry: EquipmentEntry): number => {
    const meterHours = calculateMeterHours(entry.openingReading, entry.closingReading);
    if (meterHours !== null) return meterHours;
    return calculateHours(entry.startTime, entry.endTime);
  };

  const getTotalDiesel = (): number => {
    return equipment.reduce((sum, e) => sum + (e.diesel || 0), 0);
  };

  const addRow = (section: 'progress' | 'equipment' | 'labour') => {
    if (section === 'progress') {
      setProgress([...progress, { activity: "", side: "", chainageFrom: "", chainageTo: "", length: null, width: null, thickness: null, quantity: null, uom: "SQM", noSiteWork: false, noSiteWorkDescription: "", personnelIds: [] }]);
    } else if (section === 'equipment') {
      setEquipment([...equipment, { machine: "", vehicleNo: "", operator: "", task: "", entryType: "time_meter", startTime: "", endTime: "", openingReading: null, closingReading: null, diesel: null, equipmentId: null, dieselSource: "plant_stock", fuelStation: "", billNumber: "", amountPaid: null, numberOfTrips: null, tripDistance: null, totalKm: null }]);
    } else if (section === 'labour') {
      setLabour([...labour, { category: "Skilled", gender: "Male", count: 0, task: "", contractor: "" }]);
    }
  };

  const removeRow = (section: 'progress' | 'equipment' | 'labour', index: number) => {
    if (section === 'progress' && progress.length > 1) {
      setProgress(progress.filter((_, i) => i !== index));
    } else if (section === 'equipment' && equipment.length > 1) {
      setEquipment(equipment.filter((_, i) => i !== index));
    } else if (section === 'labour' && labour.length > 1) {
      setLabour(labour.filter((_, i) => i !== index));
    }
  };

  const addSitePurchase = () => {
    setSitePurchases([...sitePurchases, { itemDescription: "", vendor: "", billNo: "", amount: null, quantity: null, uom: "" }]);
  };
  const removeSitePurchase = (index: number) => {
    setSitePurchases(sitePurchases.filter((_, i) => i !== index));
  };
  const updateSitePurchase = (index: number, field: keyof SitePurchaseEntry, value: any) => {
    const updated = [...sitePurchases];
    (updated[index] as any)[field] = value;
    setSitePurchases(updated);
  };

  const handleSave = () => {
    if (!header.date || !header.site || !header.engineer) {
      toast({
        title: "Missing Fields",
        description: "Please fill in date, site name, and engineer name.",
        variant: "destructive",
      });
      return;
    }

    const payload = {
      ...header,
      progress: progress.filter(p => p.activity).map(p => {
        const effectiveLength = getEffectiveLength(p);
        return {
          ...p,
          length: effectiveLength,
          quantity: calculateQuantity(p) || p.quantity,
        };
      }),
      equipment: equipment.filter(e => e.machine).map(eq => ({
        ...eq,
        totalKm: eq.entryType === "trip_based" && eq.numberOfTrips && eq.tripDistance
          ? Number(eq.numberOfTrips) * Number(eq.tripDistance) * 2 : eq.totalKm || null,
      })),
      labour: labour.filter(l => l.count > 0),
      materials: materials.filter(m => m.material).map(m => ({
        type: m.type,
        material: m.material,
        quantity: m.quantity,
        uom: m.uom,
        vehicleNumber: m.vehicleNumber || undefined,
        supplier: m.supplier || undefined,
        location: m.location || undefined,
        receiptNumber: m.receiptNumber || undefined,
      })),
      sitePurchases: sitePurchases.filter(sp => sp.itemDescription),
    };

    updateMutation.mutate(payload);
  };

  if (isLoading) {
    return (
      <div className="flex justify-center p-20">
        <Loader2 className="animate-spin w-8 h-8" />
      </div>
    );
  }

  if (!dpr) {
    return <div className="p-20 text-center text-red-500">Report not found.</div>;
  }

  if (!pin) {
    return (
      <div className="p-20 text-center">
        <p className="text-muted-foreground mb-4">Authorization required to edit this report.</p>
        <Button onClick={() => setLocation(backToReport)} data-testid="button-back-to-report">
          Back to Report
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-20 animate-in fade-in duration-300">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => setLocation(backToReport)} data-testid="button-back">
            <ChevronLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold font-display">Edit Report</h1>
            <p className="text-muted-foreground text-sm">Modify and save your changes</p>
          </div>
        </div>
        <Button onClick={handleSave} disabled={updateMutation.isPending} className="gap-2" data-testid="button-save">
          {updateMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save Changes
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Report Details</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <Label>Date</Label>
            <Input
              type="date"
              value={header.date}
              onChange={(e) => setHeader({ ...header, date: e.target.value })}
              data-testid="input-date"
            />
          </div>
          <div>
            <Label>Site Name</Label>
            <Select value={header.site} onValueChange={(val) => setHeader({ ...header, site: val })}>
              <SelectTrigger data-testid="input-site">
                <SelectValue placeholder="Select Site" />
              </SelectTrigger>
              <SelectContent>
                {activeSites.map((s) => (
                  <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Engineer / Submitted By</Label>
            <div className="flex gap-2">
              <Select
                value={header.engineer}
                onValueChange={(val) => setHeader({ ...header, engineer: val })}
              >
                <SelectTrigger className="uppercase" data-testid="select-engineer">
                  <SelectValue placeholder="Select Engineer" />
                </SelectTrigger>
                <SelectContent>
                  {header.engineer && !(personnelList || []).some(p => 
                    `${p.name.toUpperCase()} - ${p.role.toUpperCase()}` === header.engineer
                  ) && (
                    <SelectItem value={header.engineer}>{header.engineer} (LEGACY)</SelectItem>
                  )}
                  {(personnelList || []).filter(p => p.isActive).map((p) => (
                    <SelectItem key={p.id} value={`${p.name.toUpperCase()} - ${p.role.toUpperCase()}`}>
                      {p.name.toUpperCase()} - {p.role.toUpperCase()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                type="button"
                size="icon"
                variant="outline"
                onClick={() => setShowAddPersonnelPin(true)}
                title="Add new personnel"
                data-testid="button-add-engineer-personnel"
              >
                <UserPlus className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle>Activity Progress</CardTitle>
          <Button size="sm" variant="outline" onClick={() => addRow('progress')} data-testid="button-add-progress">
            <Plus className="w-4 h-4 mr-1" /> Add Row
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {progress.map((entry, idx) => (
            <div key={idx} className="p-4 border rounded-lg bg-muted/30 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id={`no-site-work-${idx}`}
                      checked={entry.noSiteWork}
                      onCheckedChange={(checked) => {
                        const updated = [...progress];
                        updated[idx].noSiteWork = checked === true;
                        if (checked) {
                          updated[idx].activity = updated[idx].activity || "NO SITE WORK";
                          updated[idx].side = "";
                          updated[idx].chainageFrom = "";
                          updated[idx].chainageTo = "";
                          updated[idx].length = null;
                          updated[idx].width = null;
                          updated[idx].thickness = null;
                          updated[idx].quantity = null;
                        } else {
                          updated[idx].noSiteWorkDescription = "";
                        }
                        setProgress(updated);
                      }}
                      data-testid={`checkbox-no-site-work-${idx}`}
                    />
                    <Label htmlFor={`no-site-work-${idx}`} className="text-xs cursor-pointer">No Site Work</Label>
                  </div>
                </div>
                <Button 
                  size="icon" 
                  variant="ghost" 
                  onClick={() => removeRow('progress', idx)}
                  disabled={progress.length === 1}
                  data-testid={`button-remove-progress-${idx}`}
                >
                  <Trash2 className="w-4 h-4 text-destructive" />
                </Button>
              </div>

              {entry.noSiteWork ? (
                <div className="space-y-3">
                  <div>
                    <Label className="text-xs">Activity</Label>
                    <Input
                      placeholder="e.g., MACHINERY SHIFTING, OFFICE WORK"
                      value={entry.activity}
                      onChange={(e) => {
                        const updated = [...progress];
                        updated[idx].activity = e.target.value.toUpperCase();
                        setProgress(updated);
                      }}
                      className="uppercase"
                      data-testid={`input-activity-${idx}`}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Description</Label>
                    <Textarea
                      placeholder="Describe what was done..."
                      value={entry.noSiteWorkDescription}
                      onChange={(e) => {
                        const updated = [...progress];
                        updated[idx].noSiteWorkDescription = e.target.value.toUpperCase();
                        setProgress(updated);
                      }}
                      className="uppercase"
                      rows={3}
                      data-testid={`input-description-${idx}`}
                    />
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  <div className="col-span-2">
                    <Label className="text-xs">Activity</Label>
                    <Input
                      placeholder="Activity description"
                      value={entry.activity}
                      onChange={(e) => {
                        const updated = [...progress];
                        updated[idx].activity = e.target.value.toUpperCase();
                        setProgress(updated);
                      }}
                      className="uppercase"
                      data-testid={`input-activity-${idx}`}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Side</Label>
                    <Select
                      value={entry.side}
                      onValueChange={(val) => {
                        const updated = [...progress];
                        updated[idx].side = val;
                        setProgress(updated);
                      }}
                    >
                      <SelectTrigger data-testid={`select-side-${idx}`}>
                        <SelectValue placeholder="Select" />
                      </SelectTrigger>
                      <SelectContent>
                        {SIDE_OPTIONS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">From (Km)</Label>
                    <Input
                      placeholder="0+000"
                      value={entry.chainageFrom}
                      onChange={(e) => {
                        const updated = [...progress];
                        updated[idx].chainageFrom = e.target.value.toUpperCase();
                        setProgress(updated);
                      }}
                      className="uppercase"
                      data-testid={`input-chainage-from-${idx}`}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">To (Km)</Label>
                    <Input
                      placeholder="0+000"
                      value={entry.chainageTo}
                      onChange={(e) => {
                        const updated = [...progress];
                        updated[idx].chainageTo = e.target.value.toUpperCase();
                        setProgress(updated);
                      }}
                      className="uppercase"
                      data-testid={`input-chainage-to-${idx}`}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Length (m)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      placeholder="0"
                      value={entry.length ?? ""}
                      onChange={(e) => {
                        const updated = [...progress];
                        updated[idx].length = e.target.value ? parseFloat(e.target.value) : null;
                        updated[idx].quantity = calculateQuantity(updated[idx]);
                        setProgress(updated);
                      }}
                      data-testid={`input-length-${idx}`}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Width (m)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      placeholder="0"
                      value={entry.width ?? ""}
                      onChange={(e) => {
                        const updated = [...progress];
                        updated[idx].width = e.target.value ? parseFloat(e.target.value) : null;
                        updated[idx].quantity = calculateQuantity(updated[idx]);
                        setProgress(updated);
                      }}
                      data-testid={`input-width-${idx}`}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Thickness (m)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      placeholder="0"
                      value={entry.thickness ?? ""}
                      onChange={(e) => {
                        const updated = [...progress];
                        updated[idx].thickness = e.target.value ? parseFloat(e.target.value) : null;
                        updated[idx].quantity = calculateQuantity(updated[idx]);
                        setProgress(updated);
                      }}
                      data-testid={`input-thickness-${idx}`}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">UOM</Label>
                    <Select
                      value={entry.uom}
                      onValueChange={(val) => {
                        const updated = [...progress];
                        updated[idx].uom = val;
                        updated[idx].quantity = calculateQuantity(updated[idx]);
                        setProgress(updated);
                      }}
                    >
                      <SelectTrigger data-testid={`select-uom-${idx}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {UOM_OPTIONS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}

              <div className="flex items-center gap-2 flex-wrap">
                <Label className="text-xs text-muted-foreground">Personnel:</Label>
                {entry.personnelIds.map(pid => {
                  const person = personnelList?.find(p => p.id === pid);
                  return person ? (
                    <Badge key={pid} variant="secondary" className="text-xs gap-1">
                      {person.name}
                      <X className="w-3 h-3 cursor-pointer" onClick={() => {
                        const updated = [...progress];
                        updated[idx].personnelIds = updated[idx].personnelIds.filter(id => id !== pid);
                        setProgress(updated);
                      }} />
                    </Badge>
                  ) : null;
                })}
                <Select
                  value=""
                  onValueChange={(val) => {
                    if (val === "__add_new__") {
                      setShowAddPersonnelPin(true);
                      return;
                    }
                    const pid = parseInt(val);
                    if (!entry.personnelIds.includes(pid)) {
                      const updated = [...progress];
                      updated[idx].personnelIds = [...updated[idx].personnelIds, pid];
                      setProgress(updated);
                    }
                  }}
                >
                  <SelectTrigger className="w-[140px] h-7 text-xs" data-testid={`select-personnel-${idx}`}>
                    <SelectValue placeholder="+ Add person" />
                  </SelectTrigger>
                  <SelectContent>
                    {personnelList?.filter(p => !entry.personnelIds.includes(p.id)).map(p => (
                      <SelectItem key={p.id} value={String(p.id)}>{p.name} ({p.role})</SelectItem>
                    ))}
                    <SelectItem value="__add_new__" className="text-primary font-medium">
                      <span className="flex items-center gap-1"><UserPlus className="h-3 w-3" /> New Personnel</span>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          ))}
          <Button size="sm" variant="outline" className="w-full border-dashed" onClick={() => addRow('progress')} data-testid="button-add-progress-bottom">
            <Plus className="w-4 h-4 mr-1" /> Add Row
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle>Equipment Log</CardTitle>
          <Button size="sm" variant="outline" onClick={() => addRow('equipment')} data-testid="button-add-equipment">
            <Plus className="w-4 h-4 mr-1" /> Add Row
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {equipment.map((entry, idx) => {
            const workingHours = getWorkingHours(entry);
            const isTimeMeter = !entry.entryType || entry.entryType === "time_meter" || entry.entryType === "hourly";
            const isTripBased = entry.entryType === "trip_based";
            const isDailyOrMonthly = entry.entryType === "daily" || entry.entryType === "monthly";
            const calculatedTotalKm = (entry.numberOfTrips && entry.tripDistance) ? entry.numberOfTrips * entry.tripDistance * 2 : 0;

            return (
            <div key={idx} className="p-4 border rounded-lg bg-muted/30 space-y-4 relative">
              <Button
                size="icon"
                variant="ghost"
                onClick={() => removeRow('equipment', idx)}
                disabled={equipment.length === 1}
                className="absolute right-2 top-2 text-muted-foreground hover:text-destructive"
                data-testid={`button-remove-equipment-${idx}`}
              >
                <Trash2 className="w-4 h-4" />
              </Button>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="col-span-2">
                <Label className="text-xs">Equipment</Label>
                <Select
                  value={entry.equipmentId ? String(entry.equipmentId) : ""}
                  onValueChange={(val) => {
                    const updated = [...equipment];
                    const selectedEquip = activeEquipment.find(e => e.id === Number(val));
                    if (selectedEquip) {
                      updated[idx].equipmentId = selectedEquip.id;
                      updated[idx].machine = selectedEquip.name;
                      updated[idx].vehicleNo = selectedEquip.registrationNumber || "";
                      if (selectedEquip.ownership !== "hired") {
                        updated[idx].entryType = "time_meter";
                        updated[idx].numberOfTrips = null;
                        updated[idx].tripDistance = null;
                        updated[idx].totalKm = null;
                      }
                    }
                    setEquipment(updated);
                  }}
                >
                  <SelectTrigger data-testid={`select-equipment-${idx}`}>
                    <SelectValue placeholder="Select equipment..." />
                  </SelectTrigger>
                  <SelectContent>
                    {activeEquipment.map((eq) => (
                      <SelectItem key={eq.id} value={String(eq.id)}>
                        {eq.name} {eq.registrationNumber ? `(${eq.registrationNumber})` : ""} — {eq.ownership === "hired" ? `HIRED: ${eq.vendorName}` : "HLC OWN"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {entry.equipmentId && entry.vehicleNo && (
                  <p className="text-xs text-muted-foreground mt-1">Reg: {entry.vehicleNo}</p>
                )}
                {(() => {
                  const selectedEquipForType = activeEquipment.find(e => e.id === entry.equipmentId);
                  if (!selectedEquipForType || selectedEquipForType.ownership !== "hired") return null;
                  return (
                    <div className="mt-2">
                      <Label className="text-xs">Entry Type</Label>
                      <div className="flex items-center gap-2">
                        <Select
                          value={entry.entryType ?? "time_meter"}
                          onValueChange={(val) => {
                            const updated = [...equipment];
                            updated[idx].entryType = val;
                            if (val !== "trip_based") {
                              updated[idx].numberOfTrips = null;
                              updated[idx].tripDistance = null;
                              updated[idx].totalKm = null;
                            }
                            setEquipment(updated);
                          }}
                        >
                          <SelectTrigger data-testid={`select-entry-type-${idx}`} className="w-48">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="time_meter">Time / Meter Reading</SelectItem>
                            <SelectItem value="hourly">Hourly Hire</SelectItem>
                            <SelectItem value="daily">Daily Hire</SelectItem>
                            <SelectItem value="trip_based">Trip Based</SelectItem>
                            <SelectItem value="monthly">Monthly Hire</SelectItem>
                          </SelectContent>
                        </Select>
                        {isDailyOrMonthly && (
                          <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 px-3 py-1.5" data-testid={`badge-entry-type-${idx}`}>
                            {entry.entryType === "daily" ? "DAILY HIRE" : "MONTHLY HIRE"}
                          </Badge>
                        )}
                      </div>
                    </div>
                  );
                })()}
              </div>
              <div>
                <Label className="text-xs">Operator</Label>
                <Input
                  placeholder="Operator name"
                  value={entry.operator}
                  onChange={(e) => {
                    const updated = [...equipment];
                    updated[idx].operator = e.target.value.toUpperCase();
                    setEquipment(updated);
                  }}
                  className="uppercase"
                  data-testid={`input-operator-${idx}`}
                />
              </div>
              <div>
                <Label className="text-xs">Task</Label>
                <Input
                  placeholder="Task performed"
                  value={entry.task}
                  onChange={(e) => {
                    const updated = [...equipment];
                    updated[idx].task = e.target.value.toUpperCase();
                    setEquipment(updated);
                  }}
                  className="uppercase"
                  data-testid={`input-equipment-task-${idx}`}
                />
              </div>
              </div>

              <>
                  <p className="text-xs font-semibold text-muted-foreground border-b pb-1">
                    {entry.entryType === "hourly" ? "Hourly Hire — Time Entry" : "Time / Meter Entry"}
                  </p>
                  <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
                    <div>
                      <Label className="text-xs">Start</Label>
                      <Input
                        type="time"
                        value={entry.startTime}
                        onChange={(e) => {
                          const updated = [...equipment];
                          updated[idx].startTime = e.target.value;
                          setEquipment(updated);
                        }}
                        data-testid={`input-equipment-start-${idx}`}
                      />
                    </div>
                    <div>
                      <Label className="text-xs">End</Label>
                      <Input
                        type="time"
                        value={entry.endTime}
                        onChange={(e) => {
                          const updated = [...equipment];
                          updated[idx].endTime = e.target.value;
                          setEquipment(updated);
                        }}
                        data-testid={`input-equipment-end-${idx}`}
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Opening Reading</Label>
                      <Input
                        type="number"
                        step="0.1"
                        placeholder="Meter"
                        value={entry.openingReading ?? ""}
                        onChange={(e) => {
                          const updated = [...equipment];
                          updated[idx].openingReading = e.target.value ? parseFloat(e.target.value) : null;
                          setEquipment(updated);
                        }}
                        data-testid={`input-equipment-opening-${idx}`}
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Closing Reading</Label>
                      <Input
                        type="number"
                        step="0.1"
                        placeholder="Meter"
                        value={entry.closingReading ?? ""}
                        onChange={(e) => {
                          const updated = [...equipment];
                          updated[idx].closingReading = e.target.value ? parseFloat(e.target.value) : null;
                          setEquipment(updated);
                        }}
                        data-testid={`input-equipment-closing-${idx}`}
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Working Hours</Label>
                      <div className="bg-primary/10 px-3 py-2 rounded border border-primary/20 font-semibold text-primary text-sm" data-testid={`display-working-hours-${idx}`}>
                        {workingHours > 0 ? `${workingHours.toFixed(3)} hrs` : "-"}
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs">Diesel (L)</Label>
                      <Input
                        type="number"
                        step="0.1"
                        placeholder="0"
                        value={entry.diesel ?? ""}
                        onChange={(e) => {
                          const updated = [...equipment];
                          updated[idx].diesel = e.target.value ? parseFloat(e.target.value) : null;
                          setEquipment(updated);
                        }}
                        data-testid={`input-equipment-diesel-${idx}`}
                      />
                    </div>
                  </div>
              </>

              {isTripBased && (
                <>
                  <p className="text-xs font-semibold text-muted-foreground border-b pb-1">Trip Based Entry</p>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div>
                      <Label className="text-xs">No. of Trips</Label>
                      <Input
                        type="number"
                        step="1"
                        placeholder="0"
                        value={entry.numberOfTrips ?? ""}
                        onChange={(e) => {
                          const updated = [...equipment];
                          updated[idx].numberOfTrips = e.target.value ? parseInt(e.target.value) : null;
                          const trips = updated[idx].numberOfTrips || 0;
                          const dist = updated[idx].tripDistance || 0;
                          updated[idx].totalKm = trips * dist * 2;
                          setEquipment(updated);
                        }}
                        data-testid={`input-equipment-trips-${idx}`}
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Trip Distance (km one-way)</Label>
                      <Input
                        type="number"
                        step="0.1"
                        placeholder="0"
                        value={entry.tripDistance ?? ""}
                        onChange={(e) => {
                          const updated = [...equipment];
                          updated[idx].tripDistance = e.target.value ? parseFloat(e.target.value) : null;
                          const trips = updated[idx].numberOfTrips || 0;
                          const dist = updated[idx].tripDistance || 0;
                          updated[idx].totalKm = trips * dist * 2;
                          setEquipment(updated);
                        }}
                        data-testid={`input-equipment-trip-distance-${idx}`}
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Total KM (round trip)</Label>
                      <div className="bg-primary/10 px-3 py-2 rounded border border-primary/20 font-semibold text-primary text-sm" data-testid={`display-total-km-${idx}`}>
                        {calculatedTotalKm > 0 ? `${calculatedTotalKm.toFixed(1)} km` : "-"}
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs">Diesel (L)</Label>
                      <Input
                        type="number"
                        step="0.1"
                        placeholder="0"
                        value={entry.diesel ?? ""}
                        onChange={(e) => {
                          const updated = [...equipment];
                          updated[idx].diesel = e.target.value ? parseFloat(e.target.value) : null;
                          setEquipment(updated);
                        }}
                        data-testid={`input-equipment-diesel-${idx}`}
                      />
                    </div>
                  </div>
                </>
              )}

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <Label className="text-xs">Diesel Source</Label>
                  <Select
                    value={entry.dieselSource ?? "plant_stock"}
                    onValueChange={(value) => {
                      const updated = [...equipment];
                      updated[idx].dieselSource = value;
                      setEquipment(updated);
                    }}
                  >
                    <SelectTrigger data-testid={`select-diesel-source-${idx}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="plant_stock">Plant Stock</SelectItem>
                      <SelectItem value="direct_purchase">Direct Site Purchase</SelectItem>
                      <SelectItem value="contractor">Contractor</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {entry.dieselSource === "direct_purchase" && (
                  <>
                    <div>
                      <Label className="text-xs">Fuel Station</Label>
                      <Input
                        placeholder="HP / BPCL"
                        value={entry.fuelStation ?? ""}
                        onChange={(e) => {
                          const updated = [...equipment];
                          updated[idx].fuelStation = e.target.value.toUpperCase();
                          setEquipment(updated);
                        }}
                        className="uppercase"
                        data-testid={`input-fuel-station-${idx}`}
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Bill No.</Label>
                      <Input
                        placeholder="Receipt #"
                        value={entry.billNumber ?? ""}
                        onChange={(e) => {
                          const updated = [...equipment];
                          updated[idx].billNumber = e.target.value.toUpperCase();
                          setEquipment(updated);
                        }}
                        className="uppercase"
                        data-testid={`input-bill-number-${idx}`}
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Amount (Rs)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="0"
                        value={entry.amountPaid ?? ""}
                        onChange={(e) => {
                          const updated = [...equipment];
                          updated[idx].amountPaid = e.target.value ? parseFloat(e.target.value) : null;
                          setEquipment(updated);
                        }}
                        data-testid={`input-amount-paid-${idx}`}
                      />
                    </div>
                  </>
                )}
              </div>
            </div>
            );
          })}
          <div className="p-4 bg-primary/5 border border-primary/20 rounded-lg">
            <p className="text-sm text-muted-foreground">Total Diesel</p>
            <p className="text-2xl font-bold text-primary">{getTotalDiesel().toFixed(3)} L</p>
          </div>
          <Button size="sm" variant="outline" className="w-full border-dashed" onClick={() => addRow('equipment')} data-testid="button-add-equipment-bottom">
            <Plus className="w-4 h-4 mr-1" /> Add Row
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle>Labour Strength</CardTitle>
          <Button size="sm" variant="outline" onClick={() => addRow('labour')} data-testid="button-add-labour">
            <Plus className="w-4 h-4 mr-1" /> Add Row
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {labour.map((entry, idx) => (
            <div key={idx} className="grid grid-cols-2 md:grid-cols-6 gap-3 p-4 border rounded-lg bg-muted/30">
              <div>
                <Label className="text-xs">Category</Label>
                <Select
                  value={entry.category}
                  onValueChange={(val) => {
                    const updated = [...labour];
                    updated[idx].category = val;
                    setLabour(updated);
                  }}
                >
                  <SelectTrigger data-testid={`select-labour-category-${idx}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LABOUR_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Gender</Label>
                <Select
                  value={entry.gender}
                  onValueChange={(val) => {
                    const updated = [...labour];
                    updated[idx].gender = val;
                    setLabour(updated);
                  }}
                >
                  <SelectTrigger data-testid={`select-labour-gender-${idx}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {GENDER_OPTIONS.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Count</Label>
                <Input
                  type="number"
                  min="0"
                  value={entry.count || ""}
                  onChange={(e) => {
                    const updated = [...labour];
                    updated[idx].count = parseInt(e.target.value) || 0;
                    setLabour(updated);
                  }}
                  data-testid={`input-labour-count-${idx}`}
                />
              </div>
              <div>
                <Label className="text-xs">Task/Work</Label>
                <Input
                  placeholder="e.g. Spreading WMM"
                  value={entry.task}
                  onChange={(e) => {
                    const updated = [...labour];
                    updated[idx].task = e.target.value.toUpperCase();
                    setLabour(updated);
                  }}
                  className="uppercase"
                  data-testid={`input-labour-task-${idx}`}
                />
              </div>
              <div>
                <Label className="text-xs">Contractor/Gang</Label>
                <Input
                  placeholder="e.g. Raju Gang"
                  value={entry.contractor}
                  onChange={(e) => {
                    const updated = [...labour];
                    updated[idx].contractor = e.target.value.toUpperCase();
                    setLabour(updated);
                  }}
                  className="uppercase"
                  data-testid={`input-labour-contractor-${idx}`}
                />
              </div>
              <div className="flex items-end">
                <Button 
                  size="icon" 
                  variant="ghost" 
                  onClick={() => removeRow('labour', idx)}
                  disabled={labour.length === 1}
                  data-testid={`button-remove-labour-${idx}`}
                >
                  <Trash2 className="w-4 h-4 text-destructive" />
                </Button>
              </div>
            </div>
          ))}
          <Button size="sm" variant="outline" className="w-full border-dashed" onClick={() => addRow('labour')} data-testid="button-add-labour-bottom">
            <Plus className="w-4 h-4 mr-1" /> Add Row
          </Button>
        </CardContent>
      </Card>

      {/* Site Purchases */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle className="text-teal-600">Site Purchases</CardTitle>
          <Button size="sm" variant="outline" onClick={addSitePurchase} data-testid="button-add-site-purchase-top">
            <Plus className="w-4 h-4 mr-1" /> Add
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {sitePurchases.length === 0 ? (
            <p className="text-muted-foreground text-sm text-center py-4">No site purchases added.</p>
          ) : (
            sitePurchases.map((sp, idx) => (
              <div key={idx} className="grid grid-cols-1 md:grid-cols-7 gap-3 items-end p-4 bg-muted/30 rounded-lg relative">
                <Button size="icon" variant="ghost" className="absolute right-0 top-0 text-muted-foreground hover:text-destructive" onClick={() => removeSitePurchase(idx)} data-testid={`button-remove-site-purchase-${idx}`}>
                  <Trash2 className="w-4 h-4" />
                </Button>
                <div className="md:col-span-2">
                  <Label>Item Description</Label>
                  <Input placeholder="e.g. Diesel for cleaning" value={sp.itemDescription} onChange={e => updateSitePurchase(idx, 'itemDescription', e.target.value.toUpperCase())} className="uppercase" data-testid={`input-site-purchase-item-${idx}`} />
                </div>
                <div>
                  <Label>Vendor</Label>
                  <Input placeholder="e.g. Local Fuel Station" value={sp.vendor} onChange={e => updateSitePurchase(idx, 'vendor', e.target.value.toUpperCase())} className="uppercase" data-testid={`input-site-purchase-vendor-${idx}`} />
                </div>
                <div>
                  <Label>Bill No</Label>
                  <Input placeholder="e.g. INV-001" value={sp.billNo} onChange={e => updateSitePurchase(idx, 'billNo', e.target.value.toUpperCase())} className="uppercase" data-testid={`input-site-purchase-bill-${idx}`} />
                </div>
                <div>
                  <Label>Amount</Label>
                  <Input type="number" step="0.01" placeholder="0.00" value={sp.amount ?? ''} onChange={e => updateSitePurchase(idx, 'amount', e.target.value ? parseFloat(e.target.value) : null)} data-testid={`input-site-purchase-amount-${idx}`} />
                </div>
                <div>
                  <Label>Qty</Label>
                  <Input type="number" step="0.01" placeholder="0" value={sp.quantity ?? ''} onChange={e => updateSitePurchase(idx, 'quantity', e.target.value ? parseFloat(e.target.value) : null)} data-testid={`input-site-purchase-qty-${idx}`} />
                </div>
                <div>
                  <Label>UOM</Label>
                  <Input placeholder="Litres/Nos" value={sp.uom} onChange={e => updateSitePurchase(idx, 'uom', e.target.value.toUpperCase())} className="uppercase" data-testid={`input-site-purchase-uom-${idx}`} />
                </div>
              </div>
            ))
          )}
          {sitePurchases.length > 0 && (
            <Button variant="outline" className="w-full border-dashed" onClick={addSitePurchase} data-testid="button-add-site-purchase-bottom">
              <Plus className="w-4 h-4 mr-1" /> Add Site Purchase
            </Button>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-end gap-4 pt-4">
        <Button variant="outline" onClick={() => setLocation(backToReport)} data-testid="button-cancel">
          Cancel
        </Button>
        <Button onClick={handleSave} disabled={updateMutation.isPending} className="gap-2" data-testid="button-save-bottom">
          {updateMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save Changes
        </Button>
      </div>

      {showAddPersonnelPin && (
        <PinAuth
          targetRole="any"
          onSuccess={() => {
            setShowAddPersonnelPin(false);
            setAddPersonnelOpen(true);
          }}
          onClose={() => setShowAddPersonnelPin(false)}
        />
      )}

      <Dialog open={addPersonnelOpen} onOpenChange={setAddPersonnelOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Add New Personnel</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Name</Label>
              <Input
                value={newPersonnelName}
                onChange={(e) => setNewPersonnelName(e.target.value.toUpperCase())}
                placeholder="Full name"
                className="uppercase"
                data-testid="input-new-personnel-name"
              />
            </div>
            <div>
              <Label>Role</Label>
              <Select value={newPersonnelRole} onValueChange={setNewPersonnelRole}>
                <SelectTrigger data-testid="select-new-personnel-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PERSONNEL_ROLES.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Phone (optional)</Label>
              <Input
                value={newPersonnelPhone}
                onChange={(e) => setNewPersonnelPhone(e.target.value.toUpperCase())}
                placeholder="Phone number"
                className="uppercase"
                data-testid="input-new-personnel-phone"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddPersonnelOpen(false)}>Cancel</Button>
            <Button
              disabled={!newPersonnelName.trim() || createPersonnelMutation.isPending}
              onClick={() => createPersonnelMutation.mutate({
                name: newPersonnelName.trim(),
                role: newPersonnelRole,
                phone: newPersonnelPhone.trim() || undefined,
              })}
              data-testid="button-save-new-personnel"
            >
              {createPersonnelMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
