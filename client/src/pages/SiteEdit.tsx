import { useState, useEffect } from "react";
import { useLocation, useRoute } from "wouter";
import { ChevronLeft, Plus, Trash2, Save, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { format } from "date-fns";
import { useDpr } from "@/hooks/use-dprs";

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
}

const SIDE_OPTIONS = ["LHS", "RHS", "Full Width"];
const UOM_OPTIONS = ["SQM", "CUM", "RMT", "MT", "NOS"];
const LABOUR_CATEGORIES = ["Skilled", "Semi-Skilled", "Unskilled"];
const GENDER_OPTIONS = ["Male", "Female"];
const MATERIAL_OPTIONS = ["WMM", "GSB", "6MM", "10MM", "20MM", "40MM", "Dust", "Water", "Diesel", "Bitumen", "Emulsion", "DBM Mix", "BC Mix", "Cement"];
const MATERIAL_UOM = ["Tons", "Liters", "Bags", "Trips", "CFT"];
const MATERIAL_TYPE_OPTIONS = ["Received", "Issued", "Consumed"];

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
  const id = parseInt(params?.id || "0");

  // Get PIN and role from sessionStorage once and store in state (set by SiteReport before navigating)
  const [pin] = useState(() => {
    const storedPin = sessionStorage.getItem(`edit_pin_${id}`) || "";
    // Clear from sessionStorage immediately after reading for security
    sessionStorage.removeItem(`edit_pin_${id}`);
    return storedPin;
  });
  
  const [role] = useState<"manager" | "admin">(() => {
    const storedRole = sessionStorage.getItem(`auth_role_${id}`) || "manager";
    sessionStorage.removeItem(`auth_role_${id}`);
    return storedRole as "manager" | "admin";
  });

  const { data: dpr, isLoading } = useDpr(id);

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
    { type: "Received", material: "", quantity: null, uom: "Tons", vehicleNumber: "", supplier: "", location: "" }
  ]);

  useEffect(() => {
    if (dpr) {
      setHeader({
        date: dpr.date,
        site: dpr.site,
        engineer: dpr.engineer,
      });

      if (dpr.progress?.length) {
        setProgress(dpr.progress.map(p => ({
          activity: p.activity || "",
          side: p.side || "",
          chainageFrom: p.chainageFrom || "",
          chainageTo: p.chainageTo || "",
          length: p.length,
          width: p.width,
          thickness: p.thickness,
          quantity: p.quantity,
          uom: p.uom || "SQM",
        })));
      }

      if (dpr.equipment?.length) {
        setEquipment(dpr.equipment.map(e => ({
          machine: e.machine || "",
          operator: e.operator || "",
          task: e.task || "",
          startTime: e.startTime || "",
          endTime: e.endTime || "",
          diesel: e.diesel,
        })));
      }

      if (dpr.labour?.length) {
        setLabour(dpr.labour.map(l => ({
          category: l.category || "Skilled",
          gender: l.gender || "Male",
          count: l.count,
        })));
      }

      if (dpr.materials?.length) {
        setMaterials(dpr.materials.map(m => ({
          type: m.type || "Received",
          material: m.material || "",
          quantity: m.quantity,
          uom: m.uom || "Tons",
          vehicleNumber: m.vehicleNumber || "",
          supplier: m.supplier || "",
          location: m.location || "",
        })));
      }
    }
  }, [dpr]);

  const updateMutation = useMutation({
    mutationFn: async (data: any) => {
      // Create a new version instead of overwriting original
      const response = await apiRequest("POST", `/api/dprs/${id}/version`, { 
        pin, 
        editedBy: role,
        data 
      });
      return response.json();
    },
    onSuccess: (newVersion) => {
      queryClient.invalidateQueries({ queryKey: ["/api/dprs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dprs", id] });
      toast({
        title: "New Version Created",
        description: "Your edited version has been saved successfully.",
      });
      // Redirect to the new version's report
      setLocation(`/site/report/${newVersion.id}`);
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

  const getTotalDiesel = (): number => {
    return equipment.reduce((sum, e) => sum + (e.diesel || 0), 0);
  };

  const addRow = (section: 'progress' | 'equipment' | 'labour' | 'materials') => {
    if (section === 'progress') {
      setProgress([...progress, { activity: "", side: "", chainageFrom: "", chainageTo: "", length: null, width: null, thickness: null, quantity: null, uom: "SQM" }]);
    } else if (section === 'equipment') {
      setEquipment([...equipment, { machine: "", operator: "", task: "", startTime: "", endTime: "", diesel: null }]);
    } else if (section === 'labour') {
      setLabour([...labour, { category: "Skilled", gender: "Male", count: 0 }]);
    } else if (section === 'materials') {
      setMaterials([...materials, { type: "Received", material: "", quantity: null, uom: "Tons", vehicleNumber: "", supplier: "", location: "" }]);
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
      equipment: equipment.filter(e => e.machine),
      labour: labour.filter(l => l.count > 0),
      materials: materials.filter(m => m.material).map(m => ({
        type: m.type,
        material: m.material,
        quantity: m.quantity,
        uom: m.uom,
        vehicleNumber: m.vehicleNumber || undefined,
        supplier: m.supplier || undefined,
        location: m.location || undefined,
      })),
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
        <Button onClick={() => setLocation(`/site/report/${id}`)} data-testid="button-back-to-report">
          Back to Report
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-20 animate-in fade-in duration-300">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => setLocation(`/site/report/${id}`)} data-testid="button-back">
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
            <Input
              placeholder="Site name"
              value={header.site}
              onChange={(e) => setHeader({ ...header, site: e.target.value })}
              data-testid="input-site"
            />
          </div>
          <div>
            <Label>Engineer</Label>
            <Input
              placeholder="Engineer name"
              value={header.engineer}
              onChange={(e) => setHeader({ ...header, engineer: e.target.value })}
              data-testid="input-engineer"
            />
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
            <div key={idx} className="grid grid-cols-2 md:grid-cols-5 gap-3 p-4 border rounded-lg bg-muted/30">
              <div className="col-span-2">
                <Label className="text-xs">Activity</Label>
                <Input
                  placeholder="Activity description"
                  value={entry.activity}
                  onChange={(e) => {
                    const updated = [...progress];
                    updated[idx].activity = e.target.value;
                    setProgress(updated);
                  }}
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
                    updated[idx].chainageFrom = e.target.value;
                    setProgress(updated);
                  }}
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
                    updated[idx].chainageTo = e.target.value;
                    setProgress(updated);
                  }}
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

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle>Equipment Log</CardTitle>
          <Button size="sm" variant="outline" onClick={() => addRow('equipment')} data-testid="button-add-equipment">
            <Plus className="w-4 h-4 mr-1" /> Add Row
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {equipment.map((entry, idx) => (
            <div key={idx} className="grid grid-cols-2 md:grid-cols-4 gap-3 p-4 border rounded-lg bg-muted/30">
              <div>
                <Label className="text-xs">Machine</Label>
                <Input
                  placeholder="Equipment name"
                  value={entry.machine}
                  onChange={(e) => {
                    const updated = [...equipment];
                    updated[idx].machine = e.target.value;
                    setEquipment(updated);
                  }}
                  data-testid={`input-machine-${idx}`}
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
                    updated[idx].task = e.target.value;
                    setEquipment(updated);
                  }}
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
                  data-testid={`input-material-supplier-${idx}`}
                />
              </div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <Label className="text-xs">Location/Task</Label>
                  <Input
                    placeholder="Unloading location"
                    value={entry.location}
                    onChange={(e) => {
                      const updated = [...materials];
                      updated[idx].location = e.target.value;
                      setMaterials(updated);
                    }}
                    data-testid={`input-material-location-${idx}`}
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

      <div className="flex justify-end gap-4 pt-4">
        <Button variant="outline" onClick={() => setLocation(`/site/report/${id}`)} data-testid="button-cancel">
          Cancel
        </Button>
        <Button onClick={handleSave} disabled={updateMutation.isPending} className="gap-2" data-testid="button-save-bottom">
          {updateMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save Changes
        </Button>
      </div>
    </div>
  );
}
