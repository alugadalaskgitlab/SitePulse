import { useState } from "react";
import { useLocation } from "wouter";
import { ChevronLeft, Plus, Trash2, Eye, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { format } from "date-fns";
import SitePreview from "@/pages/SitePreview";

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
}

interface EquipmentEntry {
  machine: string;
  operator: string;
  task: string;
  startTime: string;
  endTime: string;
  diesel: number | null;
}

interface LabourEntry {
  category: string;
  gender: string;
  count: number;
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

const SIDE_OPTIONS = ["LHS", "RHS", "Full Width"];
const UOM_OPTIONS = ["SQM", "CUM", "RMT", "MT", "NOS"];
const LABOUR_CATEGORIES = ["Skilled", "Semi-Skilled", "Unskilled"];

const GENDER_OPTIONS = ["Male", "Female"];
const MATERIAL_OPTIONS = ["WMM", "GSB", "6MM", "10MM", "20MM", "40MM", "Dust", "Water", "Diesel", "Bitumen", "Emulsion", "DBM Mix", "BC Mix", "Cement", "Soil"];
const MATERIAL_UOM = ["Tons", "Liters", "Bags", "Trips", "CFT"];
const MATERIAL_TYPE_OPTIONS = ["Received", "Issued", "Consumed"];

// Helper to parse chainage like "0+500" or "1+250" or decimal km like "5.2" into meters
function parseChainageToMeters(chainage: string): number | null {
  if (!chainage) return null;
  const match = chainage.match(/^(\d+)\+(\d+)$/);
  if (match) {
    const km = parseInt(match[1], 10);
    const m = parseInt(match[2], 10);
    return km * 1000 + m;
  }
  // Try parsing as decimal kilometers (e.g., "5.2" = 5.2 km = 5200 meters)
  const num = parseFloat(chainage);
  return isNaN(num) ? null : num * 1000;
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

export default function SiteEntry() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [showPreview, setShowPreview] = useState(false);

  const [header, setHeader] = useState({
    date: format(new Date(), "yyyy-MM-dd"),
    site: "",
    engineer: "",
  });

  const [progress, setProgress] = useState<ProgressEntry[]>([
    { activity: "", side: "", chainageFrom: "", chainageTo: "", length: null, width: null, thickness: null, quantity: null, uom: "SQM" }
  ]);

  const [equipment, setEquipment] = useState<EquipmentEntry[]>([
    { machine: "", operator: "", task: "", startTime: "", endTime: "", diesel: null }
  ]);

  const [labour, setLabour] = useState<LabourEntry[]>([
    { category: "Skilled", gender: "Male", count: 0 }
  ]);

  const [materials, setMaterials] = useState<MaterialEntry[]>([
    { type: "Received", material: "", quantity: null, uom: "Tons", vehicleNumber: "", supplier: "", location: "", receiptNumber: "" }
  ]);

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

  const calculateHours = (startTime: string, endTime: string): number => {
    if (!startTime || !endTime) return 0;
    try {
      const [startHour, startMin] = startTime.split(':').map(Number);
      const [endHour, endMin] = endTime.split(':').map(Number);
      const startMins = startHour * 60 + startMin;
      const endMins = endHour * 60 + endMin;
      const diff = endMins - startMins;
      return diff > 0 ? diff / 60 : 0;
    } catch {
      return 0;
    }
  };

  const getTotalDiesel = (): number => {
    return equipment.reduce((sum, e) => sum + (e.diesel || 0), 0);
  };

  const getMaterialsAbstract = () => {
    const grouped: Record<string, { material: string; uom: string; trips: number; total: number }> = {};
    materials.forEach(m => {
      if (!m.material) return;
      const key = `${m.material}|${m.uom}`;
      if (!grouped[key]) {
        grouped[key] = { material: m.material, uom: m.uom, trips: 0, total: 0 };
      }
      grouped[key].trips += 1;
      grouped[key].total += m.quantity || 0;
    });
    return Object.values(grouped);
  };

  const addRow = (section: 'progress' | 'equipment' | 'labour' | 'materials') => {
    if (section === 'progress') {
      setProgress([...progress, { activity: "", side: "", chainageFrom: "", chainageTo: "", length: null, width: null, thickness: null, quantity: null, uom: "SQM" }]);
    } else if (section === 'equipment') {
      setEquipment([...equipment, { machine: "", operator: "", task: "", startTime: "", endTime: "", diesel: null }]);
    } else if (section === 'labour') {
      setLabour([...labour, { category: "Skilled", gender: "Male", count: 0 }]);
    } else if (section === 'materials') {
      setMaterials([...materials, { type: "Received", material: "", quantity: null, uom: "Tons", vehicleNumber: "", supplier: "", location: "", receiptNumber: "" }]);
    }
  };

  const removeRow = (section: 'progress' | 'equipment' | 'labour' | 'materials', index: number) => {
    if (section === 'progress' && progress.length > 1) {
      setProgress(progress.filter((_, i) => i !== index));
    } else if (section === 'equipment' && equipment.length > 1) {
      setEquipment(equipment.filter((_, i) => i !== index));
    } else if (section === 'labour' && labour.length > 1) {
      setLabour(labour.filter((_, i) => i !== index));
    } else if (section === 'materials' && materials.length > 1) {
      setMaterials(materials.filter((_, i) => i !== index));
    }
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      const progressWithCalc = progress.map(p => {
        const effectiveLength = getEffectiveLength(p);
        return {
          ...p,
          length: effectiveLength,
          quantity: p.quantity || calculateQuantity(p)
        };
      });

      // Send client's local timestamp for accurate time display
      const clientTimestamp = format(new Date(), "yyyy-MM-dd HH:mm:ss");

      const response = await apiRequest("POST", "/api/dprs", {
        date: header.date,
        site: header.site,
        engineer: header.engineer,
        role: "engineer",
        progress: progressWithCalc,
        equipment,
        labour,
        materials,
        clientTimestamp,
      });
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/dprs"] });
      toast({
        title: "Report Saved Successfully",
        description: "Your site report has been submitted.",
      });
      setLocation(`/site/success/${data.id}`);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to save report. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handlePreview = () => {
    if (!header.site || !header.engineer) {
      toast({
        title: "Missing Information",
        description: "Please fill in site name and engineer name.",
        variant: "destructive",
      });
      return;
    }
    setShowPreview(true);
  };

  const handleSubmit = () => {
    createMutation.mutate();
  };

  const getPreviewData = () => {
    return {
      date: header.date,
      site: header.site,
      engineer: header.engineer,
      progress: progress.map(p => {
        const effectiveLength = getEffectiveLength(p);
        return {
          ...p,
          length: effectiveLength,
          quantity: p.quantity || calculateQuantity(p)
        };
      }),
      equipment,
      labour,
      materials,
      totalDiesel: getTotalDiesel(),
      materialsAbstract: getMaterialsAbstract(),
    };
  };

  if (showPreview) {
    return (
      <SitePreview
        data={getPreviewData()}
        onBack={() => setShowPreview(false)}
        onSubmit={handleSubmit}
        isSubmitting={createMutation.isPending}
      />
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-20">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => setLocation("/site")} data-testid="button-back">
          <ChevronLeft className="w-5 h-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold font-display">New Site Report</h1>
          <p className="text-muted-foreground text-sm">Fill in the daily progress details</p>
        </div>
      </div>

      {/* Header Section */}
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
            <Input
              placeholder="Enter site name"
              value={header.site}
              onChange={(e) => setHeader({ ...header, site: e.target.value })}
              className="uppercase"
              data-testid="input-site"
            />
          </div>
          <div>
            <Label>Engineer Name</Label>
            <Input
              placeholder="Enter engineer name"
              value={header.engineer}
              onChange={(e) => setHeader({ ...header, engineer: e.target.value })}
              className="uppercase"
              data-testid="input-engineer"
            />
          </div>
        </CardContent>
      </Card>

      {/* Activity Progress */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle>Activity Progress</CardTitle>
          <Button size="sm" variant="outline" onClick={() => addRow('progress')} data-testid="button-add-progress">
            <Plus className="w-4 h-4 mr-1" /> Add Row
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {progress.map((entry, idx) => (
            <div key={idx} className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3 p-4 border rounded-lg bg-muted/30">
              <div className="col-span-2">
                <Label className="text-xs">Activity</Label>
                <Input
                  placeholder="Activity name"
                  value={entry.activity}
                  onChange={(e) => {
                    const updated = [...progress];
                    updated[idx].activity = e.target.value;
                    setProgress(updated);
                  }}
                  className="uppercase"
                  data-testid={`input-progress-activity-${idx}`}
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
                  <SelectTrigger data-testid={`select-progress-side-${idx}`}>
                    <SelectValue placeholder="Side" />
                  </SelectTrigger>
                  <SelectContent>
                    {SIDE_OPTIONS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">From (Ch.)</Label>
                <Input
                  placeholder="0+000"
                  value={entry.chainageFrom}
                  onChange={(e) => {
                    const updated = [...progress];
                    updated[idx].chainageFrom = e.target.value;
                    setProgress(updated);
                  }}
                  data-testid={`input-progress-from-${idx}`}
                />
              </div>
              <div>
                <Label className="text-xs">To (Ch.)</Label>
                <Input
                  placeholder="0+000"
                  value={entry.chainageTo}
                  onChange={(e) => {
                    const updated = [...progress];
                    updated[idx].chainageTo = e.target.value;
                    setProgress(updated);
                  }}
                  data-testid={`input-progress-to-${idx}`}
                />
              </div>
              <div>
                <Label className="text-xs">L (m)</Label>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="0"
                  value={entry.length ?? (calculateLengthFromChainage(entry.chainageFrom, entry.chainageTo)?.toFixed(0) ?? "")}
                  onChange={(e) => {
                    const updated = [...progress];
                    updated[idx].length = e.target.value ? parseFloat(e.target.value) : null;
                    setProgress(updated);
                  }}
                  data-testid={`input-progress-length-${idx}`}
                />
              </div>
              <div>
                <Label className="text-xs">W (m)</Label>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="0"
                  value={entry.width ?? ""}
                  onChange={(e) => {
                    const updated = [...progress];
                    updated[idx].width = e.target.value ? parseFloat(e.target.value) : null;
                    setProgress(updated);
                  }}
                  data-testid={`input-progress-width-${idx}`}
                />
              </div>
              <div>
                <Label className="text-xs">T (m)</Label>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="0"
                  value={entry.thickness ?? ""}
                  onChange={(e) => {
                    const updated = [...progress];
                    updated[idx].thickness = e.target.value ? parseFloat(e.target.value) : null;
                    setProgress(updated);
                  }}
                  data-testid={`input-progress-thickness-${idx}`}
                />
              </div>
              <div>
                <Label className="text-xs">UOM</Label>
                <Select
                  value={entry.uom}
                  onValueChange={(val) => {
                    const updated = [...progress];
                    updated[idx].uom = val;
                    setProgress(updated);
                  }}
                >
                  <SelectTrigger data-testid={`select-progress-uom-${idx}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {UOM_OPTIONS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Qty</Label>
                <Input
                  type="number"
                  step="0.01"
                  placeholder={calculateQuantity(entry)?.toFixed(2) || "Auto"}
                  value={entry.quantity ?? ""}
                  onChange={(e) => {
                    const updated = [...progress];
                    updated[idx].quantity = e.target.value ? parseFloat(e.target.value) : null;
                    setProgress(updated);
                  }}
                  data-testid={`input-progress-qty-${idx}`}
                />
              </div>
              <div className="flex items-end">
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
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Equipment Log */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle>Equipment Log</CardTitle>
          <Button size="sm" variant="outline" onClick={() => addRow('equipment')} data-testid="button-add-equipment">
            <Plus className="w-4 h-4 mr-1" /> Add Row
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {equipment.map((entry, idx) => (
            <div key={idx} className="grid grid-cols-2 md:grid-cols-7 gap-3 p-4 border rounded-lg bg-muted/30">
              <div>
                <Label className="text-xs">Machine</Label>
                <Input
                  placeholder="Machine name"
                  value={entry.machine}
                  onChange={(e) => {
                    const updated = [...equipment];
                    updated[idx].machine = e.target.value;
                    setEquipment(updated);
                  }}
                  className="uppercase"
                  data-testid={`input-equipment-machine-${idx}`}
                />
              </div>
              <div>
                <Label className="text-xs">Operator</Label>
                <Input
                  placeholder="Operator name"
                  value={entry.operator}
                  onChange={(e) => {
                    const updated = [...equipment];
                    updated[idx].operator = e.target.value;
                    setEquipment(updated);
                  }}
                  className="uppercase"
                  data-testid={`input-equipment-operator-${idx}`}
                />
              </div>
              <div>
                <Label className="text-xs">Task</Label>
                <Input
                  placeholder="Task performed"
                  value={entry.task}
                  onChange={(e) => {
                    const updated = [...equipment];
                    updated[idx].task = e.target.value;
                    setEquipment(updated);
                  }}
                  className="uppercase"
                  data-testid={`input-equipment-task-${idx}`}
                />
              </div>
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
                <Label className="text-xs">Hours</Label>
                <Input
                  type="text"
                  readOnly
                  value={calculateHours(entry.startTime, entry.endTime) > 0 ? calculateHours(entry.startTime, entry.endTime).toFixed(2) : "-"}
                  className="bg-muted"
                  data-testid={`input-equipment-hours-${idx}`}
                />
              </div>
              <div className="flex gap-2">
                <div className="flex-1">
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
                <div className="flex items-end">
                  <Button 
                    size="icon" 
                    variant="ghost" 
                    onClick={() => removeRow('equipment', idx)}
                    disabled={equipment.length === 1}
                    data-testid={`button-remove-equipment-${idx}`}
                  >
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
          <div className="p-4 bg-primary/5 border border-primary/20 rounded-lg">
            <p className="text-sm text-muted-foreground">Total Diesel</p>
            <p className="text-2xl font-bold text-primary">{getTotalDiesel().toFixed(1)} L</p>
          </div>
        </CardContent>
      </Card>

      {/* Labour Strength */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle>Labour Strength</CardTitle>
          <Button size="sm" variant="outline" onClick={() => addRow('labour')} data-testid="button-add-labour">
            <Plus className="w-4 h-4 mr-1" /> Add Row
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {labour.map((entry, idx) => (
            <div key={idx} className="grid grid-cols-3 md:grid-cols-4 gap-3 p-4 border rounded-lg bg-muted/30">
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
        </CardContent>
      </Card>

      {/* Materials Log */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle>Materials Log</CardTitle>
          <Button size="sm" variant="outline" onClick={() => addRow('materials')} data-testid="button-add-materials">
            <Plus className="w-4 h-4 mr-1" /> Add Row
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {materials.map((entry, idx) => (
            <div key={idx} className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3 p-4 border rounded-lg bg-muted/30">
              <div>
                <Label className="text-xs">Type</Label>
                <Select
                  value={entry.type}
                  onValueChange={(val) => {
                    const updated = [...materials];
                    updated[idx].type = val;
                    setMaterials(updated);
                  }}
                >
                  <SelectTrigger data-testid={`select-material-type-${idx}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MATERIAL_TYPE_OPTIONS.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Material</Label>
                <Select
                  value={entry.material}
                  onValueChange={(val) => {
                    const updated = [...materials];
                    updated[idx].material = val;
                    setMaterials(updated);
                  }}
                >
                  <SelectTrigger data-testid={`select-material-name-${idx}`}>
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    {MATERIAL_OPTIONS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Quantity</Label>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="0"
                  value={entry.quantity ?? ""}
                  onChange={(e) => {
                    const updated = [...materials];
                    updated[idx].quantity = e.target.value ? parseFloat(e.target.value) : null;
                    setMaterials(updated);
                  }}
                  data-testid={`input-material-qty-${idx}`}
                />
              </div>
              <div>
                <Label className="text-xs">UOM</Label>
                <Select
                  value={entry.uom}
                  onValueChange={(val) => {
                    const updated = [...materials];
                    updated[idx].uom = val;
                    setMaterials(updated);
                  }}
                >
                  <SelectTrigger data-testid={`select-material-uom-${idx}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MATERIAL_UOM.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Vehicle No.</Label>
                <Input
                  placeholder="KA-XX-XXXX"
                  value={entry.vehicleNumber}
                  onChange={(e) => {
                    const updated = [...materials];
                    updated[idx].vehicleNumber = e.target.value;
                    setMaterials(updated);
                  }}
                  className="uppercase"
                  data-testid={`input-material-vehicle-${idx}`}
                />
              </div>
              <div>
                <Label className="text-xs">Supplier</Label>
                <Input
                  placeholder="Supplier"
                  value={entry.supplier}
                  onChange={(e) => {
                    const updated = [...materials];
                    updated[idx].supplier = e.target.value;
                    setMaterials(updated);
                  }}
                  className="uppercase"
                  data-testid={`input-material-supplier-${idx}`}
                />
              </div>
              <div>
                <Label className="text-xs">Location/Task</Label>
                <Input
                  placeholder="Unloading location"
                  value={entry.location}
                  onChange={(e) => {
                    const updated = [...materials];
                    updated[idx].location = e.target.value;
                    setMaterials(updated);
                  }}
                  className="uppercase"
                  data-testid={`input-material-location-${idx}`}
                />
              </div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <Label className="text-xs">Receipt No.</Label>
                  <Input
                    placeholder="Receipt number"
                    value={entry.receiptNumber}
                    onChange={(e) => {
                      const updated = [...materials];
                      updated[idx].receiptNumber = e.target.value;
                      setMaterials(updated);
                    }}
                    data-testid={`input-material-receipt-${idx}`}
                  />
                </div>
                <div className="flex items-end">
                  <Button 
                    size="icon" 
                    variant="ghost" 
                    onClick={() => removeRow('materials', idx)}
                    disabled={materials.length === 1}
                    data-testid={`button-remove-material-${idx}`}
                  >
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Action Buttons */}
      <div className="flex justify-end gap-4 pt-4">
        <Button variant="outline" onClick={() => setLocation("/site")} data-testid="button-cancel">
          Cancel
        </Button>
        <Button onClick={handlePreview} className="gap-2" data-testid="button-preview">
          <Eye className="w-4 h-4" />
          Preview Report
        </Button>
      </div>
    </div>
  );
}
