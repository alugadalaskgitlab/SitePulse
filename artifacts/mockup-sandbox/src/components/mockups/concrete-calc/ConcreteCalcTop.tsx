import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Slider } from "@/components/ui/slider";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle, Plus, Trash2, ChevronRight } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";

type EquipMode = "own" | "hired";
interface Equipment {
  id: number;
  type: string;
  model: string;
  mode: EquipMode;
  capacity: string;
  rate: string;
  rateUnit: string;
  output: string;
}

const EQUIP_TYPES: Record<string, { models: string[]; units: string }> = {
  "Self-Loading Mixer": { models: ["Ajax Fiori 1.0 m³", "Ajax Fiori 2.0 m³", "SCHWING 1.5 m³", "Generic 1 m³"], units: "₹/hr" },
  "Drum Mixer": { models: ["0.2 m³ (RM200)", "0.4 m³ (RM400)", "Tilting 0.5 m³"], units: "₹/hr" },
  "Transit Mixer": { models: ["6 m³", "7 m³", "8 m³"], units: "₹/trip" },
  "Batching Plant (Hired)": { models: ["Pan Mixer 15 m³/hr", "Twin Shaft 30 m³/hr"], units: "₹/m³" },
  "RMC Supply": { models: ["Ready Mixed Concrete (delivered)"], units: "₹/m³" },
};

const defaultEquipment: Equipment[] = [
  { id: 1, type: "Self-Loading Mixer", model: "Ajax Fiori 2.0 m³", mode: "own", capacity: "2", rate: "850", rateUnit: "₹/hr", output: "6" },
  { id: 2, type: "Self-Loading Mixer", model: "Ajax Fiori 1.0 m³", mode: "hired", capacity: "1", rate: "650", rateUnit: "₹/hr", output: "3" },
];

const COARSE_SIZES = ["20mm", "10mm", "6mm"] as const;
type CoarseSize = typeof COARSE_SIZES[number];

const defaultCoarse: Record<CoarseSize, { qty: string; rate: string; lead: string; freight: string; payload: string }> = {
  "20mm": { qty: "850", rate: "1200", lead: "28", freight: "9", payload: "16" },
  "10mm": { qty: "120", rate: "1350", lead: "28", freight: "9", payload: "16" },
  "6mm": { qty: "50", rate: "1400", lead: "28", freight: "9", payload: "16" },
};

type SandType = "natural" | "robo";

export default function ConcreteCalcTop() {
  const [bulkage, setBulkage] = useState([25]);
  const [sandType, setSandType] = useState<SandType>("natural");
  const [activeCoarse, setActiveCoarse] = useState<CoarseSize>("20mm");
  const [equipment, setEquipment] = useState<Equipment[]>(defaultEquipment);
  const [nextId, setNextId] = useState(3);

  const addEquipment = () => {
    setEquipment(prev => [...prev, {
      id: nextId, type: "Self-Loading Mixer", model: "Ajax Fiori 1.0 m³",
      mode: "hired", capacity: "1", rate: "600", rateUnit: "₹/hr", output: "3"
    }]);
    setNextId(n => n + 1);
  };
  const removeEquipment = (id: number) => setEquipment(prev => prev.filter(e => e.id !== id));
  const updateEquipment = (id: number, field: keyof Equipment, value: string) =>
    setEquipment(prev => prev.map(e => e.id === id ? { ...e, [field]: value } : e));

  const totalOutputM3hr = equipment.reduce((sum, e) => sum + (parseFloat(e.output) || 0), 0);

  const derived = {
    cement: { bags: 7.6, costPerM3: 3192 },
    coarse: { freightPerMT: 31.5, landedRate: 1231.5, costPerM3: 1256 },
    fine: sandType === "natural"
      ? { landedRate: 900.75, effectiveCost: 778, note: `With ${bulkage[0]}% bulkage, need 0.863 m³ loose vs 0.690 m³ dry. Extra: ₹${Math.round(bulkage[0] * 3.7)}/m³` }
      : { landedRate: 1050, effectiveCost: 882, note: "Robosand / Manufactured Sand — no bulkage correction needed. Consistent grading." },
    admixture: { dosage: 5.7, costPerM3: 1026 },
  };

  return (
    <div className="bg-slate-50 min-h-screen p-4 md:p-6 font-sans text-slate-900">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Concrete Rate Analysis</h1>
            <p className="text-slate-500 text-sm">M25 RCC / Covered RCC Drain — NH-48 Km 12–18</p>
          </div>
          <Badge className="bg-amber-100 text-amber-800 border-amber-200">Draft</Badge>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <div className="lg:col-span-8 space-y-5">

            {/* ① Project Info */}
            <Card className="border-l-4 border-l-amber-600 shadow-sm">
              <CardHeader className="pb-3 flex flex-row items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center font-bold shrink-0">①</div>
                <CardTitle className="text-base">Project Info</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1"><Label className="text-xs">Project Name</Label><Input defaultValue="NH-48 Storm Drain Works — Km 12 to 18" className="bg-slate-50 text-sm" /></div>
                <div className="space-y-1"><Label className="text-xs">Prepared By</Label><Input defaultValue="RK Mehta" className="bg-slate-50 text-sm" /></div>
                <div className="space-y-1"><Label className="text-xs">Date</Label><Input type="date" className="bg-slate-50 text-sm" /></div>
                <div className="space-y-1">
                  <Label className="text-xs">Structure Type</Label>
                  <Select defaultValue="covered-rcc">
                    <SelectTrigger className="bg-slate-50 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="covered-rcc">Covered RCC Drain</SelectItem>
                      <SelectItem value="open-drain">Open Drain</SelectItem>
                      <SelectItem value="box-culvert">Box Culvert</SelectItem>
                      <SelectItem value="bridge-pier">Bridge Pier & Abutment</SelectItem>
                      <SelectItem value="bridge-deck">Bridge Deck Slab</SelectItem>
                      <SelectItem value="retaining-wall">Retaining Wall</SelectItem>
                      <SelectItem value="footing-isolated">Isolated Footing</SelectItem>
                      <SelectItem value="footing-raft">Raft Foundation</SelectItem>
                      <SelectItem value="general-rcc">General RCC</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            {/* ② Concrete Grade & Mix Design */}
            <Card className="border-l-4 border-l-amber-600 shadow-sm">
              <CardHeader className="pb-3 flex flex-row items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center font-bold shrink-0">②</div>
                <CardTitle className="text-base">Concrete Grade & Mix Design</CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                <div>
                  <Label className="text-xs mb-2 block">Select Grade</Label>
                  <div className="flex flex-wrap gap-2">
                    {['M10', 'M15', 'M20', 'M25', 'M30', 'M35', 'M40'].map(g => (
                      <Badge key={g} variant="outline" className={`px-3 py-1 text-sm cursor-pointer ${g === 'M25' ? 'bg-amber-600 text-white border-amber-600' : 'bg-white hover:bg-slate-100 text-slate-600'}`}>{g}</Badge>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="flex justify-between items-end mb-2">
                    <Label className="text-xs">Mix Proportions</Label>
                    <span className="text-xs text-slate-400 italic">IS:10262-2019. Edit to match approved design.</span>
                  </div>
                  <div className="border rounded-md overflow-hidden">
                    <Table>
                      <TableHeader className="bg-slate-50">
                        <TableRow>
                          <TableHead className="text-xs">Component</TableHead>
                          <TableHead className="text-xs w-28">Per m³</TableHead>
                          <TableHead className="text-xs">Unit</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody className="text-sm">
                        <TableRow><TableCell>Cement (OPC 53)</TableCell><TableCell><Input defaultValue="380" className="h-8 w-24 text-right text-sm" /></TableCell><TableCell className="text-slate-500">kg/m³</TableCell></TableRow>
                        <TableRow><TableCell>Coarse Agg (total)</TableCell><TableCell><Input defaultValue="1020" className="h-8 w-24 text-right text-sm" /></TableCell><TableCell className="text-slate-500">kg/m³</TableCell></TableRow>
                        <TableRow><TableCell>Fine Agg / Sand</TableCell><TableCell><Input defaultValue="690" className="h-8 w-24 text-right text-sm" /></TableCell><TableCell className="text-slate-500">kg/m³</TableCell></TableRow>
                        <TableRow><TableCell>Water</TableCell><TableCell><Input defaultValue="172" className="h-8 w-24 text-right text-sm" /></TableCell><TableCell className="text-slate-500">litre/m³</TableCell></TableRow>
                        <TableRow><TableCell>Admixture</TableCell><TableCell><Input defaultValue="1.5" className="h-8 w-24 text-right text-sm" /></TableCell><TableCell className="text-slate-500">% of cement</TableCell></TableRow>
                      </TableBody>
                    </Table>
                  </div>
                </div>
                <div className="flex gap-4 p-3 bg-amber-50 rounded-lg border border-amber-100 text-sm">
                  <div className="flex-1"><span className="text-amber-700 block text-xs">Density</span><span className="font-semibold text-amber-900">2450 kg/m³</span></div>
                  <Separator orientation="vertical" className="h-auto bg-amber-200" />
                  <div className="flex-1"><span className="text-amber-700 block text-xs">Cement bags</span><span className="font-semibold text-amber-900">7.6 bags/m³</span></div>
                  <Separator orientation="vertical" className="h-auto bg-amber-200" />
                  <div className="flex-1"><span className="text-amber-700 block text-xs">w/c ratio</span><span className="font-semibold text-amber-900">0.45</span></div>
                </div>
              </CardContent>
            </Card>

            {/* ③ Raw Materials */}
            <Card className="border-l-4 border-l-amber-600 shadow-sm">
              <CardHeader className="pb-3 flex flex-row items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center font-bold shrink-0">③</div>
                <CardTitle className="text-base">Raw Materials Rate</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">

                {/* Cement */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between border-b pb-1">
                    <h4 className="font-semibold text-sm text-slate-800">Cement</h4>
                    <span className="text-xs text-slate-400">7.6 bags/m³ × rate</span>
                  </div>
                  <div className="flex items-end gap-4">
                    <div className="space-y-1 flex-1 max-w-[180px]">
                      <Label className="text-xs">Price per bag (50 kg)</Label>
                      <div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">₹</span><Input defaultValue="420" className="pl-7 text-sm bg-slate-50" /></div>
                    </div>
                    <div className="pb-0.5 text-right">
                      <span className="text-xs text-slate-500 block">Cost per m³</span>
                      <span className="text-lg font-bold text-slate-900">₹{derived.cement.costPerM3.toLocaleString()}</span>
                    </div>
                  </div>
                </div>

                {/* Coarse Aggregate — Multi-Size */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between border-b pb-1">
                    <h4 className="font-semibold text-sm text-slate-800">Coarse Aggregate</h4>
                    <span className="text-xs text-slate-400">Define qty for each size used in the mix</span>
                  </div>
                  <div className="flex gap-1 bg-slate-100 p-1 rounded-md w-fit">
                    {COARSE_SIZES.map(sz => (
                      <button
                        key={sz}
                        onClick={() => setActiveCoarse(sz)}
                        className={`px-4 py-1.5 rounded text-sm font-medium transition-all ${activeCoarse === sz ? 'bg-white shadow text-slate-900 border border-slate-200' : 'text-slate-500 hover:text-slate-700'}`}
                      >{sz}</button>
                    ))}
                  </div>
                  <div className="p-3 border rounded-lg bg-slate-50 space-y-3">
                    <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                      <span className="font-medium text-slate-700">{activeCoarse} Stone</span>
                      <span>Edit quantity split in Mix Design (②) to match your grading</span>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs">Qty in mix design</Label>
                        <div className="relative">
                          <Input defaultValue={defaultCoarse[activeCoarse].qty} className="pr-12 text-sm bg-white" />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs">kg/m³</span>
                        </div>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Purchase Rate</Label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">₹</span>
                          <Input defaultValue={defaultCoarse[activeCoarse].rate} className="pl-7 text-sm bg-white" />
                        </div>
                        <span className="text-xs text-slate-400">/MT ex-quarry</span>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Lead Distance</Label>
                        <div className="relative">
                          <Input defaultValue={defaultCoarse[activeCoarse].lead} className="pr-8 text-sm bg-white" />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs">km</span>
                        </div>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Payload</Label>
                        <div className="relative">
                          <Input defaultValue={defaultCoarse[activeCoarse].payload} className="pr-8 text-sm bg-white" />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs">MT</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-3 p-2 bg-white rounded border text-xs">
                      <span className="text-slate-500">Freight/MT: <strong className="text-amber-700">₹31.50</strong></span>
                      <Separator orientation="vertical" className="h-auto" />
                      <span className="text-slate-500">Landed: <strong className="text-amber-700">₹1,231.50/MT</strong></span>
                      <Separator orientation="vertical" className="h-auto" />
                      <span className="text-slate-500 ml-auto">Cost/m³: <strong className="text-slate-900 text-sm">₹1,256</strong></span>
                    </div>
                  </div>
                  <div className="bg-slate-50 border rounded p-2 text-xs text-slate-500">
                    💡 If using a blended grading (e.g. 60% 20mm + 30% 10mm + 10% 6mm), set quantities in ② Mix Design and enter rates for each size above. Total coarse cost = sum of all size costs.
                  </div>
                </div>

                {/* Fine Aggregate — Sand Type Toggle */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between border-b pb-1">
                    <h4 className="font-semibold text-sm text-slate-800">Fine Aggregate</h4>
                    <div className="flex gap-1 bg-slate-100 p-0.5 rounded-md text-xs">
                      <button
                        onClick={() => setSandType("natural")}
                        className={`px-3 py-1 rounded font-medium transition-all ${sandType === "natural" ? "bg-white shadow text-slate-900 border border-slate-200" : "text-slate-500"}`}
                      >🏞 Natural River Sand</button>
                      <button
                        onClick={() => setSandType("robo")}
                        className={`px-3 py-1 rounded font-medium transition-all ${sandType === "robo" ? "bg-white shadow text-slate-900 border border-slate-200" : "text-slate-500"}`}
                      >🏭 Robosand / M-Sand</button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Purchase Rate</Label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">₹</span>
                        <Input defaultValue={sandType === "natural" ? "800" : "950"} className="pl-7 text-sm bg-slate-50" />
                      </div>
                      <span className="text-xs text-slate-400">/MT</span>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Lead Distance</Label>
                      <div className="relative">
                        <Input defaultValue="18" className="pr-8 text-sm bg-slate-50" />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs">km</span>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Freight Rate</Label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">₹</span>
                        <Input defaultValue="9" className="pl-7 text-sm bg-slate-50" />
                      </div>
                      <span className="text-xs text-slate-400">/km/load</span>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Payload</Label>
                      <div className="relative">
                        <Input defaultValue="16" className="pr-8 text-sm bg-slate-50" />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs">MT</span>
                      </div>
                    </div>
                  </div>

                  {sandType === "natural" ? (
                    <div className="p-4 border rounded-lg space-y-3 bg-amber-50/50">
                      <div className="flex justify-between items-center">
                        <div>
                          <Label className="text-sm font-medium">Sand Bulkage Factor</Label>
                          <p className="text-xs text-slate-500 mt-0.5">Natural river sand swells when moist — you'll physically receive more volume than your dry mix design quantity. Adjust this to your site conditions.</p>
                        </div>
                        <span className="text-xl font-bold text-amber-600 ml-4">{bulkage[0]}%</span>
                      </div>
                      <Slider defaultValue={[25]} max={40} step={1} className="py-2" onValueChange={setBulkage} />
                      <Alert className="bg-amber-50 border-amber-200 text-amber-800 py-2">
                        <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
                        <AlertDescription className="text-xs">
                          {derived.fine.note}
                        </AlertDescription>
                      </Alert>
                    </div>
                  ) : (
                    <div className="p-3 border rounded-lg bg-blue-50/50 border-blue-100">
                      <div className="flex items-start gap-2 text-xs text-blue-800">
                        <span className="text-blue-500 mt-0.5">ℹ</span>
                        <div>
                          <strong>No bulkage correction needed for Robosand / M-Sand.</strong><br />
                          Manufactured sand is dry-processed and has consistent particle shape. The mix design quantity is used as-is. However, check fineness modulus (FM 2.6–2.9) for workability.
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="flex gap-3 p-2 bg-slate-50 rounded border text-xs">
                    <span className="text-slate-500">Landed Rate: <strong className="text-slate-700">₹{derived.fine.landedRate}/MT</strong></span>
                    <Separator orientation="vertical" className="h-auto" />
                    <span className="text-slate-500 ml-auto">Effective Cost/m³: <strong className="text-slate-900 text-sm">₹{derived.fine.effectiveCost}</strong></span>
                  </div>
                </div>

                {/* Admixture */}
                <div className="space-y-2">
                  <h4 className="font-semibold text-sm text-slate-800 border-b pb-1">Admixture / Plasticiser</h4>
                  <div className="flex items-end gap-4">
                    <div className="space-y-1">
                      <Label className="text-xs">Type</Label>
                      <Select defaultValue="pcsp">
                        <SelectTrigger className="text-sm bg-slate-50 w-52"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pcsp">PCE Superplasticiser</SelectItem>
                          <SelectItem value="snf">SNF Plasticiser</SelectItem>
                          <SelectItem value="ret">Retarder</SelectItem>
                          <SelectItem value="acc">Accelerator</SelectItem>
                          <SelectItem value="none">None / Excluded</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Price per litre</Label>
                      <div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">₹</span><Input defaultValue="180" className="pl-7 text-sm bg-slate-50 w-28" /></div>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Dosage (litres/m³)</Label>
                      <Input defaultValue="5.7" className="text-sm bg-slate-50 w-24" readOnly />
                    </div>
                    <div className="pb-0.5 text-right ml-auto">
                      <span className="text-xs text-slate-500 block">Cost per m³</span>
                      <span className="text-lg font-bold text-slate-900">₹1,026</span>
                    </div>
                  </div>
                </div>

              </CardContent>
            </Card>

            {/* ④ Batching & Production Equipment */}
            <Card className="border-l-4 border-l-amber-600 shadow-sm">
              <CardHeader className="pb-2 flex flex-row items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center font-bold shrink-0">④</div>
                <div className="flex-1">
                  <CardTitle className="text-base">Batching & Production Equipment</CardTitle>
                  <p className="text-xs text-slate-500 mt-0.5">Add each machine being used for this job. Mixed equipment (e.g. two self-loaders + transit mixer) is supported.</p>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">

                <div className="overflow-x-auto rounded-lg border">
                  <Table>
                    <TableHeader className="bg-slate-50">
                      <TableRow>
                        <TableHead className="text-xs w-[180px]">Equipment Type</TableHead>
                        <TableHead className="text-xs w-[180px]">Model / Capacity</TableHead>
                        <TableHead className="text-xs">Mode</TableHead>
                        <TableHead className="text-xs w-[130px]">Rate</TableHead>
                        <TableHead className="text-xs w-[100px]">Output m³/hr</TableHead>
                        <TableHead className="text-xs text-right w-[100px]">₹/m³ derived</TableHead>
                        <TableHead className="w-8"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody className="text-sm">
                      {equipment.map((eq) => {
                        const rateNum = parseFloat(eq.rate) || 0;
                        const outputNum = parseFloat(eq.output) || 1;
                        const costPerM3 = eq.rateUnit === "₹/m³" ? rateNum : Math.round(rateNum / outputNum);
                        return (
                          <TableRow key={eq.id}>
                            <TableCell className="p-1.5">
                              <Select value={eq.type} onValueChange={(v) => updateEquipment(eq.id, "type", v)}>
                                <SelectTrigger className="text-xs h-8"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  {Object.keys(EQUIP_TYPES).map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                                </SelectContent>
                              </Select>
                            </TableCell>
                            <TableCell className="p-1.5">
                              <Select value={eq.model} onValueChange={(v) => updateEquipment(eq.id, "model", v)}>
                                <SelectTrigger className="text-xs h-8"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  {(EQUIP_TYPES[eq.type]?.models || []).map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                                </SelectContent>
                              </Select>
                            </TableCell>
                            <TableCell className="p-1.5">
                              <div className="flex gap-1">
                                {(["own", "hired"] as EquipMode[]).map(m => (
                                  <button key={m} onClick={() => updateEquipment(eq.id, "mode", m)}
                                    className={`px-2 py-1 rounded text-xs font-medium border transition-colors ${eq.mode === m ? (m === "own" ? "bg-amber-100 border-amber-300 text-amber-800" : "bg-blue-100 border-blue-300 text-blue-800") : "bg-white border-slate-200 text-slate-500"}`}
                                  >{m === "own" ? "Own" : "Hired"}</button>
                                ))}
                              </div>
                            </TableCell>
                            <TableCell className="p-1.5">
                              <div className="flex items-center gap-1">
                                <Input value={eq.rate} onChange={(e) => updateEquipment(eq.id, "rate", e.target.value)} className="h-8 w-16 text-right text-xs font-mono" />
                                <span className="text-xs text-slate-400 whitespace-nowrap">{EQUIP_TYPES[eq.type]?.units || "₹/hr"}</span>
                              </div>
                            </TableCell>
                            <TableCell className="p-1.5">
                              {eq.rateUnit !== "₹/m³" && (
                                <div className="flex items-center gap-1">
                                  <Input value={eq.output} onChange={(e) => updateEquipment(eq.id, "output", e.target.value)} className="h-8 w-16 text-right text-xs font-mono" />
                                  <span className="text-xs text-slate-400">m³/hr</span>
                                </div>
                              )}
                              {eq.rateUnit === "₹/m³" && <span className="text-xs text-slate-400 pl-2">—</span>}
                            </TableCell>
                            <TableCell className="p-1.5 text-right">
                              <span className="font-mono text-sm font-semibold text-blue-700">₹{costPerM3}</span>
                            </TableCell>
                            <TableCell className="p-1.5">
                              <button onClick={() => removeEquipment(eq.id)} className="text-slate-300 hover:text-red-500 transition-colors p-1 rounded">
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>

                <div className="flex items-center justify-between">
                  <Button variant="outline" size="sm" onClick={addEquipment} className="text-xs gap-1.5 border-dashed border-amber-300 text-amber-700 hover:bg-amber-50">
                    <Plus className="h-3.5 w-3.5" /> Add Equipment
                  </Button>
                  <div className="flex items-center gap-3 text-sm">
                    <span className="text-slate-500 text-xs">Combined output: <strong className="text-slate-700">{totalOutputM3hr} m³/hr</strong></span>
                    <ChevronRight className="h-3 w-3 text-slate-300" />
                    <span className="text-slate-500 text-xs">Total batching cost/m³: </span>
                    <span className="font-bold text-blue-700">₹{equipment.reduce((s, e) => {
                      const r = parseFloat(e.rate) || 0;
                      const o = parseFloat(e.output) || 1;
                      return s + (e.rateUnit === "₹/m³" ? r : Math.round(r / o));
                    }, 0)}</span>
                  </div>
                </div>

                <div className="text-xs text-slate-400 bg-slate-50 rounded p-2 border">
                  💡 <strong>How it works:</strong> For hired equipment, divide hourly rate by output (m³/hr) to get ₹/m³. Own equipment should include fuel, operator and maintenance in the hourly rate. For RMC Supply, the quoted rate replaces all material + batching costs.
                </div>

              </CardContent>
            </Card>

            {/* ⑤ Concrete Pump */}
            <Card className="border-l-4 border-l-amber-600 shadow-sm">
              <CardHeader className="pb-3 flex flex-row items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center font-bold shrink-0">⑤</div>
                <CardTitle className="text-base">Concrete Pump</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex bg-slate-100 p-1 rounded-md w-fit">
                  <div className="px-4 py-1.5 rounded bg-white shadow-sm text-sm font-medium border border-slate-200 cursor-pointer">Hired Pump</div>
                  <div className="px-4 py-1.5 rounded text-slate-500 text-sm font-medium cursor-pointer hover:text-slate-700">Own Pump</div>
                  <div className="px-4 py-1.5 rounded text-slate-500 text-sm font-medium cursor-pointer hover:text-slate-700">No Pump</div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-3 bg-blue-50 rounded-lg border border-blue-100">
                  <div className="space-y-1">
                    <Label className="text-xs">Pump Type</Label>
                    <Select defaultValue="line-80">
                      <SelectTrigger className="bg-white text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="line-80">Line Pump 80m</SelectItem>
                        <SelectItem value="boom-36">Boom Pump 36m</SelectItem>
                        <SelectItem value="boom-42">Boom Pump 42m</SelectItem>
                        <SelectItem value="static">Static Pump</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Daily Hire</Label>
                    <div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">₹</span><Input defaultValue="12000" className="pl-7 bg-white text-sm" /></div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Daily Output</Label>
                    <div className="relative"><Input defaultValue="60" className="pr-12 bg-white text-sm" /><span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs">m³/day</span></div>
                  </div>
                  <div className="md:col-span-3 text-right">
                    <span className="text-xs text-slate-500">Cost per m³: </span>
                    <span className="font-bold text-blue-700">₹200</span>
                  </div>
                </div>
              </CardContent>
            </Card>

          </div>

          {/* ⟶ Sticky Rate Summary */}
          <div className="lg:col-span-4">
            <div className="sticky top-6 space-y-4">
              <Card className="border-b-4 border-b-amber-500 shadow-md">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold text-slate-700">Rate Summary — M25 RCC</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableBody className="text-sm">
                      {[
                        { label: "Cement (7.6 bags × ₹420)", val: 3192, muted: false },
                        { label: "Coarse Agg (20+10+6mm blended)", val: 1256, muted: false },
                        { label: "Sand (with bulkage)", val: 778, muted: false },
                        { label: "Admixture", val: 1026, muted: false },
                      ].map(r => (
                        <TableRow key={r.label}>
                          <TableCell className="py-1.5 px-4 text-xs text-slate-600">{r.label}</TableCell>
                          <TableCell className="py-1.5 px-4 text-right text-xs font-mono">₹{r.val.toLocaleString()}</TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="bg-amber-50">
                        <TableCell className="py-1.5 px-4 text-xs font-semibold text-amber-900">Materials Total</TableCell>
                        <TableCell className="py-1.5 px-4 text-right text-sm font-bold font-mono text-amber-900">₹6,252</TableCell>
                      </TableRow>
                      <TableRow><TableCell className="py-1.5 px-4 text-xs text-slate-500">Batching Equipment</TableCell><TableCell className="py-1.5 px-4 text-right text-xs font-mono text-slate-500">₹252</TableCell></TableRow>
                      <TableRow><TableCell className="py-1.5 px-4 text-xs text-slate-500">Concrete Pump</TableCell><TableCell className="py-1.5 px-4 text-right text-xs font-mono text-slate-500">₹200</TableCell></TableRow>
                      <TableRow><TableCell className="py-1.5 px-4 text-xs text-slate-400">Formwork (below ↓)</TableCell><TableCell className="py-1.5 px-4 text-right text-xs font-mono text-slate-400">—</TableCell></TableRow>
                      <TableRow><TableCell className="py-1.5 px-4 text-xs text-slate-400">Labour & Curing (below ↓)</TableCell><TableCell className="py-1.5 px-4 text-right text-xs font-mono text-slate-400">—</TableCell></TableRow>
                      <TableRow className="bg-slate-50">
                        <TableCell className="py-1.5 px-4 text-xs font-semibold">Sub-total</TableCell>
                        <TableCell className="py-1.5 px-4 text-right text-sm font-bold font-mono">₹6,704</TableCell>
                      </TableRow>
                      <TableRow><TableCell className="py-1.5 px-4 text-xs text-slate-500">Overhead (8%)</TableCell><TableCell className="py-1.5 px-4 text-right text-xs font-mono text-slate-500">+₹536</TableCell></TableRow>
                      <TableRow><TableCell className="py-1.5 px-4 text-xs text-slate-500">Margin (12%)</TableCell><TableCell className="py-1.5 px-4 text-right text-xs font-mono text-slate-500">+₹878</TableCell></TableRow>
                      <TableRow className="bg-amber-600 text-white">
                        <TableCell className="py-2 px-4 text-sm font-bold">TOTAL ₹/m³</TableCell>
                        <TableCell className="py-2 px-4 text-right text-lg font-bold font-mono">₹8,118</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                  <div className="p-3">
                    <div className="flex gap-0.5 h-3 rounded-full overflow-hidden">
                      <div style={{width: "43%"}} className="bg-amber-500 rounded-l" title="Materials" />
                      <div style={{width: "7%"}} className="bg-blue-400" title="Batching" />
                      <div style={{width: "7%"}} className="bg-blue-300" title="Pump" />
                      <div style={{width: "5%"}} className="bg-green-400" title="Formwork" />
                      <div style={{width: "7%"}} className="bg-purple-400" title="Labour" />
                      <div style={{width: "3%"}} className="bg-teal-400" title="Curing" />
                      <div style={{width: "28%"}} className="bg-slate-300 rounded-r" title="OH+Margin" />
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
                      {[["bg-amber-500","Materials"],["bg-blue-400","Batching"],["bg-green-400","Formwork"],["bg-purple-400","Labour"],["bg-slate-300","OH+Margin"]].map(([c,l]) => (
                        <span key={l} className="flex items-center gap-1 text-xs text-slate-500"><span className={`w-2 h-2 rounded-full ${c}`} />{l}</span>
                      ))}
                    </div>
                    <p className="text-xs text-slate-400 mt-3 border-t pt-2">Formwork, Labour & Curing inputs in sections ⑥–⑦ will update this summary.</p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
