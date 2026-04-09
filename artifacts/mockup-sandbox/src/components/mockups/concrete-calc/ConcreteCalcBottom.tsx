import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Calculator, HardHat, TrendingUp, AlertTriangle, Droplet, Layers, IndianRupee, Plus, Trash2, Info, CheckCircle2, Circle } from 'lucide-react';
import { Separator } from "@/components/ui/separator";

// ---------- BBS Types ----------
type BarShape = "Straight" | "U-bar (2 hooks)" | "L-bar (1 hook)" | "Ring/Stirrup" | "Spiral";
interface BBSRow {
  id: number;
  element: string;
  dia: number;
  shape: BarShape;
  count: number;
  cutLength: string;
  hookAllowance: number;
}
const defaultBBS: BBSRow[] = [
  { id: 1, element: "Wall vertical bars", dia: 12, shape: "Straight", count: 210, cutLength: "1.95", hookAllowance: 0.48 },
  { id: 2, element: "Wall horizontal bars", dia: 10, shape: "Straight", count: 280, cutLength: "1.85", hookAllowance: 0.40 },
  { id: 3, element: "Slab top mesh", dia: 10, shape: "Straight", count: 185, cutLength: "1.25", hookAllowance: 0.40 },
  { id: 4, element: "Slab bottom mesh", dia: 12, shape: "Straight", count: 185, cutLength: "1.25", hookAllowance: 0.48 },
  { id: 5, element: "Wall stirrups", dia: 8, shape: "Ring/Stirrup", count: 320, cutLength: "2.84", hookAllowance: 0.24 },
  { id: 6, element: "Footing main bars", dia: 16, shape: "Straight", count: 48, cutLength: "4.80", hookAllowance: 0.64 },
];

// weight per metre = dia² / 162   (for TMT bars, dia in mm → kg/m)
const weightPerMetre = (dia: number) => (dia * dia) / 162;

type WastageKey = "sand_bulkage" | "cement_wastage" | "steel_cutting" | "formwork_reuse" | "water_curing";
interface WastageItem { key: WastageKey; label: string; enabled: boolean; assumption: string; impact: string; costImpact: number; explanation: string }

export default function ConcreteCalcBottom() {
  // BBS
  const [bbsRows, setBbsRows] = useState<BBSRow[]>(defaultBBS);
  const [nextBbsId, setNextBbsId] = useState(7);
  const [overlapDia, setOverlapDia] = useState(50);
  const addBBSRow = () => { setBbsRows(p => [...p, { id: nextBbsId, element: "", dia: 12, shape: "Straight", count: 1, cutLength: "3.0", hookAllowance: 0.48 }]); setNextBbsId(n => n + 1); };
  const removeBBSRow = (id: number) => setBbsRows(p => p.filter(r => r.id !== id));

  // Formwork
  const [fwSystem, setFwSystem] = useState("steel");
  const [stagingSystem, setStagingSystem] = useState("cuplock");
  const [curingMethod, setCuringMethod] = useState<"water" | "compound" | "both">("water");
  const [tankerType, setTankerType] = useState<"static" | "mobile">("mobile");

  // Wastage toggles
  const [wastage, setWastage] = useState<WastageItem[]>([
    { key: "sand_bulkage", label: "Sand Bulkage Allowance", enabled: true, assumption: "25% bulkage", impact: "Need 0.863 m³ loose sand per m³ concrete instead of 0.690 m³ dry", costImpact: 94, explanation: "Natural river sand swells when moist. If you order the exact dry-mix quantity, you'll receive less than you need on site. This adds extra sand cost to cover the gap." },
    { key: "cement_wastage", label: "Cement Wastage & Bag Losses", enabled: true, assumption: "2% of bags", impact: "+0.15 bags/m³ extra", costImpact: 63, explanation: "Open bags stored in rain, partially used bags, rejected batches — typically 2–3% of cement is unusable. This adds the replacement cost." },
    { key: "steel_cutting", label: "Steel Cutting Waste", enabled: true, assumption: "5% off-cuts", impact: "+2.7 kg/m³ extra steel ordered", costImpact: 32, explanation: "Short off-cuts below 300mm (the minimum usable lap length) are scrapped. You'll need to order more MT than the BBS shows to cover these wastages." },
    { key: "formwork_reuse", label: "Formwork Early Damage", enabled: false, assumption: "8 reuses planned", impact: "If only 5 usable → cost rises 60%", costImpact: 38, explanation: "Steel plates or timber panels may get damaged, warped, or lost earlier than planned. This toggle applies a risk reserve to your shuttering cost." },
    { key: "water_curing", label: "Curing Water Loss / Evaporation", enabled: false, assumption: "14 days curing", impact: "+15% water quantity in hot/dry weather", costImpact: 12, explanation: "In peak summer or windy sites, more water is needed for curing than the standard 14-day estimate. Toggle on when working in dry/hot conditions." },
  ]);
  const toggleWastage = (key: WastageKey) => setWastage(p => p.map(w => w.key === key ? { ...w, enabled: !w.enabled } : w));
  const activeWastageCost = wastage.filter(w => w.enabled).reduce((s, w) => s + w.costImpact, 0);

  // BBS derived totals per dia
  const bbsByDia = bbsRows.reduce<Record<number, { totalLen: number; weight: number }>>((acc, row) => {
    const len = (parseFloat(row.cutLength) || 0) + row.hookAllowance;
    const overlapLen = (overlapDia * row.dia) / 1000;
    const totalLen = (len + overlapLen) * row.count;
    const weight = totalLen * weightPerMetre(row.dia);
    if (!acc[row.dia]) acc[row.dia] = { totalLen: 0, weight: 0 };
    acc[row.dia].totalLen += totalLen;
    acc[row.dia].weight += weight;
    return acc;
  }, {});
  const totalSteelWeight = Object.values(bbsByDia).reduce((s, v) => s + v.weight, 0);

  const STEEL_RATES: Record<number, number> = { 8: 65500, 10: 64000, 12: 63500, 16: 63000, 20: 62500, 25: 62000 };
  const blendedRate = Object.entries(bbsByDia).reduce((s, [dia, v]) => s + (STEEL_RATES[Number(dia)] || 63000) * v.weight, 0) / (totalSteelWeight || 1);

  const fabricationCosts = { cutBend: 3500, bindingWire: 120, fixing: 1500 };
  const totalFabPerMT = Object.values(fabricationCosts).reduce((a, b) => a + b, 0);
  const totalSteelCostPerMT = Math.round(blendedRate + totalFabPerMT);

  return (
    <div className="w-full max-w-4xl mx-auto p-4 space-y-5 font-sans bg-stone-50 text-stone-900">
      <div className="flex items-center gap-3">
        <Calculator className="h-5 w-5 text-amber-600" />
        <div>
          <h1 className="text-xl font-bold text-stone-900">HLC Concrete Rate Analysis <span className="text-stone-400 font-normal text-base ml-1">— Part 2</span></h1>
          <p className="text-stone-500 text-sm">Formwork · Labour · Curing · BOQ · Reinforcement BBS · Profitability</p>
        </div>
      </div>

      <Accordion type="multiple" defaultValue={["item-6", "item-7", "item-8"]} className="space-y-3">

        {/* ⑥ FORMWORK */}
        <AccordionItem value="item-6" className="bg-white border border-stone-200 rounded-lg shadow-sm overflow-hidden">
          <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-stone-50">
            <div className="flex items-center gap-3 text-left">
              <div className="flex items-center justify-center w-8 h-8 rounded-full bg-amber-100 text-amber-700 font-bold text-sm shrink-0">⑥</div>
              <div>
                <h3 className="font-semibold text-base text-stone-800">Formwork & Staging</h3>
                <p className="text-xs text-stone-500 font-normal">Shuttering panels + propping/staging system selection and costing</p>
              </div>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-4 pb-5 pt-2 space-y-5">

            {/* Formwork system */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wide text-stone-600 flex items-center gap-1"><Layers className="h-3.5 w-3.5" /> Shuttering / Formwork System</Label>
                <Select value={fwSystem} onValueChange={setFwSystem}>
                  <SelectTrigger className="text-sm bg-slate-50"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="steel">Steel Plate Panels</SelectItem>
                    <SelectItem value="steel-timber">Steel + Timber Combo</SelectItem>
                    <SelectItem value="modular">Modular Steel (Doka / PERI type)</SelectItem>
                    <SelectItem value="plywood">Plywood on I-beam / Timber Frame</SelectItem>
                    <SelectItem value="precast">Precast / Stay-in-place (no recovery)</SelectItem>
                  </SelectContent>
                </Select>
                <div className="grid grid-cols-2 gap-3 mt-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Cost per m² (new)</Label>
                    <div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 text-sm">₹</span><Input defaultValue={fwSystem === "steel" ? "120" : fwSystem === "steel-timber" ? "85" : "150"} className="pl-7 text-sm bg-slate-50" /></div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Expected Reuses</Label>
                    <Input defaultValue={fwSystem === "steel" ? "8" : fwSystem === "plywood" ? "3" : "6"} className="text-sm bg-slate-50" />
                    <span className="text-xs text-stone-400">cycles before replacement</span>
                  </div>
                </div>
                <div className="bg-stone-50 rounded p-2 text-xs flex justify-between border">
                  <span className="text-stone-500">Net shuttering cost / m² / use:</span>
                  <span className="font-mono font-semibold">₹{fwSystem === "steel" ? "15.00" : fwSystem === "steel-timber" ? "14.17" : fwSystem === "plywood" ? "28.33" : "25.00"}</span>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wide text-stone-600 flex items-center gap-1"><IndianRupee className="h-3.5 w-3.5" /> Staging / Propping System</Label>
                <Select value={stagingSystem} onValueChange={setStagingSystem}>
                  <SelectTrigger className="text-sm bg-slate-50"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cuplock">Cuplock Scaffolding</SelectItem>
                    <SelectItem value="prop-beam">Prop & Beam (acrow props)</SelectItem>
                    <SelectItem value="cribs">Cribs & MS Plates</SelectItem>
                    <SelectItem value="ibeam">I-Beam + Universal Props</SelectItem>
                    <SelectItem value="none">No Staging Required</SelectItem>
                  </SelectContent>
                </Select>
                {stagingSystem !== "none" && (
                  <div className="grid grid-cols-2 gap-3 mt-2">
                    <div className="space-y-1">
                      <Label className="text-xs">Staging height</Label>
                      <div className="relative"><Input defaultValue="3.5" className="pr-6 text-sm bg-slate-50" /><span className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 text-xs">m</span></div>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Hire rate per m²/month</Label>
                      <div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 text-sm">₹</span><Input defaultValue={stagingSystem === "cuplock" ? "28" : stagingSystem === "cribs" ? "35" : "22"} className="pl-7 text-sm bg-slate-50" /></div>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Hire duration</Label>
                      <div className="relative"><Input defaultValue="1" className="pr-12 text-sm bg-slate-50" /><span className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 text-xs">months</span></div>
                    </div>
                    <div className="bg-stone-50 rounded p-2 text-xs border flex flex-col justify-center">
                      <span className="text-stone-400">Staging cost / m² shuttered</span>
                      <span className="font-mono font-semibold mt-0.5">₹{stagingSystem === "cuplock" ? "28" : stagingSystem === "cribs" ? "35" : "22"}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Structure dimensions + auto-calc */}
            <div className="space-y-3">
              <Label className="text-xs font-semibold uppercase tracking-wide text-stone-600">Structure Dimensions (for area calculation)</Label>
              <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
                {[["Internal width W","1.2","m"],["Wall height H","1.5","m"],["Wall thickness T","0.25","m"],["Slab thickness T_s","0.20","m"],["Run length L","100","m"],["No. of cells","1",""]].map(([l,v,u]) => (
                  <div key={l} className="space-y-1">
                    <Label className="text-xs text-stone-500">{l}</Label>
                    <div className="flex items-center">
                      <Input defaultValue={v} className="rounded-r-none font-mono text-sm text-right" />
                      {u && <span className="bg-stone-100 border border-l-0 border-stone-200 px-2 py-2 text-xs text-stone-500 rounded-r-md">{u}</span>}
                    </div>
                  </div>
                ))}
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 space-y-2.5">
                <div className="font-semibold text-xs text-amber-800 uppercase tracking-wide">📐 Auto-Calculated (Covered Drain)</div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                  <div className="bg-white rounded p-2 border border-amber-100">
                    <div className="text-amber-700 font-medium">Side & Bottom Shuttering</div>
                    <div className="font-mono text-stone-700 mt-1">Inner: (2H + W) × L = 4.2 × 100 = <strong>420 m²</strong></div>
                    <div className="font-mono text-stone-500 text-xs">Outer: (2H + W + 4T) × L = <strong>520 m²</strong></div>
                  </div>
                  <div className="bg-white rounded p-2 border border-amber-100">
                    <div className="text-amber-700 font-medium">Slab Soffit</div>
                    <div className="font-mono text-stone-700 mt-1">(W + 2T) × L = 1.7 × 100 = <strong>170 m²</strong></div>
                    <div className="font-mono text-stone-500 text-xs">Requires staging for soffit</div>
                  </div>
                  <div className="bg-white rounded p-2 border border-amber-100">
                    <div className="text-amber-700 font-medium">Concrete Volume</div>
                    <div className="font-mono text-stone-700 mt-1">(2HT + WT_s) × L = <strong>99 m³</strong></div>
                    <div className="font-mono text-stone-500 text-xs">Shuttering ratio: 5.96 m²/m³</div>
                  </div>
                </div>
                <div className="flex items-center justify-between border-t border-amber-200/50 pt-2">
                  <div className="text-xs text-amber-700">Total formwork cost = (shuttering + staging) per m² × total area ÷ concrete volume</div>
                  <div className="bg-amber-600 text-white px-4 py-1.5 rounded-full text-sm font-bold shadow-sm whitespace-nowrap">₹98.4 / m³</div>
                </div>
              </div>
              <div className="text-xs text-stone-400 bg-stone-50 border rounded p-2">
                💡 <strong>Bridges / Box Culverts:</strong> The system splits shuttering into side walls, soffit slab, and end caps — staging cost is applied only to horizontal (soffit) areas. <strong>Abutment type:</strong> side & back formwork only, no staging above ground level. Select structure type in ① to auto-switch the formula.
              </div>
            </div>

          </AccordionContent>
        </AccordionItem>

        {/* ⑦ LABOUR & CURING */}
        <AccordionItem value="item-7" className="bg-white border border-stone-200 rounded-lg shadow-sm overflow-hidden">
          <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-stone-50">
            <div className="flex items-center gap-3 text-left">
              <div className="flex items-center justify-center w-8 h-8 rounded-full bg-amber-100 text-amber-700 font-bold text-sm shrink-0">⑦</div>
              <div>
                <h3 className="font-semibold text-base text-stone-800">Labour & Curing</h3>
                <p className="text-xs text-stone-500 font-normal">Crew, wages, water tanker / curing compound details</p>
              </div>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-4 pb-5 pt-2 space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

              {/* Labour */}
              <div className="space-y-3">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-stone-600 flex items-center gap-1.5"><HardHat className="h-3.5 w-3.5" /> Labour</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1"><Label className="text-xs">Crew Size</Label><Input defaultValue="8" className="font-mono text-sm" /></div>
                  <div className="space-y-1"><Label className="text-xs">Avg Wage / day</Label><div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 text-sm">₹</span><Input defaultValue="700" className="pl-7 font-mono text-sm" /></div></div>
                  <div className="space-y-1"><Label className="text-xs">Daily output</Label><div className="relative"><Input defaultValue="15" className="pr-12 font-mono text-sm" /><span className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 text-xs">m³/day</span></div></div>
                  <div className="space-y-1"><Label className="text-xs">Supervisor / mobilisation</Label><div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 text-sm">₹</span><Input defaultValue="60" className="pl-7 font-mono text-sm" /><span className="absolute right-10 top-1/2 -translate-y-1/2 text-stone-400 text-xs">/m³</span></div></div>
                </div>
                <div className="bg-stone-100 rounded p-2 border text-sm flex justify-between items-center">
                  <span className="text-stone-500">Labour cost per m³ <span className="text-xs">(₹5,600 ÷ 15 + ₹60)</span></span>
                  <span className="font-mono font-bold text-stone-900">₹433</span>
                </div>
              </div>

              {/* Curing */}
              <div className="space-y-3">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-stone-600 flex items-center gap-1.5"><Droplet className="h-3.5 w-3.5" /> Curing</h4>
                <div className="flex gap-1 bg-stone-100 p-0.5 rounded-md text-xs">
                  {(["water","compound","both"] as const).map(m => (
                    <button key={m} onClick={() => setCuringMethod(m)} className={`flex-1 py-1.5 rounded font-medium transition-all capitalize ${curingMethod === m ? "bg-white shadow text-stone-900 border border-stone-200" : "text-stone-500 hover:text-stone-700"}`}>{m === "both" ? "Water + Compound" : m === "water" ? "💧 Water Curing" : "🧴 Compound"}</button>
                  ))}
                </div>

                {(curingMethod === "water" || curingMethod === "both") && (
                  <div className="space-y-2 p-3 rounded-lg bg-blue-50 border border-blue-100">
                    <div className="text-xs font-semibold text-blue-700">Water Curing</div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs">Tanker Type</Label>
                        <div className="flex gap-1">
                          <button onClick={() => setTankerType("mobile")} className={`flex-1 py-1 rounded text-xs font-medium border transition-colors ${tankerType === "mobile" ? "bg-blue-600 text-white border-blue-600" : "bg-white text-stone-500 border-stone-200"}`}>Mobile</button>
                          <button onClick={() => setTankerType("static")} className={`flex-1 py-1 rounded text-xs font-medium border transition-colors ${tankerType === "static" ? "bg-blue-600 text-white border-blue-600" : "bg-white text-stone-500 border-stone-200"}`}>Static Tank</button>
                        </div>
                      </div>
                      {tankerType === "mobile" ? (
                        <>
                          <div className="space-y-1"><Label className="text-xs">Tanker capacity</Label><div className="relative"><Input defaultValue="12000" className="pr-8 text-sm bg-white font-mono" /><span className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 text-xs">L</span></div></div>
                          <div className="space-y-1"><Label className="text-xs">Hire rate / trip</Label><div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 text-sm">₹</span><Input defaultValue="1200" className="pl-7 text-sm bg-white font-mono" /></div></div>
                          <div className="space-y-1"><Label className="text-xs">Trips per day</Label><Input defaultValue="2" className="text-sm bg-white font-mono" /></div>
                        </>
                      ) : (
                        <>
                          <div className="space-y-1"><Label className="text-xs">Tank capacity</Label><div className="relative"><Input defaultValue="20000" className="pr-8 text-sm bg-white font-mono" /><span className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 text-xs">L</span></div></div>
                          <div className="space-y-1"><Label className="text-xs">Pump hire / day</Label><div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 text-sm">₹</span><Input defaultValue="400" className="pl-7 text-sm bg-white font-mono" /></div></div>
                          <div className="space-y-1"><Label className="text-xs">Water cost / kL</Label><div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 text-sm">₹</span><Input defaultValue="150" className="pl-7 text-sm bg-white font-mono" /></div></div>
                        </>
                      )}
                      <div className="space-y-1"><Label className="text-xs">Curing crew / day</Label><div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 text-sm">₹</span><Input defaultValue="420" className="pl-7 text-sm bg-white font-mono" /></div></div>
                      <div className="space-y-1"><Label className="text-xs">Curing days</Label><Input defaultValue="14" className="text-sm bg-white font-mono" /></div>
                    </div>
                    <div className="text-xs text-blue-700 flex justify-between bg-white rounded p-1.5 border border-blue-100">
                      <span>Water curing cost / m³:</span><span className="font-mono font-bold">₹{tankerType === "mobile" ? "78" : "52"}</span>
                    </div>
                  </div>
                )}

                {(curingMethod === "compound" || curingMethod === "both") && (
                  <div className="space-y-2 p-3 rounded-lg bg-green-50 border border-green-100">
                    <div className="text-xs font-semibold text-green-700">Curing Compound</div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1"><Label className="text-xs">Brand / Product</Label><Input defaultValue="SikaKure-501" className="text-sm bg-white" /></div>
                      <div className="space-y-1"><Label className="text-xs">Price per litre</Label><div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 text-sm">₹</span><Input defaultValue="220" className="pl-7 text-sm bg-white font-mono" /></div></div>
                      <div className="space-y-1"><Label className="text-xs">Coverage rate</Label><div className="relative"><Input defaultValue="5" className="pr-12 text-sm bg-white font-mono" /><span className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 text-xs">m²/L</span></div></div>
                      <div className="space-y-1"><Label className="text-xs">Cured surface area</Label><div className="relative"><Input defaultValue="590" className="pr-8 text-sm bg-white font-mono" /><span className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 text-xs">m²</span></div><span className="text-xs text-stone-400">auto from formwork calc</span></div>
                    </div>
                    <div className="text-xs text-green-700 flex justify-between bg-white rounded p-1.5 border border-green-100">
                      <span>Compound cost / m³: 118L × ₹220 ÷ 99 m³</span><span className="font-mono font-bold">₹262</span>
                    </div>
                  </div>
                )}

                <div className="bg-stone-100 rounded p-2 border text-sm flex justify-between items-center">
                  <span className="text-stone-500">Total curing cost / m³</span>
                  <span className="font-mono font-bold text-stone-900">₹{curingMethod === "water" ? "78" : curingMethod === "compound" ? "262" : "340"}</span>
                </div>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* ⑧ Overhead & Margin */}
        <AccordionItem value="item-8" className="bg-white border border-stone-200 rounded-lg shadow-sm overflow-hidden">
          <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-stone-50">
            <div className="flex items-center gap-3 text-left">
              <div className="flex items-center justify-center w-8 h-8 rounded-full bg-amber-100 text-amber-700 font-bold text-sm shrink-0">⑧</div>
              <div><h3 className="font-semibold text-base text-stone-800">Overhead & Margin</h3><p className="text-xs text-stone-500 font-normal">Applied to the full cost base</p></div>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-4 pb-4 pt-2 space-y-4">
            <div className="grid grid-cols-2 gap-5">
              <div className="space-y-1"><Label className="text-xs">Site Overhead (%)</Label><div className="flex items-center"><Input defaultValue="8" className="rounded-r-none font-mono text-sm" /><span className="bg-stone-100 border border-l-0 border-stone-200 px-3 py-2 text-xs text-stone-500 rounded-r-md">%</span></div><span className="text-xs text-stone-400">→ ₹552/m³</span></div>
              <div className="space-y-1"><Label className="text-xs">Contractor Margin (%)</Label><div className="flex items-center"><Input defaultValue="12" className="rounded-r-none font-mono text-sm" /><span className="bg-stone-100 border border-l-0 border-stone-200 px-3 py-2 text-xs text-stone-500 rounded-r-md">%</span></div><span className="text-xs text-stone-400">→ ₹894/m³</span></div>
            </div>
            <div className="flex items-center justify-between text-sm text-stone-600 bg-stone-50 p-3 rounded border border-stone-100">
              <span>Base: <strong className="font-mono">₹6,774</strong></span>
              <span className="text-stone-400">→</span>
              <span>After OH: <strong className="font-mono">₹7,315</strong></span>
              <span className="text-stone-400">→</span>
              <span>After Margin: <strong className="font-mono text-stone-900">₹8,193</strong></span>
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      {/* Full Rate Callout */}
      <div className="bg-amber-600 rounded-xl p-5 text-white shadow-lg">
        <div className="text-amber-100 text-xs font-mono flex flex-wrap gap-x-2 gap-y-1 mb-2">
          <span>₹6,252 materials</span><span>+</span><span>₹452 batching</span><span>+</span><span>₹98 formwork+staging</span><span>+</span><span>₹433 labour</span><span>+</span><span>₹78 curing</span><span>=</span>
          <span className="text-white font-semibold">₹7,313 base</span><span>→</span><span className="text-white font-semibold">₹8,862 after OH+M</span>
        </div>
        <h2 className="text-2xl font-bold">Final Rate: ₹8,862 <span className="text-amber-200 text-lg font-normal">/ m³ of M25 RCC incl. shuttering</span></h2>
      </div>

      <div className="w-full h-px bg-stone-200" />

      <Accordion type="multiple" defaultValue={["item-9", "item-10", "item-11"]} className="space-y-3">

        {/* ⑨ BOQ */}
        <AccordionItem value="item-9" className="bg-white border border-stone-200 rounded-lg shadow-sm overflow-hidden">
          <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-stone-50">
            <div className="flex items-center gap-3 text-left">
              <div className="flex items-center justify-center w-8 h-8 rounded-full bg-emerald-100 text-emerald-700 font-bold text-sm shrink-0">⑨</div>
              <div><h3 className="font-semibold text-base text-stone-800">BOQ Items & Profitability</h3><p className="text-xs text-stone-500 font-normal">Enter BOQ quantities and quoted rates to see your profit on each item</p></div>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-0 pb-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-stone-50">
                  <TableRow>
                    <TableHead className="text-xs w-8 text-center">#</TableHead>
                    <TableHead className="text-xs min-w-[200px]">Description</TableHead>
                    <TableHead className="text-xs">Unit</TableHead>
                    <TableHead className="text-xs text-right">BOQ Qty</TableHead>
                    <TableHead className="text-xs text-right">Your Cost</TableHead>
                    <TableHead className="text-xs text-right bg-blue-50/50">Quoted Rate ✏</TableHead>
                    <TableHead className="text-xs text-right">Revenue</TableHead>
                    <TableHead className="text-xs text-right">Profit</TableHead>
                    <TableHead className="text-xs text-right w-20">Margin</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="text-xs">
                  {[
                    { n:1, desc:"Earthwork excl. incl. backfill & disposal", unit:"Cum", qty:"3,812", cost:"₹320", qr:"380", rev:"14,48,560", profit:"2,28,720", margin:"15.8% ↑", bold:false },
                    { n:2, desc:"PCC M15 in open foundation", unit:"Cum", qty:"450", cost:"₹5,840", qr:"6500", rev:"29,25,000", profit:"2,97,000", margin:"10.2% ↑", bold:false },
                    { n:3, desc:"RCC M25 walls & slab incl. shuttering", unit:"Cum", qty:"1,072", cost:"₹8,862", qr:"10200", rev:"1,09,34,400", profit:"14,40,864", margin:"13.2% ↑", bold:true },
                    { n:4, desc:"HYSD reinforcement bars", unit:"MT", qty:"54", cost:"₹69,800", qr:"75000", rev:"40,50,000", profit:"2,80,920", margin:"6.9% ↑", bold:false },
                  ].map(r => (
                    <TableRow key={r.n} className={r.bold ? "bg-stone-50/50" : ""}>
                      <TableCell className="text-center text-stone-400">{r.n}</TableCell>
                      <TableCell className={`font-medium ${r.bold ? "text-stone-900" : "text-stone-700"}`}>{r.desc}</TableCell>
                      <TableCell className="text-stone-500">{r.unit}</TableCell>
                      <TableCell className="text-right font-mono">{r.qty}</TableCell>
                      <TableCell className="text-right font-mono">{r.cost}</TableCell>
                      <TableCell className="p-1"><Input defaultValue={r.qr} className="h-7 text-right text-xs font-mono border-blue-200 focus-visible:ring-blue-500 w-20 ml-auto" /></TableCell>
                      <TableCell className="text-right font-mono">{r.rev}</TableCell>
                      <TableCell className={`text-right font-mono ${r.bold ? "text-emerald-700 font-bold bg-emerald-50/50" : "text-emerald-600 bg-emerald-50/30"}`}>{r.profit}</TableCell>
                      <TableCell className={`text-right font-mono ${r.bold ? "text-emerald-700 font-bold bg-emerald-50/50" : "text-emerald-600 bg-emerald-50/30"}`}>{r.margin}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter className="bg-stone-100 text-xs font-bold">
                  <TableRow>
                    <TableCell colSpan={5} className="text-right">TOTAL</TableCell>
                    <TableCell />
                    <TableCell className="text-right font-mono">₹1,93,57,960</TableCell>
                    <TableCell className="text-right font-mono text-emerald-800 bg-emerald-100">₹22,47,504</TableCell>
                    <TableCell className="text-right font-mono text-emerald-800 bg-emerald-100">11.6%</TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* ⑩ HYSD BBS */}
        <AccordionItem value="item-10" className="bg-white border border-stone-200 border-l-4 border-l-blue-500 rounded-lg shadow-sm overflow-hidden">
          <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-stone-50">
            <div className="flex items-center gap-3 text-left">
              <div className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-100 text-blue-700 font-bold text-sm shrink-0">⑩</div>
              <div>
                <h3 className="font-semibold text-base text-stone-800">HYSD Bar Schedule (BBS)</h3>
                <p className="text-xs text-stone-500 font-normal">Enter bars by element — system calculates weight per dia using dia²/162 formula, adds overlaps & hooks automatically</p>
              </div>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-4 pb-5 pt-3 space-y-4">

            <div className="flex items-center gap-4 p-3 bg-blue-50 rounded-lg border border-blue-100 text-xs">
              <Info className="h-4 w-4 text-blue-500 shrink-0" />
              <div className="text-blue-700">
                <strong>How it works:</strong> Enter each bar group (element, dia, shape, count, cut length). The system adds hook/bend allowances automatically, calculates total length per group, then converts to weight (kg) using <strong>W = (dia² / 162) × length</strong> (TMT standard formula). Overlap length = {overlapDia}×dia — adjust below.
              </div>
              <div className="shrink-0">
                <Label className="text-xs text-blue-600">Overlap factor (×dia)</Label>
                <Input value={overlapDia} onChange={e => setOverlapDia(Number(e.target.value))} className="h-7 w-16 text-right text-xs font-mono bg-white mt-1" />
              </div>
            </div>

            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader className="bg-slate-50">
                  <TableRow>
                    <TableHead className="text-xs min-w-[140px]">Element / Location</TableHead>
                    <TableHead className="text-xs w-20">Dia (mm)</TableHead>
                    <TableHead className="text-xs w-36">Bar Shape</TableHead>
                    <TableHead className="text-xs w-20 text-right">Count</TableHead>
                    <TableHead className="text-xs w-24 text-right">Cut Length (m)</TableHead>
                    <TableHead className="text-xs w-28 text-right text-blue-600">Hook Allow. (m)</TableHead>
                    <TableHead className="text-xs w-28 text-right">Total Length (m)</TableHead>
                    <TableHead className="text-xs w-24 text-right font-semibold">Weight (kg)</TableHead>
                    <TableHead className="w-8"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="text-xs">
                  {bbsRows.map(row => {
                    const effectiveLen = (parseFloat(row.cutLength) || 0) + row.hookAllowance + (overlapDia * row.dia / 1000);
                    const totalLen = effectiveLen * row.count;
                    const weight = totalLen * weightPerMetre(row.dia);
                    return (
                      <TableRow key={row.id}>
                        <TableCell className="p-1.5"><Input defaultValue={row.element} className="h-7 text-xs bg-slate-50 min-w-[130px]" /></TableCell>
                        <TableCell className="p-1.5">
                          <Select defaultValue={String(row.dia)}>
                            <SelectTrigger className="h-7 text-xs w-16"><SelectValue /></SelectTrigger>
                            <SelectContent>{[8,10,12,16,20,25,32].map(d=><SelectItem key={d} value={String(d)}>{d}mm</SelectItem>)}</SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className="p-1.5">
                          <Select defaultValue={row.shape}>
                            <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Straight">Straight (no hooks)</SelectItem>
                              <SelectItem value="U-bar (2 hooks)">U-bar (2 hooks)</SelectItem>
                              <SelectItem value="L-bar (1 hook)">L-bar (1 hook)</SelectItem>
                              <SelectItem value="Ring/Stirrup">Ring / Stirrup (closed)</SelectItem>
                              <SelectItem value="Spiral">Spiral</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className="p-1.5"><Input defaultValue={String(row.count)} className="h-7 text-xs text-right font-mono w-16" /></TableCell>
                        <TableCell className="p-1.5"><Input defaultValue={row.cutLength} className="h-7 text-xs text-right font-mono w-20" /></TableCell>
                        <TableCell className="p-1.5 text-right text-blue-600 font-mono">{row.hookAllowance.toFixed(2)}</TableCell>
                        <TableCell className="p-1.5 text-right font-mono text-stone-600">{totalLen.toFixed(1)}</TableCell>
                        <TableCell className="p-1.5 text-right font-mono font-semibold text-stone-800">{weight.toFixed(1)}</TableCell>
                        <TableCell className="p-1.5"><button onClick={() => removeBBSRow(row.id)} className="text-stone-200 hover:text-red-400 p-0.5"><Trash2 className="h-3.5 w-3.5" /></button></TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
                <TableFooter>
                  <TableRow className="bg-blue-50 text-xs font-bold">
                    <TableCell colSpan={7} className="text-right">Total Steel</TableCell>
                    <TableCell className="text-right font-mono text-blue-700">{totalSteelWeight.toFixed(0)} kg = <strong>{(totalSteelWeight/1000).toFixed(3)} MT</strong></TableCell>
                    <TableCell />
                  </TableRow>
                </TableFooter>
              </Table>
            </div>
            <Button variant="outline" size="sm" onClick={addBBSRow} className="text-xs gap-1.5 border-dashed border-blue-300 text-blue-600 hover:bg-blue-50">
              <Plus className="h-3.5 w-3.5" /> Add Bar Group
            </Button>

            {/* Dia summary + rates */}
            <div className="rounded-lg border overflow-hidden">
              <div className="bg-blue-700 text-white text-xs font-semibold px-4 py-2 flex justify-between">
                <span>Summary by Diameter</span>
                <span>Blended material rate: ₹{Math.round(blendedRate).toLocaleString()}/MT</span>
              </div>
              <Table>
                <TableHeader className="bg-slate-50"><TableRow>
                  <TableHead className="text-xs">Dia</TableHead>
                  <TableHead className="text-xs text-right">Weight (kg)</TableHead>
                  <TableHead className="text-xs text-right">% of total</TableHead>
                  <TableHead className="text-xs text-right">Rate ₹/MT</TableHead>
                  <TableHead className="text-xs text-right">Material Cost</TableHead>
                </TableRow></TableHeader>
                <TableBody className="text-xs">
                  {Object.entries(bbsByDia).sort((a,b)=>Number(a[0])-Number(b[0])).map(([dia, v]) => (
                    <TableRow key={dia}>
                      <TableCell className="font-semibold">{dia}mm TMT</TableCell>
                      <TableCell className="text-right font-mono">{v.weight.toFixed(1)}</TableCell>
                      <TableCell className="text-right font-mono text-stone-500">{((v.weight/totalSteelWeight)*100).toFixed(1)}%</TableCell>
                      <TableCell className="text-right font-mono"><Input defaultValue={STEEL_RATES[Number(dia)] || 63000} className="h-7 text-xs text-right font-mono w-24 ml-auto" /></TableCell>
                      <TableCell className="text-right font-mono">₹{Math.round((v.weight/1000) * (STEEL_RATES[Number(dia)] || 63000)).toLocaleString()}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
              {[["Cut & Bend","₹3,500/MT","Standard workshop charges"],["Binding Wire","₹120/MT","1.5 kg @ ₹80/kg"],["Fixing Labour","₹1,500/MT","Placing & tying"],["5% Cutting Waste","₹3,219/MT","Off-cuts below 300mm scrapped"]].map(([l,v,n])=>(
                <div key={l} className="bg-stone-50 rounded border p-2 space-y-0.5">
                  <div className="font-semibold text-stone-700">{l}</div>
                  <div className="font-mono text-blue-700">{v}</div>
                  <div className="text-stone-400">{n}</div>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between p-3 bg-blue-700 text-white rounded-lg text-sm">
              <span>Total HYSD cost per MT (material + fab + waste)</span>
              <span className="text-lg font-bold font-mono">₹{totalSteelCostPerMT.toLocaleString()}</span>
            </div>

          </AccordionContent>
        </AccordionItem>

        {/* ⑪ Wastage & Risk Allowances */}
        <AccordionItem value="item-11" className="bg-white border-2 border-amber-400 rounded-lg shadow-sm overflow-hidden">
          <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-amber-50">
            <div className="flex items-center gap-3 text-left">
              <div className="flex items-center justify-center w-8 h-8 rounded-full bg-amber-200 text-amber-800 font-bold text-sm shrink-0">⑪</div>
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              <div>
                <h3 className="font-semibold text-base text-stone-800">Wastage & Risk Allowances</h3>
                <p className="text-xs text-stone-500 font-normal">Toggle each factor you want included in your cost. See the plain-English explanation for each.</p>
              </div>
              <Badge className="ml-auto mr-2 bg-amber-100 text-amber-800 border-amber-200 text-xs">
                {wastage.filter(w=>w.enabled).length} of {wastage.length} active · +₹{activeWastageCost}/m³
              </Badge>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-4 pb-5 pt-3 space-y-3">
            <div className="text-xs text-stone-500 bg-amber-50 rounded p-3 border border-amber-100">
              <strong>What is this section?</strong> These are real-world factors that eat into your profit but don't appear in the basic mix design calculation. Each one is a known source of extra cost on construction sites. Toggle the ones that apply to your job. The adjusted total cost (and BOQ profit margins above) will update automatically.
            </div>
            <div className="space-y-2">
              {wastage.map(w => (
                <div key={w.key} onClick={() => toggleWastage(w.key)} className={`rounded-lg border p-3 cursor-pointer transition-all ${w.enabled ? "border-amber-300 bg-amber-50" : "border-stone-200 bg-white hover:bg-stone-50"}`}>
                  <div className="flex items-start gap-3">
                    <div className={`mt-0.5 shrink-0 ${w.enabled ? "text-amber-600" : "text-stone-300"}`}>
                      {w.enabled ? <CheckCircle2 className="h-4 w-4" /> : <Circle className="h-4 w-4" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <span className={`font-semibold text-sm ${w.enabled ? "text-amber-900" : "text-stone-600"}`}>{w.label}</span>
                        <span className={`font-mono text-xs px-2 py-0.5 rounded-full ${w.enabled ? "bg-amber-200 text-amber-900" : "bg-stone-100 text-stone-500"}`}>
                          {w.enabled ? `+₹${w.costImpact}/m³` : `+₹${w.costImpact}/m³ if enabled`}
                        </span>
                      </div>
                      <div className="text-xs text-stone-500 mt-1">{w.explanation}</div>
                      <div className="flex gap-4 mt-1.5 text-xs">
                        <span className="text-stone-400">Assumption: <span className="font-medium text-stone-600">{w.assumption}</span></span>
                        <span className="text-stone-400">Effect: <span className="font-medium text-stone-600">{w.impact}</span></span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {activeWastageCost > 0 && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 space-y-2 mt-2">
                <div className="text-sm font-semibold text-amber-900">Cost Impact Summary</div>
                <div className="flex justify-between text-sm">
                  <span className="text-stone-600">Base cost per m³ (before allowances)</span>
                  <span className="font-mono font-semibold">₹8,862</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-amber-700">Active wastage/risk allowances ({wastage.filter(w=>w.enabled).length} factors)</span>
                  <span className="font-mono font-semibold text-amber-700">+₹{activeWastageCost}</span>
                </div>
                <Separator className="bg-amber-200" />
                <div className="flex justify-between text-sm font-bold">
                  <span className="text-stone-800">Adjusted cost per m³</span>
                  <span className="font-mono text-amber-800 text-base">₹{(8862 + activeWastageCost).toLocaleString()}</span>
                </div>
                <div className="text-xs text-stone-500">If you quoted ₹10,200/m³ for RCC item: revised margin = {(((10200 - 8862 - activeWastageCost) / 10200) * 100).toFixed(1)}% (was 13.2%)</div>
              </div>
            )}
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      {/* Total Profitability */}
      <div className="rounded-xl border-2 border-emerald-400 overflow-hidden shadow-sm">
        <div className="bg-emerald-600 text-white px-4 py-3 flex items-center gap-2">
          <TrendingUp className="h-4 w-4" />
          <span className="font-bold text-sm">Overall Job Profitability</span>
        </div>
        <div className="p-4 bg-white grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div className="text-center"><div className="text-stone-500 text-xs">Total Revenue</div><div className="text-lg font-bold font-mono">₹1.94 Cr</div></div>
          <div className="text-center"><div className="text-stone-500 text-xs">Total Cost</div><div className="text-lg font-bold font-mono">₹1.72 Cr</div></div>
          <div className="text-center"><div className="text-stone-500 text-xs">Gross Profit</div><div className="text-lg font-bold font-mono text-emerald-700">₹22.5 L</div></div>
          <div className="text-center"><div className="text-stone-500 text-xs">Overall Margin</div><div className="text-xl font-bold text-emerald-700">11.6%</div></div>
        </div>
        <div className="px-4 pb-4 bg-white text-xs text-stone-400 border-t border-stone-100 pt-2">
          With active wastage allowances (+₹{activeWastageCost}/m³ on RCC item): Revised profit ≈ ₹{(2247504 - activeWastageCost * 1072).toLocaleString()} · Revised margin ≈ {(((2247504 - activeWastageCost * 1072) / 19357960) * 100).toFixed(1)}%
        </div>
      </div>

    </div>
  );
}
