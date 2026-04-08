import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calculator, HardHat, TrendingUp, AlertTriangle, ArrowUpRight, Droplet, Layers, IndianRupee } from 'lucide-react';

export default function ConcreteCalcBottom() {
  return (
    <div className="w-full max-w-4xl mx-auto p-4 space-y-6 font-sans bg-stone-50 text-stone-900">
      
      <div className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight text-stone-900 flex items-center gap-2">
          <Calculator className="h-6 w-6 text-amber-600" />
          HLC Concrete Rate Analysis <span className="text-stone-400 font-medium ml-2">Part 2</span>
        </h1>
        <p className="text-stone-500">Formwork, Labour, Overheads & Profitability</p>
      </div>

      <Accordion type="multiple" defaultValue={["item-6", "item-7", "item-8", "item-9", "item-10", "item-11"]} className="space-y-4">
        
        {/* 6. Formwork */}
        <AccordionItem value="item-6" className="bg-white border border-stone-200 rounded-lg shadow-sm overflow-hidden">
          <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-stone-50 transition-colors">
            <div className="flex items-center gap-3 text-left">
              <div className="flex items-center justify-center w-8 h-8 rounded-full bg-amber-100 text-amber-700 font-bold text-sm shrink-0">
                ⑥
              </div>
              <div>
                <h3 className="font-semibold text-lg text-stone-800">Formwork (Shuttering)</h3>
                <p className="text-sm text-stone-500 font-normal">Structure dimensions & reuse cycles</p>
              </div>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-4 pb-4 pt-2">
            <div className="space-y-6">
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <h4 className="text-sm font-semibold text-stone-700 uppercase tracking-wider flex items-center gap-2">
                    <Layers className="h-4 w-4" /> Structure Dimensions
                  </h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label className="text-xs text-stone-500">Internal width (W)</Label>
                      <div className="flex items-center">
                        <Input defaultValue="1.2" className="rounded-r-none font-mono" />
                        <span className="bg-stone-100 border border-l-0 border-stone-200 px-3 py-2 text-sm text-stone-500 rounded-r-md">m</span>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs text-stone-500">Wall height (H)</Label>
                      <div className="flex items-center">
                        <Input defaultValue="1.5" className="rounded-r-none font-mono" />
                        <span className="bg-stone-100 border border-l-0 border-stone-200 px-3 py-2 text-sm text-stone-500 rounded-r-md">m</span>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs text-stone-500">Wall thickness (T)</Label>
                      <div className="flex items-center">
                        <Input defaultValue="0.25" className="rounded-r-none font-mono" />
                        <span className="bg-stone-100 border border-l-0 border-stone-200 px-3 py-2 text-sm text-stone-500 rounded-r-md">m</span>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs text-stone-500">Cover slab (T_slab)</Label>
                      <div className="flex items-center">
                        <Input defaultValue="0.20" className="rounded-r-none font-mono" />
                        <span className="bg-stone-100 border border-l-0 border-stone-200 px-3 py-2 text-sm text-stone-500 rounded-r-md">m</span>
                      </div>
                    </div>
                    <div className="space-y-1.5 col-span-2">
                      <Label className="text-xs text-stone-500">Drain length (estimate basis)</Label>
                      <div className="flex items-center">
                        <Input defaultValue="100" className="rounded-r-none font-mono" />
                        <span className="bg-stone-100 border border-l-0 border-stone-200 px-3 py-2 text-sm text-stone-500 rounded-r-md">m</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h4 className="text-sm font-semibold text-stone-700 uppercase tracking-wider flex items-center gap-2">
                    <IndianRupee className="h-4 w-4" /> Costing Inputs
                  </h4>
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs text-stone-500">Formwork Type</Label>
                      <Select defaultValue="steel">
                        <SelectTrigger>
                          <SelectValue placeholder="Select type" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="steel">Steel Plates</SelectItem>
                          <SelectItem value="combo">Steel-Timber Combo</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <Label className="text-xs text-stone-500">Cost per m² (new)</Label>
                        <div className="flex items-center">
                          <span className="bg-stone-100 border border-r-0 border-stone-200 px-3 py-2 text-sm text-stone-500 rounded-l-md">₹</span>
                          <Input defaultValue="120" className="rounded-l-none font-mono" />
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs text-stone-500">Expected Uses</Label>
                        <Input defaultValue="8" className="font-mono" />
                      </div>
                    </div>
                    <div className="flex justify-between items-center bg-stone-50 p-2 rounded text-sm">
                      <span className="text-stone-500">Net cost/m²/use:</span>
                      <span className="font-mono font-medium">₹15.00</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-md p-4 space-y-2">
                <p className="text-sm text-amber-800 font-mono">
                  📐 Shuttering area: 2H + W = 2(1.5) + 1.2 = <strong>4.2 m²/m run</strong>
                </p>
                <p className="text-sm text-amber-800 font-mono">
                  Concrete volume: (2×H×T + W×T_slab) × L = (2×1.5×0.25 + 1.2×0.20) × 100 = <strong>99 m³</strong>
                </p>
                <div className="border-t border-amber-200/50 pt-2 mt-2 flex justify-between items-end">
                  <p className="text-sm text-amber-800 font-mono">
                    Shuttering m² per m³ concrete: 420 m² ÷ 99 m³ = <strong>4.24 m²/m³</strong>
                  </p>
                  <div className="bg-amber-500 text-white px-3 py-1 rounded shadow-sm text-sm font-bold flex items-center gap-1">
                    Cost per m³: ₹63.6
                  </div>
                </div>
              </div>

            </div>
          </AccordionContent>
        </AccordionItem>

        {/* 7. Labour & Curing */}
        <AccordionItem value="item-7" className="bg-white border border-stone-200 rounded-lg shadow-sm overflow-hidden">
          <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-stone-50 transition-colors">
            <div className="flex items-center gap-3 text-left">
              <div className="flex items-center justify-center w-8 h-8 rounded-full bg-amber-100 text-amber-700 font-bold text-sm shrink-0">
                ⑦
              </div>
              <div>
                <h3 className="font-semibold text-lg text-stone-800">Labour & Curing</h3>
                <p className="text-sm text-stone-500 font-normal">Crew size, wages, and curing methodology</p>
              </div>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-4 pb-4 pt-2">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              
              <div className="space-y-4">
                <h4 className="text-sm font-semibold text-stone-700 uppercase tracking-wider flex items-center gap-2">
                  <HardHat className="h-4 w-4" /> Labour
                </h4>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label className="text-xs text-stone-500">Crew Size</Label>
                      <Input defaultValue="8" className="font-mono" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs text-stone-500">Avg Wage (/day)</Label>
                      <div className="flex items-center">
                        <span className="bg-stone-100 border border-r-0 border-stone-200 px-3 py-2 text-sm text-stone-500 rounded-l-md">₹</span>
                        <Input defaultValue="700" className="rounded-l-none font-mono" />
                      </div>
                    </div>
                  </div>
                  <div className="flex justify-between items-center bg-stone-50 p-2 rounded text-sm">
                    <span className="text-stone-500">Total daily cost:</span>
                    <span className="font-mono font-medium">₹5,600</span>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-stone-500">Daily Productivity (m³)</Label>
                    <Input defaultValue="15" className="font-mono" />
                  </div>
                  <div className="flex justify-between items-center bg-stone-100 p-2 rounded text-sm border border-stone-200">
                    <span className="text-stone-600 font-medium">Labour cost per m³:</span>
                    <span className="font-mono font-bold text-stone-800">₹373</span>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <h4 className="text-sm font-semibold text-stone-700 uppercase tracking-wider flex items-center gap-2">
                  <Droplet className="h-4 w-4" /> Curing
                </h4>
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-stone-500">Curing Method</Label>
                    <Select defaultValue="water">
                      <SelectTrigger>
                        <SelectValue placeholder="Select method" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="water">Water Curing</SelectItem>
                        <SelectItem value="compound">Curing Compound</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-stone-500">Duration (Days)</Label>
                    <Input defaultValue="14" className="font-mono" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-stone-500">Water/Crew Cost per m³</Label>
                    <div className="flex items-center">
                      <span className="bg-stone-100 border border-r-0 border-stone-200 px-3 py-2 text-sm text-stone-500 rounded-l-md">₹</span>
                      <Input defaultValue="85" className="rounded-l-none font-mono" />
                    </div>
                  </div>
                  <div className="flex justify-between items-center bg-stone-100 p-2 rounded text-sm border border-stone-200 mt-2">
                    <span className="text-stone-600 font-medium">Curing cost per m³:</span>
                    <span className="font-mono font-bold text-stone-800">₹85</span>
                  </div>
                </div>
              </div>

            </div>
          </AccordionContent>
        </AccordionItem>

        {/* 8. Overhead & Margin */}
        <AccordionItem value="item-8" className="bg-white border border-stone-200 rounded-lg shadow-sm overflow-hidden">
          <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-stone-50 transition-colors">
            <div className="flex items-center gap-3 text-left">
              <div className="flex items-center justify-center w-8 h-8 rounded-full bg-amber-100 text-amber-700 font-bold text-sm shrink-0">
                ⑧
              </div>
              <div>
                <h3 className="font-semibold text-lg text-stone-800">Overhead & Margin</h3>
                <p className="text-sm text-stone-500 font-normal">Contractor markups</p>
              </div>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-4 pb-4 pt-2">
            <div className="space-y-4">
              
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-1.5">
                  <Label className="text-xs text-stone-500">Site Overhead (%)</Label>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center flex-1">
                      <Input defaultValue="8" className="rounded-r-none font-mono" />
                      <span className="bg-stone-100 border border-l-0 border-stone-200 px-3 py-2 text-sm text-stone-500 rounded-r-md">%</span>
                    </div>
                    <span className="text-sm font-mono text-stone-500 w-24 text-right">→ ₹552/m³</span>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-stone-500">Contractor Margin (%)</Label>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center flex-1">
                      <Input defaultValue="12" className="rounded-r-none font-mono" />
                      <span className="bg-stone-100 border border-l-0 border-stone-200 px-3 py-2 text-sm text-stone-500 rounded-r-md">%</span>
                    </div>
                    <span className="text-sm font-mono text-stone-500 w-24 text-right">→ ₹894/m³</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between text-sm text-stone-600 bg-stone-50 p-3 rounded-md border border-stone-100">
                <span>Base: <strong className="font-mono">₹6,774</strong></span>
                <span>→ After OH: <strong className="font-mono">₹7,315</strong></span>
                <span>→ After Margin: <strong className="font-mono text-stone-900">₹8,193</strong></span>
              </div>

            </div>
          </AccordionContent>
        </AccordionItem>

      </Accordion>

      {/* Summary Callout */}
      <div className="bg-amber-600 rounded-lg p-5 text-white shadow-md relative overflow-hidden">
        <div className="absolute -right-4 -top-4 opacity-10">
          <Calculator className="w-32 h-32" />
        </div>
        <div className="relative z-10 space-y-2">
          <div className="text-amber-100 text-sm font-mono flex flex-wrap gap-x-2 gap-y-1">
            <span>₹6,252 mat</span>
            <span>+</span>
            <span>₹650 batch/pump</span>
            <span>+</span>
            <span>₹64 formwork</span>
            <span>+</span>
            <span>₹373 labour</span>
            <span>+</span>
            <span>₹85 curing</span>
            <span>=</span>
            <span className="text-white font-semibold">₹7,424 base</span>
            <span>→</span>
            <span className="text-white font-semibold">₹8,994 w/ OH+M</span>
          </div>
          <h2 className="text-2xl font-bold tracking-tight">
            Final Rate: ₹8,994 <span className="text-amber-200 text-lg font-normal">/ m³ of M25 RCC</span>
          </h2>
          <p className="text-amber-100 text-sm">Including shuttering, labour, and all markups.</p>
        </div>
      </div>

      <div className="w-full h-px bg-stone-200 my-8"></div>

      <Accordion type="multiple" defaultValue={["item-9", "item-10", "item-11"]} className="space-y-4">
        
        {/* 9. BOQ & Profitability */}
        <AccordionItem value="item-9" className="bg-white border border-stone-200 rounded-lg shadow-sm overflow-hidden">
          <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-stone-50 transition-colors">
            <div className="flex items-center gap-3 text-left">
              <div className="flex items-center justify-center w-8 h-8 rounded-full bg-emerald-100 text-emerald-700 font-bold text-sm shrink-0">
                ⑨
              </div>
              <div>
                <h3 className="font-semibold text-lg text-stone-800">BOQ Items & Profitability</h3>
                <p className="text-sm text-stone-500 font-normal">Enter BOQ quantities and your quoted rates to see profitability</p>
              </div>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-0 pb-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-stone-50">
                  <TableRow>
                    <TableHead className="w-[50px] text-center">#</TableHead>
                    <TableHead className="min-w-[200px]">Description</TableHead>
                    <TableHead>Unit</TableHead>
                    <TableHead className="text-right">BOQ Qty</TableHead>
                    <TableHead className="text-right">Your Cost</TableHead>
                    <TableHead className="text-right bg-blue-50/50">Quoted Rate</TableHead>
                    <TableHead className="text-right">Revenue</TableHead>
                    <TableHead className="text-right">Cost</TableHead>
                    <TableHead className="text-right">Profit</TableHead>
                    <TableHead className="text-right w-[80px]">Margin</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="text-sm">
                  <TableRow>
                    <TableCell className="text-center text-stone-500">1</TableCell>
                    <TableCell className="font-medium text-stone-700">Earth work in excavation incl. backfilling</TableCell>
                    <TableCell className="text-stone-500">Cum</TableCell>
                    <TableCell className="text-right font-mono">3,812</TableCell>
                    <TableCell className="text-right font-mono">₹320</TableCell>
                    <TableCell className="p-1">
                      <Input defaultValue="380" className="h-8 text-right font-mono border-blue-200 focus-visible:ring-blue-500" />
                    </TableCell>
                    <TableCell className="text-right font-mono">14,48,560</TableCell>
                    <TableCell className="text-right font-mono">12,19,840</TableCell>
                    <TableCell className="text-right font-mono text-emerald-700 bg-emerald-50/50">2,28,720</TableCell>
                    <TableCell className="text-right font-mono text-emerald-700 bg-emerald-50/50">15.8% ↑</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="text-center text-stone-500">2</TableCell>
                    <TableCell className="font-medium text-stone-700">PCC M15 in Open Foundation</TableCell>
                    <TableCell className="text-stone-500">Cum</TableCell>
                    <TableCell className="text-right font-mono">450</TableCell>
                    <TableCell className="text-right font-mono">₹5,840</TableCell>
                    <TableCell className="p-1">
                      <Input defaultValue="6500" className="h-8 text-right font-mono border-blue-200 focus-visible:ring-blue-500" />
                    </TableCell>
                    <TableCell className="text-right font-mono">29,25,000</TableCell>
                    <TableCell className="text-right font-mono">26,28,000</TableCell>
                    <TableCell className="text-right font-mono text-emerald-700 bg-emerald-50/50">2,97,000</TableCell>
                    <TableCell className="text-right font-mono text-emerald-700 bg-emerald-50/50">10.2% ↑</TableCell>
                  </TableRow>
                  <TableRow className="bg-stone-50/50">
                    <TableCell className="text-center text-stone-500">3</TableCell>
                    <TableCell className="font-medium text-stone-900">RCC M25 Raft, Walls & Slab incl. Shuttering</TableCell>
                    <TableCell className="text-stone-500">Cum</TableCell>
                    <TableCell className="text-right font-mono font-bold">1,072</TableCell>
                    <TableCell className="text-right font-mono font-bold">₹8,994</TableCell>
                    <TableCell className="p-1">
                      <Input defaultValue="10200" className="h-8 text-right font-mono font-bold border-blue-400 focus-visible:ring-blue-500 shadow-sm" />
                    </TableCell>
                    <TableCell className="text-right font-mono font-bold">1,09,34,400</TableCell>
                    <TableCell className="text-right font-mono font-bold">96,41,568</TableCell>
                    <TableCell className="text-right font-mono font-bold text-emerald-700 bg-emerald-100/50">12,92,832</TableCell>
                    <TableCell className="text-right font-mono font-bold text-emerald-700 bg-emerald-100/50">11.8% ↑</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="text-center text-stone-500">4</TableCell>
                    <TableCell className="font-medium text-stone-700">HYSD Bar Reinforcement</TableCell>
                    <TableCell className="text-stone-500">MT</TableCell>
                    <TableCell className="text-right font-mono">54</TableCell>
                    <TableCell className="text-right font-mono">₹68,500</TableCell>
                    <TableCell className="p-1">
                      <Input defaultValue="75000" className="h-8 text-right font-mono border-blue-200 focus-visible:ring-blue-500" />
                    </TableCell>
                    <TableCell className="text-right font-mono">40,50,000</TableCell>
                    <TableCell className="text-right font-mono">36,99,000</TableCell>
                    <TableCell className="text-right font-mono text-emerald-700 bg-emerald-50/50">3,51,000</TableCell>
                    <TableCell className="text-right font-mono text-emerald-700 bg-emerald-50/50">8.7% ↑</TableCell>
                  </TableRow>
                </TableBody>
                <TableFooter className="bg-stone-100 font-bold">
                  <TableRow>
                    <TableCell colSpan={6} className="text-right">TOTAL</TableCell>
                    <TableCell className="text-right font-mono">₹1,93,57,960</TableCell>
                    <TableCell className="text-right font-mono">₹1,71,88,408</TableCell>
                    <TableCell className="text-right font-mono text-emerald-800 bg-emerald-100">₹21,69,552</TableCell>
                    <TableCell className="text-right font-mono text-emerald-800 bg-emerald-100">11.2%</TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* 10. Steel Breakdown */}
        <AccordionItem value="item-10" className="bg-white border border-stone-200 border-l-4 border-l-blue-500 rounded-lg shadow-sm overflow-hidden">
          <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-stone-50 transition-colors">
            <div className="flex items-center gap-3 text-left">
              <div className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-100 text-blue-700 font-bold text-sm shrink-0">
                ⑩
              </div>
              <div>
                <h3 className="font-semibold text-lg text-stone-800">HYSD Reinforcement Rate Analysis</h3>
                <p className="text-sm text-stone-500 font-normal">Dia-wise split and fabrication costs (Total: 54 MT)</p>
              </div>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-4 pb-4 pt-2">
            <div className="space-y-6">
              
              <div className="border border-stone-200 rounded-md overflow-hidden">
                <Table>
                  <TableHeader className="bg-stone-50">
                    <TableRow>
                      <TableHead>Dia</TableHead>
                      <TableHead className="text-right">% Share</TableHead>
                      <TableHead className="text-right">Weight (MT)</TableHead>
                      <TableHead className="text-right">Price ₹/MT</TableHead>
                      <TableHead className="text-right">Material Cost</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="text-sm">
                    <TableRow>
                      <TableCell className="font-medium">8mm TMT</TableCell>
                      <TableCell className="text-right">10%</TableCell>
                      <TableCell className="text-right font-mono">5.4</TableCell>
                      <TableCell className="text-right font-mono">₹65,500</TableCell>
                      <TableCell className="text-right font-mono">₹3,53,700</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="font-medium">10mm TMT</TableCell>
                      <TableCell className="text-right">15%</TableCell>
                      <TableCell className="text-right font-mono">8.1</TableCell>
                      <TableCell className="text-right font-mono">₹64,000</TableCell>
                      <TableCell className="text-right font-mono">₹5,18,400</TableCell>
                    </TableRow>
                    <TableRow className="bg-blue-50/30">
                      <TableCell className="font-medium">12mm TMT</TableCell>
                      <TableCell className="text-right">40%</TableCell>
                      <TableCell className="text-right font-mono">21.6</TableCell>
                      <TableCell className="text-right font-mono">₹63,500</TableCell>
                      <TableCell className="text-right font-mono">₹13,71,600</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="font-medium">16mm TMT</TableCell>
                      <TableCell className="text-right">30%</TableCell>
                      <TableCell className="text-right font-mono">16.2</TableCell>
                      <TableCell className="text-right font-mono">₹63,000</TableCell>
                      <TableCell className="text-right font-mono">₹10,20,600</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="font-medium">20mm TMT</TableCell>
                      <TableCell className="text-right">5%</TableCell>
                      <TableCell className="text-right font-mono">2.7</TableCell>
                      <TableCell className="text-right font-mono">₹62,500</TableCell>
                      <TableCell className="text-right font-mono">₹1,68,750</TableCell>
                    </TableRow>
                  </TableBody>
                  <TableFooter className="bg-stone-100">
                    <TableRow>
                      <TableCell className="font-bold">Total</TableCell>
                      <TableCell className="text-right font-bold">100%</TableCell>
                      <TableCell className="text-right font-mono font-bold">54</TableCell>
                      <TableCell className="text-right font-mono text-stone-500">₹63,390 avg</TableCell>
                      <TableCell className="text-right font-mono font-bold">₹34,23,050</TableCell>
                    </TableRow>
                  </TableFooter>
                </Table>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2 text-sm">
                  <h4 className="font-semibold text-stone-700 uppercase tracking-wider mb-3">Additional Costs</h4>
                  <div className="flex justify-between border-b border-stone-100 pb-1">
                    <span className="text-stone-600">Cutting & bending (₹3,500/MT)</span>
                    <span className="font-mono">₹1,89,000</span>
                  </div>
                  <div className="flex justify-between border-b border-stone-100 pb-1">
                    <span className="text-stone-600">Binding wire (1.5kg/MT @ ₹80)</span>
                    <span className="font-mono">₹6,480</span>
                  </div>
                  <div className="flex justify-between border-b border-stone-100 pb-1">
                    <span className="text-stone-600">Fixing labour (₹1,500/MT)</span>
                    <span className="font-mono">₹81,000</span>
                  </div>
                  <div className="flex justify-between pb-1">
                    <span className="text-stone-600">5% cutting waste</span>
                    <span className="font-mono">₹1,71,153</span>
                  </div>
                </div>

                <div className="bg-blue-50 border border-blue-200 rounded-md p-4 flex flex-col justify-center space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-blue-800 font-medium">Total HYSD Cost:</span>
                    <span className="font-mono font-bold text-lg text-blue-900">₹69,827 <span className="text-sm font-normal text-blue-700">/MT</span></span>
                  </div>
                  <div className="w-full h-px bg-blue-200/50"></div>
                  <div className="flex justify-between items-center">
                    <span className="text-stone-600 text-sm">Rate you're quoting:</span>
                    <span className="font-mono font-medium text-stone-800 text-sm">₹75,000 /MT</span>
                  </div>
                  <div className="flex justify-between items-center text-emerald-700">
                    <span className="text-sm font-medium">Profit per MT:</span>
                    <span className="font-mono font-bold text-sm">₹5,173 (6.9%)</span>
                  </div>
                </div>
              </div>

            </div>
          </AccordionContent>
        </AccordionItem>

      </Accordion>

      {/* 11. Hidden Factors Panel */}
      <div className="border-2 border-amber-400 bg-amber-50 rounded-lg overflow-hidden shadow-sm mt-8">
        <div className="bg-amber-100 px-4 py-3 flex items-center gap-3 border-b border-amber-200">
          <div className="flex items-center justify-center w-8 h-8 rounded-full bg-amber-200 text-amber-800 font-bold text-sm shrink-0">⑪</div>
          <AlertTriangle className="h-5 w-5 text-amber-600" />
          <div>
            <h3 className="font-bold text-amber-900">Hidden Factors — Sensitivity Analysis</h3>
            <p className="text-xs text-amber-700">See how your margin changes if key assumptions shift</p>
          </div>
        </div>
        <div className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="border-amber-200 hover:bg-transparent">
                <TableHead className="text-amber-900 font-semibold">Factor</TableHead>
                <TableHead className="text-amber-900 font-semibold">Assumption</TableHead>
                <TableHead className="text-amber-900 font-semibold">If Worse</TableHead>
                <TableHead className="text-amber-900 font-semibold">Cost Impact (Item total)</TableHead>
                <TableHead className="text-amber-900 font-semibold text-right">Margin Impact</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="text-sm border-b-0">
              <TableRow className="border-amber-100 hover:bg-amber-100/50">
                <TableCell className="font-medium text-stone-800">Sand bulkage</TableCell>
                <TableCell>25%</TableCell>
                <TableCell className="text-red-600 font-medium">35%</TableCell>
                <TableCell className="font-mono text-stone-600">+₹37/m³ <span className="text-xs text-stone-400">(₹39,664)</span></TableCell>
                <TableCell className="text-right font-mono text-red-600 font-medium">-0.2%</TableCell>
              </TableRow>
              <TableRow className="border-amber-100 hover:bg-amber-100/50">
                <TableCell className="font-medium text-stone-800">Cement wastage</TableCell>
                <TableCell>2%</TableCell>
                <TableCell className="text-red-600 font-medium">5%</TableCell>
                <TableCell className="font-mono text-stone-600">+₹96/m³ <span className="text-xs text-stone-400">(₹1,02,912)</span></TableCell>
                <TableCell className="text-right font-mono text-red-600 font-medium">-0.5%</TableCell>
              </TableRow>
              <TableRow className="border-amber-100 hover:bg-amber-100/50">
                <TableCell className="font-medium text-stone-800">Steel cutting waste</TableCell>
                <TableCell>5%</TableCell>
                <TableCell className="text-red-600 font-medium">8%</TableCell>
                <TableCell className="font-mono text-stone-600">+₹1,903/MT <span className="text-xs text-stone-400">(₹1,02,762)</span></TableCell>
                <TableCell className="text-right font-mono text-red-600 font-medium">-0.5%</TableCell>
              </TableRow>
              <TableRow className="border-amber-100 hover:bg-amber-100/50">
                <TableCell className="font-medium text-stone-800">Formwork reuse</TableCell>
                <TableCell>8 uses</TableCell>
                <TableCell className="text-red-600 font-medium">5 uses</TableCell>
                <TableCell className="font-mono text-stone-600">+₹38/m³ <span className="text-xs text-stone-400">(₹40,736)</span></TableCell>
                <TableCell className="text-right font-mono text-red-600 font-medium">-0.2%</TableCell>
              </TableRow>
            </TableBody>
            <TableFooter className="bg-amber-200/50 border-t-2 border-amber-300">
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={3} className="font-bold text-amber-900">Worst case total</TableCell>
                <TableCell className="font-mono font-bold text-red-700">+₹2,86,074</TableCell>
                <TableCell className="text-right font-mono font-bold text-red-700">-1.5%</TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </div>
      </div>

      {/* Total Profitability Summary */}
      <div className="bg-emerald-50 border-2 border-emerald-200 rounded-lg p-6 shadow-sm mt-8">
        <div className="flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="space-y-2 flex-1">
            <h2 className="text-2xl font-bold text-emerald-900 tracking-tight">Project Profitability</h2>
            <div className="flex gap-4 text-sm font-mono text-emerald-700">
              <span>Rev: ₹1,93,57,960</span>
              <span>•</span>
              <span>Cost: ₹1,71,88,408</span>
            </div>
          </div>
          
          <div className="bg-white rounded-md p-4 shadow-sm border border-emerald-100 flex gap-8 shrink-0">
            <div>
              <p className="text-xs text-stone-500 uppercase tracking-wider font-semibold mb-1">Gross Profit</p>
              <p className="text-2xl font-bold font-mono text-emerald-700">₹21,69,552</p>
            </div>
            <div className="w-px bg-emerald-100"></div>
            <div>
              <p className="text-xs text-stone-500 uppercase tracking-wider font-semibold mb-1">Overall Margin</p>
              <p className="text-2xl font-bold font-mono text-emerald-700 flex items-center gap-1">
                11.2% <TrendingUp className="h-5 w-5" />
              </p>
            </div>
          </div>
        </div>

        <div className="mt-4 pt-4 border-t border-emerald-200/50 flex items-center justify-between text-sm text-stone-600 bg-white/50 px-4 py-2 rounded">
          <span className="flex items-center gap-1.5"><AlertTriangle className="h-4 w-4 text-amber-500" /> If worst case hidden factors materialize:</span>
          <div className="font-mono font-medium text-stone-800 space-x-4">
            <span>Revised Profit: ₹18,83,478</span>
            <span className="text-stone-400">•</span>
            <span>Revised Margin: <span className="text-amber-600">9.7%</span></span>
          </div>
        </div>
      </div>

    </div>
  );
}
