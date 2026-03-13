import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Link, useSearch } from "wouter";
import { ChevronLeft, Loader2, Save, Lock, Search, Plus, ChevronDown, ChevronUp } from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { PinAuth } from "@/components/PinAuth";

type DiscoveredItem = {
  itemKey: string;
  itemLabel: string;
  category: string;
  unit: string;
  rate: number | null;
  rateCardId: number | null;
};

type ManualRow = {
  id: string;
  itemKey: string;
  itemLabel: string;
  category: string;
  unit: string;
  rate: number | string;
};

const UNIT_OPTIONS = ["HRS", "DAYS", "TRIPS", "MONTHS", "TRIP", "MT", "KL", "NOS", "KGS", "LITERS", "CFT", "CUM", "KM"];

const BILLING_MODES = [
  { value: "HOURLY HIRE", unit: "HRS" },
  { value: "DAILY HIRE", unit: "DAYS" },
  { value: "TRIP BASED", unit: "TRIPS" },
  { value: "MONTHLY HIRE", unit: "MONTHS" },
  { value: "TIME/METER", unit: "HRS" },
];

const TRANSPORT_MODES = [
  { value: "TRANSPORT", unit: "TRIP" },
  { value: "HOURLY HIRE", unit: "HRS" },
  { value: "DAILY HIRE", unit: "DAYS" },
  { value: "MONTHLY HIRE", unit: "MONTHS" },
];

const getCategoryBadgeClass = (cat: string) => {
  switch (cat) {
    case "equipment": return "bg-blue-600 text-white border-blue-700";
    case "material": return "bg-amber-600 text-white border-amber-700";
    case "transport": return "bg-purple-600 text-white border-purple-700";
    default: return "bg-gray-500 text-white border-gray-600";
  }
};

export default function RateCards() {
  const { toast } = useToast();
  const searchString = useSearch();
  const params = new URLSearchParams(searchString);
  const preselectedVendor = params.get("vendorName") || "";

  const [authenticated, setAuthenticated] = useState(false);
  const [showPinAuth, setShowPinAuth] = useState(true);
  const [selectedVendor, setSelectedVendor] = useState(preselectedVendor);
  const [rates, setRates] = useState<Record<string, number | string>>({});
  const [unitOverrides, setUnitOverrides] = useState<Record<string, string>>({});
  const [searchFilter, setSearchFilter] = useState("");

  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});
  const [manualRows, setManualRows] = useState<ManualRow[]>([]);

  const [showAddEquipment, setShowAddEquipment] = useState(false);
  const [addEqType, setAddEqType] = useState("");
  const [addEqMode, setAddEqMode] = useState("");

  const [showAddMaterial, setShowAddMaterial] = useState(false);
  const [addMatName, setAddMatName] = useState("");
  const [addMatUnit, setAddMatUnit] = useState("CFT");

  const [showAddTransport, setShowAddTransport] = useState(false);
  const [addTransType, setAddTransType] = useState("");
  const [addTransMode, setAddTransMode] = useState("");

  const { data: vendorNames = [] } = useQuery<string[]>({
    queryKey: ["/api/vendor-bills/vendor-names"],
  });

  const { data: discoveredItems = [], isLoading: isDiscovering } = useQuery<DiscoveredItem[]>({
    queryKey: ["/api/vendor-rate-cards/discover", selectedVendor],
    enabled: !!selectedVendor,
    queryFn: async () => {
      const r = await fetch(`/api/vendor-rate-cards/discover?vendorName=${encodeURIComponent(selectedVendor)}`);
      if (!r.ok) {
        const err = await r.json().catch(() => ({ message: "Failed to discover items" }));
        throw new Error(err.message || "Failed to discover items");
      }
      return r.json();
    },
  });

  const { data: allRateCards = [] } = useQuery<any[]>({
    queryKey: ["/api/vendor-rate-cards", selectedVendor],
    enabled: !!selectedVendor,
    queryFn: async () => {
      const r = await fetch(`/api/vendor-rate-cards?vendorName=${encodeURIComponent(selectedVendor)}`);
      return r.ok ? r.json() : [];
    },
  });

  const { data: canonicalTypes = [] } = useQuery<string[]>({
    queryKey: ["/api/equipment-master/canonical-types", selectedVendor],
    enabled: !!selectedVendor,
    queryFn: async () => {
      const r = await fetch(`/api/equipment-master/canonical-types?vendorName=${encodeURIComponent(selectedVendor)}`);
      return r.ok ? r.json() : [];
    },
  });

  const { data: plantMaterials = [] } = useQuery<any[]>({
    queryKey: ["/api/plant-materials"],
    enabled: !!selectedVendor,
  });

  useEffect(() => {
    if (discoveredItems.length > 0) {
      const rateMap: Record<string, number | string> = {};
      discoveredItems.forEach(item => {
        if (item.rate !== null) {
          rateMap[item.itemKey] = item.rate;
        }
      });
      setRates(rateMap);
    }
  }, [discoveredItems]);

  const bulkSaveMutation = useMutation({
    mutationFn: (items: any[]) => apiRequest("POST", "/api/vendor-rate-cards/bulk-upsert", { items }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/vendor-rate-cards"] });
      queryClient.invalidateQueries({ queryKey: ["/api/vendor-rate-cards/discover", selectedVendor] });
      const savedCount = variables.filter((i: any) => i.rate && i.rate > 0).length;
      toast({ title: `${savedCount} rate(s) saved` });
    },
    onError: (err: any) => toast({ title: err.message || "Failed to save rates", variant: "destructive" }),
  });

  const getEffectiveUnit = (item: DiscoveredItem) => unitOverrides[item.itemKey] || item.unit;

  const getEffectiveKey = (item: DiscoveredItem) => {
    const overriddenUnit = unitOverrides[item.itemKey];
    if (!overriddenUnit || overriddenUnit === item.unit) return item.itemKey;
    const parts = item.itemKey.split("_");
    if (parts.length >= 2) {
      parts[parts.length - 1] = overriddenUnit;
      return parts.join("_");
    }
    return item.itemKey;
  };

  const handleUnitChange = (item: DiscoveredItem, newUnit: string) => {
    setUnitOverrides(prev => ({ ...prev, [item.itemKey]: newUnit }));
    const parts = item.itemKey.split("_");
    if (parts.length >= 2) {
      parts[parts.length - 1] = newUnit;
      const newKey = parts.join("_");
      const existingCard = allRateCards.find(
        (rc: any) => rc.itemKey.toUpperCase() === newKey.toUpperCase() && rc.category === item.category
      );
      if (existingCard && Number(existingCard.rate) > 0) {
        setRates(prev => ({ ...prev, [item.itemKey]: Number(existingCard.rate) }));
      } else {
        setRates(prev => {
          const updated = { ...prev };
          delete updated[item.itemKey];
          return updated;
        });
      }
    }
  };

  const handleAddEquipmentRow = () => {
    if (!addEqType || !addEqMode) {
      toast({ title: "Select machine type and billing mode", variant: "destructive" });
      return;
    }
    const mode = BILLING_MODES.find(m => m.value === addEqMode);
    const unit = mode?.unit || "HRS";
    const key = `EQ_${addEqType.replace(/\s+/g, "_")}_${unit}`;
    const existing = discoveredItems.find(d => d.itemKey === key && d.category === "equipment");
    const existingManual = manualRows.find(r => r.itemKey === key && r.category === "equipment");
    if (existing || existingManual) {
      toast({ title: `${addEqType} - ${addEqMode} already exists`, variant: "destructive" });
      return;
    }
    setManualRows(prev => [...prev, {
      id: `manual_eq_${Date.now()}`,
      itemKey: key,
      itemLabel: `${addEqType} - ${addEqMode}`,
      category: "equipment",
      unit,
      rate: "",
    }]);
    setAddEqType("");
    setAddEqMode("");
    setShowAddEquipment(false);
  };

  const handleAddMaterialRow = () => {
    if (!addMatName || !addMatUnit) {
      toast({ title: "Select material and unit", variant: "destructive" });
      return;
    }
    const key = `MAT_${addMatName.replace(/\s+/g, "_")}_${addMatUnit}`;
    const existing = discoveredItems.find(d => d.itemKey === key && d.category === "material");
    const existingManual = manualRows.find(r => r.itemKey === key && r.category === "material");
    if (existing || existingManual) {
      toast({ title: `${addMatName} - ${addMatUnit} already exists`, variant: "destructive" });
      return;
    }
    setManualRows(prev => [...prev, {
      id: `manual_mat_${Date.now()}`,
      itemKey: key,
      itemLabel: addMatName,
      category: "material",
      unit: addMatUnit,
      rate: "",
    }]);
    setAddMatName("");
    setAddMatUnit("CFT");
    setShowAddMaterial(false);
  };

  const handleAddTransportRow = () => {
    if (!addTransType || !addTransMode) {
      toast({ title: "Select machine type and billing mode", variant: "destructive" });
      return;
    }
    const mode = TRANSPORT_MODES.find(m => m.value === addTransMode);
    const unit = mode?.unit || "TRIP";
    const key = `EQ_${addTransType.replace(/\s+/g, "_")}_${unit}`;
    const existing = discoveredItems.find(d => d.itemKey === key && d.category === "transport");
    const existingManual = manualRows.find(r => r.itemKey === key && r.category === "transport");
    if (existing || existingManual) {
      toast({ title: `${addTransType} - ${addTransMode} already exists`, variant: "destructive" });
      return;
    }
    setManualRows(prev => [...prev, {
      id: `manual_trans_${Date.now()}`,
      itemKey: key,
      itemLabel: `${addTransType} - ${addTransMode}`,
      category: "transport",
      unit,
      rate: "",
    }]);
    setAddTransType("");
    setAddTransMode("");
    setShowAddTransport(false);
  };

  const handleSaveAll = () => {
    const discoveredToSave = discoveredItems.map(item => {
      const effectiveUnit = getEffectiveUnit(item);
      const effectiveKey = getEffectiveKey(item);
      return {
        vendorName: selectedVendor,
        category: item.category,
        itemKey: effectiveKey,
        itemLabel: item.itemLabel,
        unit: effectiveUnit,
        rate: parseFloat(String(rates[item.itemKey] || 0)) || 0,
      };
    }).filter(i => i.rate > 0);

    const manualToSave = manualRows.map(row => ({
      vendorName: selectedVendor,
      category: row.category,
      itemKey: row.itemKey,
      itemLabel: row.itemLabel,
      unit: row.unit,
      rate: parseFloat(String(row.rate || 0)) || 0,
    })).filter(i => i.rate > 0);

    const allToSave = [...discoveredToSave, ...manualToSave];

    if (allToSave.length === 0) {
      toast({ title: "No rates to save — enter at least one rate", variant: "destructive" });
      return;
    }
    bulkSaveMutation.mutate(allToSave);
  };

  const toggleSection = (section: string) => {
    setCollapsedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const equipmentItems = useMemo(() => {
    return discoveredItems.filter(item => {
      if (item.category !== "equipment") return false;
      if (searchFilter && !item.itemLabel.toUpperCase().includes(searchFilter.toUpperCase())) return false;
      return true;
    });
  }, [discoveredItems, searchFilter]);

  const materialItems = useMemo(() => {
    return discoveredItems.filter(item => {
      if (item.category !== "material") return false;
      if (searchFilter && !item.itemLabel.toUpperCase().includes(searchFilter.toUpperCase())) return false;
      return true;
    });
  }, [discoveredItems, searchFilter]);

  const transportItems = useMemo(() => {
    return discoveredItems.filter(item => {
      if (item.category !== "transport") return false;
      if (searchFilter && !item.itemLabel.toUpperCase().includes(searchFilter.toUpperCase())) return false;
      return true;
    });
  }, [discoveredItems, searchFilter]);

  const equipmentManualRows = useMemo(() => manualRows.filter(r => r.category === "equipment"), [manualRows]);
  const materialManualRows = useMemo(() => manualRows.filter(r => r.category === "material"), [manualRows]);
  const transportManualRows = useMemo(() => manualRows.filter(r => r.category === "transport"), [manualRows]);

  const filledCount = useMemo(() => {
    const discoveredFilled = Object.values(rates).filter(r => parseFloat(String(r)) > 0).length;
    const manualFilled = manualRows.filter(r => parseFloat(String(r.rate)) > 0).length;
    return discoveredFilled + manualFilled;
  }, [rates, manualRows]);

  const materialNameOptions = useMemo(() => {
    return plantMaterials.map((m: any) => m.name?.toUpperCase()?.trim()).filter(Boolean).sort();
  }, [plantMaterials]);

  if (!authenticated) {
    return (
      <div className="max-w-md mx-auto p-8 space-y-4">
        <div className="text-center space-y-2">
          <Lock className="w-10 h-10 mx-auto text-muted-foreground" />
          <h1 className="text-xl font-bold">RATE CARD MANAGEMENT</h1>
          <p className="text-sm text-muted-foreground">Manager or Admin PIN required to access rate cards</p>
        </div>
        {showPinAuth && (
          <PinAuth
            targetRole="any"
            onSuccess={() => { setAuthenticated(true); setShowPinAuth(false); }}
            onClose={() => setShowPinAuth(false)}
          />
        )}
        {!showPinAuth && (
          <div className="text-center space-y-2">
            <Button onClick={() => setShowPinAuth(true)} data-testid="button-retry-pin">
              ENTER PIN
            </Button>
            <div>
              <Link href="/plant/vendor-bills">
                <Button variant="ghost" size="sm">BACK TO VENDOR BILLS</Button>
              </Link>
            </div>
          </div>
        )}
      </div>
    );
  }

  const renderItemRow = (item: DiscoveredItem, idx: number) => (
    <tr key={item.itemKey} className="border-t hover:bg-muted/30" data-testid={`row-discovered-item-${idx}`}>
      <td className="px-3 py-2">
        <div className="font-medium text-sm">{item.itemLabel}</div>
      </td>
      <td className="px-3 py-2">
        <Select value={getEffectiveUnit(item)} onValueChange={(v) => handleUnitChange(item, v)}>
          <SelectTrigger className="h-8 w-24 text-xs" data-testid={`select-unit-${idx}`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {UNIT_OPTIONS.map(u => (
              <SelectItem key={u} value={u}>{u}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </td>
      <td className="px-3 py-2">
        <Input
          type="number"
          step="0.01"
          min="0"
          value={rates[item.itemKey] ?? ""}
          onChange={e => setRates(prev => ({ ...prev, [item.itemKey]: e.target.value }))}
          onWheel={e => (e.target as HTMLInputElement).blur()}
          placeholder="0.00"
          className="text-right font-mono w-full"
          data-testid={`input-rate-${idx}`}
        />
      </td>
    </tr>
  );

  const renderManualRow = (row: ManualRow, idx: number) => (
    <tr key={row.id} className="border-t hover:bg-muted/30 bg-green-50/50 dark:bg-green-900/10" data-testid={`row-manual-${row.category}-${idx}`}>
      <td className="px-3 py-2">
        <div className="font-medium text-sm flex items-center gap-2">
          {row.itemLabel}
          <Badge variant="outline" className="text-[9px] bg-green-100 text-green-700 border-green-300 no-default-hover-elevate no-default-active-elevate">NEW</Badge>
        </div>
      </td>
      <td className="px-3 py-2">
        <span className="text-xs font-mono px-2 py-1 bg-muted rounded">{row.unit}</span>
      </td>
      <td className="px-3 py-2">
        <Input
          type="number"
          step="0.01"
          min="0"
          value={row.rate}
          onChange={e => {
            const val = e.target.value;
            setManualRows(prev => prev.map(r => r.id === row.id ? { ...r, rate: val } : r));
          }}
          onWheel={e => (e.target as HTMLInputElement).blur()}
          placeholder="0.00"
          className="text-right font-mono w-full"
          data-testid={`input-manual-rate-${row.category}-${idx}`}
        />
      </td>
    </tr>
  );

  const renderSectionHeader = (title: string, category: string, count: number, badgeClass: string) => (
    <div
      className="flex items-center justify-between px-3 py-2 bg-muted/60 cursor-pointer select-none"
      onClick={() => toggleSection(category)}
      data-testid={`section-header-${category}`}
    >
      <div className="flex items-center gap-2">
        <Badge variant="outline" className={`text-[10px] ${badgeClass} no-default-hover-elevate no-default-active-elevate`}>
          {title}
        </Badge>
        <span className="text-xs text-muted-foreground">{count} item(s)</span>
      </div>
      {collapsedSections[category] ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
    </div>
  );

  return (
    <div className="max-w-5xl mx-auto space-y-4 p-4">
      <div className="flex items-center gap-4 flex-wrap">
        <Link href="/plant/vendor-bills">
          <Button variant="ghost" size="icon" data-testid="button-back-rate-cards">
            <ChevronLeft className="w-5 h-5" />
          </Button>
        </Link>
        <h1 className="text-xl font-bold" data-testid="text-rate-cards-title">VENDOR RATE CARDS</h1>
      </div>

      <Card>
        <CardContent className="pt-4 space-y-3">
          <div>
            <Label className="text-xs uppercase font-semibold">Select Vendor</Label>
            <Select value={selectedVendor} onValueChange={(v) => { setSelectedVendor(v); setRates({}); setUnitOverrides({}); setSearchFilter(""); setManualRows([]); }}>
              <SelectTrigger data-testid="select-vendor">
                <SelectValue placeholder="Choose a vendor..." />
              </SelectTrigger>
              <SelectContent>
                {vendorNames.map(v => (
                  <SelectItem key={v} value={v}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {selectedVendor && isDiscovering && (
        <div className="flex justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin" />
          <span className="ml-2 text-sm text-muted-foreground">Discovering items for {selectedVendor}...</span>
        </div>
      )}

      {selectedVendor && !isDiscovering && (
        <>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold">{discoveredItems.length + manualRows.length} ITEMS</span>
                  <Badge variant="outline" className="text-[10px] bg-green-600 text-white border-green-700 no-default-hover-elevate no-default-active-elevate">
                    {filledCount} RATES SET
                  </Badge>
                </div>
                <div className="relative">
                  <Search className="absolute left-2 top-2.5 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Search items..."
                    value={searchFilter}
                    onChange={e => setSearchFilter(e.target.value)}
                    className="pl-8 uppercase w-48"
                    data-testid="input-search-items"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* EQUIPMENT SECTION */}
          <Card>
            <CardContent className="p-0 overflow-x-auto">
              {renderSectionHeader("EQUIPMENT", "equipment", equipmentItems.length + equipmentManualRows.length, getCategoryBadgeClass("equipment"))}
              {!collapsedSections["equipment"] && (
                <>
                  <table className="w-full text-sm">
                    <thead className="bg-muted/30">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs">MACHINE TYPE — BILLING MODE</th>
                        <th className="px-3 py-2 text-left text-xs w-28">UNIT</th>
                        <th className="px-3 py-2 text-right text-xs w-36">RATE (₹)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {equipmentItems.map((item, idx) => renderItemRow(item, idx))}
                      {equipmentManualRows.map((row, idx) => renderManualRow(row, idx))}
                      {equipmentItems.length === 0 && equipmentManualRows.length === 0 && (
                        <tr><td colSpan={3} className="px-3 py-4 text-center text-muted-foreground text-sm">No equipment items discovered. Use ADD ROW to add manually.</td></tr>
                      )}
                    </tbody>
                  </table>
                  <div className="px-3 py-2 border-t">
                    {!showAddEquipment ? (
                      <Button variant="outline" size="sm" onClick={() => setShowAddEquipment(true)} data-testid="button-add-equipment-row">
                        <Plus className="w-3 h-3 mr-1" /> ADD ROW
                      </Button>
                    ) : (
                      <div className="flex items-end gap-2 flex-wrap">
                        <div className="space-y-1">
                          <Label className="text-[10px] uppercase">Machine Type</Label>
                          <Select value={addEqType} onValueChange={setAddEqType}>
                            <SelectTrigger className="w-44 h-8 text-xs" data-testid="select-add-eq-type">
                              <SelectValue placeholder="Select type..." />
                            </SelectTrigger>
                            <SelectContent>
                              {canonicalTypes.map(t => (
                                <SelectItem key={t} value={t}>{t}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[10px] uppercase">Billing Mode</Label>
                          <Select value={addEqMode} onValueChange={setAddEqMode}>
                            <SelectTrigger className="w-40 h-8 text-xs" data-testid="select-add-eq-mode">
                              <SelectValue placeholder="Select mode..." />
                            </SelectTrigger>
                            <SelectContent>
                              {BILLING_MODES.map(m => (
                                <SelectItem key={m.value} value={m.value}>{m.value} ({m.unit})</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <Button size="sm" onClick={handleAddEquipmentRow} data-testid="button-confirm-add-equipment">ADD</Button>
                        <Button variant="ghost" size="sm" onClick={() => { setShowAddEquipment(false); setAddEqType(""); setAddEqMode(""); }}>CANCEL</Button>
                      </div>
                    )}
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* MATERIALS SECTION */}
          <Card>
            <CardContent className="p-0 overflow-x-auto">
              {renderSectionHeader("MATERIALS", "material", materialItems.length + materialManualRows.length, getCategoryBadgeClass("material"))}
              {!collapsedSections["material"] && (
                <>
                  <table className="w-full text-sm">
                    <thead className="bg-muted/30">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs">MATERIAL NAME</th>
                        <th className="px-3 py-2 text-left text-xs w-28">UNIT</th>
                        <th className="px-3 py-2 text-right text-xs w-36">RATE (₹)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {materialItems.map((item, idx) => renderItemRow(item, idx))}
                      {materialManualRows.map((row, idx) => renderManualRow(row, idx))}
                      {materialItems.length === 0 && materialManualRows.length === 0 && (
                        <tr><td colSpan={3} className="px-3 py-4 text-center text-muted-foreground text-sm">No materials discovered. Use ADD ROW to add manually.</td></tr>
                      )}
                    </tbody>
                  </table>
                  <div className="px-3 py-2 border-t">
                    {!showAddMaterial ? (
                      <Button variant="outline" size="sm" onClick={() => setShowAddMaterial(true)} data-testid="button-add-material-row">
                        <Plus className="w-3 h-3 mr-1" /> ADD ROW
                      </Button>
                    ) : (
                      <div className="flex items-end gap-2 flex-wrap">
                        <div className="space-y-1">
                          <Label className="text-[10px] uppercase">Material</Label>
                          <Select value={addMatName} onValueChange={setAddMatName}>
                            <SelectTrigger className="w-48 h-8 text-xs" data-testid="select-add-mat-name">
                              <SelectValue placeholder="Select material..." />
                            </SelectTrigger>
                            <SelectContent>
                              {materialNameOptions.map((m: string) => (
                                <SelectItem key={m} value={m}>{m}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[10px] uppercase">Unit</Label>
                          <Select value={addMatUnit} onValueChange={setAddMatUnit}>
                            <SelectTrigger className="w-28 h-8 text-xs" data-testid="select-add-mat-unit">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {UNIT_OPTIONS.map(u => (
                                <SelectItem key={u} value={u}>{u}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <Button size="sm" onClick={handleAddMaterialRow} data-testid="button-confirm-add-material">ADD</Button>
                        <Button variant="ghost" size="sm" onClick={() => { setShowAddMaterial(false); setAddMatName(""); setAddMatUnit("CFT"); }}>CANCEL</Button>
                      </div>
                    )}
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* TRANSPORT SECTION */}
          <Card>
            <CardContent className="p-0 overflow-x-auto">
              {renderSectionHeader("TRANSPORT", "transport", transportItems.length + transportManualRows.length, getCategoryBadgeClass("transport"))}
              {!collapsedSections["transport"] && (
                <>
                  <table className="w-full text-sm">
                    <thead className="bg-muted/30">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs">MACHINE TYPE — BILLING MODE</th>
                        <th className="px-3 py-2 text-left text-xs w-28">UNIT</th>
                        <th className="px-3 py-2 text-right text-xs w-36">RATE (₹)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {transportItems.map((item, idx) => renderItemRow(item, idx))}
                      {transportManualRows.map((row, idx) => renderManualRow(row, idx))}
                      {transportItems.length === 0 && transportManualRows.length === 0 && (
                        <tr><td colSpan={3} className="px-3 py-4 text-center text-muted-foreground text-sm">No transport items discovered. Use ADD ROW to add manually.</td></tr>
                      )}
                    </tbody>
                  </table>
                  <div className="px-3 py-2 border-t">
                    <div className="text-[10px] text-muted-foreground mb-1">TRIP rates use lead distance x 2 (one-way to two-way)</div>
                    {!showAddTransport ? (
                      <Button variant="outline" size="sm" onClick={() => setShowAddTransport(true)} data-testid="button-add-transport-row">
                        <Plus className="w-3 h-3 mr-1" /> ADD ROW
                      </Button>
                    ) : (
                      <div className="flex items-end gap-2 flex-wrap">
                        <div className="space-y-1">
                          <Label className="text-[10px] uppercase">Machine Type</Label>
                          <Select value={addTransType} onValueChange={setAddTransType}>
                            <SelectTrigger className="w-44 h-8 text-xs" data-testid="select-add-trans-type">
                              <SelectValue placeholder="Select type..." />
                            </SelectTrigger>
                            <SelectContent>
                              {canonicalTypes.map(t => (
                                <SelectItem key={t} value={t}>{t}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[10px] uppercase">Billing Mode</Label>
                          <Select value={addTransMode} onValueChange={setAddTransMode}>
                            <SelectTrigger className="w-40 h-8 text-xs" data-testid="select-add-trans-mode">
                              <SelectValue placeholder="Select mode..." />
                            </SelectTrigger>
                            <SelectContent>
                              {TRANSPORT_MODES.map(m => (
                                <SelectItem key={m.value} value={m.value}>{m.value} ({m.unit})</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <Button size="sm" onClick={handleAddTransportRow} data-testid="button-confirm-add-transport">ADD</Button>
                        <Button variant="ghost" size="sm" onClick={() => { setShowAddTransport(false); setAddTransType(""); setAddTransMode(""); }}>CANCEL</Button>
                      </div>
                    )}
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button
              size="lg"
              onClick={handleSaveAll}
              disabled={bulkSaveMutation.isPending}
              data-testid="button-save-all-rates"
            >
              {bulkSaveMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
              SAVE ALL RATES
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
