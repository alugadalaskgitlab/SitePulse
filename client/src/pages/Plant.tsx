import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useSearch } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Link } from "wouter";
import { useOrigin } from "@/hooks/use-origin";
import { ChevronLeft, Plus, Users, Package, Layers, Truck, Settings, Gauge, Droplets, ChevronRight, Loader2, Pencil, Trash2, Download, Printer, Lock, ArrowUpRight, RotateCcw, AlertTriangle, Shield, Fuel, Power, ClipboardList, Receipt, FileText, ArrowRightLeft, Scale, Flame } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import * as XLSX from "xlsx";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAccess } from "@/lib/access-context";
import { PinAuth } from "@/components/PinAuth";
import type { Party, PlantMaterial, MixTemplate, EquipmentMasterType, MixType, MaterialOpeningStock, Personnel } from "@shared/schema";
import { EQUIPMENT_TYPES, METER_TYPES, PERSONNEL_ROLES } from "@shared/schema";
import { format } from "date-fns";

export default function Plant() {
  const searchString = useSearch();
  const params = new URLSearchParams(searchString || window.location.search);
  const tabParam = params.get("tab");
  const roleParam = params.get("role") as "manager" | "admin" | null;
  
  const initialUnlocked = new Map<string, "manager" | "admin">();
  if (tabParam && roleParam && ["stock", "masters"].includes(tabParam)) {
    initialUnlocked.set(tabParam, roleParam);
  }
  
  const [activeTab, setActiveTab] = useState(tabParam || "operations");
  const [showPinAuth, setShowPinAuth] = useState(false);
  const [pendingTab, setPendingTab] = useState<string | null>(null);
  const [unlockedTabs, setUnlockedTabs] = useState<Map<string, "manager" | "admin">>(initialUnlocked);
  const { toast } = useToast();
  const { setAccess } = useAccess();
  
  const { getBackLink, appendOrigin } = useOrigin();
  const backLink = getBackLink("/plant");

  useEffect(() => {
    if (tabParam && ["operations", "stock", "masters"].includes(tabParam)) {
      setActiveTab(tabParam);
      if (roleParam && ["stock", "masters"].includes(tabParam)) {
        setUnlockedTabs(prev => {
          const newMap = new Map(prev);
          newMap.set(tabParam, roleParam);
          return newMap;
        });
        setAccess(roleParam);
      }
    }
  }, [tabParam, roleParam]);

  const handleTabChange = (tab: string) => {
    if ((tab === "masters" || tab === "stock") && !unlockedTabs.has(tab)) {
      setPendingTab(tab);
      setShowPinAuth(true);
      return;
    }
    setActiveTab(tab);
  };

  const handlePinSuccess = (role: "manager" | "admin") => {
    if (pendingTab) {
      setAccess(role);
      setUnlockedTabs(prev => {
        const newMap = new Map(prev);
        newMap.set(pendingTab, role);
        return newMap;
      });
      setActiveTab(pendingTab);
      const tabNames: Record<string, string> = { masters: "Masters", stock: "Management" };
      toast({ title: `${tabNames[pendingTab] || pendingTab} unlocked`, description: role === "manager" ? "View and add only" : "Full access" });
    }
    setShowPinAuth(false);
    setPendingTab(null);
  };

  const handlePinClose = () => {
    setShowPinAuth(false);
    setPendingTab(null);
  };
  
  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-4">
          <Link href={backLink}>
            <Button variant="ghost" size="icon" data-testid="button-back">
              <ChevronLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold font-display tracking-tight text-foreground">Plant Module</h1>
            <p className="text-muted-foreground mt-1">Hot-mix plant operations and material tracking</p>
          </div>
        </div>
      </div>

      {showPinAuth && (
        <PinAuth
          targetRole="any"
          onSuccess={handlePinSuccess}
          onClose={handlePinClose}
        />
      )}

      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="operations" className="gap-2" data-testid="tab-operations">
            <Truck className="w-4 h-4" />
            <span className="hidden sm:inline">Operations</span>
          </TabsTrigger>
          <TabsTrigger value="stock" className="gap-2" data-testid="tab-management">
            <Layers className="w-4 h-4" />
            <span className="hidden sm:inline">Management</span>
          </TabsTrigger>
          <TabsTrigger value="masters" className="gap-2" data-testid="tab-masters">
            <Settings className="w-4 h-4" />
            <span className="hidden sm:inline">Masters</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="operations" className="mt-6">
          <OperationsTab />
        </TabsContent>

        <TabsContent value="stock" className="mt-6">
          {unlockedTabs.has("stock") ? (
            <StockDetailsTab unlockedRole={unlockedTabs.get("stock")!} />
          ) : (
            <Card className="py-12">
              <CardContent className="text-center">
                <Lock className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">PIN Required</h3>
                <p className="text-muted-foreground mb-4">Enter Manager or Admin PIN to access Management</p>
                <Button onClick={() => handleTabChange("stock")} data-testid="button-unlock-stock">
                  <Lock className="w-4 h-4 mr-2" /> Unlock Management
                </Button>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="masters" className="mt-6">
          {unlockedTabs.has("masters") ? (
            <MastersTab unlockedRole={unlockedTabs.get("masters")!} />
          ) : (
            <Card className="py-12">
              <CardContent className="text-center">
                <Lock className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">PIN Required</h3>
                <p className="text-muted-foreground mb-4">Enter Manager or Admin PIN to access Masters</p>
                <Button onClick={() => handleTabChange("masters")} data-testid="button-unlock-masters">
                  <Lock className="w-4 h-4 mr-2" /> Unlock Masters
                </Button>
              </CardContent>
            </Card>
          )}
        </TabsContent>

      </Tabs>
    </div>
  );
}

function OperationsTab() {
  const { appendOrigin } = useOrigin();
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      <Link href={appendOrigin("/plant/material-receipts")}>
        <Card className="hover-elevate cursor-pointer h-full">
          <CardContent className="p-6 flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
              <Package className="w-7 h-7 text-blue-600 dark:text-blue-400" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-lg">Material Receipts</h3>
              <p className="text-sm text-muted-foreground">Record incoming materials by party/job</p>
            </div>
            <ChevronRight className="w-5 h-5 text-muted-foreground" />
          </CardContent>
        </Card>
      </Link>

      <Link href={appendOrigin("/plant/material-issues")}>
        <Card className="hover-elevate cursor-pointer h-full">
          <CardContent className="p-6 flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
              <ArrowUpRight className="w-7 h-7 text-orange-600 dark:text-orange-400" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-lg">Material Issues</h3>
              <p className="text-sm text-muted-foreground">Issue materials to sites from central store</p>
            </div>
            <ChevronRight className="w-5 h-5 text-muted-foreground" />
          </CardContent>
        </Card>
      </Link>

      <Link href={appendOrigin("/plant/material-returns")}>
        <Card className="hover-elevate cursor-pointer h-full">
          <CardContent className="p-6 flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
              <RotateCcw className="w-7 h-7 text-green-600 dark:text-green-400" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-lg">Material Returns</h3>
              <p className="text-sm text-muted-foreground">Return issued materials back to plant stock</p>
            </div>
            <ChevronRight className="w-5 h-5 text-muted-foreground" />
          </CardContent>
        </Card>
      </Link>

      <Link href={appendOrigin("/plant/dispatches")}>
        <Card className="hover-elevate cursor-pointer h-full">
          <CardContent className="p-6 flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
              <Truck className="w-7 h-7 text-green-600 dark:text-green-400" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-lg">Plant Production and Dispatches</h3>
              <p className="text-sm text-muted-foreground">Log outgoing truck loads with mix data</p>
            </div>
            <ChevronRight className="w-5 h-5 text-muted-foreground" />
          </CardContent>
        </Card>
      </Link>

      <Link href={appendOrigin("/plant/equipment-usage")}>
        <Card className="hover-elevate cursor-pointer h-full">
          <CardContent className="p-6 flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
              <Gauge className="w-7 h-7 text-orange-600 dark:text-orange-400" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-lg">Equipment Usage</h3>
              <p className="text-sm text-muted-foreground">Track meter readings and diesel consumption</p>
            </div>
            <ChevronRight className="w-5 h-5 text-muted-foreground" />
          </CardContent>
        </Card>
      </Link>

      <Link href={appendOrigin("/plant/purchase-indents")}>
        <Card className="hover-elevate cursor-pointer h-full" data-testid="card-purchase-indents">
          <CardContent className="p-6 flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
              <ClipboardList className="w-7 h-7 text-purple-600 dark:text-purple-400" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-lg">Purchase Indents</h3>
              <p className="text-sm text-muted-foreground">Raise and track material purchase requests</p>
            </div>
            <ChevronRight className="w-5 h-5 text-muted-foreground" />
          </CardContent>
        </Card>
      </Link>

      <Link href={appendOrigin("/plant/shift-log")}>
        <Card className="hover-elevate cursor-pointer h-full">
          <CardContent className="p-6 flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
              <ClipboardList className="w-7 h-7 text-purple-700 dark:text-purple-400" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-lg">Plant Shift Log</h3>
              <p className="text-sm text-muted-foreground">Operator daily log – plant start/stop, idle events, manpower, fuel meters</p>
            </div>
            <ChevronRight className="w-5 h-5 text-muted-foreground" />
          </CardContent>
        </Card>
      </Link>

      <Link href={appendOrigin(`/plant/shift-log/${new Date().toISOString().slice(0, 10)}`)}>
        <Card className="hover-elevate cursor-pointer h-full border-blue-200 dark:border-blue-800" data-testid="tile-today-shift-log">
          <CardContent className="p-6 flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
              <Pencil className="w-7 h-7 text-blue-700 dark:text-blue-400" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-lg">Today's Shift Log</h3>
              <p className="text-sm text-muted-foreground">Open or create today's plant shift log – plant times, dips, manpower, idle</p>
            </div>
            <ChevronRight className="w-5 h-5 text-muted-foreground" />
          </CardContent>
        </Card>
      </Link>

      <Link href={appendOrigin(`/plant/heating-sessions/${new Date().toISOString().slice(0, 10)}`)}>
        <Card className="hover-elevate cursor-pointer h-full border-orange-200 dark:border-orange-800" data-testid="tile-heating-sessions">
          <CardContent className="p-6 flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
              <Flame className="w-7 h-7 text-orange-600 dark:text-orange-400" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-lg">Bitumen Heating Sessions</h3>
              <p className="text-sm text-muted-foreground">Per-session boiler runs – night pre-heat + day-time, with optional inline DG</p>
            </div>
            <ChevronRight className="w-5 h-5 text-muted-foreground" />
          </CardContent>
        </Card>
      </Link>

      <Link href={appendOrigin("/plant/diesel-requirements")}>
        <Card className="hover-elevate cursor-pointer h-full" data-testid="card-diesel-requirements">
          <CardContent className="p-6 flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
              <Fuel className="w-7 h-7 text-amber-600 dark:text-amber-400" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-lg">Daily Diesel Requirements</h3>
              <p className="text-sm text-muted-foreground">Plan and track daily diesel needs per equipment</p>
            </div>
            <ChevronRight className="w-5 h-5 text-muted-foreground" />
          </CardContent>
        </Card>
      </Link>

    </div>
  );
}

function StockDetailsTab({ unlockedRole }: { unlockedRole: "manager" | "admin" }) {
  const { appendOrigin } = useOrigin();
  const isAdmin = unlockedRole === "admin";
  const isManager = unlockedRole === "manager";
  const { toast } = useToast();

  const [dieselCorrPhysicalL, setDieselCorrPhysicalL] = useState("");
  const [dieselCorrPartyId, setDieselCorrPartyId] = useState<string>("");
  const [dieselCorrDate, setDieselCorrDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [dieselCorrNotes, setDieselCorrNotes] = useState("");
  const [showDieselCorrForm, setShowDieselCorrForm] = useState(false);

  const appendRoleAndTab = (path: string) => {
    const base = appendOrigin(path);
    const sep = base.includes("?") ? "&" : "?";
    return `${base}${sep}tab=stock&role=${unlockedRole}`;
  };

  const { data: ldoFlowReadings } = useQuery<{ id: number; date: string; time: string | null; tankNumber: number; meterReading: number; readingType: string; quantityLiters: number | null }[]>({
    queryKey: ["/api/plant-module/ldo-flow-readings"],
  });

  const { data: materials } = useQuery<{ id: number; name: string; defaultUom: string }[]>({
    queryKey: ["/api/plant-module/materials"],
  });

  const { data: stockBalances } = useQuery<{ id: number; partyId: number | null; materialId: number; balance: number; uom: string }[]>({
    queryKey: ["/api/plant-module/stock-balances"],
  });

  const { data: allParties } = useQuery<Party[]>({
    queryKey: ["/api/plant-module/parties"],
  });

  const dieselBalToL = (balance: number, uom: string) => {
    const u = (uom || "").toUpperCase();
    if (u === "MT" || u === "TON" || u === "TONS") return balance * 1000 / 0.84;
    if (u === "KG") return balance / 0.84;
    return balance;
  };

  const dieselMaterialId = materials?.find(m => m.name.toUpperCase() === "DIESEL")?.id ?? null;

  const dieselPartyBalances = (stockBalances && dieselMaterialId)
    ? stockBalances.filter(b => b.materialId === dieselMaterialId)
    : [];

  const dieselBookStockL = dieselPartyBalances.reduce((s, b) => s + dieselBalToL(b.balance, b.uom), 0);

  const dieselSelectedPartyBalanceL = (() => {
    if (!dieselCorrPartyId) return null;
    const b = dieselPartyBalances.find(b => String(b.partyId) === dieselCorrPartyId);
    return b ? dieselBalToL(b.balance, b.uom) : 0;
  })();

  const dieselCorrectionMutation = useMutation({
    mutationFn: async (data: { materialId: number; partyId: number; physicalQty: number; uom: string; date: string; notes: string; correctedBy: string }) => {
      const res = await apiRequest("POST", "/api/plant-module/stock-correction", data);
      return res.json();
    },
    onSuccess: (result: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/stock-balances"] });
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/stock-ledger"] });
      const adjL = result.adjustment || 0;
      const sign = adjL >= 0 ? "+" : "";
      const newL = result.newBalance || 0;
      toast({ title: "Diesel stock correction posted", description: `Adjustment: ${sign}${adjL.toFixed(0)} L. Book stock now ${newL.toFixed(0)} L.` });
      setShowDieselCorrForm(false);
      setDieselCorrPhysicalL("");
      setDieselCorrNotes("");
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const ldoTankSummary = (() => {
    if (!ldoFlowReadings) return null;
    const LDO_DENSITY = 0.84;
    const computeStock = (tankNum: number) => {
      const tankR = ldoFlowReadings.filter(r => r.tankNumber === tankNum);
      const stockEntries = tankR.filter(r => r.readingType === "stock").sort((a, b) => b.date.localeCompare(a.date) || (b.time || "").localeCompare(a.time || ""));
      if (stockEntries.length === 0) return null;
      const latest = stockEntries[0];
      const stockL = latest.quantityLiters || 0;
      const stockDT = `${latest.date}T${latest.time || "00:00"}`;
      const receiptsSince = tankR.filter(r => r.readingType === "receipt" && `${r.date}T${r.time || "00:00"}` > stockDT).reduce((s, r) => s + (r.quantityLiters || 0), 0);
      const dateGroups: Record<string, { opens: { time: string; meter: number }[]; closes: { time: string; meter: number }[] }> = {};
      for (const r of tankR) {
        if (r.readingType !== "opening" && r.readingType !== "closing") continue;
        if (r.date < latest.date || (r.date === latest.date && `${r.date}T${r.time || "00:00"}` <= stockDT)) continue;
        if (!dateGroups[r.date]) dateGroups[r.date] = { opens: [], closes: [] };
        const entry = { time: r.time || "", meter: r.meterReading };
        if (r.readingType === "opening") dateGroups[r.date].opens.push(entry);
        else dateGroups[r.date].closes.push(entry);
      }
      let consumed = 0;
      for (const g of Object.values(dateGroups)) {
        if (g.opens.length > 0 && g.closes.length > 0) {
          const openVal = g.opens.sort((a, b) => a.time.localeCompare(b.time))[0].meter;
          const closeVal = g.closes.sort((a, b) => b.time.localeCompare(a.time))[0].meter;
          const diff = closeVal - openVal;
          if (diff > 0) consumed += diff;
        }
      }
      return stockL + receiptsSince - consumed;
    };
    const t1 = computeStock(1);
    const t2 = computeStock(2);
    const totalL = (t1 || 0) + (t2 || 0);
    return { tank1L: t1, tank2L: t2, totalL, totalMT: (totalL * LDO_DENSITY / 1000) };
  })();

  return (
    <div className="space-y-4">
      {isManager && (
        <div className="bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200 px-4 py-2 rounded-md text-sm">
          Manager access: You can view and add new readings. Editing, deleting, and exports require Admin PIN.
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <Link href={appendRoleAndTab("/plant/stock")}>
        <Card className="hover-elevate cursor-pointer h-full">
          <CardContent className="p-6 flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
              <Layers className="w-7 h-7 text-purple-600 dark:text-purple-400" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-lg">Stock Balances & Ledger</h3>
              <p className="text-sm text-muted-foreground">View party-wise stock and transaction history</p>
            </div>
            <ChevronRight className="w-5 h-5 text-muted-foreground" />
          </CardContent>
        </Card>
      </Link>
      
      <Link href={appendRoleAndTab("/plant/variance-report")}>
        <Card className="hover-elevate cursor-pointer h-full">
          <CardContent className="p-6 flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
              <AlertTriangle className="w-7 h-7 text-amber-600 dark:text-amber-400" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-lg">Variance Report</h3>
              <p className="text-sm text-muted-foreground">View dispatches where actual differs from theoretical</p>
            </div>
            <ChevronRight className="w-5 h-5 text-muted-foreground" />
          </CardContent>
        </Card>
      </Link>
      
      <Link href={appendRoleAndTab("/plant/audit-report")}>
        <Card className="hover-elevate cursor-pointer h-full">
          <CardContent className="p-6 flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
              <Shield className="w-7 h-7 text-blue-600 dark:text-blue-400" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-lg">Audit Report</h3>
              <p className="text-sm text-muted-foreground">Complete history of consumption adjustments</p>
            </div>
            <ChevronRight className="w-5 h-5 text-muted-foreground" />
          </CardContent>
        </Card>
      </Link>
      
      <Link href={appendRoleAndTab("/plant/diesel-procurement")}>
        <Card className="hover-elevate cursor-pointer h-full">
          <CardContent className="p-6 flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
              <Fuel className="w-7 h-7 text-green-600 dark:text-green-400" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-lg">Diesel Procurement</h3>
              <p className="text-sm text-muted-foreground">Track all diesel: plant receipts + direct site purchases</p>
            </div>
            <ChevronRight className="w-5 h-5 text-muted-foreground" />
          </CardContent>
        </Card>
      </Link>

      <Link href={appendRoleAndTab("/plant/bitumen-stock")}>
        <Card className="hover-elevate cursor-pointer h-full">
          <CardContent className="p-6 flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
              <Droplets className="w-7 h-7 text-amber-700 dark:text-amber-500" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-lg">Bitumen Stock Tracker</h3>
              <p className="text-sm text-muted-foreground">Track bitumen tank dip readings & actual stock (2 tanks)</p>
            </div>
            <ChevronRight className="w-5 h-5 text-muted-foreground" />
          </CardContent>
        </Card>
      </Link>

      <Card
        className="hover-elevate cursor-pointer h-full border-green-200 dark:border-green-800"
        data-testid="tile-today-daily-report"
        onClick={async () => {
          const today = new Date().toISOString().slice(0, 10);
          try {
            const res = await fetch(`/api/plant-module/shift-logs/by-date/${today}?plant=Main+Plant`, { credentials: "include" });
            if (res.status === 404) {
              await apiRequest("POST", "/api/plant-module/shift-logs", {
                date: today,
                shiftCode: "DAY",
                plantName: "Main Plant",
                manpower: [],
                idleEvents: [],
              });
              queryClient.invalidateQueries({ queryKey: ["/api/plant-module/shift-logs/by-date", today, "Main Plant"] });
            }
          } catch {
            // continue regardless – report page handles missing data
          }
          window.location.href = appendRoleAndTab(`/plant/daily-report/${today}`);
        }}
      >
        <CardContent className="p-6 flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
            <FileText className="w-7 h-7 text-green-700 dark:text-green-400" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-lg">Today's Daily Plant Report</h3>
            <p className="text-sm text-muted-foreground">Creates today's shift log if missing, then opens the consolidated report</p>
          </div>
          <ChevronRight className="w-5 h-5 text-muted-foreground" />
        </CardContent>
      </Card>

      <Link href={appendRoleAndTab("/plant/ldo-flow-meter")}>
        <Card className="hover-elevate cursor-pointer h-full">
          <CardContent className="p-6 flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
              <Gauge className="w-7 h-7 text-blue-600 dark:text-blue-400" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-lg">LDO Flow Meter Tracker</h3>
              <p className="text-sm text-muted-foreground">Track LDO consumption, tank stock & variance analysis</p>
              {ldoTankSummary && (
                <div className="mt-2 flex items-center gap-3 text-sm" data-testid="text-ldo-stock-summary">
                  <span className="font-bold text-blue-700 dark:text-blue-300">{ldoTankSummary.totalL.toFixed(0)} L</span>
                  <span className="text-muted-foreground">({ldoTankSummary.totalMT.toFixed(3)} MT)</span>
                  <span className="text-xs text-muted-foreground">
                    T1: {ldoTankSummary.tank1L !== null ? `${ldoTankSummary.tank1L.toFixed(0)} L` : "—"} |
                    T2: {ldoTankSummary.tank2L !== null ? `${ldoTankSummary.tank2L.toFixed(0)} L` : "—"}
                  </span>
                </div>
              )}
            </div>
            <ChevronRight className="w-5 h-5 text-muted-foreground" />
          </CardContent>
        </Card>
      </Link>
      </div>

      {/* ── Diesel Physical Stock Correction Card (admin only) ── */}
      {isAdmin && dieselMaterialId && (
        <Card className="border-blue-200 dark:border-blue-800">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <Scale className="w-5 h-5 text-blue-600" />
                <CardTitle className="text-base font-semibold">Diesel Book Stock Correction</CardTitle>
              </div>
              {!showDieselCorrForm && (
                <Button size="sm" variant="outline" onClick={() => {
                  if (!dieselCorrPartyId && dieselPartyBalances.length > 0) setDieselCorrPartyId(String(dieselPartyBalances[0].partyId));
                  setShowDieselCorrForm(true);
                }} data-testid="button-show-diesel-correction-form">
                  Post Correction
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Summary */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
              <div className="bg-muted/50 rounded-lg p-3">
                <div className="text-muted-foreground text-xs mb-1">Total Book Stock (All Parties)</div>
                <div className={`font-bold text-lg ${dieselBookStockL < 0 ? "text-red-600" : "text-foreground"}`}>
                  {dieselBookStockL.toFixed(0)} L
                </div>
                <div className="text-xs text-muted-foreground mt-1 space-y-0.5">
                  {dieselPartyBalances.map(b => (
                    <div key={b.id} className="flex justify-between gap-2">
                      <span>{allParties?.find(p => p.id === b.partyId)?.name ?? `Party ${b.partyId}`}:</span>
                      <span className={dieselBalToL(b.balance, b.uom) < 0 ? "text-red-500" : ""}>{dieselBalToL(b.balance, b.uom).toFixed(0)} L</span>
                    </div>
                  ))}
                  {dieselPartyBalances.length === 0 && <span className="italic">No balances yet</span>}
                </div>
              </div>
              <div className="bg-muted/50 rounded-lg p-3">
                <div className="text-muted-foreground text-xs mb-1">How to use</div>
                <div className="text-sm text-muted-foreground">
                  Select a party, enter their physical diesel quantity from a dip-stick reading, and post the correction to align the book stock.
                </div>
              </div>
            </div>

            {showDieselCorrForm && (
              <div className="border rounded-lg p-4 space-y-4 bg-blue-50/50 dark:bg-blue-950/20">
                <p className="text-sm font-medium text-blue-700 dark:text-blue-300">Post Physical Diesel Stock Correction</p>

                {/* Party + date */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Party to Correct</Label>
                    <Select value={dieselCorrPartyId} onValueChange={id => setDieselCorrPartyId(id)}>
                      <SelectTrigger data-testid="select-diesel-corr-party">
                        <SelectValue placeholder="Select party" />
                      </SelectTrigger>
                      <SelectContent>
                        {allParties?.map(p => (
                          <SelectItem key={p.id} value={String(p.id)}>
                            {p.name}
                            {dieselPartyBalances.find(b => b.partyId === p.id) !== undefined &&
                              ` (${dieselBalToL(dieselPartyBalances.find(b => b.partyId === p.id)?.balance ?? 0, dieselPartyBalances.find(b => b.partyId === p.id)?.uom ?? "L").toFixed(0)} L)`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {dieselCorrPartyId && dieselSelectedPartyBalanceL !== null && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Current book stock: <span className={dieselSelectedPartyBalanceL < 0 ? "text-red-500 font-medium" : "font-medium"}>{dieselSelectedPartyBalanceL.toFixed(0)} L</span>
                      </p>
                    )}
                  </div>
                  <div>
                    <Label className="text-xs">As on Date</Label>
                    <Input type="date" value={dieselCorrDate} onChange={e => setDieselCorrDate(e.target.value)} data-testid="input-diesel-corr-date" />
                  </div>
                </div>

                {/* Physical qty + preview */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
                  <div>
                    <Label className="text-xs">Physical Stock (Liters)</Label>
                    <Input
                      type="number" step="1" min="0"
                      value={dieselCorrPhysicalL}
                      onChange={e => setDieselCorrPhysicalL(e.target.value)}
                      placeholder="e.g. 850"
                      data-testid="input-diesel-corr-physical-l"
                    />
                    <p className="text-xs text-muted-foreground mt-1">From dip-stick reading</p>
                  </div>
                  {dieselCorrPartyId && dieselSelectedPartyBalanceL !== null && dieselCorrPhysicalL && (
                    <div className={`rounded-lg p-2 text-center ${
                      parseFloat(dieselCorrPhysicalL) - dieselSelectedPartyBalanceL > 0
                        ? "bg-green-50 dark:bg-green-900/20"
                        : "bg-red-50 dark:bg-red-900/20"
                    }`}>
                      <div className="text-xs text-muted-foreground">Adjustment</div>
                      <div className={`font-bold text-base ${
                        parseFloat(dieselCorrPhysicalL) - dieselSelectedPartyBalanceL > 0
                          ? "text-green-700 dark:text-green-400"
                          : "text-red-700 dark:text-red-400"
                      }`}>
                        {(() => {
                          const adj = parseFloat(dieselCorrPhysicalL) - dieselSelectedPartyBalanceL;
                          return `${adj > 0 ? "+" : ""}${adj.toFixed(0)} L`;
                        })()}
                      </div>
                    </div>
                  )}
                  <div>
                    <Label className="text-xs">Notes (optional)</Label>
                    <Input value={dieselCorrNotes} onChange={e => setDieselCorrNotes(e.target.value)} placeholder="e.g. Dip stick reading" data-testid="input-diesel-corr-notes" />
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button
                    size="sm"
                    disabled={!dieselCorrPartyId || !dieselCorrPhysicalL || dieselCorrectionMutation.isPending}
                    onClick={() => {
                      if (!dieselMaterialId || !dieselCorrPartyId) return;
                      const physL = parseFloat(dieselCorrPhysicalL);
                      const partyName = allParties?.find(p => String(p.id) === dieselCorrPartyId)?.name || `Party ${dieselCorrPartyId}`;
                      dieselCorrectionMutation.mutate({
                        materialId: dieselMaterialId,
                        partyId: parseInt(dieselCorrPartyId),
                        physicalQty: physL,
                        uom: "Liters",
                        date: dieselCorrDate,
                        notes: dieselCorrNotes || `Diesel dip stick reconciliation (${partyName})`,
                        correctedBy: "admin",
                      });
                    }}
                    data-testid="button-post-diesel-correction"
                  >
                    {dieselCorrectionMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Post Correction"}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => { setShowDieselCorrForm(false); setDieselCorrPhysicalL(""); setDieselCorrNotes(""); }}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <div className="mt-2">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Procurement & Finance</h3>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Link href={appendRoleAndTab("/plant/vendor-bills")}>
          <Card className="hover-elevate cursor-pointer h-full" data-testid="card-vendor-bills">
            <CardContent className="p-6 flex items-center gap-4">
              <div className="w-14 h-14 rounded-full bg-teal-100 dark:bg-teal-900/30 flex items-center justify-center">
                <Receipt className="w-7 h-7 text-teal-600 dark:text-teal-400" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-lg">Vendor Bills</h3>
                <p className="text-sm text-muted-foreground">Track and process vendor invoices with workflow</p>
              </div>
              <ChevronRight className="w-5 h-5 text-muted-foreground" />
            </CardContent>
          </Card>
        </Link>
      </div>

      {unlockedRole === "admin" && (
        <>
          <div className="mt-2">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Admin Tools</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Link href={appendRoleAndTab("/plant/data-sync")}>
              <Card className="hover-elevate cursor-pointer h-full" data-testid="card-data-sync">
                <CardContent className="p-6 flex items-center gap-4">
                  <div className="w-14 h-14 rounded-full bg-slate-100 dark:bg-slate-900/30 flex items-center justify-center">
                    <ArrowRightLeft className="w-7 h-7 text-slate-600 dark:text-slate-400" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-lg">Data Export / Import</h3>
                    <p className="text-sm text-muted-foreground">Transfer data between development and production</p>
                  </div>
                  <ChevronRight className="w-5 h-5 text-muted-foreground" />
                </CardContent>
              </Card>
            </Link>
          </div>
        </>
      )}
    </div>
  );
}

function MastersTab({ unlockedRole }: { unlockedRole: "manager" | "admin" }) {
  const isManager = unlockedRole === "manager";
  return (
    <div className="space-y-6">
      {isManager && (
        <div className="bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200 px-4 py-2 rounded-md text-sm">
          Manager access: You can view, add, and edit entries. Deleting and exports require Admin PIN.
        </div>
      )}
      <PartyMaster isManagerMode={isManager} />
      <MaterialMaster isManagerMode={isManager} />
      <MixTemplateMaster isManagerMode={isManager} />
      <EquipmentMasterSection isManagerMode={isManager} />
      <PersonnelMasterSection isManagerMode={isManager} />
    </div>
  );
}

function PartyMaster({ isManagerMode = false }: { isManagerMode?: boolean }) {
  const { toast } = useToast();
  const { canEdit: globalCanEdit, canDelete: globalCanDelete } = useAccess();
  const canEdit = globalCanEdit;
  const canDelete = !isManagerMode && globalCanDelete;
  const canExport = !isManagerMode;
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingParty, setEditingParty] = useState<Party | null>(null);
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");

  const exportToExcel = (data: Party[]) => {
    const ws = XLSX.utils.json_to_sheet(data.map(p => ({ Name: p.name, Notes: p.notes || "" })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Parties");
    XLSX.writeFile(wb, "parties.xlsx");
    toast({ title: "Exported to Excel" });
  };

  const handlePrint = () => {
    window.print();
  };

  const { data: parties, isLoading } = useQuery<Party[]>({
    queryKey: ["/api/plant-module/parties"],
  });

  const createMutation = useMutation({
    mutationFn: (data: { name: string; notes?: string }) =>
      apiRequest("POST", "/api/plant-module/parties", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/parties"] });
      setDialogOpen(false);
      resetForm();
      toast({ title: "Party created successfully" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: { name: string; notes?: string } }) =>
      apiRequest("PATCH", `/api/plant-module/parties/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/parties"] });
      setDialogOpen(false);
      resetForm();
      toast({ title: "Party updated successfully" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) =>
      apiRequest("DELETE", `/api/plant-module/parties/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/parties"] });
      toast({ title: "Party deleted successfully" });
    },
  });

  const resetForm = () => {
    setName("");
    setNotes("");
    setEditingParty(null);
  };

  const handleSubmit = () => {
    if (!name.trim()) return;
    if (editingParty) {
      updateMutation.mutate({ id: editingParty.id, data: { name, notes } });
    } else {
      createMutation.mutate({ name, notes });
    }
  };

  const openEdit = (party: Party) => {
    setEditingParty(party);
    setName(party.name);
    setNotes(party.notes || "");
    setDialogOpen(true);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4 flex-wrap">
        <CardTitle className="flex items-center gap-2">
          <Users className="w-5 h-5" />
          Party/Job Master
        </CardTitle>
        <div className="flex items-center gap-2 flex-wrap">
          {canExport && (
            <>
              <Button size="sm" variant="outline" className="gap-1" onClick={() => parties && exportToExcel(parties)} disabled={!parties?.length} data-testid="button-export-parties">
                <Download className="w-4 h-4" /> Excel
              </Button>
              <Button size="sm" variant="outline" className="gap-1" onClick={handlePrint} data-testid="button-print-parties">
                <Printer className="w-4 h-4" /> Print
              </Button>
            </>
          )}
          <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1" data-testid="button-add-party">
                <Plus className="w-4 h-4" /> Add Party
              </Button>
            </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingParty ? "Edit Party" : "Add New Party"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-4">
              <div>
                <Label htmlFor="party-name">Party/Job Name</Label>
                <Input
                  id="party-name"
                  value={name}
                  onChange={(e) => setName(e.target.value.toUpperCase())}
                  placeholder="e.g., GIRIDHAR - BC"
                  data-testid="input-party-name"
                />
              </div>
              <div>
                <Label htmlFor="party-notes">Notes (optional)</Label>
                <Textarea
                  id="party-notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value.toUpperCase())}
                  placeholder="Additional notes..."
                  data-testid="input-party-notes"
                />
              </div>
              <Button onClick={handleSubmit} className="w-full" disabled={createMutation.isPending || updateMutation.isPending} data-testid="button-save-party">
                {(createMutation.isPending || updateMutation.isPending) ? <Loader2 className="w-4 h-4 animate-spin" /> : editingParty ? "Update" : "Create"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center p-8">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        ) : !parties?.length ? (
          <p className="text-muted-foreground text-center py-6">No parties added yet.</p>
        ) : (
          <div className="space-y-2">
            {parties.map((party) => (
              <div key={party.id} className="flex items-center justify-between p-3 rounded-md bg-muted/50">
                <div>
                  <p className="font-medium">{party.name}</p>
                  {party.notes && <p className="text-sm text-muted-foreground">{party.notes}</p>}
                </div>
                {canEdit && (
                  <div className="flex gap-2">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(party)} data-testid={`button-edit-party-${party.id}`}>
                      <Pencil className="w-4 h-4" />
                    </Button>
                    {canDelete && (
                      <Button variant="ghost" size="icon" onClick={() => deleteMutation.mutate(party.id)} data-testid={`button-delete-party-${party.id}`}>
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function MaterialMaster({ isManagerMode = false }: { isManagerMode?: boolean }) {
  const { toast } = useToast();
  const { canEdit: globalCanEdit, canDelete: globalCanDelete } = useAccess();
  const canEdit = globalCanEdit;
  const canDelete = !isManagerMode && globalCanDelete;
  const canExport = !isManagerMode;
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingMaterial, setEditingMaterial] = useState<PlantMaterial | null>(null);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [defaultUom, setDefaultUom] = useState("Ton");
  
  // Opening Stock dialog state
  const [openingStockDialogOpen, setOpeningStockDialogOpen] = useState(false);
  const [selectedMaterialForStock, setSelectedMaterialForStock] = useState<PlantMaterial | null>(null);
  const [stockQuantity, setStockQuantity] = useState("");
  const [stockPartyId, setStockPartyId] = useState<string>("");
  const [stockDate, setStockDate] = useState(new Date().toISOString().split('T')[0]);
  const [stockNotes, setStockNotes] = useState("");
  const [editingOpeningStock, setEditingOpeningStock] = useState<MaterialOpeningStock | null>(null);
  const [deleteOpeningStockId, setDeleteOpeningStockId] = useState<number | null>(null);
  const [showOSPinAuth, setShowOSPinAuth] = useState(false);
  const [pendingOSAction, setPendingOSAction] = useState<{ type: "delete"; stockId: number } | null>(null);

  const exportToExcel = (data: PlantMaterial[]) => {
    const ws = XLSX.utils.json_to_sheet(data.map(m => ({ Name: m.name, Category: m.category || "", UOM: m.defaultUom })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Materials");
    XLSX.writeFile(wb, "materials.xlsx");
    toast({ title: "Exported to Excel" });
  };

  const { data: materials, isLoading } = useQuery<PlantMaterial[]>({
    queryKey: ["/api/plant-module/materials"],
  });

  const { data: parties } = useQuery<Party[]>({
    queryKey: ["/api/plant-module/parties"],
  });

  const { data: openingStocks } = useQuery<MaterialOpeningStock[]>({
    queryKey: ["/api/plant-module/opening-stocks"],
  });

  const createMutation = useMutation({
    mutationFn: (data: { name: string; category?: string; defaultUom: string }) =>
      apiRequest("POST", "/api/plant-module/materials", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/materials"] });
      resetForm();
      toast({ title: "Material created successfully" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<{ name: string; category?: string; defaultUom: string }> }) =>
      apiRequest("PATCH", `/api/plant-module/materials/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/materials"] });
      resetForm();
      toast({ title: "Material updated successfully" });
    },
  });

  const createOpeningStockMutation = useMutation({
    mutationFn: (data: { materialId: number; partyId?: number | null; isPlantCommon: number; quantity: number; uom: string; date: string; notes?: string }) =>
      apiRequest("POST", "/api/plant-module/opening-stocks", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0]?.toString().includes('stock') || q.queryKey[0]?.toString().includes('opening') || false });
      resetOpeningStockForm();
      toast({ title: "Opening stock added successfully" });
    },
  });

  const updateOpeningStockMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) =>
      apiRequest("PUT", `/api/plant-module/opening-stocks/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0]?.toString().includes('stock') || q.queryKey[0]?.toString().includes('opening') || false });
      resetOpeningStockForm();
      toast({ title: "Opening stock updated successfully" });
    },
  });

  const deleteOpeningStockMutation = useMutation({
    mutationFn: (id: number) =>
      apiRequest("DELETE", `/api/plant-module/opening-stocks/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0]?.toString().includes('stock') || q.queryKey[0]?.toString().includes('opening') || false });
      setDeleteOpeningStockId(null);
      toast({ title: "Opening stock deleted successfully" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) =>
      apiRequest("DELETE", `/api/plant-module/materials/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/materials"] });
      toast({ title: "Material deleted successfully" });
    },
  });

  const resetForm = () => {
    setDialogOpen(false);
    setEditingMaterial(null);
    setName("");
    setCategory("");
    setDefaultUom("Ton");
  };

  const resetOpeningStockForm = () => {
    setOpeningStockDialogOpen(false);
    setSelectedMaterialForStock(null);
    setEditingOpeningStock(null);
    setStockQuantity("");
    setStockPartyId("");
    setStockDate(new Date().toISOString().split('T')[0]);
    setStockNotes("");
  };

  const openEdit = (material: PlantMaterial) => {
    setEditingMaterial(material);
    setName(material.name);
    setCategory(material.category || "");
    setDefaultUom(material.defaultUom || "Ton");
    setDialogOpen(true);
  };

  const openOpeningStockDialog = (material: PlantMaterial) => {
    setSelectedMaterialForStock(material);
    setOpeningStockDialogOpen(true);
  };

  const handleSubmit = () => {
    const data = { 
      name, 
      category, 
      defaultUom
    };
    if (editingMaterial) {
      updateMutation.mutate({ id: editingMaterial.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const handleOpeningStockSubmit = () => {
    if (!stockQuantity) return;
    const materialId = selectedMaterialForStock?.id ?? editingOpeningStock?.materialId;
    if (!materialId) return;
    const data = {
      materialId,
      partyId: stockPartyId ? Number(stockPartyId) : null,
      isPlantCommon: 0,
      quantity: parseFloat(stockQuantity),
      uom: selectedMaterialForStock?.defaultUom || editingOpeningStock?.uom || "Ton",
      date: stockDate,
      notes: stockNotes || undefined,
    };
    if (editingOpeningStock) {
      updateOpeningStockMutation.mutate({ id: editingOpeningStock.id, data });
    } else {
      createOpeningStockMutation.mutate(data);
    }
  };

  const getMaterialName = (id: number) => materials?.find(m => m.id === id)?.name || `Material #${id}`;
  const getPartyName = (id: number | null) => {
    if (id === null) return "HLC (Common)";
    return parties?.find(p => p.id === id)?.name || `Party #${id}`;
  };

  const openEditOpeningStock = (os: MaterialOpeningStock) => {
    setEditingOpeningStock(os);
    setStockPartyId(os.partyId ? String(os.partyId) : "");
    setStockQuantity(String(os.quantity));
    setStockDate(os.date);
    setStockNotes(os.notes || "");
    setSelectedMaterialForStock(materials?.find(m => m.id === os.materialId) || null);
    setOpeningStockDialogOpen(true);
  };

  const handleOSPinSuccess = () => {
    setShowOSPinAuth(false);
    if (pendingOSAction) {
      if (pendingOSAction.type === "delete") {
        setDeleteOpeningStockId(pendingOSAction.stockId);
      }
      setPendingOSAction(null);
    }
  };

  const requireOSAuth = (action: { type: "delete"; stockId: number }) => {
    setPendingOSAction(action);
    setShowOSPinAuth(true);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4 flex-wrap">
        <CardTitle className="flex items-center gap-2">
          <Package className="w-5 h-5" />
          Material Master
        </CardTitle>
        <div className="flex items-center gap-2 flex-wrap">
          {canExport && (
            <Button size="sm" variant="outline" className="gap-1" onClick={() => materials && exportToExcel(materials)} disabled={!materials?.length} data-testid="button-export-materials">
              <Download className="w-4 h-4" /> Excel
            </Button>
          )}
          <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) resetForm(); else setDialogOpen(true); }}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1" data-testid="button-add-material">
                <Plus className="w-4 h-4" /> Add Material
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editingMaterial ? "Edit Material" : "Add New Material"}</DialogTitle>
              </DialogHeader>
            <div className="space-y-4 pt-4">
              <div>
                <Label htmlFor="material-name">Material Name</Label>
                <Input
                  id="material-name"
                  value={name}
                  onChange={(e) => setName(e.target.value.toUpperCase())}
                  placeholder="e.g., 20MM AGGREGATE"
                  data-testid="input-material-name"
                />
              </div>
              <div>
                <Label htmlFor="material-category">Category</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger data-testid="select-material-category">
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Aggregate">Aggregate</SelectItem>
                    <SelectItem value="Bitumen">Bitumen</SelectItem>
                    <SelectItem value="Utility">Utility</SelectItem>
                    <SelectItem value="Other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="material-uom">Default UOM</Label>
                <Select value={defaultUom} onValueChange={setDefaultUom}>
                  <SelectTrigger data-testid="select-material-uom">
                    <SelectValue placeholder="Select UOM" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Ton">Ton</SelectItem>
                    <SelectItem value="MT">MT</SelectItem>
                    <SelectItem value="Cum">Cum</SelectItem>
                    <SelectItem value="Liters">Liters</SelectItem>
                    <SelectItem value="Kgs">Kgs</SelectItem>
                    <SelectItem value="CFT">CFT</SelectItem>
                    <SelectItem value="Barrels">Barrels</SelectItem>
                    <SelectItem value="Nos">Nos</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={handleSubmit} className="w-full" disabled={createMutation.isPending || updateMutation.isPending || !name.trim()} data-testid="button-save-material">
                {(createMutation.isPending || updateMutation.isPending) ? <Loader2 className="w-4 h-4 animate-spin" /> : editingMaterial ? "Update" : "Create"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center p-8">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        ) : !materials?.length ? (
          <p className="text-muted-foreground text-center py-6">No materials added yet.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
            {materials.map((material) => (
              <div key={material.id} className="flex items-center justify-between p-3 rounded-md bg-muted/50">
                <div>
                  <p className="font-medium">{material.name}</p>
                  <p className="text-xs text-muted-foreground">{material.category} - {material.defaultUom}</p>
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="sm" onClick={() => openOpeningStockDialog(material)} data-testid={`button-add-stock-${material.id}`} title="Add Opening Stock">
                    <Plus className="w-4 h-4" />
                  </Button>
                  {canEdit && (
                    <>
                      <Button variant="ghost" size="icon" onClick={() => openEdit(material)} data-testid={`button-edit-material-${material.id}`}>
                        <Pencil className="w-4 h-4" />
                      </Button>
                      {canDelete && (
                        <Button variant="ghost" size="icon" onClick={() => deleteMutation.mutate(material.id)} data-testid={`button-delete-material-${material.id}`}>
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      )}
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
        
        {openingStocks && openingStocks.length > 0 && (
          <div className="mt-4">
            <h3 className="text-sm font-semibold mb-2">Opening Stock Entries</h3>
            <div className="space-y-2">
              {openingStocks.map((os) => (
                <div key={os.id} className="flex items-center justify-between p-3 rounded-md bg-muted/30 border" data-testid={`opening-stock-entry-${os.id}`}>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm">{getMaterialName(os.materialId)}</p>
                    <p className="text-xs text-muted-foreground">
                      {os.quantity} {os.uom} | {getPartyName(os.partyId)} | {os.date}
                      {os.notes ? ` | ${os.notes}` : ""}
                    </p>
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    {canEdit && (
                      <Button variant="ghost" size="icon" onClick={() => openEditOpeningStock(os)} data-testid={`button-edit-opening-stock-${os.id}`}>
                        <Pencil className="w-4 h-4" />
                      </Button>
                    )}
                    {canDelete && (
                      <Button variant="ghost" size="icon" onClick={() => requireOSAuth({ type: "delete", stockId: os.id })} data-testid={`button-delete-opening-stock-${os.id}`}>
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {showOSPinAuth && (
          <PinAuth
            targetRole="admin"
            onSuccess={handleOSPinSuccess}
            onClose={() => { setShowOSPinAuth(false); setPendingOSAction(null); }}
          />
        )}

        {/* Opening Stock Dialog */}
          <Dialog open={openingStockDialogOpen} onOpenChange={(open) => { if (!open) resetOpeningStockForm(); }}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editingOpeningStock ? "Edit Opening Stock" : "Add Opening Stock"}</DialogTitle>
                {selectedMaterialForStock && (
                  <p className="text-sm text-muted-foreground">{selectedMaterialForStock.name}</p>
                )}
              </DialogHeader>
              <div className="space-y-4 pt-4">
                <div>
                  <Label>Party/Job</Label>
                  <Select value={stockPartyId} onValueChange={setStockPartyId}>
                    <SelectTrigger data-testid="select-stock-party">
                      <SelectValue placeholder="Select party" />
                    </SelectTrigger>
                    <SelectContent>
                      {parties?.map((party) => (
                        <SelectItem key={party.id} value={String(party.id)}>{party.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div>
                  <Label htmlFor="stock-quantity">Quantity ({selectedMaterialForStock?.defaultUom || editingOpeningStock?.uom || "Ton"})</Label>
                  <Input
                    id="stock-quantity"
                    type="number"
                    step="0.01"
                    value={stockQuantity}
                    onChange={(e) => setStockQuantity(e.target.value)}
                    placeholder="0.00"
                    data-testid="input-stock-quantity"
                  />
                </div>
                
                <div>
                  <Label htmlFor="stock-date">Date</Label>
                  <Input
                    id="stock-date"
                    type="date"
                    value={stockDate}
                    onChange={(e) => setStockDate(e.target.value)}
                    data-testid="input-stock-date"
                  />
                </div>
                
                <div>
                  <Label htmlFor="stock-notes">Notes (optional)</Label>
                  <Input
                    id="stock-notes"
                    value={stockNotes}
                    onChange={(e) => setStockNotes(e.target.value.toUpperCase())}
                    placeholder="Opening balance from previous period"
                    data-testid="input-stock-notes"
                  />
                </div>
                
                <Button 
                  onClick={handleOpeningStockSubmit} 
                  className="w-full" 
                  disabled={(createOpeningStockMutation.isPending || updateOpeningStockMutation.isPending) || !stockQuantity || !stockPartyId}
                  data-testid="button-save-opening-stock"
                >
                  {(createOpeningStockMutation.isPending || updateOpeningStockMutation.isPending) ? <Loader2 className="w-4 h-4 animate-spin" /> : editingOpeningStock ? "Update Opening Stock" : "Add Opening Stock"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>

        {/* Delete Opening Stock Confirmation Dialog */}
        <Dialog open={deleteOpeningStockId !== null} onOpenChange={(open) => { if (!open) setDeleteOpeningStockId(null); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete Opening Stock Entry</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground py-2">
              Are you sure you want to delete this opening stock entry? This action cannot be undone and will affect stock balances.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setDeleteOpeningStockId(null)} data-testid="button-cancel-delete-opening-stock">
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => { if (deleteOpeningStockId) deleteOpeningStockMutation.mutate(deleteOpeningStockId); }}
                disabled={deleteOpeningStockMutation.isPending}
                data-testid="button-confirm-delete-opening-stock"
              >
                {deleteOpeningStockMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Delete"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

type MixTemplateComponent = {
  id: number;
  templateId: number;
  materialId: number;
  percent: number | null;
  uom: string;
};

function MixTemplateMaster({ isManagerMode = false }: { isManagerMode?: boolean }) {
  const { toast } = useToast();
  const { canEdit: globalCanEdit, canDelete: globalCanDelete } = useAccess();
  const canEdit = globalCanEdit;
  const canDelete = !isManagerMode && globalCanDelete;
  const canExport = !isManagerMode;
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<MixTemplate | null>(null);
  const [name, setName] = useState("");
  const [mixType, setMixType] = useState("");
  const [bitumenPercent, setBitumenPercent] = useState("");
  const [ldoNorm, setLdoNorm] = useState("6");
  const [notes, setNotes] = useState("");
  const [aggregateProportions, setAggregateProportions] = useState<Record<number, string>>({});
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [newMixTypeDialogOpen, setNewMixTypeDialogOpen] = useState(false);
  const [newMixTypeName, setNewMixTypeName] = useState("");

  const { data: templates, isLoading } = useQuery<MixTemplate[]>({
    queryKey: ["/api/plant-module/mix-templates"],
  });

  const { data: materials } = useQuery<PlantMaterial[]>({
    queryKey: ["/api/plant-module/materials"],
  });

  const { data: allComponents } = useQuery<MixTemplateComponent[]>({
    queryKey: ["/api/plant-module/mix-template-components"],
  });

  const { data: mixTypes } = useQuery<MixType[]>({
    queryKey: ["/api/plant-module/mix-types"],
  });

  const aggregateMaterials = materials?.filter(m => m.category === "Aggregate") || [];
  
  const createMixTypeMutation = useMutation({
    mutationFn: async (data: { name: string }) => {
      const response = await apiRequest("POST", "/api/plant-module/mix-types", data);
      return response.json() as Promise<MixType>;
    },
    onSuccess: (newType: MixType) => {
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/mix-types"] });
      setMixType(newType.name);
      setNewMixTypeDialogOpen(false);
      setNewMixTypeName("");
      toast({ title: "Mix type created successfully" });
    },
    onError: () => {
      toast({ title: "Failed to create mix type", variant: "destructive" });
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: { 
      name: string; 
      mixType: string; 
      bitumenPercent?: number; 
      ldoNorm?: number;
      notes?: string;
      components?: { materialId: number; percent: number; uom: string }[];
    }) => apiRequest("POST", "/api/plant-module/mix-templates", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/mix-templates"] });
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/mix-template-components"] });
      setDialogOpen(false);
      resetForm();
      toast({ title: "Mix template created successfully" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: { 
      name?: string; 
      mixType?: string; 
      bitumenPercent?: number; 
      ldoNorm?: number;
      notes?: string;
      components?: { materialId: number; percent: number; uom: string }[];
    }}) => apiRequest("PATCH", `/api/plant-module/mix-templates/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/mix-templates"] });
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/mix-template-components"] });
      setDialogOpen(false);
      resetForm();
      toast({ title: "Mix template updated successfully" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) =>
      apiRequest("DELETE", `/api/plant-module/mix-templates/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/mix-templates"] });
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/mix-template-components"] });
      setDeleteConfirmId(null);
      toast({ title: "Mix template deleted successfully" });
    },
  });

  const resetForm = () => {
    setEditingTemplate(null);
    setName("");
    setMixType("");
    setBitumenPercent("");
    setLdoNorm("6");
    setNotes("");
    setAggregateProportions({});
  };

  const openEdit = (template: MixTemplate) => {
    setEditingTemplate(template);
    setName(template.name);
    setMixType(template.mixType);
    setBitumenPercent(template.bitumenPercent?.toString() || "");
    setLdoNorm(template.ldoNorm?.toString() || "6");
    setNotes(template.notes || "");
    // Load components for this template
    const templateComponents = allComponents?.filter(c => c.templateId === template.id) || [];
    const proportions: Record<number, string> = {};
    templateComponents.forEach(c => {
      proportions[c.materialId] = c.percent?.toString() || "";
    });
    setAggregateProportions(proportions);
    setDialogOpen(true);
  };

  const getMaterialName = (id: number) => materials?.find(m => m.id === id)?.name || "Unknown";

  // Calculate total percentage (aggregates + bitumen)
  const aggregateTotal = Object.values(aggregateProportions)
    .reduce((sum, val) => sum + (parseFloat(val) || 0), 0);
  const bitumenVal = parseFloat(bitumenPercent) || 0;
  const totalPercent = aggregateTotal + bitumenVal;

  const handleSubmit = () => {
    const components = Object.entries(aggregateProportions)
      .filter(([_, value]) => value && parseFloat(value) > 0)
      .map(([materialId, percent]) => ({
        materialId: parseInt(materialId),
        percent: parseFloat(percent),
        uom: "%"
      }));

    const data = {
      name,
      mixType,
      bitumenPercent: bitumenPercent ? parseFloat(bitumenPercent) : undefined,
      ldoNorm: ldoNorm ? parseFloat(ldoNorm) : 6,
      notes,
      components
    };

    if (editingTemplate) {
      updateMutation.mutate({ id: editingTemplate.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <CardTitle className="flex items-center gap-2">
          <Layers className="w-5 h-5" />
          Mix Template Master
        </CardTitle>
        <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1" data-testid="button-add-mix-template">
              <Plus className="w-4 h-4" /> Add Template
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingTemplate ? "Edit Mix Template" : "Add Mix Template"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-4">
              <div>
                <Label htmlFor="template-name">Template Name</Label>
                <Input
                  id="template-name"
                  value={name}
                  onChange={(e) => setName(e.target.value.toUpperCase())}
                  placeholder="e.g., BC STANDARD"
                  data-testid="input-template-name"
                />
              </div>
              <div>
                <Label htmlFor="mix-type">Mix Type</Label>
                <Select 
                  value={mixType} 
                  onValueChange={(value) => {
                    if (value === "__add_new__") {
                      setNewMixTypeDialogOpen(true);
                    } else {
                      setMixType(value);
                    }
                  }}
                >
                  <SelectTrigger data-testid="select-mix-type">
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    {mixTypes?.map((type) => (
                      <SelectItem key={type.id} value={type.name}>{type.name}</SelectItem>
                    ))}
                    <SelectItem value="__add_new__" className="text-primary font-medium">
                      <span className="flex items-center gap-1"><Plus className="h-3 w-3" /> Add New Type</span>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="bitumen-percent">Bitumen %</Label>
                  <Input
                    id="bitumen-percent"
                    type="number"
                    step="0.1"
                    value={bitumenPercent}
                    onChange={(e) => setBitumenPercent(e.target.value)}
                    placeholder="e.g., 5.2"
                    data-testid="input-bitumen-percent"
                  />
                </div>
                <div>
                  <Label htmlFor="ldo-norm">LDO Norm (L/ton)</Label>
                  <Input
                    id="ldo-norm"
                    type="number"
                    step="0.1"
                    value={ldoNorm}
                    onChange={(e) => setLdoNorm(e.target.value)}
                    placeholder="e.g., 6"
                    data-testid="input-ldo-norm"
                  />
                </div>
              </div>
              
              <div className="space-y-2">
                <Label>Aggregate Proportions (% of total mix)</Label>
                <div className="grid grid-cols-2 gap-2">
                  {aggregateMaterials.map((mat) => (
                    <div key={mat.id} className="flex items-center gap-2">
                      <Label className="w-20 text-xs">{mat.name}</Label>
                      <Input
                        type="number"
                        step="0.1"
                        value={aggregateProportions[mat.id] || ""}
                        onChange={(e) => setAggregateProportions(prev => ({
                          ...prev,
                          [mat.id]: e.target.value
                        }))}
                        placeholder="0"
                        className="h-8"
                        data-testid={`input-aggregate-${mat.id}`}
                      />
                    </div>
                  ))}
                </div>
                <div className={`text-xs ${Math.abs(totalPercent - 100) < 0.5 ? "text-green-600" : "text-amber-600"}`}>
                  Total: {totalPercent.toFixed(1)}% (Bitumen: {bitumenVal}% + Aggregates: {aggregateTotal.toFixed(1)}%)
                  {Math.abs(totalPercent - 100) >= 0.5 && " - Should equal 100%"}
                </div>
              </div>

              <div>
                <Label htmlFor="template-notes">Notes</Label>
                <Textarea
                  id="template-notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value.toUpperCase())}
                  placeholder="Additional notes..."
                  data-testid="input-template-notes"
                />
              </div>
              <Button 
                onClick={handleSubmit} 
                className="w-full" 
                disabled={createMutation.isPending || updateMutation.isPending || !name.trim()}
                data-testid="button-save-template"
              >
                {(createMutation.isPending || updateMutation.isPending) ? <Loader2 className="w-4 h-4 animate-spin" /> : editingTemplate ? "Update Template" : "Create Template"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </CardHeader>
      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteConfirmId !== null} onOpenChange={(open) => !open && setDeleteConfirmId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Delete</DialogTitle>
          </DialogHeader>
          <p>Are you sure you want to delete this mix template?</p>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setDeleteConfirmId(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => deleteConfirmId && deleteMutation.mutate(deleteConfirmId)} disabled={deleteMutation.isPending}>
              {deleteMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Delete"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add New Mix Type Dialog */}
      <Dialog open={newMixTypeDialogOpen} onOpenChange={setNewMixTypeDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Add New Mix Type</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="new-mix-type-name">Mix Type Name</Label>
              <Input
                id="new-mix-type-name"
                value={newMixTypeName}
                onChange={(e) => setNewMixTypeName(e.target.value.toUpperCase())}
                placeholder="e.g., SDBC, PMC, PMB"
                data-testid="input-new-mix-type-name"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => {
                setNewMixTypeDialogOpen(false);
                setNewMixTypeName("");
              }}>Cancel</Button>
              <Button 
                onClick={() => {
                  if (newMixTypeName.trim()) {
                    createMixTypeMutation.mutate({ name: newMixTypeName.trim() });
                  }
                }}
                disabled={!newMixTypeName.trim() || createMixTypeMutation.isPending}
                data-testid="button-save-mix-type"
              >
                {createMixTypeMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Add"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <CardContent>
        {isLoading ? (
          <div className="flex justify-center p-8">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        ) : !templates?.length ? (
          <p className="text-muted-foreground text-center py-6">No mix templates added yet.</p>
        ) : (
          <div className="space-y-2">
            {templates.map((template) => {
              const templateComponents = allComponents?.filter(c => c.templateId === template.id) || [];
              return (
                <div key={template.id} className="p-3 rounded-md bg-muted/50">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <p className="font-medium">{template.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {template.mixType} - Bitumen: {template.bitumenPercent}% - LDO: {template.ldoNorm || 6} L/ton
                        {template.isStandard === 1 ? " (Standard)" : " (Job-specific)"}
                      </p>
                      {template.createdAt && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Created: {format(new Date(template.createdAt), "dd-MMM-yyyy HH:mm")}
                        </p>
                      )}
                      {templateComponents.length > 0 && (
                        <div className="mt-2 text-xs text-muted-foreground">
                          <span className="font-medium">Aggregates:</span>{" "}
                          {templateComponents.map((c, idx) => (
                            <span key={c.id}>
                              {getMaterialName(c.materialId)}: {c.percent}%{idx < templateComponents.length - 1 ? ", " : ""}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    {canEdit && (
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(template)} data-testid={`button-edit-template-${template.id}`}>
                          <Pencil className="w-4 h-4" />
                        </Button>
                        {canDelete && (
                          <Button variant="ghost" size="icon" onClick={() => setDeleteConfirmId(template.id)} data-testid={`button-delete-template-${template.id}`}>
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function EquipmentMasterSection({ isManagerMode = false }: { isManagerMode?: boolean }) {
  const { toast } = useToast();
  const { canEdit: globalCanEdit, canDelete: globalCanDelete } = useAccess();
  const canEdit = globalCanEdit;
  const canDelete = !isManagerMode && globalCanDelete;
  const canExport = !isManagerMode;
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingEquipment, setEditingEquipment] = useState<EquipmentMasterType | null>(null);
  const [name, setName] = useState("");
  const [registrationNumber, setRegistrationNumber] = useState("");
  const [ownership, setOwnership] = useState("owned");
  const [vendorName, setVendorName] = useState("");
  const [meterType, setMeterType] = useState("hour_meter");
  const [consumptionNorm, setConsumptionNorm] = useState("");
  const [showInactive, setShowInactive] = useState(false);

  const { data: equipment, isLoading } = useQuery<EquipmentMasterType[]>({
    queryKey: ["/api/plant-module/equipment", showInactive ? "all" : "active"],
    queryFn: async () => {
      const res = await fetch(`/api/plant-module/equipment${showInactive ? "?includeInactive=true" : ""}`);
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: { name: string; registrationNumber?: string; ownership?: string; vendorName?: string; meterType: string; consumptionNorm?: number }) =>
      apiRequest("POST", "/api/plant-module/equipment", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/equipment"] });
      resetForm();
      toast({ title: "Equipment created successfully" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<{ name: string; registrationNumber?: string; ownership?: string; vendorName?: string; meterType: string; consumptionNorm?: number }> }) =>
      apiRequest("PATCH", `/api/plant-module/equipment/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/equipment"] });
      resetForm();
      toast({ title: "Equipment updated successfully" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) =>
      apiRequest("DELETE", `/api/plant-module/equipment/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/equipment"] });
      toast({ title: "Equipment deleted successfully" });
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: (id: number) =>
      apiRequest("PATCH", `/api/plant-module/equipment/${id}/toggle-active`),
    onSuccess: () => {
      queryClient.invalidateQueries({ predicate: (query) => {
        const key = query.queryKey[0];
        return key === "/api/plant-module/equipment";
      }});
      toast({ title: "Equipment status updated" });
    },
  });

  const resetForm = () => {
    setDialogOpen(false);
    setEditingEquipment(null);
    setName("");
    setRegistrationNumber("");
    setOwnership("owned");
    setVendorName("");
    setMeterType("hour_meter");
    setConsumptionNorm("");
  };

  const openEdit = (equip: EquipmentMasterType) => {
    setEditingEquipment(equip);
    setName(equip.name);
    setRegistrationNumber((equip as any).registrationNumber || "");
    setOwnership((equip as any).ownership || "owned");
    setVendorName((equip as any).vendorName || "");
    setMeterType(equip.meterType);
    setConsumptionNorm(equip.consumptionNorm?.toString() || "");
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    const data = {
      name,
      registrationNumber: registrationNumber || undefined,
      ownership,
      vendorName: ownership === "hired" ? vendorName || undefined : undefined,
      meterType,
      consumptionNorm: consumptionNorm ? parseFloat(consumptionNorm) : undefined
    };
    if (editingEquipment) {
      updateMutation.mutate({ id: editingEquipment.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4 flex-wrap">
        <CardTitle className="flex items-center gap-2">
          <Gauge className="w-5 h-5" />
          Equipment Master
        </CardTitle>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Checkbox
              id="show-inactive"
              checked={showInactive}
              onCheckedChange={(checked) => setShowInactive(checked === true)}
              data-testid="checkbox-show-inactive"
            />
            <Label htmlFor="show-inactive" className="text-sm cursor-pointer">Show Inactive</Label>
          </div>
        <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) resetForm(); else setDialogOpen(true); }}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1" data-testid="button-add-equipment">
              <Plus className="w-4 h-4" /> Add Equipment
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingEquipment ? "Edit Equipment" : "Add Equipment"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-4">
              <div>
                <Label htmlFor="equipment-name">Equipment Name</Label>
                <Input
                  id="equipment-name"
                  value={name}
                  onChange={(e) => setName(e.target.value.toUpperCase())}
                  placeholder="e.g., 600 KVA GENERATOR"
                  data-testid="input-equipment-name"
                />
              </div>
              <div>
                <Label htmlFor="registration-number">Registration / ID Number</Label>
                <Input
                  id="registration-number"
                  value={registrationNumber}
                  onChange={(e) => setRegistrationNumber(e.target.value.toUpperCase())}
                  placeholder="e.g., MH12AB1234"
                  data-testid="input-registration-number"
                />
              </div>
              <div>
                <Label htmlFor="ownership">Ownership</Label>
                <Select value={ownership} onValueChange={setOwnership}>
                  <SelectTrigger data-testid="select-ownership">
                    <SelectValue placeholder="Select ownership" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="owned">Owned</SelectItem>
                    <SelectItem value="hired">Hired</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {ownership === "hired" && (
                <div>
                  <Label htmlFor="vendor-name">Vendor / Contractor Name</Label>
                  <Input
                    id="vendor-name"
                    value={vendorName}
                    onChange={(e) => setVendorName(e.target.value.toUpperCase())}
                    placeholder="e.g., ABC CONTRACTORS"
                    data-testid="input-vendor-name"
                  />
                </div>
              )}
              <div>
                <Label htmlFor="meter-type">Meter Type</Label>
                <Select value={meterType} onValueChange={setMeterType}>
                  <SelectTrigger data-testid="select-meter-type">
                    <SelectValue placeholder="Select meter" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="hour_meter">Hour Meter (hrs)</SelectItem>
                    <SelectItem value="odometer">Odometer (km)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="consumption-norm">Consumption Norm ({meterType === "hour_meter" ? "L/hr" : "L/km"})</Label>
                <Input
                  id="consumption-norm"
                  type="number"
                  step="0.1"
                  value={consumptionNorm}
                  onChange={(e) => setConsumptionNorm(e.target.value)}
                  placeholder="e.g., 50"
                  data-testid="input-consumption-norm"
                />
              </div>
              <Button 
                onClick={handleSubmit}
                className="w-full" 
                disabled={createMutation.isPending || updateMutation.isPending || !name.trim()}
                data-testid="button-save-equipment"
              >
                {(createMutation.isPending || updateMutation.isPending) ? <Loader2 className="w-4 h-4 animate-spin" /> : editingEquipment ? "Update" : "Create"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center p-8">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        ) : !equipment?.length ? (
          <p className="text-muted-foreground text-center py-6">No equipment added yet.</p>
        ) : (
          <div className="space-y-2">
            {equipment.map((equip) => {
              const isInactive = equip.isActive === 0;
              return (
              <div key={equip.id} className={`flex items-center justify-between p-3 rounded-md ${isInactive ? "bg-muted/30 opacity-60" : "bg-muted/50"}`}>
                <div>
                  <p className="font-medium flex items-center gap-2">
                    {equip.name}
                    {isInactive && <Badge variant="outline" className="text-xs bg-gray-100 dark:bg-gray-800 text-gray-500">Inactive</Badge>}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {(equip as any).registrationNumber && <span className="font-medium">{(equip as any).registrationNumber} | </span>}
                    {(equip as any).ownership === "hired" ? (
                      <span className="text-orange-600 font-medium">Hired{(equip as any).vendorName ? ` - ${(equip as any).vendorName}` : ""} | </span>
                    ) : (
                      <span className="text-green-600 font-medium">Owned | </span>
                    )}
                    {equip.meterType === "hour_meter" ? "Hour Meter" : "Odometer"} | 
                    Norm: {equip.consumptionNorm} {equip.meterType === "hour_meter" ? "L/hr" : "L/km"}
                  </p>
                </div>
                {canEdit && (
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => toggleActiveMutation.mutate(equip.id)}
                      disabled={toggleActiveMutation.isPending}
                      title={isInactive ? "Activate" : "Deactivate"}
                      data-testid={`button-toggle-equipment-${equip.id}`}
                    >
                      <Power className={`w-4 h-4 ${isInactive ? "text-green-600" : "text-gray-400"}`} />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => openEdit(equip)} data-testid={`button-edit-equipment-${equip.id}`}>
                      <Pencil className="w-4 h-4" />
                    </Button>
                    {canDelete && (
                      <Button variant="ghost" size="icon" onClick={() => deleteMutation.mutate(equip.id)} data-testid={`button-delete-equipment-${equip.id}`}>
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                )}
              </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function PersonnelMasterSection({ isManagerMode = false }: { isManagerMode?: boolean }) {
  const { toast } = useToast();
  const { canEdit: globalCanEdit } = useAccess();
  const canEdit = globalCanEdit;
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPerson, setEditingPerson] = useState<Personnel | null>(null);
  const [name, setName] = useState("");
  const [role, setRole] = useState("Engineer");
  const [phone, setPhone] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [showAddPinAuth, setShowAddPinAuth] = useState(false);

  const { data: personnel, isLoading } = useQuery<Personnel[]>({
    queryKey: ["/api/personnel", showInactive ? "all" : "active"],
    queryFn: async () => {
      const res = await fetch(`/api/personnel${showInactive ? "?includeInactive=true" : ""}`);
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: { name: string; role: string; phone?: string }) =>
      apiRequest("POST", "/api/personnel", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ predicate: (q) => (q.queryKey[0] as string) === "/api/personnel" });
      setDialogOpen(false);
      resetForm();
      toast({ title: "Personnel added" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: { id: number; name: string; role: string; phone?: string }) =>
      apiRequest("PATCH", `/api/personnel/${data.id}`, { name: data.name, role: data.role, phone: data.phone }),
    onSuccess: () => {
      queryClient.invalidateQueries({ predicate: (q) => (q.queryKey[0] as string) === "/api/personnel" });
      setDialogOpen(false);
      resetForm();
      toast({ title: "Personnel updated" });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: (id: number) =>
      apiRequest("PATCH", `/api/personnel/${id}/toggle-active`),
    onSuccess: () => {
      queryClient.invalidateQueries({ predicate: (q) => (q.queryKey[0] as string) === "/api/personnel" });
      toast({ title: "Status updated" });
    },
  });

  const resetForm = () => {
    setName("");
    setRole("Engineer");
    setPhone("");
    setEditingPerson(null);
  };

  const openEdit = (person: Personnel) => {
    setEditingPerson(person);
    setName(person.name);
    setRole(person.role);
    setPhone(person.phone || "");
    setDialogOpen(true);
  };

  const openCreate = () => {
    resetForm();
    setShowAddPinAuth(true);
  };

  const handleAddPinSuccess = (_role: "manager" | "admin") => {
    setShowAddPinAuth(false);
    setDialogOpen(true);
  };

  const handleAddPinClose = () => {
    setShowAddPinAuth(false);
  };

  const handleSubmit = () => {
    if (!name.trim()) return;
    const data = { name: name.trim(), role, phone: phone.trim() || undefined };
    if (editingPerson) {
      updateMutation.mutate({ id: editingPerson.id, ...data });
    } else {
      createMutation.mutate(data);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="flex items-center gap-2">
          <Users className="w-5 h-5" />
          Personnel Master
        </CardTitle>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2">
            <Checkbox
              id="show-inactive-personnel"
              checked={showInactive}
              onCheckedChange={(checked) => setShowInactive(checked === true)}
              data-testid="checkbox-show-inactive-personnel"
            />
            <Label htmlFor="show-inactive-personnel" className="text-xs cursor-pointer">Show Inactive</Label>
          </div>
          <Button size="sm" onClick={openCreate} data-testid="button-add-personnel">
            <Plus className="w-4 h-4 mr-1" /> Add Personnel
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin" /></div>
        ) : !personnel?.length ? (
          <p className="text-muted-foreground text-center py-8">No personnel added yet.</p>
        ) : (
          <div className="space-y-2">
            {personnel.map(person => (
              <div
                key={person.id}
                className={`flex items-center justify-between p-3 rounded-lg border ${!person.isActive ? "opacity-50" : ""}`}
                data-testid={`personnel-row-${person.id}`}
              >
                <div className="flex items-center gap-3">
                  <div>
                    <div className="font-medium">{person.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {person.role}
                      {person.phone && ` · ${person.phone}`}
                    </div>
                  </div>
                  {!person.isActive && <Badge variant="outline" className="text-xs">Inactive</Badge>}
                </div>
                <div className="flex items-center gap-1">
                  {canEdit && (
                    <>
                      <Button size="icon" variant="ghost" onClick={() => openEdit(person)} data-testid={`button-edit-personnel-${person.id}`}>
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => toggleMutation.mutate(person.id)}
                        title={person.isActive ? "Deactivate" : "Activate"}
                        data-testid={`button-toggle-personnel-${person.id}`}
                      >
                        <Power className={`w-4 h-4 ${person.isActive ? "text-green-600" : "text-muted-foreground"}`} />
                      </Button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      {showAddPinAuth && (
        <PinAuth
          targetRole="any"
          onSuccess={handleAddPinSuccess}
          onClose={handleAddPinClose}
        />
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>{editingPerson ? "Edit Personnel" : "Add Personnel"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Name</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value.toUpperCase())}
                placeholder="Full name"
                className="uppercase"
                data-testid="input-personnel-name"
              />
            </div>
            <div>
              <Label>Role</Label>
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger data-testid="select-personnel-role">
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
                value={phone}
                onChange={(e) => setPhone(e.target.value.toUpperCase())}
                placeholder="Phone number"
                className="uppercase"
                data-testid="input-personnel-phone"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button
              disabled={!name.trim() || createMutation.isPending || updateMutation.isPending}
              onClick={handleSubmit}
              data-testid="button-save-personnel"
            >
              {(createMutation.isPending || updateMutation.isPending) ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
