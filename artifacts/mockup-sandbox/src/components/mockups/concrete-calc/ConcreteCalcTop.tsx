import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Slider } from "@/components/ui/slider";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle, Info, MapPin } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

export default function ConcreteCalcTop() {
  const [bulkage, setBulkage] = useState([25]);
  const [batchMode, setBatchMode] = useState<"own" | "hired" | "rmc">("hired");

  return (
    <div className="bg-slate-50 min-h-screen p-4 md:p-8 font-sans text-slate-900">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Concrete Rate Analysis</h1>
            <p className="text-slate-500">M25 RCC / Covered RCC Drain</p>
          </div>
          <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-200 border-amber-200">
            Draft
          </Badge>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* LEFT COLUMN - 65% (8/12 cols) */}
          <div className="lg:col-span-8 space-y-6">
            
            {/* 1. Project Info */}
            <Card className="border-l-4 border-l-amber-600 shadow-sm">
              <CardHeader className="pb-3 flex flex-row items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center font-bold font-mono shrink-0">①</div>
                <CardTitle className="text-lg">Project Info</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label>Project Name</Label>
                  <Input defaultValue="NH-48 Storm Drain Works — Km 12 to 18" className="bg-slate-50" />
                </div>
                <div className="space-y-1">
                  <Label>Prepared By</Label>
                  <Input defaultValue="RK Mehta" className="bg-slate-50" />
                </div>
                <div className="space-y-1">
                  <Label>Date</Label>
                  <Input defaultValue="08 Apr 2026" type="date" className="bg-slate-50" />
                </div>
                <div className="space-y-1">
                  <Label>Structure Type</Label>
                  <Select defaultValue="covered-rcc">
                    <SelectTrigger className="bg-slate-50">
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="covered-rcc">Covered RCC Drain</SelectItem>
                      <SelectItem value="open-drain">Open Drain</SelectItem>
                      <SelectItem value="box-culvert">Box Culvert</SelectItem>
                      <SelectItem value="bridge-pier">Bridge Pier & Abutment</SelectItem>
                      <SelectItem value="bridge-deck">Bridge Deck Slab</SelectItem>
                      <SelectItem value="retaining-wall">Retaining Wall</SelectItem>
                      <SelectItem value="footing">Footing</SelectItem>
                      <SelectItem value="general-rcc">General RCC</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            {/* 2. Concrete Grade & Mix Design */}
            <Card className="border-l-4 border-l-amber-600 shadow-sm">
              <CardHeader className="pb-3 flex flex-row items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center font-bold font-mono shrink-0">②</div>
                <CardTitle className="text-lg">Concrete Grade & Mix Design</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div>
                  <Label className="mb-2 block">Select Grade</Label>
                  <div className="flex flex-wrap gap-2">
                    {['M10', 'M15', 'M20', 'M25', 'M30', 'M35', 'M40'].map(grade => (
                      <Badge 
                        key={grade}
                        variant="outline" 
                        className={`px-3 py-1 text-sm cursor-pointer ${grade === 'M25' ? 'bg-amber-600 text-white hover:bg-amber-700 border-amber-600' : 'bg-white hover:bg-slate-100 text-slate-600'}`}
                      >
                        {grade}
                      </Badge>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="flex justify-between items-end mb-2">
                    <Label>Mix Proportions</Label>
                    <span className="text-xs text-slate-500 italic">IS:10262-2019 nominal mix. Edit values to match your approved mix design.</span>
                  </div>
                  <div className="border rounded-md overflow-hidden">
                    <Table>
                      <TableHeader className="bg-slate-50">
                        <TableRow>
                          <TableHead>Component</TableHead>
                          <TableHead className="w-32">Per m³</TableHead>
                          <TableHead>Unit</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        <TableRow>
                          <TableCell className="font-medium">Cement (OPC 53)</TableCell>
                          <TableCell><Input defaultValue="380" className="h-8 w-24 text-right" /></TableCell>
                          <TableCell className="text-slate-500 text-sm">kg/m³</TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell className="font-medium">Coarse Agg (20mm)</TableCell>
                          <TableCell><Input defaultValue="1020" className="h-8 w-24 text-right" /></TableCell>
                          <TableCell className="text-slate-500 text-sm">kg/m³</TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell className="font-medium">Fine Agg / Sand</TableCell>
                          <TableCell><Input defaultValue="690" className="h-8 w-24 text-right" /></TableCell>
                          <TableCell className="text-slate-500 text-sm">kg/m³</TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell className="font-medium">Water</TableCell>
                          <TableCell><Input defaultValue="172" className="h-8 w-24 text-right" /></TableCell>
                          <TableCell className="text-slate-500 text-sm">litre/m³</TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell className="font-medium">Admixture</TableCell>
                          <TableCell><Input defaultValue="1.5" className="h-8 w-24 text-right" /></TableCell>
                          <TableCell className="text-slate-500 text-sm">% of cement</TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>
                </div>

                <div className="flex gap-4 p-3 bg-amber-50 rounded-lg border border-amber-100">
                  <div className="flex-1">
                    <span className="text-sm text-amber-800 block">Density of Concrete</span>
                    <span className="text-lg font-semibold text-amber-900">2450 <span className="text-sm font-normal">kg/m³</span></span>
                  </div>
                  <Separator orientation="vertical" className="h-auto bg-amber-200" />
                  <div className="flex-1">
                    <span className="text-sm text-amber-800 block">Cement Requirement</span>
                    <span className="text-lg font-semibold text-amber-900">7.6 <span className="text-sm font-normal">bags/m³</span></span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* 3. Raw Materials */}
            <Card className="border-l-4 border-l-amber-600 shadow-sm">
              <CardHeader className="pb-3 flex flex-row items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center font-bold font-mono shrink-0">③</div>
                <CardTitle className="text-lg">Raw Materials Rate</CardTitle>
              </CardHeader>
              <CardContent className="space-y-8">
                
                {/* Cement */}
                <div className="space-y-3">
                  <h4 className="font-semibold text-slate-800 border-b pb-1">Cement</h4>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 items-end">
                    <div className="space-y-1">
                      <Label>Price per bag</Label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">₹</span>
                        <Input defaultValue="420" className="pl-7 bg-slate-50" />
                      </div>
                    </div>
                    <div className="col-span-2 md:col-span-3 flex items-center justify-end">
                      <div className="text-right">
                        <span className="text-sm text-slate-500 block">Cost per m³</span>
                        <span className="text-xl font-semibold text-slate-900">₹3,192</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Coarse Agg */}
                <div className="space-y-3">
                  <h4 className="font-semibold text-slate-800 border-b pb-1">Coarse Aggregate (20mm)</h4>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="space-y-1">
                      <Label>Purchase Rate</Label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">₹</span>
                        <Input defaultValue="1200" className="pl-7 bg-slate-50" />
                      </div>
                      <span className="text-xs text-slate-500">per MT</span>
                    </div>
                    <div className="space-y-1">
                      <Label>Lead Distance</Label>
                      <div className="relative">
                        <Input defaultValue="28" className="pr-8 bg-slate-50" />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">km</span>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label>Freight Rate</Label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">₹</span>
                        <Input defaultValue="9" className="pl-7 bg-slate-50" />
                      </div>
                      <span className="text-xs text-slate-500">per km/load</span>
                    </div>
                    <div className="space-y-1">
                      <Label>Payload</Label>
                      <div className="relative">
                        <Input defaultValue="16" className="pr-8 bg-slate-50" />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">MT</span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex gap-4 p-3 bg-slate-50 rounded-lg border">
                    <div className="flex-1">
                      <span className="text-sm text-slate-500 block">Freight per MT</span>
                      <span className="text-sm font-medium text-amber-600">₹31.50</span>
                    </div>
                    <Separator orientation="vertical" className="h-auto" />
                    <div className="flex-1">
                      <span className="text-sm text-slate-500 block">Landed Rate</span>
                      <span className="text-sm font-medium text-amber-600">₹1,231.50 <span className="text-xs font-normal text-slate-500">/MT</span></span>
                    </div>
                    <Separator orientation="vertical" className="h-auto" />
                    <div className="flex-1 text-right">
                      <span className="text-sm text-slate-500 block">Cost per m³</span>
                      <span className="text-lg font-semibold text-slate-900">₹1,256</span>
                    </div>
                  </div>
                </div>

                {/* Fine Agg / Sand */}
                <div className="space-y-3">
                  <div className="flex justify-between items-center border-b pb-1">
                    <h4 className="font-semibold text-slate-800">Fine Aggregate / Sand</h4>
                  </div>
                  
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="space-y-1">
                      <Label>Purchase Rate</Label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">₹</span>
                        <Input defaultValue="800" className="pl-7 bg-slate-50" />
                      </div>
                      <span className="text-xs text-slate-500">per MT</span>
                    </div>
                    <div className="space-y-1">
                      <Label>Lead Distance</Label>
                      <div className="relative">
                        <Input defaultValue="18" className="pr-8 bg-slate-50" />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">km</span>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label>Freight Rate</Label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">₹</span>
                        <Input defaultValue="9" className="pl-7 bg-slate-50" />
                      </div>
                      <span className="text-xs text-slate-500">per km/load</span>
                    </div>
                    <div className="space-y-1">
                      <Label>Payload</Label>
                      <div className="relative">
                        <Input defaultValue="16" className="pr-8 bg-slate-50" />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">MT</span>
                      </div>
                    </div>
                  </div>

                  {/* Sand Bulkage */}
                  <div className="p-4 border rounded-lg space-y-4">
                    <div className="flex justify-between items-center">
                      <Label className="text-base">Sand Bulkage Factor</Label>
                      <span className="text-lg font-bold text-amber-600">{bulkage[0]}%</span>
                    </div>
                    <Slider 
                      defaultValue={[25]} 
                      max={40} 
                      step={1} 
                      className="py-2"
                      onValueChange={setBulkage}
                    />
                    
                    <Alert className="bg-amber-50 border-amber-200 text-amber-800">
                      <AlertTriangle className="h-4 w-4 text-amber-600" />
                      <AlertDescription>
                        <strong>Bulkage Impact:</strong> You'll need 0.863 m³ loose sand per m³ concrete instead of 0.690 m³ dry sand from mix design. <span className="font-semibold">Extra cost: ₹94/m³</span>
                      </AlertDescription>
                    </Alert>
                  </div>

                  <div className="flex gap-4 p-3 bg-slate-50 rounded-lg border">
                    <div className="flex-1">
                      <span className="text-sm text-slate-500 block">Landed Rate</span>
                      <span className="text-sm font-medium text-slate-700">₹900.75 <span className="text-xs font-normal text-slate-500">/MT</span></span>
                    </div>
                    <Separator orientation="vertical" className="h-auto" />
                    <div className="flex-1 text-right">
                      <span className="text-sm text-slate-500 block">Effective cost per m³ (with bulkage)</span>
                      <span className="text-lg font-semibold text-slate-900">₹778</span>
                    </div>
                  </div>
                </div>

                {/* Admixture */}
                <div className="space-y-3">
                  <h4 className="font-semibold text-slate-800 border-b pb-1">Admixture</h4>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 items-end">
                    <div className="space-y-1">
                      <Label>Price</Label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">₹</span>
                        <Input defaultValue="180" className="pl-7 bg-slate-50" />
                      </div>
                      <span className="text-xs text-slate-500">per litre</span>
                    </div>
                    <div className="space-y-1">
                      <Label>Dosage</Label>
                      <div className="relative">
                        <Input defaultValue="5.7" className="pr-16 bg-slate-50" readOnly />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">litres/m³</span>
                      </div>
                    </div>
                    <div className="col-span-2 flex items-center justify-end">
                      <div className="text-right">
                        <span className="text-sm text-slate-500 block">Cost per m³</span>
                        <span className="text-xl font-semibold text-slate-900">₹1,026</span>
                      </div>
                    </div>
                  </div>
                </div>

              </CardContent>
            </Card>

            {/* 4. Batching & Production */}
            <Card className="border-l-4 border-l-amber-600 shadow-sm">
              <CardHeader className="pb-3 flex flex-row items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center font-bold font-mono shrink-0">④</div>
                <CardTitle className="text-lg">Batching & Production</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <RadioGroup value={batchMode} onValueChange={(v) => setBatchMode(v as "own" | "hired" | "rmc")} className="flex flex-col sm:flex-row gap-4">
                  <div className={`flex items-center space-x-2 border rounded-md p-3 flex-1 cursor-pointer ${batchMode === "own" ? "bg-blue-50 border-blue-200" : ""}`}>
                    <RadioGroupItem value="own" id="r1" />
                    <Label htmlFor="r1" className="cursor-pointer">Own Batching Plant</Label>
                  </div>
                  <div className={`flex items-center space-x-2 border rounded-md p-3 flex-1 cursor-pointer ${batchMode === "hired" ? "bg-blue-50 border-blue-200" : ""}`}>
                    <RadioGroupItem value="hired" id="r2" />
                    <Label htmlFor="r2" className={`cursor-pointer ${batchMode === "hired" ? "text-blue-900 font-medium" : ""}`}>Hired Batching Plant</Label>
                  </div>
                  <div className={`flex items-center space-x-2 border rounded-md p-3 flex-1 cursor-pointer ${batchMode === "rmc" ? "bg-blue-50 border-blue-200" : ""}`}>
                    <RadioGroupItem value="rmc" id="r3" />
                    <Label htmlFor="r3" className="cursor-pointer">RMC Supply</Label>
                  </div>
                </RadioGroup>

                {batchMode === "hired" && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 border rounded-lg bg-blue-50 border-blue-100">
                    <div className="space-y-1">
                      <Label>Hire Rate</Label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">₹</span>
                        <Input defaultValue="450" className="pl-7 bg-white max-w-[200px]" />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">/m³</span>
                      </div>
                      <span className="text-xs text-slate-500 mt-1 block">Includes: batching, water, operator</span>
                    </div>
                    <div className="flex items-center justify-end">
                      <div className="text-right">
                        <span className="text-sm text-slate-500 block">Cost per m³</span>
                        <span className="text-xl font-semibold text-blue-700">₹450</span>
                      </div>
                    </div>
                  </div>
                )}

                {batchMode === "own" && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-4 border rounded-lg bg-amber-50 border-amber-100">
                    <div className="space-y-1">
                      <Label>Plant capacity</Label>
                      <div className="relative">
                        <Input defaultValue="30" className="bg-white max-w-[140px]" />
                        <span className="text-xs text-slate-500 block mt-1">m³/hr</span>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label>Fuel cost/hr</Label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">₹</span>
                        <Input defaultValue="850" className="pl-7 bg-white" />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label>Operator & misc/hr</Label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">₹</span>
                        <Input defaultValue="320" className="pl-7 bg-white" />
                      </div>
                    </div>
                    <div className="col-span-3 flex justify-end">
                      <div className="text-right">
                        <span className="text-sm text-slate-500 block">Derived cost per m³</span>
                        <span className="text-xl font-semibold text-amber-700">₹39</span>
                        <span className="text-xs text-slate-500 block">(₹1,170/hr ÷ 30 m³/hr)</span>
                      </div>
                    </div>
                  </div>
                )}

                {batchMode === "rmc" && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 border rounded-lg bg-green-50 border-green-100">
                    <div className="space-y-1">
                      <Label>RMC quoted rate</Label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">₹</span>
                        <Input defaultValue="6800" className="pl-7 bg-white max-w-[200px]" />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">/m³</span>
                      </div>
                      <span className="text-xs text-green-700 mt-1 block">⚠ This replaces raw material cost — enter full delivered rate</span>
                    </div>
                    <div className="flex items-center justify-end">
                      <div className="text-right">
                        <span className="text-sm text-slate-500 block">Cost per m³</span>
                        <span className="text-xl font-semibold text-green-700">₹6,800</span>
                        <span className="text-xs text-slate-500 block">Includes mix, delivery, pump</span>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* 5. Concrete Pump */}
            <Card className="border-l-4 border-l-amber-600 shadow-sm">
              <CardHeader className="pb-3 flex flex-row items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center font-bold font-mono shrink-0">⑤</div>
                <CardTitle className="text-lg">Concrete Pump</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex bg-slate-100 p-1 rounded-md max-w-xs">
                  <div className="flex-1 text-center py-1.5 rounded bg-white shadow-sm text-sm font-medium border border-slate-200 cursor-pointer">Hired</div>
                  <div className="flex-1 text-center py-1.5 rounded text-slate-500 text-sm font-medium hover:text-slate-700 cursor-pointer">Owned</div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-1">
                    <Label>Pump Type</Label>
                    <Select defaultValue="line-pump">
                      <SelectTrigger className="bg-white">
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="line-pump">Line Pump (80m)</SelectItem>
                        <SelectItem value="boom-pump">Boom Pump (36m)</SelectItem>
                        <SelectItem value="static">Static Pump</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label>Daily Hire</Label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">₹</span>
                      <Input defaultValue="12000" className="pl-7 bg-white" />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label>Expected Daily Output</Label>
                    <div className="relative">
                      <Input defaultValue="60" className="pr-12 bg-white" />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">m³/day</span>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end pt-2 border-t">
                  <div className="text-right">
                    <span className="text-sm text-slate-500 block">Cost per m³</span>
                    <span className="text-xl font-semibold text-slate-900">₹200</span>
                  </div>
                </div>
              </CardContent>
            </Card>

          </div>

          {/* RIGHT COLUMN - 35% Sticky (4/12 cols) */}
          <div className="lg:col-span-4 relative">
            <div className="sticky top-6 space-y-4">
              <Card className="border-b-4 border-b-amber-600 shadow-md">
                <CardHeader className="bg-slate-50 pb-4 border-b">
                  <CardTitle className="text-lg flex justify-between items-center">
                    Rate Summary — M25 RCC
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-4 p-0">
                  <Table className="text-sm">
                    <TableBody>
                      {/* Materials */}
                      <TableRow className="border-none">
                        <TableCell className="py-2 text-slate-600">Cement (7.6 bags × ₹420)</TableCell>
                        <TableCell className="py-2 text-right">3,192</TableCell>
                      </TableRow>
                      <TableRow className="border-none">
                        <TableCell className="py-2 text-slate-600">Coarse Aggregate</TableCell>
                        <TableCell className="py-2 text-right">1,256</TableCell>
                      </TableRow>
                      <TableRow className="border-none">
                        <TableCell className="py-2 text-slate-600">Sand (with 25% bulkage)</TableCell>
                        <TableCell className="py-2 text-right">778</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="py-2 text-slate-600 pb-4 border-b">Admixture</TableCell>
                        <TableCell className="py-2 text-right pb-4 border-b">1,026</TableCell>
                      </TableRow>
                      <TableRow className="bg-amber-50/50">
                        <TableCell className="py-3 font-semibold text-amber-900">Materials Total</TableCell>
                        <TableCell className="py-3 text-right font-semibold text-amber-900">6,252</TableCell>
                      </TableRow>

                      {/* Production */}
                      <TableRow className="border-none">
                        <TableCell className="py-2 pt-4 text-slate-600">Hired Batching Plant</TableCell>
                        <TableCell className="py-2 pt-4 text-right">450</TableCell>
                      </TableRow>
                      <TableRow className="border-none">
                        <TableCell className="py-2 text-slate-600">Concrete Pump</TableCell>
                        <TableCell className="py-2 text-right">200</TableCell>
                      </TableRow>
                      <TableRow className="border-none">
                        <TableCell className="py-2 text-slate-400 italic">Formwork (shuttering)</TableCell>
                        <TableCell className="py-2 text-right text-slate-400">—</TableCell>
                      </TableRow>
                      <TableRow className="border-none">
                        <TableCell className="py-2 text-slate-400 italic">Labour & Crew</TableCell>
                        <TableCell className="py-2 text-right text-slate-400">—</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="py-2 text-slate-400 italic pb-4 border-b">Curing</TableCell>
                        <TableCell className="py-2 text-right text-slate-400 pb-4 border-b">—</TableCell>
                      </TableRow>
                      <TableRow className="bg-blue-50/30">
                        <TableCell className="py-3 font-semibold text-slate-700">Production Sub-total</TableCell>
                        <TableCell className="py-3 text-right font-semibold text-slate-700">6,902</TableCell>
                      </TableRow>

                      {/* OH & Margin */}
                      <TableRow className="border-none">
                        <TableCell className="py-2 pt-4 text-slate-600">Overhead (8%)</TableCell>
                        <TableCell className="py-2 pt-4 text-right">552</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="py-2 text-slate-600 pb-4 border-b">Margin (12%)</TableCell>
                        <TableCell className="py-2 text-right pb-4 border-b">894</TableCell>
                      </TableRow>
                      
                      {/* Total */}
                      <TableRow className="bg-slate-100 hover:bg-slate-100 border-none">
                        <TableCell className="py-4 font-bold text-lg text-slate-900">TOTAL RATE ₹/m³</TableCell>
                        <TableCell className="py-4 text-right font-bold text-lg text-slate-900">8,348</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>

                  <div className="p-4 pt-2">
                    {/* Stacked bar chart */}
                    <div className="w-full h-3 bg-slate-200 rounded-full flex overflow-hidden mb-2">
                      <div className="bg-amber-500 h-full" style={{ width: '75%' }} title="Materials: 75%"></div>
                      <div className="bg-blue-500 h-full" style={{ width: '8%' }} title="Production: 8%"></div>
                      <div className="bg-slate-400 h-full" style={{ width: '17%' }} title="OH & Margin: 17%"></div>
                    </div>
                    <div className="flex justify-between text-[10px] text-slate-500 px-1">
                      <span>Materials (75%)</span>
                      <span>Prod (8%)</span>
                      <span>OH/M (17%)</span>
                    </div>
                  </div>

                </CardContent>
              </Card>

              <p className="text-sm text-slate-500 flex items-center gap-2 justify-center italic">
                <Info className="w-4 h-4" />
                Formwork, Labour, Curing inputs below will update this summary
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}