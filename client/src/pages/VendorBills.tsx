import { useState, useMemo, useRef, useEffect, Fragment } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Link, useSearch } from "wouter";
import { useOrigin } from "@/hooks/use-origin";
import { ChevronLeft, Plus, Loader2, Trash2, FileText, Printer, ArrowRight, Check, Circle, Info, Fuel, Settings, Copy, X, Download, Search, Edit, PlusCircle } from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { PinAuth } from "@/components/PinAuth";
import { format } from "date-fns";
import type { VendorBillWithItems, VendorAlias } from "@shared/schema";

const formatDate = (dateStr: string | null | undefined) => {
  if (!dateStr) return "-";
  try {
    const d = new Date(dateStr + (dateStr.length === 10 ? "T00:00:00" : ""));
    if (Number.isNaN(d.getTime())) return dateStr;
    return format(d, "dd-MMM-yyyy").toUpperCase();
  } catch { return dateStr; }
};

type ViewMode = "list" | "form" | "detail";

interface LineItem {
  date: string;
  category: string;
  description: string;
  qty: number;
  unit: string;
  rate: number;
  amount: number;
  source: string;
  equipmentId: number | null;
  leadDistance: number | null;
  siteName?: string | null;
  billedIn?: { billNo: string; billStatus: string } | null;
}

const BILL_TYPES = [
  { value: "equipment", label: "EQUIPMENT HIRE" },
  { value: "material", label: "MATERIAL SUPPLY" },
  { value: "transport", label: "TRANSPORT" },
  { value: "all", label: "All Types (Combined)" },
  { value: "other", label: "OTHER / MISCELLANEOUS" },
];

const LINE_ITEM_UNITS = ["HRS", "DAYS", "TRIP", "TRIPS", "MT", "KL", "NOS", "KGS", "LITERS", "CFT", "CUM", "MONTHS", "KM"];

function getCategoryBadgeClass(category: string) {
  switch (category) {
    case "equipment": return "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 border-orange-300";
    case "material": return "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border-blue-300";
    case "transport": return "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border-green-300";
    default: return "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400 border-gray-300";
  }
}

function getCategoryLabel(category: string) {
  switch (category) {
    case "equipment": return "EQUIP";
    case "material": return "MATL";
    case "transport": return "TRNS";
    default: return "OTHER";
  }
}


function extractDiesel(description: string): number {
  const match = description.match(/DIESEL:\s*(\d+(?:\.\d+)?)L/i);
  return match ? parseFloat(match[1]) : 0;
}

function inferSiteNameFromDescription(description: string | undefined, existingSiteName: string | null | undefined): string | null {
  if (existingSiteName) return existingSiteName;
  if (!description) return null;
  const d = description.toUpperCase();
  if (d.includes("(SITE-UNLINKED)")) return "SITE*";
  if (d.includes("(SITE TRIP)")) return "SITE: TRIP";
  if (d.includes("(PLANT)")) return "PLANT";
  if (d.includes("(SITE)")) return "SITE";
  return null;
}

function parseSiteBadge(item: { siteName?: string | null; description?: string }): { type: "site" | "plant" | "site-unlinked"; label: string } | null {
  const resolved = inferSiteNameFromDescription(item.description, item.siteName);
  if (!resolved) return null;
  const sn = resolved.toUpperCase();
  if (sn === "PLANT") return { type: "plant", label: "PLANT" };
  if (sn.startsWith("SITE*")) {
    const name = sn.replace(/^SITE\*:?\s*/, "").trim();
    return { type: "site-unlinked", label: name ? `SITE* · ${name}` : "SITE*" };
  }
  if (sn.startsWith("SITE")) {
    const name = sn.replace(/^SITE:?\s*/, "").trim();
    return { type: "site", label: name ? `SITE · ${name}` : "SITE" };
  }
  return { type: "site", label: sn };
}

function getSiteBadgeClass(type: "site" | "plant" | "site-unlinked"): string {
  switch (type) {
    case "site": return "bg-blue-50 text-blue-700 border-blue-300 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-700";
    case "plant": return "bg-green-50 text-green-700 border-green-300 dark:bg-green-900/30 dark:text-green-400 dark:border-green-700";
    case "site-unlinked": return "bg-orange-50 text-orange-700 border-orange-300 dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-700";
  }
}

function stripSourceSuffix(desc: string): string {
  return desc.replace(/\s*\(SITE-UNLINKED\)\s*/gi, " ").replace(/\s*\(SITE TRIP\)\s*/gi, " ").replace(/\s*\(SITE\)\s*/gi, " ").replace(/\s*\(PLANT\)\s*/gi, " ").trim();
}

function canonicalizeMachineType(name: string): string {
  return name
    .replace(/\s+PLANT\s+INTERCARTING/gi, '')
    .replace(/\s+INTERCARTING/gi, '')
    .replace(/\s+PLANT$/i, '')
    .replace(/-PLANT$/i, '')
    .replace(/-SITE$/i, '')
    .replace(/-\d+(\s+.*)?$/i, '')
    .replace(/-[A-Z][A-Z\s]+$/i, '')
    .trim();
}

function canonicalMachineName(description: string): string {
  const rawName = description.split(/\s*-\s*/)[0]?.trim() || "EQUIPMENT";
  const stripped = stripSourceSuffix(rawName);
  return canonicalizeMachineType(stripped).toUpperCase().replace(/\s+/g, "_");
}

function canonicalTransportName(description: string): string {
  const upper = stripSourceSuffix(description.trim().toUpperCase());
  const viaMatch = upper.match(/\bVIA\s+(.+)/);
  if (viaMatch) {
    return canonicalizeMachineType(viaMatch[1].trim()).toUpperCase().replace(/\s+/g, "_");
  }
  const mobilMatch = upper.match(/^MOBILIZATION:\s*(.+?)(?:\s*\(.*)?$/);
  if (mobilMatch) {
    return canonicalizeMachineType(mobilMatch[1].trim()).toUpperCase().replace(/\s+/g, "_");
  }
  const stripped = upper
    .replace(/\s*-\s*(HOURLY HIRE|DAILY HIRE|TRIP BASED|MONTHLY HIRE|TIME\/METER|MOBILIZATION|TRANSPORT).*$/i, "")
    .trim();
  return canonicalizeMachineType(stripped).toUpperCase().replace(/\s+/g, "_");
}

function canonicalMatName(description: string): string {
  return stripSourceSuffix(description.trim().toUpperCase()).replace(/\s+/g, "_");
}

const STATUS_ORDER = ["draft", "verified", "approved", "paid"] as const;

function getStatusBadgeClass(status: string) {
  switch (status) {
    case "draft": return "bg-amber-500 text-white border-amber-600";
    case "verified": return "bg-emerald-600 text-white border-emerald-700";
    case "approved": return "bg-indigo-600 text-white border-indigo-700";
    case "paid": return "bg-blue-600 text-white border-blue-700";
    default: return "bg-gray-500 text-white border-gray-600";
  }
}

function getStatusColor(status: string) {
  switch (status) {
    case "draft": return "text-amber-600 dark:text-amber-400";
    case "verified": return "text-emerald-600 dark:text-emerald-400";
    case "approved": return "text-indigo-600 dark:text-indigo-400";
    case "paid": return "text-blue-600 dark:text-blue-400";
    default: return "";
  }
}

function formatCurrency(amount: number | null | undefined) {
  if (amount == null) return "0.00";
  return Number(amount).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatQty(qty: number | null | undefined) {
  if (qty == null) return "0.00";
  return Number(qty).toFixed(2);
}

function getBillTypeLabel(type: string) {
  return BILL_TYPES.find(t => t.value === type.toLowerCase())?.label || type.toUpperCase();
}

export default function VendorBills() {
  const { toast } = useToast();
  const { appendOrigin } = useOrigin();
  const searchString = useSearch();
  const urlParams = new URLSearchParams(searchString || window.location.search);
  const urlTab = urlParams.get("tab");
  const urlRole = urlParams.get("role");
  const backLink = appendOrigin(`/plant/dashboard${urlTab ? `?tab=${urlTab}${urlRole ? `&role=${urlRole}` : ""}` : ""}`);

  const [view, setView] = useState<ViewMode>("list");
  const [selectedBillId, setSelectedBillId] = useState<number | null>(null);
  const [editingBillId, setEditingBillId] = useState<number | null>(null);

  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [filterVendor, setFilterVendor] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");

  const [billDate, setBillDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [billNo, setBillNo] = useState("");
  const [billType, setBillType] = useState("equipment");
  const [vendorName, setVendorName] = useState("");
  const [periodFrom, setPeriodFrom] = useState("");
  const [periodTo, setPeriodTo] = useState("");
  const [notes, setNotes] = useState("");
  const [lineItems, setLineItems] = useState<LineItem[]>([
    { date: "", category: "equipment", description: "", qty: 0, unit: "HRS", rate: 0, amount: 0, source: "manual", equipmentId: null, leadDistance: null },
  ]);
  const [adjustmentLabel, setAdjustmentLabel] = useState("");
  const [adjustmentAmount, setAdjustmentAmount] = useState<number>(0);
  const [gstRateEquipment, setGstRateEquipment] = useState<number>(0);
  const [gstRateMaterial, setGstRateMaterial] = useState<number>(0);
  const [gstRateTransport, setGstRateTransport] = useState<number>(0);
  const [tdsRate, setTdsRate] = useState<number>(0);

  const [showPinAuth, setShowPinAuth] = useState(false);
  const [pendingStatusAction, setPendingStatusAction] = useState<{ billId: number; status: string } | null>(null);
  const [pendingEditAction, setPendingEditAction] = useState<{ bill: VendorBillWithItems } | null>(null);
  const [pendingDeleteAction, setPendingDeleteAction] = useState<{ billId: number; billNo?: string; status?: string } | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showEditPinAuth, setShowEditPinAuth] = useState(false);
  const [showDeletePinAuth, setShowDeletePinAuth] = useState(false);
  const [adminPinForUpdate, setAdminPinForUpdate] = useState<string | null>(null);
  const [showAliasDialog, setShowAliasDialog] = useState(false);
  const [showAliasPinAuth, setShowAliasPinAuth] = useState(false);
  const [aliasCanonical, setAliasCanonical] = useState("");
  const [aliasValue, setAliasValue] = useState("");
  const [showSetRatesDialog, setShowSetRatesDialog] = useState(false);
  const [bulkRates, setBulkRates] = useState<Record<string, { rate: number; leadDistance: number }>>({});

  const { data: bills, isLoading } = useQuery<VendorBillWithItems[]>({
    queryKey: ["/api/vendor-bills"],
  });

  const { data: billSummary } = useQuery<{
    total: number;
    totalAmount: number;
    draft: number;
    draftAmount: number;
    verified: number;
    verifiedAmount: number;
    approved: number;
    approvedAmount: number;
    paid: number;
    paidAmount: number;
  }>({
    queryKey: ["/api/vendor-bills/summary"],
  });

  const { data: billDetail } = useQuery<VendorBillWithItems>({
    queryKey: ["/api/vendor-bills", selectedBillId],
    enabled: !!selectedBillId,
  });

  const { data: vendorNamesData } = useQuery<string[]>({
    queryKey: ["/api/vendor-bills/vendor-names"],
  });

  const vendorNames = vendorNamesData || [];

  const { data: vendorAliasesData } = useQuery<VendorAlias[]>({
    queryKey: ["/api/vendor-aliases"],
  });

  const addAliasMutation = useMutation({
    mutationFn: (data: { canonicalName: string; alias: string }) =>
      apiRequest("POST", "/api/vendor-aliases", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vendor-aliases"] });
      queryClient.invalidateQueries({ queryKey: ["/api/vendor-bills/vendor-names"] });
      toast({ title: "Vendor alias added" });
      setAliasCanonical("");
      setAliasValue("");
    },
    onError: (err: Error) => {
      toast({ title: "Failed to add alias", description: err.message, variant: "destructive" });
    },
  });

  const deleteAliasMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/vendor-aliases/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vendor-aliases"] });
      queryClient.invalidateQueries({ queryKey: ["/api/vendor-bills/vendor-names"] });
      toast({ title: "Alias removed" });
    },
  });

  const [showVendorDiscovery, setShowVendorDiscovery] = useState(false);

  const [vendorSearch, setVendorSearch] = useState("");
  const [showVendorDropdown, setShowVendorDropdown] = useState(false);
  const vendorInputRef = useRef<HTMLInputElement>(null);

  const filteredVendorNames = useMemo(() => {
    if (!vendorSearch) return vendorNames;
    return vendorNames.filter(n => n.includes(vendorSearch.toUpperCase()));
  }, [vendorNames, vendorSearch]);

  interface DiscoveredVendor {
    vendorName: string;
    recordCount: number;
    categories: string[];
    existingBill: { id: number; billNo: string; status: string } | null;
  }

  const discoverUrl = periodFrom && periodTo && billType !== "other"
    ? `/api/vendor-bills/discover-vendors?billType=${encodeURIComponent(billType)}&periodFrom=${encodeURIComponent(periodFrom)}&periodTo=${encodeURIComponent(periodTo)}`
    : null;

  const { data: discoveredVendors, isFetching: discoveryLoading } = useQuery<DiscoveredVendor[]>({
    queryKey: ["/api/vendor-bills/discover-vendors", billType, periodFrom, periodTo],
    queryFn: () => discoverUrl ? fetch(discoverUrl).then(r => r.json()) : Promise.resolve([]),
    enabled: !!discoverUrl && showVendorDiscovery,
  });

  const autoItemsUrl = vendorName && periodFrom && periodTo && billType !== "other"
    ? `/api/vendor-bills/auto-items?vendorName=${encodeURIComponent(vendorName)}&billType=${encodeURIComponent(billType)}&periodFrom=${encodeURIComponent(periodFrom)}&periodTo=${encodeURIComponent(periodTo)}`
    : null;

  const { data: autoItems, isFetching: autoItemsLoading } = useQuery<any[]>({
    queryKey: ["/api/vendor-bills/auto-items", vendorName, billType, periodFrom, periodTo],
    queryFn: () => autoItemsUrl ? fetch(autoItemsUrl).then(r => r.json()) : Promise.resolve([]),
    enabled: !!autoItemsUrl,
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/vendor-bills", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vendor-bills"] });
      toast({ title: "Vendor bill created successfully" });
      resetForm();
      setView("list");
    },
    onError: (err: Error) => {
      toast({ title: "Failed to create bill", description: err.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data, pin }: { id: number; data: any; pin?: string | null }) => apiRequest("PUT", `/api/vendor-bills/${id}`, pin ? { ...data, pin } : data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vendor-bills"] });
      toast({ title: "Vendor bill updated successfully" });
      resetForm();
      setEditingBillId(null);
      setAdminPinForUpdate(null);
      setView("list");
    },
    onError: (err: Error) => {
      toast({ title: "Failed to update bill", description: err.message, variant: "destructive" });
    },
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status, actor, pin }: { id: number; status: string; actor: string; pin?: string }) =>
      apiRequest("PATCH", `/api/vendor-bills/${id}/status`, { status, actor, pin }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vendor-bills"] });
      if (selectedBillId) {
        queryClient.invalidateQueries({ queryKey: ["/api/vendor-bills", selectedBillId] });
      }
      toast({ title: "Bill status updated" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to update status", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: ({ id, pin }: { id: number; pin: string }) => apiRequest("DELETE", `/api/vendor-bills/${id}`, { pin }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vendor-bills"] });
      toast({ title: "Bill deleted" });
      setSelectedBillId(null);
      setShowDeleteConfirm(false);
      setView("list");
    },
    onError: (err: Error) => {
      toast({ title: "Failed to delete bill", description: err.message, variant: "destructive" });
    },
  });

  const resetForm = () => {
    setBillDate(format(new Date(), "yyyy-MM-dd"));
    setBillNo("");
    setBillType("equipment");
    setVendorName("");
    setPeriodFrom("");
    setPeriodTo("");
    setNotes("");
    setLineItems([{ date: "", category: "equipment", description: "", qty: 0, unit: "HRS", rate: 0, amount: 0, source: "manual", equipmentId: null, leadDistance: null }]);
    setAdjustmentLabel("");
    setAdjustmentAmount(0);
    setGstRateEquipment(0);
    setGstRateMaterial(0);
    setGstRateTransport(0);
    setTdsRate(0);
    setEditingBillId(null);
    setAdminPinForUpdate(null);
    setVendorSearch("");
    setShowVendorDropdown(false);
    setShowVendorDiscovery(false);
  };

  const handleSelectDiscoveredVendor = (vendor: DiscoveredVendor) => {
    setVendorName(vendor.vendorName);
    setVendorSearch(vendor.vendorName);
    setShowVendorDiscovery(false);
  };

  const handleEditExistingBill = (billId: number) => {
    const bill = bills?.find(b => b.id === billId);
    if (bill) {
      loadBillForEdit(bill);
      setShowVendorDiscovery(false);
    } else {
      setSelectedBillId(billId);
      setView("detail");
      setShowVendorDiscovery(false);
    }
  };

  const loadBillForEdit = (bill: VendorBillWithItems) => {
    setBillDate(bill.billDate);
    setBillNo(bill.billNo);
    setBillType(bill.billType.toLowerCase());
    setVendorName(bill.vendorName);
    setVendorSearch(bill.vendorName);
    setPeriodFrom(bill.periodFrom || "");
    setPeriodTo(bill.periodTo || "");
    setNotes(bill.notes || "");
    setLineItems(
      bill.items.map(item => ({
        date: item.date || "",
        category: item.category || "other",
        description: item.description,
        qty: item.qty || 0,
        unit: item.unit || "HRS",
        rate: item.rate || 0,
        amount: item.amount || 0,
        source: item.source || "manual",
        equipmentId: item.equipmentId || null,
        leadDistance: item.leadDistance ?? null,
        siteName: inferSiteNameFromDescription(item.description, item.siteName) || null,
      }))
    );
    setAdjustmentLabel((bill as any).adjustmentLabel || "");
    setAdjustmentAmount((bill as any).adjustmentAmount || 0);
    setGstRateEquipment((bill as any).gstRateEquipment || 0);
    setGstRateMaterial((bill as any).gstRateMaterial || 0);
    setGstRateTransport((bill as any).gstRateTransport || 0);
    setTdsRate((bill as any).tdsRate || 0);
    setEditingBillId(bill.id);
    setView("form");
  };

  const handleAutoPopulate = async () => {
    if (autoItems && autoItems.length > 0) {
      const mapped: LineItem[] = autoItems.map((item: any) => ({
        date: item.date || "",
        category: item.category || "other",
        description: item.description || "",
        qty: item.qty || 0,
        unit: item.unit || "HRS",
        rate: item.rate || 0,
        amount: (item.qty || 0) * (item.rate || 0),
        source: "auto",
        equipmentId: item.equipmentId || null,
        leadDistance: item.leadDistance ?? null,
        siteName: item.siteName || null,
      }));

      try {
        const rcRes = await fetch(`/api/vendor-rate-cards?vendorName=${encodeURIComponent(vendorName)}`);
        if (rcRes.ok) {
          const rateCards: any[] = await rcRes.json();
          const cardByKey = new Map(rateCards.map((rc: any) => [`${rc.itemKey.toUpperCase()}_${rc.category}`, rc]));
          let appliedCount = 0;
          for (let i = 0; i < mapped.length; i++) {
            const item = mapped[i];
            if (item.rate === 0) {
              let card: any = null;
              if (item.category === "transport") {
                const canonical = canonicalTransportName(item.description);
                const unit = (item.unit || "TRIP").toUpperCase();
                const canonicalKey = `EQ_${canonical}_${unit}`;
                card = cardByKey.get(`${canonicalKey}_${item.category}`);
              } else if (item.category === "material") {
                const unit = (item.unit || "NOS").toUpperCase();
                const mn = canonicalMatName(item.description);
                const newKey = `MAT_${mn}_${unit}`;
                card = cardByKey.get(`${newKey}_${item.category}`);
                if (!card) {
                  const oldKey = `MAT_${stripSourceSuffix(item.description.trim().toUpperCase())}`;
                  card = cardByKey.get(`${oldKey}_${item.category}`);
                }
              } else if (item.equipmentId) {
                const mn = canonicalMachineName(item.description);
                const unit = (item.unit || "HRS").toUpperCase();
                const newKey = `EQ_${mn}_${unit}`;
                card = cardByKey.get(`${newKey}_${item.category}`);
                if (!card) {
                  const entryTypeMatch = item.description.match(/(?:- )?(HOURLY HIRE|DAILY HIRE|TRIP BASED|MONTHLY HIRE|TIME\/METER|MOBILIZATION)/);
                  const entryType = entryTypeMatch ? entryTypeMatch[1].replace(/\s+/g, "_").replace(/\//g, "_") : "OTHER";
                  const oldKey = `${item.equipmentId}_${entryType}`;
                  card = cardByKey.get(`${oldKey}_${item.category}`);
                }
              } else {
                const descKey = stripSourceSuffix(item.description.trim().toUpperCase());
                card = cardByKey.get(`${descKey}_${item.category}`);
              }
              if (card && Number(card.rate) > 0) {
                mapped[i] = { ...item, rate: Number(card.rate) };
                mapped[i].amount = calcAmount(mapped[i]);
                appliedCount++;
              }
            }
          }
          if (appliedCount > 0) {
            toast({ title: `Applied ${appliedCount} rates from rate card` });
          }
        }
      } catch (_e) {
      }

      try {
        const dupRes = await fetch("/api/vendor-bills/check-duplicates", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            vendorName,
            excludeBillId: editingBillId || undefined,
            items: mapped.map(m => ({ date: m.date, equipmentId: m.equipmentId, description: m.description })),
          }),
        });
        if (dupRes.ok) {
          const dups: { index: number; billNo: string; billStatus: string }[] = await dupRes.json();
          if (dups.length > 0) {
            for (const d of dups) {
              mapped[d.index] = { ...mapped[d.index], billedIn: { billNo: d.billNo, billStatus: d.billStatus } };
            }
            toast({ title: `⚠ ${dups.length} item(s) already billed in other bills`, variant: "destructive" });
          }
        }
      } catch (_e) {
      }

      const categoryOrder: Record<string, number> = { equipment: 0, material: 1, transport: 2, other: 3 };
      mapped.sort((a, b) => {
        const catA = categoryOrder[a.category] ?? 3;
        const catB = categoryOrder[b.category] ?? 3;
        if (catA !== catB) return catA - catB;
        return (a.date || "").localeCompare(b.date || "");
      });

      setLineItems(mapped);
      toast({ title: `${mapped.length} items auto-populated from records` });
    }
  };

  const getDefaultCategory = () => {
    if (billType === "transport" || billType === "equipment" || billType === "material") return billType;
    return "other";
  };

  const getDefaultUnit = () => {
    if (billType === "transport") return "TRIP";
    return "HRS";
  };

  const addLineItem = () => {
    setLineItems(prev => [
      ...prev,
      { date: "", category: getDefaultCategory(), description: "", qty: 0, unit: getDefaultUnit(), rate: 0, amount: 0, source: "manual", equipmentId: null, leadDistance: null },
    ]);
  };

  const removeLineItem = (index: number) => {
    setLineItems(prev => prev.filter((_, i) => i !== index));
  };

  const calcAmount = (item: LineItem) => {
    if (item.category === "transport" && item.leadDistance && item.leadDistance > 0) {
      return item.leadDistance * 2 * (item.rate || 0);
    }
    return (item.qty || 0) * (item.rate || 0);
  };

  const updateLineItem = (index: number, field: keyof LineItem, value: any) => {
    setLineItems(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      if (field === "category" && value !== "transport") {
        updated[index].leadDistance = null;
      }
      if (field === "qty" || field === "rate" || field === "leadDistance" || field === "category") {
        updated[index].amount = calcAmount(updated[index]);
      }
      return updated;
    });
  };

  const totalAmount = useMemo(() => lineItems.reduce((sum, item) => sum + (item.amount || 0), 0), [lineItems]);

  const categorySubtotals = useMemo(() => {
    const cats: Record<string, number> = {};
    lineItems.forEach(item => {
      const cat = item.category || "other";
      cats[cat] = (cats[cat] || 0) + (item.amount || 0);
    });
    return cats;
  }, [lineItems]);

  const gstAmountEquipment = useMemo(() => gstRateEquipment ? (categorySubtotals["equipment"] || 0) * gstRateEquipment / 100 : 0, [categorySubtotals, gstRateEquipment]);
  const gstAmountMaterial = useMemo(() => gstRateMaterial ? (categorySubtotals["material"] || 0) * gstRateMaterial / 100 : 0, [categorySubtotals, gstRateMaterial]);
  const gstAmountTransport = useMemo(() => gstRateTransport ? (categorySubtotals["transport"] || 0) * gstRateTransport / 100 : 0, [categorySubtotals, gstRateTransport]);
  const totalGstAmount = useMemo(() => gstAmountEquipment + gstAmountMaterial + gstAmountTransport, [gstAmountEquipment, gstAmountMaterial, gstAmountTransport]);
  const tdsAmount = useMemo(() => tdsRate ? totalAmount * tdsRate / 100 : 0, [totalAmount, tdsRate]);
  const netTotal = useMemo(() => totalAmount + totalGstAmount + (adjustmentAmount || 0) - tdsAmount, [totalAmount, totalGstAmount, adjustmentAmount, tdsAmount]);

  const computeCategorySubTotals = (items: { category?: string | null; amount?: number | null }[]) => {
    const cats: Record<string, number> = {};
    items.forEach(item => {
      const cat = item.category || "other";
      cats[cat] = (cats[cat] || 0) + (item.amount || 0);
    });
    return Object.entries(cats).filter(([, amt]) => amt !== 0).sort(([a], [b]) => a.localeCompare(b));
  };

  const applyRateToSimilar = (sourceIdx: number) => {
    const source = lineItems[sourceIdx];
    if (!source.rate || source.rate <= 0) return;
    const sourceEntryType = source.description.match(/(?:- )?(HOURLY HIRE|DAILY HIRE|TRIP BASED|MONTHLY HIRE|TIME\/METER|MOBILIZATION)/)?.[1] || "";
    let applied = 0;
    let skipped = 0;
    setLineItems(prev => {
      const updated = [...prev];
      for (let i = 0; i < updated.length; i++) {
        if (i === sourceIdx) continue;
        const itemEntryType = updated[i].description.match(/(?:- )?(HOURLY HIRE|DAILY HIRE|TRIP BASED|MONTHLY HIRE|TIME\/METER|MOBILIZATION)/)?.[1] || "";
        const sameEquipment = source.equipmentId && updated[i].equipmentId === source.equipmentId;
        const sameType = sourceEntryType && itemEntryType === sourceEntryType;
        if (sameEquipment && sameType) {
          if (!updated[i].rate || updated[i].rate === 0) {
            const newItem = { ...updated[i], rate: source.rate };
            newItem.amount = calcAmount(newItem);
            updated[i] = newItem;
            applied++;
          } else {
            skipped++;
          }
        }
      }
      return updated;
    });
    toast({
      title: applied > 0 ? `Rate applied to ${applied} row${applied > 1 ? "s" : ""}` : "No matching rows to apply",
      description: skipped > 0 ? `${skipped} row${skipped > 1 ? "s" : ""} skipped (already have rates)` : undefined,
    });
  };

  const uniqueRateGroups = useMemo(() => {
    const groups: Record<string, { equipmentId: number | null; groupName: string; entryType: string; category: string; unit: string; count: number }> = {};
    lineItems.forEach(item => {
      if (item.category === "transport") {
        const canonical = canonicalTransportName(item.description);
        const unit = (item.unit || "TRIP").toUpperCase();
        const key = `transport_${canonical}_${unit}`;
        if (!groups[key]) {
          groups[key] = { equipmentId: null, groupName: canonical.replace(/_/g, " "), entryType: unit, category: "transport", unit, count: 0 };
        }
        groups[key].count++;
      } else if (item.equipmentId) {
        const mn = canonicalMachineName(item.description);
        const entryTypeMatch = item.description.match(/(?:- )?(HOURLY HIRE|DAILY HIRE|TRIP BASED|MONTHLY HIRE|TIME\/METER|MOBILIZATION)/);
        const entryType = entryTypeMatch ? entryTypeMatch[1] : "OTHER";
        const unit = (item.unit || "HRS").toUpperCase();
        const key = `eq_${mn}_${unit}`;
        if (!groups[key]) {
          groups[key] = { equipmentId: item.equipmentId, groupName: mn.replace(/_/g, " "), entryType, category: item.category, unit, count: 0 };
        }
        groups[key].count++;
      } else if (item.description.trim()) {
        const cleanDesc = stripSourceSuffix(item.description.trim().toUpperCase());
        const unit = (item.unit || "NOS").toUpperCase();
        const key = `desc_${item.category}_${cleanDesc.replace(/\s+/g, "_")}_${unit}`;
        if (!groups[key]) {
          groups[key] = { equipmentId: null, groupName: cleanDesc, entryType: item.unit || "", category: item.category, unit, count: 0 };
        }
        groups[key].count++;
      }
    });
    return Object.entries(groups).map(([key, val]) => ({ key, ...val }));
  }, [lineItems]);

  const openSetRatesDialog = async () => {
    const initialRates: Record<string, { rate: number; leadDistance: number }> = {};

    let rateCards: any[] = [];
    if (vendorName) {
      try {
        const res = await fetch(`/api/vendor-rate-cards?vendorName=${encodeURIComponent(vendorName)}`);
        if (res.ok) rateCards = await res.json();
      } catch (_e) {}
    }

    const cardByKey = new Map(rateCards.map((rc: any) => [`${rc.itemKey.toUpperCase()}_${rc.category}`, rc]));

    uniqueRateGroups.forEach(group => {
      let existing: LineItem | undefined;
      if (group.equipmentId) {
        existing = lineItems.find(item => {
          if (!item.equipmentId) return false;
          const mn = canonicalMachineName(item.description);
          return mn === group.groupName.replace(/\s+/g, "_") && item.description.includes(group.entryType) && item.rate > 0;
        });
      } else {
        existing = lineItems.find(item => !item.equipmentId && item.category === group.category && stripSourceSuffix(item.description.trim().toUpperCase()) === group.groupName.toUpperCase() && (item.unit || "NOS").toUpperCase() === group.unit && item.rate > 0);
      }

      let cardRate = 0;
      if (!existing?.rate && rateCards.length > 0) {
        let card: any = null;
        if (group.equipmentId) {
          const newKey = `EQ_${group.groupName.replace(/\s+/g, "_")}_${group.unit}`;
          card = cardByKey.get(`${newKey}_${group.category}`);
          if (!card) {
            const entryType = (group.entryType || "OTHER").replace(/\s+/g, "_").replace(/\//g, "_");
            const oldKey = `${group.equipmentId}_${entryType}`;
            card = cardByKey.get(`${oldKey}_${group.category}`);
          }
        } else {
          if (group.category === "material") {
            const newKey = `MAT_${group.groupName.trim().toUpperCase().replace(/\s+/g, "_")}_${group.unit}`;
            card = cardByKey.get(`${newKey}_${group.category}`);
            if (!card) {
              const oldKey = `MAT_${group.groupName.trim().toUpperCase()}`;
              card = cardByKey.get(`${oldKey}_${group.category}`);
            }
          } else if (group.category === "transport") {
            const canonicalKey = `EQ_${group.groupName.trim().toUpperCase().replace(/\s+/g, "_")}_${group.unit}`;
            card = cardByKey.get(`${canonicalKey}_${group.category}`);
          } else {
            card = cardByKey.get(`${group.groupName.trim().toUpperCase()}_${group.category}`);
          }
        }
        if (card) cardRate = Number(card.rate) || 0;
      }

      initialRates[group.key] = {
        rate: existing?.rate || cardRate || 0,
        leadDistance: existing?.leadDistance || 0,
      };
    });
    setBulkRates(initialRates);
    setShowSetRatesDialog(true);
  };

  const applyBulkRates = () => {
    let applied = 0;
    setLineItems(prev => {
      const updated = [...prev];
      for (let i = 0; i < updated.length; i++) {
        const item = updated[i];
        let key: string;
        if (item.category === "transport") {
          const canonical = canonicalTransportName(item.description);
          const unit = (item.unit || "TRIP").toUpperCase();
          key = `transport_${canonical}_${unit}`;
        } else if (item.equipmentId) {
          const mn = canonicalMachineName(item.description);
          const unit = (item.unit || "HRS").toUpperCase();
          key = `eq_${mn}_${unit}`;
        } else {
          const cleanDesc = stripSourceSuffix(item.description.trim().toUpperCase());
          const unit = (item.unit || "NOS").toUpperCase();
          key = `desc_${item.category}_${cleanDesc.replace(/\s+/g, "_")}_${unit}`;
        }
        const rateData = bulkRates[key];
        if (rateData && rateData.rate > 0) {
          const newItem = { ...item, rate: rateData.rate };
          if (item.category === "transport" && rateData.leadDistance > 0) {
            newItem.leadDistance = rateData.leadDistance;
          }
          newItem.amount = calcAmount(newItem);
          updated[i] = newItem;
          applied++;
        }
      }
      return updated;
    });
    setShowSetRatesDialog(false);
    toast({ title: `Rates applied to ${applied} item${applied !== 1 ? "s" : ""}` });

    if (vendorName) {
      const rateCardItems: any[] = [];
      uniqueRateGroups.forEach(group => {
        const rd = bulkRates[group.key];
        if (rd && rd.rate > 0) {
          let itemKey = "";
          if (group.equipmentId) {
            itemKey = `EQ_${group.groupName.replace(/\s+/g, "_")}_${group.unit}`;
          } else if (group.category === "material") {
            itemKey = `MAT_${group.groupName.trim().toUpperCase().replace(/\s+/g, "_")}_${group.unit}`;
          } else if (group.category === "transport") {
            itemKey = `EQ_${group.groupName.trim().toUpperCase().replace(/\s+/g, "_")}_${group.unit}`;
          } else {
            itemKey = group.groupName.trim().toUpperCase();
          }
          rateCardItems.push({
            vendorName: vendorName.toUpperCase(),
            category: group.category,
            itemKey: itemKey.toUpperCase(),
            itemLabel: group.groupName.toUpperCase(),
            unit: group.unit || "HRS",
            rate: rd.rate,
            notes: null,
          });
        }
      });
      if (rateCardItems.length > 0) {
        fetch("/api/vendor-rate-cards/bulk-upsert", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items: rateCardItems }),
        }).then(() => {
          queryClient.invalidateQueries({ queryKey: ["/api/vendor-rate-cards"] });
        }).catch(() => {});
      }
    }
  };

  const handleSubmit = () => {
    if (!vendorName || !billDate) {
      toast({ title: "Please fill vendor name and bill date", variant: "destructive" });
      return;
    }
    if (lineItems.length === 0 || lineItems.every(i => !i.description)) {
      toast({ title: "Please add at least one line item", variant: "destructive" });
      return;
    }

    const data = {
      billDate,
      billNo: billNo || `AUTO-${Date.now()}`,
      billType,
      vendorName: vendorName.toUpperCase(),
      periodFrom: periodFrom || null,
      periodTo: periodTo || null,
      status: "draft",
      notes: notes ? notes.toUpperCase() : null,
      totalAmount,
      adjustmentLabel: adjustmentLabel || null,
      adjustmentAmount: adjustmentAmount || 0,
      gstRateEquipment: gstRateEquipment || null,
      gstRateMaterial: gstRateMaterial || null,
      gstRateTransport: gstRateTransport || null,
      tdsRate: tdsRate || null,
      items: lineItems.filter(i => i.description).map(item => ({
        date: item.date || null,
        category: item.category || null,
        description: item.description.toUpperCase(),
        qty: item.qty,
        unit: item.unit,
        rate: item.rate,
        amount: item.amount,
        source: item.source,
        equipmentId: item.equipmentId,
        leadDistance: item.leadDistance,
        siteName: item.siteName || null,
      })),
    };

    const rateCardItems: any[] = [];
    lineItems.filter(i => i.description && i.rate > 0).forEach(item => {
      let itemKey = "";
      if (item.category === "transport") {
        const canonical = canonicalTransportName(item.description);
        const unit = (item.unit || "TRIP").toUpperCase();
        itemKey = `EQ_${canonical}_${unit}`;
      } else if (item.category === "material") {
        const mn = canonicalMatName(item.description);
        const unit = (item.unit || "NOS").toUpperCase();
        itemKey = `MAT_${mn}_${unit}`;
      } else if (item.equipmentId) {
        const mn = canonicalMachineName(item.description);
        const unit = (item.unit || "HRS").toUpperCase();
        itemKey = `EQ_${mn}_${unit}`;
      } else {
        itemKey = stripSourceSuffix(item.description.trim().toUpperCase());
      }
      if (itemKey && !rateCardItems.some(rc => rc.itemKey === itemKey.toUpperCase() && rc.category === item.category)) {
        rateCardItems.push({
          vendorName: vendorName.toUpperCase(),
          category: item.category,
          itemKey: itemKey.toUpperCase(),
          itemLabel: item.description.split(" - ")[0]?.trim().toUpperCase() || item.description.toUpperCase(),
          unit: item.unit,
          rate: item.rate,
          notes: null,
        });
      }
    });
    if (rateCardItems.length > 0) {
      fetch("/api/vendor-rate-cards/bulk-upsert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: rateCardItems }),
      }).then(() => {
        queryClient.invalidateQueries({ queryKey: ["/api/vendor-rate-cards"] });
      }).catch(() => {});
    }

    if (editingBillId) {
      updateMutation.mutate({ id: editingBillId, data, pin: adminPinForUpdate });
    } else {
      createMutation.mutate(data);
    }
  };

  const openBillDetail = (bill: VendorBillWithItems) => {
    setSelectedBillId(bill.id);
    setView("detail");
  };

  const handleStatusChange = (billId: number, newStatus: string) => {
    if (newStatus === "verified" || newStatus === "approved") {
      setPendingStatusAction({ billId, status: newStatus });
      setShowPinAuth(true);
    } else {
      statusMutation.mutate({ id: billId, status: newStatus, actor: "SYSTEM" });
    }
  };

  const handlePinSuccess = (_role: "manager" | "admin", _pin: string) => {
    setShowPinAuth(false);
    if (pendingStatusAction) {
      statusMutation.mutate({
        id: pendingStatusAction.billId,
        status: pendingStatusAction.status,
        actor: _role.toUpperCase(),
        pin: _pin,
      });
      setPendingStatusAction(null);
    }
  };

  const handleEditPinSuccess = (_role: "manager" | "admin", _pin: string) => {
    setShowEditPinAuth(false);
    if (pendingEditAction) {
      setAdminPinForUpdate(_pin);
      loadBillForEdit(pendingEditAction.bill);
      setPendingEditAction(null);
    }
  };

  const handleDeletePinSuccess = (_role: "manager" | "admin", _pin: string) => {
    setShowDeletePinAuth(false);
    if (pendingDeleteAction) {
      deleteMutation.mutate({ id: pendingDeleteAction.billId, pin: _pin });
      setPendingDeleteAction(null);
    }
  };

  const handleEditBill = (bill: VendorBillWithItems) => {
    if (bill.status === "verified" || bill.status === "approved" || bill.status === "paid") {
      setPendingEditAction({ bill });
      setShowEditPinAuth(true);
    } else {
      loadBillForEdit(bill);
    }
  };

  const handleDeleteBill = (bill: VendorBillWithItems) => {
    setPendingDeleteAction({ billId: bill.id, billNo: bill.billNo, status: bill.status });
    setShowDeleteConfirm(true);
  };

  const filteredBills = useMemo(() => {
    if (!bills) return [];
    return bills.filter(bill => {
      if (filterDateFrom && bill.billDate < filterDateFrom) return false;
      if (filterDateTo && bill.billDate > filterDateTo) return false;
      if (filterVendor !== "all" && bill.vendorName.toUpperCase() !== filterVendor) return false;
      if (filterStatus !== "all" && bill.status !== filterStatus) return false;
      return true;
    });
  }, [bills, filterDateFrom, filterDateTo, filterVendor, filterStatus]);

  const escHtml = (str: string) => {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  };

  const handlePrint = (bill: VendorBillWithItems) => {
    const hasLeadDistance = bill.items.some((it: any) => it.leadDistance && it.leadDistance > 0);
    const catSubs = computeCategorySubTotals(bill.items);
    const shouldGroup = catSubs.length > 1;
    const printCategories = ["equipment", "material", "transport", "other"];
    const printCatLabels: Record<string, string> = { equipment: "EQUIPMENT", material: "MATERIAL", transport: "TRANSPORT", other: "OTHER" };
    const colCount = hasLeadDistance ? 9 : 8;
    const labelColCount = hasLeadDistance ? 8 : 7;

    const renderPrintRow = (item: any, i: number) => {
      const badge = parseSiteBadge(item);
      const siteHtml = badge ? `<div style="font-size:10px;color:#555;font-style:italic;margin-top:2px;">${escHtml(badge.label)}</div>` : "";
      return `
      <tr class="${i % 2 === 0 ? "even" : "odd"}">
        <td style="text-align:center">${i + 1}</td>
        <td>${escHtml(formatDate(item.date))}</td>
        <td style="text-align:center">${item.category ? escHtml(getCategoryLabel(item.category).toUpperCase()) : "-"}</td>
        <td>${escHtml(item.description)}${siteHtml}</td>
        <td style="text-align:center">${formatQty(item.qty)}</td>
        <td style="text-align:center">${item.unit || ""}</td>
        ${hasLeadDistance ? `<td style="text-align:center">${item.leadDistance ? `${formatQty(item.leadDistance)} (RT: ${formatQty(item.leadDistance * 2)})` : "-"}</td>` : ""}
        <td style="text-align:right">${formatCurrency(item.rate)}</td>
        <td style="text-align:right">${formatCurrency(item.amount)}</td>
      </tr>
    `;
    };

    let rows = "";
    if (shouldGroup) {
      for (const cat of printCategories) {
        const catItems = bill.items.filter((it: any) => it.category === cat).map((item: any, origIdx: number) => ({
          item, origIdx: bill.items.indexOf(item)
        }));
        if (catItems.length === 0) continue;
        const catTotal = catItems.reduce((sum: number, { item }: any) => sum + (item.amount || 0), 0);
        const catGstRate = cat === "equipment" ? (bill as any).gstRateEquipment : cat === "material" ? (bill as any).gstRateMaterial : cat === "transport" ? (bill as any).gstRateTransport : 0;
        const catGstAmt = catGstRate ? catTotal * catGstRate / 100 : 0;
        rows += `<tr class="cat-header"><td colspan="${colCount}" style="background:#f0f0f0;font-weight:bold;font-size:12px;text-transform:uppercase;letter-spacing:1px;padding:8px;">${printCatLabels[cat]} (${catItems.length} items)</td></tr>`;
        rows += catItems.map(({ item, origIdx }: any) => renderPrintRow(item, origIdx)).join("");
        rows += `<tr class="summary-row"><td colspan="${labelColCount}" style="text-align:right">${printCatLabels[cat]} Sub-total</td><td style="text-align:right">Rs. ${formatCurrency(catTotal)}</td></tr>`;
        if (catGstRate > 0) {
          rows += `<tr class="summary-row"><td colspan="${labelColCount}" style="text-align:right;color:#15803d;">GST ON ${printCatLabels[cat]} @ ${catGstRate}%</td><td style="text-align:right;color:#15803d;">+ Rs. ${formatCurrency(catGstAmt)}</td></tr>`;
        }
      }
    } else {
      rows = bill.items.map((item: any, i: number) => renderPrintRow(item, i)).join("");
    }

    const totalQty = bill.items.reduce((s: number, it: any) => s + (it.qty || 0), 0);
    const totalItems = bill.items.length;

    const printContent = `
      <!DOCTYPE html><html><head><title>Vendor Bill - ${bill.billNo}</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: Arial, sans-serif; padding: 24px; color: #000; }
        .header { text-align: center; margin-bottom: 16px; border-bottom: 3px solid #d97706; padding-bottom: 12px; }
        .header img { height: 50px; margin-bottom: 5px; }
        .header h1 { font-size: 22px; letter-spacing: 2px; margin-bottom: 4px; color: #000; }
        .header .subtitle { font-size: 14px; color: #333; text-transform: uppercase; letter-spacing: 1px; }
        .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 16px; }
        .meta-grid .item { padding: 4px 0; }
        .meta-grid .label { color: #333; text-transform: uppercase; font-size: 10px; letter-spacing: 0.5px; font-weight: bold; }
        .meta-grid .value { font-weight: bold; font-size: 13px; color: #000; }
        .status-badge { display: inline-block; padding: 2px 10px; border-radius: 4px; font-size: 11px; font-weight: bold; text-transform: uppercase; background: #d97706; color: white; }
        table { width: 100%; border-collapse: collapse; margin-top: 12px; }
        th, td { border: 1px solid #999; padding: 6px 8px; text-align: left; font-size: 12px; color: #000; }
        th { background: #d97706; color: white; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; }
        tr.odd { background: #f9f9f9; }
        .cat-header td { border-left: 4px solid #d97706; }
        .summary-row td { font-weight: bold; font-size: 12px; background: #f5f5f5; color: #000; border-color: #999; }
        .total-row { background: #d97706 !important; }
        .total-row td { color: white; font-weight: bold; font-size: 13px; border-color: #b45309; }
        .notes { margin-top: 16px; padding: 10px 14px; background: #fffbeb; border-left: 3px solid #d97706; font-size: 12px; color: #000; }
        .notes strong { font-size: 11px; text-transform: uppercase; color: #92400e; }
        .signatures { margin-top: 60px; display: flex; justify-content: space-between; align-items: flex-start; page-break-inside: avoid; }
        .sig-block { width: 220px; text-align: center; }
        .sig-block.vendor { margin-top: 30px; }
        .sig-line { border-top: 1px solid #000; margin-top: 50px; padding-top: 6px; font-size: 11px; color: #000; }
        .sig-label { font-size: 11px; font-weight: bold; color: #000; }
        .footer { margin-top: 30px; font-size: 10px; color: #555; text-align: center; border-top: 1px solid #ccc; padding-top: 8px; }
        @media print { body { padding: 12px; } .signatures { page-break-inside: avoid; } }
      </style></head><body>
      <div class="header">
        <img src="${window.location.origin}/hlc-logo.jpg" style="height: 50px; margin-bottom: 6px;" onerror="this.style.display='none'" />
        <h1>HIGH LANE CONSTRUCTIONS</h1>
        <div class="subtitle">Vendor Bill</div>
      </div>
      <div class="meta-grid">
        <div class="item"><div class="label">Bill Number</div><div class="value">${escHtml(bill.billNo)}</div></div>
        <div class="item"><div class="label">Bill Date</div><div class="value">${escHtml(formatDate(bill.billDate))}</div></div>
        <div class="item"><div class="label">Vendor</div><div class="value">${escHtml(bill.vendorName)}</div></div>
        <div class="item"><div class="label">Bill Type</div><div class="value">${escHtml(getBillTypeLabel(bill.billType))}</div></div>
        ${bill.periodFrom && bill.periodTo ? `<div class="item"><div class="label">Period</div><div class="value">${escHtml(formatDate(bill.periodFrom))} to ${escHtml(formatDate(bill.periodTo))}</div></div>` : ""}
        <div class="item"><div class="label">Status</div><div class="value"><span class="status-badge">${escHtml(bill.status.toUpperCase())}</span></div></div>
      </div>
      <table><thead><tr><th>#</th><th>Date</th><th>Type</th><th>Description</th><th>Qty</th><th>Unit</th>${hasLeadDistance ? "<th>Lead (KM)</th>" : ""}<th style="text-align:right">Rate (₹)</th><th style="text-align:right">Amount (₹)</th></tr></thead>
      <tbody>${rows}</tbody>
      <tfoot>
        <tr class="summary-row"><td colspan="${hasLeadDistance ? 5 : 4}" style="text-align:right">TOTAL ITEMS: ${totalItems}</td><td style="text-align:center">${formatQty(totalQty)}</td><td colspan="${hasLeadDistance ? 4 : 3}"></td></tr>
        <tr class="total-row"><td colspan="${labelColCount}" style="text-align:right">TOTAL AMOUNT</td><td style="text-align:right">Rs. ${formatCurrency(bill.totalAmount)}</td></tr>
        ${(() => {
          const pb = bill as any;
          const pCatSubs: Record<string, number> = {};
          bill.items.forEach((it: any) => { const c = it.category || "other"; pCatSubs[c] = (pCatSubs[c] || 0) + (it.amount || 0); });
          const pGstEq = pb.gstRateEquipment ? (pCatSubs["equipment"] || 0) * pb.gstRateEquipment / 100 : 0;
          const pGstMat = pb.gstRateMaterial ? (pCatSubs["material"] || 0) * pb.gstRateMaterial / 100 : 0;
          const pGstTr = pb.gstRateTransport ? (pCatSubs["transport"] || 0) * pb.gstRateTransport / 100 : 0;
          const pIsAllType = bill.billType?.toLowerCase() === "all";
          const pUsePerGroupGst = pIsAllType || shouldGroup;
          const pSingleGstRate = !pUsePerGroupGst
            ? (bill.billType?.toLowerCase() === "equipment" ? pb.gstRateEquipment
              : bill.billType?.toLowerCase() === "material" ? pb.gstRateMaterial
              : bill.billType?.toLowerCase() === "transport" ? pb.gstRateTransport : 0) || 0
            : 0;
          const pSingleGstAmt = pSingleGstRate ? (bill.totalAmount || 0) * pSingleGstRate / 100 : 0;
          const pTotalGst = pUsePerGroupGst ? pGstEq + pGstMat + pGstTr : pSingleGstAmt;
          const pAdvAmt = pb.adjustmentAmount || 0;
          const pAdvLabel = pb.adjustmentLabel || "ADVANCE DEDUCTION";
          const pTdsR = pb.tdsRate || 0;
          const pTdsAmt = pTdsR ? (bill.totalAmount || 0) * pTdsR / 100 : 0;
          const pHasAny = pTotalGst !== 0 || pAdvAmt !== 0 || pTdsAmt !== 0;
          if (!pHasAny) return "";
          const pNetTotal = (bill.totalAmount || 0) + pTotalGst + pAdvAmt - pTdsAmt;
          let adjRows = "";
          if (!pUsePerGroupGst && pSingleGstRate > 0) {
            adjRows += `<tr class="summary-row"><td colspan="${labelColCount}" style="text-align:right;color:#15803d;">GST @ ${pSingleGstRate}%</td><td style="text-align:right;color:#15803d;">+ Rs. ${formatCurrency(pSingleGstAmt)}</td></tr>`;
          }
          if (pUsePerGroupGst && pTotalGst > 0) {
            adjRows += `<tr class="summary-row"><td colspan="${labelColCount}" style="text-align:right;color:#15803d;">TOTAL GST</td><td style="text-align:right;color:#15803d;">+ Rs. ${formatCurrency(pTotalGst)}</td></tr>`;
          }
          if (pAdvAmt !== 0) {
            adjRows += `<tr class="summary-row"><td colspan="${labelColCount}" style="text-align:right">${escHtml(pAdvLabel)}</td><td style="text-align:right">Rs. ${formatCurrency(pAdvAmt)}</td></tr>`;
          }
          if (pTdsAmt > 0) {
            adjRows += `<tr class="summary-row"><td colspan="${labelColCount}" style="text-align:right;color:#dc2626;">IT TDS @ ${pTdsR}%</td><td style="text-align:right;color:#dc2626;">- Rs. ${formatCurrency(pTdsAmt)}</td></tr>`;
          }
          adjRows += `<tr class="total-row"><td colspan="${labelColCount}" style="text-align:right">NET TOTAL</td><td style="text-align:right">Rs. ${formatCurrency(pNetTotal)}</td></tr>`;
          return adjRows;
        })()}
      </tfoot>
      </table>
      ${bill.notes ? `<div class="notes"><strong>Notes / Remarks:</strong><br/>${escHtml(bill.notes)}</div>` : ""}
      <div class="signatures">
        <div class="sig-block vendor">
          <div class="sig-label">Vendor Acknowledgement</div>
          <div class="sig-line">${escHtml(bill.vendorName)}</div>
        </div>
        <div class="sig-block">
          <div class="sig-label">For HIGH LANE CONSTRUCTIONS</div>
          <div class="sig-line">Authorized Signatory</div>
        </div>
      </div>
      <div class="footer">Generated on ${new Date().toLocaleString("en-IN")} | HIGH LANE CONSTRUCTIONS</div>
      </body></html>
    `;

    const iframe = document.createElement('iframe');
    iframe.style.position = 'absolute';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = 'none';
    iframe.style.left = '-9999px';

    let printed = false;
    const doPrint = () => {
      if (printed) return;
      printed = true;
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } catch (e) {
        window.print();
      }
      setTimeout(() => {
        if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
      }, 1000);
    };

    iframe.onload = () => setTimeout(doPrint, 100);
    document.body.appendChild(iframe);
    iframe.srcdoc = printContent;

    setTimeout(() => {
      if (!printed) doPrint();
    }, 2000);
  };

  const renderStatusSteps = (currentStatus: string) => {
    const currentIdx = STATUS_ORDER.indexOf(currentStatus as any);
    return (
      <div className="flex items-center gap-1 flex-wrap" data-testid="status-steps">
        {STATUS_ORDER.map((step, idx) => {
          const isDone = idx < currentIdx;
          const isActive = idx === currentIdx;
          return (
            <div key={step} className="flex items-center gap-1">
              {idx > 0 && <ArrowRight className="w-3 h-3 text-muted-foreground" />}
              <Badge
                variant={isDone ? "default" : isActive ? "secondary" : "outline"}
                className={`text-xs uppercase ${isDone ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 no-default-hover-elevate no-default-active-elevate" : ""}`}
                data-testid={`status-step-${step}`}
              >
                {isDone && <Check className="w-3 h-3 mr-1" />}
                {isActive && <Circle className="w-2 h-2 mr-1 fill-current" />}
                {step}
              </Badge>
            </div>
          );
        })}
      </div>
    );
  };

  if (view === "form") {
    return (
      <div className="max-w-5xl mx-auto space-y-4 p-4">
        <div className="flex items-center gap-4 flex-wrap">
          <Button variant="ghost" size="icon" onClick={() => { resetForm(); setView("list"); }} data-testid="button-back-form">
            <ChevronLeft className="w-5 h-5" />
          </Button>
          <h1 className="text-xl font-bold" data-testid="text-form-title">
            {editingBillId ? "EDIT VENDOR BILL" : "NEW VENDOR BILL"}
          </h1>
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <CardTitle className="text-base">BILL DETAILS</CardTitle>
            <Badge variant="secondary" className="uppercase" data-testid="badge-status-draft">DRAFT</Badge>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label className="text-xs uppercase">Bill Date</Label>
                <Input type="date" value={billDate} onChange={e => setBillDate(e.target.value)} data-testid="input-bill-date" />
              </div>
              <div>
                <Label className="text-xs uppercase">Bill Number</Label>
                <Input value={billNo} onChange={e => setBillNo(e.target.value.toUpperCase())} placeholder="AUTO-GENERATED" data-testid="input-bill-no" />
              </div>
              <div>
                <Label className="text-xs uppercase">Bill Type</Label>
                <Select value={billType} onValueChange={(val) => {
                  setBillType(val);
                  const newCat = (val === "transport" || val === "equipment" || val === "material") ? val : "other";
                  const newUnit = val === "transport" ? "TRIP" : undefined;
                  setLineItems(prev => prev.map(item => {
                    if (item.source === "manual") {
                      const updated = { ...item, category: newCat };
                      if (newUnit) updated.unit = newUnit;
                      if (newCat !== "transport") updated.leadDistance = null;
                      updated.amount = calcAmount(updated);
                      return updated;
                    }
                    return item;
                  }));
                }}>
                  <SelectTrigger data-testid="select-bill-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {BILL_TYPES.map(t => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="relative">
                <Label className="text-xs uppercase">Vendor / Supplier Name</Label>
                <Input
                  value={vendorName || vendorSearch}
                  onChange={e => {
                    const v = e.target.value.toUpperCase();
                    setVendorSearch(v);
                    setVendorName("");
                    setShowVendorDropdown(true);
                  }}
                  onFocus={() => setShowVendorDropdown(true)}
                  onBlur={() => {
                    setTimeout(() => setShowVendorDropdown(false), 200);
                    if (!vendorName && vendorSearch.trim()) {
                      setVendorName(vendorSearch.trim().toUpperCase());
                    }
                  }}
                  onKeyDown={e => {
                    if (e.key === "Enter" && !vendorName && vendorSearch.trim()) {
                      setVendorName(vendorSearch.trim().toUpperCase());
                      setShowVendorDropdown(false);
                    }
                  }}
                  placeholder="SEARCH VENDOR..."
                  className="uppercase"
                  data-testid="input-vendor-name"
                />
                {showVendorDropdown && filteredVendorNames.length > 0 && !vendorName && (
                  <div className="absolute z-50 top-full left-0 right-0 mt-1 max-h-48 overflow-y-auto bg-white dark:bg-zinc-900 border rounded-md shadow-lg" data-testid="vendor-dropdown">
                    {filteredVendorNames.map(name => (
                      <button
                        key={name}
                        type="button"
                        className="w-full text-left px-3 py-2 text-sm hover:bg-amber-50 dark:hover:bg-amber-900/20 truncate"
                        onMouseDown={() => {
                          setVendorName(name);
                          setVendorSearch(name);
                          setShowVendorDropdown(false);
                        }}
                        data-testid={`vendor-option-${name}`}
                      >
                        {name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <Label className="text-xs uppercase">Period From</Label>
                <Input type="date" value={periodFrom} onChange={e => setPeriodFrom(e.target.value)} data-testid="input-period-from" />
              </div>
              <div>
                <Label className="text-xs uppercase">Period To</Label>
                <Input type="date" value={periodTo} onChange={e => setPeriodTo(e.target.value)} data-testid="input-period-to" />
              </div>
            </div>
            {periodFrom && periodTo && billType !== "other" && !vendorName && (
              <div className="border-t pt-4">
                <Button
                  variant="default"
                  className="w-full bg-amber-600 hover:bg-amber-700 text-white"
                  onClick={() => setShowVendorDiscovery(true)}
                  disabled={discoveryLoading}
                  data-testid="button-show-vendors"
                >
                  {discoveryLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Search className="w-4 h-4 mr-2" />}
                  SHOW AVAILABLE VENDORS
                </Button>
              </div>
            )}

            <div className="border-t pt-4">
              <p className="text-xs font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wider mb-2">Bill Status</p>
              {renderStatusSteps("draft")}
            </div>
          </CardContent>
        </Card>

        {showVendorDiscovery && periodFrom && periodTo && billType !== "other" && (
          <Card data-testid="card-vendor-discovery">
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <CardTitle className="text-base">AVAILABLE VENDORS</CardTitle>
              <Button variant="ghost" size="icon" onClick={() => setShowVendorDiscovery(false)} data-testid="button-close-discovery">
                <X className="w-4 h-4" />
              </Button>
            </CardHeader>
            <CardContent>
              {discoveryLoading ? (
                <div className="flex items-center justify-center py-8 gap-2">
                  <Loader2 className="w-5 h-5 animate-spin text-amber-600" />
                  <span className="text-sm text-muted-foreground">Scanning records...</span>
                </div>
              ) : !discoveredVendors || discoveredVendors.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm" data-testid="text-no-vendors">
                  No records found for this type and period
                </div>
              ) : (
                <div className="space-y-2">
                  {discoveredVendors.map((vendor) => (
                    <div
                      key={vendor.vendorName}
                      className="flex items-center justify-between gap-3 p-3 border rounded-md flex-wrap"
                      data-testid={`row-vendor-${vendor.vendorName}`}
                    >
                      <div className="flex flex-col gap-1 min-w-0 flex-1">
                        <span className="font-semibold text-sm truncate" data-testid={`text-vendor-name-${vendor.vendorName}`}>
                          {vendor.vendorName}
                        </span>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs text-muted-foreground" data-testid={`text-record-count-${vendor.vendorName}`}>
                            {vendor.recordCount} record{vendor.recordCount !== 1 ? "s" : ""}
                          </span>
                          {vendor.categories.map(cat => (
                            <Badge
                              key={cat}
                              variant="outline"
                              className={`text-[10px] ${getCategoryBadgeClass(cat)} no-default-hover-elevate no-default-active-elevate`}
                              data-testid={`badge-cat-${vendor.vendorName}-${cat}`}
                            >
                              {getCategoryLabel(cat)}
                            </Badge>
                          ))}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        {vendor.existingBill ? (
                          <>
                            <Badge
                              variant="outline"
                              className={`text-xs uppercase ${getStatusBadgeClass(vendor.existingBill.status)} no-default-hover-elevate no-default-active-elevate`}
                              data-testid={`badge-bill-status-${vendor.vendorName}`}
                            >
                              {vendor.existingBill.status} - {vendor.existingBill.billNo}
                            </Badge>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleEditExistingBill(vendor.existingBill!.id)}
                              data-testid={`button-edit-bill-${vendor.vendorName}`}
                            >
                              <Edit className="w-3 h-3 mr-1" />
                              EDIT
                            </Button>
                          </>
                        ) : (
                          <>
                            <span className="text-xs text-muted-foreground">NO BILL</span>
                            <Button
                              variant="default"
                              size="sm"
                              onClick={() => handleSelectDiscoveredVendor(vendor)}
                              data-testid={`button-select-vendor-${vendor.vendorName}`}
                            >
                              <PlusCircle className="w-3 h-3 mr-1" />
                              SELECT &amp; CREATE
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {vendorName && periodFrom && periodTo && billType !== "other" && (
          <Card className="border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20">
            <CardContent className="py-3 flex items-start gap-3">
              <Info className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-blue-800 dark:text-blue-200 flex flex-wrap items-center gap-2">
                <span>
                  {billType === "all"
                    ? `All billable records for ${vendorName} (${formatDate(periodFrom)} to ${formatDate(periodTo)}) — equipment, materials & transport.`
                    : billType === "equipment"
                    ? `Equipment usage for ${vendorName} (${formatDate(periodFrom)} to ${formatDate(periodTo)}) from DPR & Plant records.`
                    : billType === "material"
                    ? `Material receipts for ${vendorName} (${formatDate(periodFrom)} to ${formatDate(periodTo)}) from DPR & Plant records.`
                    : `Transport dispatches for ${vendorName} (${formatDate(periodFrom)} to ${formatDate(periodTo)}) from truck dispatch records.`}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleAutoPopulate}
                  disabled={autoItemsLoading || !autoItems?.length}
                  data-testid="button-auto-populate"
                >
                  {autoItemsLoading ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
                  {autoItems?.length ? `PULL ${autoItems.length} ITEMS` : "NO ITEMS FOUND"}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <div className="flex gap-2 flex-wrap">
              <Link href={`/plant/rate-cards?vendorName=${encodeURIComponent(vendorName)}`}>
                <Button variant="outline" size="sm" data-testid="button-manage-rate-cards">
                  <Settings className="w-4 h-4 mr-1" /> RATE CARDS
                </Button>
              </Link>
              {uniqueRateGroups.length > 0 && (
                <Button variant="outline" size="sm" onClick={openSetRatesDialog} data-testid="button-set-rates">
                  <span className="font-bold mr-1">₹</span> SET RATES
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={addLineItem} data-testid="button-add-item">
                <Plus className="w-4 h-4 mr-1" /> ADD ITEM
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            {(() => {
              const hasLead = billType === "transport" || lineItems.some(i => i.leadDistance !== null);
              const totalColSpan = hasLead ? 10 : 9;
              const labelColSpan = hasLead ? 8 : 7;
              const categories = ["equipment", "material", "transport", "other"] as const;
              const catLabels: Record<string, string> = { equipment: "EQUIPMENT", material: "MATERIAL", transport: "TRANSPORT", other: "OTHER" };
              const shouldGroup = computeCategorySubTotals(lineItems).length > 1;

              const renderItemRow = (item: LineItem, idx: number) => (
                <tr key={idx} className="border-b">
                  <td className="px-2 py-1.5 text-muted-foreground text-xs">{idx + 1}</td>
                  <td className="px-2 py-1.5">
                    {item.source === "auto" ? (
                      <span className="text-xs font-mono" data-testid={`text-item-date-${idx}`}>{formatDate(item.date)}</span>
                    ) : (
                      <Input
                        type="date"
                        value={item.date}
                        onChange={e => updateLineItem(idx, "date", e.target.value)}
                        className="text-xs h-8"
                        data-testid={`input-item-date-${idx}`}
                      />
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-center">
                    {item.source === "auto" ? (
                      <Badge
                        variant="outline"
                        className={`text-[10px] ${getCategoryBadgeClass(item.category)} no-default-hover-elevate no-default-active-elevate`}
                        data-testid={`badge-category-${idx}`}
                      >
                        {getCategoryLabel(item.category)}
                      </Badge>
                    ) : (
                      <Select value={item.category} onValueChange={v => updateLineItem(idx, "category", v)}>
                        <SelectTrigger className="h-8 text-xs" data-testid={`select-item-category-${idx}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="equipment">EQUIP</SelectItem>
                          <SelectItem value="material">MATL</SelectItem>
                          <SelectItem value="transport">TRNS</SelectItem>
                          <SelectItem value="other">OTHER</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  </td>
                  <td className="px-2 py-1.5">
                    {item.source === "auto" ? (
                      <div className="space-y-1">
                        <span className="text-xs" data-testid={`text-item-desc-${idx}`}>{item.description}</span>
                        <div className="flex items-center gap-1 flex-wrap">
                          {(() => {
                            const badge = parseSiteBadge(item);
                            return badge ? (
                              <Badge variant="outline" className={`text-[10px] ${getSiteBadgeClass(badge.type)} no-default-hover-elevate no-default-active-elevate`} data-testid={`badge-form-site-${idx}`}>
                                {badge.label}
                              </Badge>
                            ) : null;
                          })()}
                          {extractDiesel(item.description) > 0 && (
                            <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-700 no-default-hover-elevate no-default-active-elevate" data-testid={`badge-diesel-${idx}`}>
                              <Fuel className="w-3 h-3 mr-1" />
                              {extractDiesel(item.description)}L DIESEL
                            </Badge>
                          )}
                          {item.billedIn && (
                            <Badge variant="outline" className="text-[10px] bg-red-600 text-white border-red-700 dark:bg-red-700 dark:text-white dark:border-red-800 no-default-hover-elevate no-default-active-elevate" data-testid={`badge-billed-${idx}`}>
                              BILLED ({item.billedIn.billNo} - {item.billedIn.billStatus.toUpperCase()})
                            </Badge>
                          )}
                        </div>
                      </div>
                    ) : (
                      <Input
                        value={item.description}
                        onChange={e => updateLineItem(idx, "description", e.target.value.toUpperCase())}
                        placeholder="ENTER DESCRIPTION"
                        className="uppercase text-xs h-8"
                        data-testid={`input-item-desc-${idx}`}
                      />
                    )}
                  </td>
                  <td className="px-2 py-1.5">
                    {item.category === "transport" ? (
                      <div className="space-y-0.5">
                        <Input
                          type="number"
                          step="0.01"
                          value={item.qty || ""}
                          onChange={e => updateLineItem(idx, "qty", parseFloat(e.target.value) || 0)}
                          className="text-xs h-8 bg-muted/50 text-muted-foreground"
                          onWheel={e => (e.target as HTMLInputElement).blur()}
                          data-testid={`input-item-qty-${idx}`}
                        />
                        <span className="text-[9px] text-muted-foreground italic">info only</span>
                      </div>
                    ) : (
                      <Input
                        type="number"
                        step="0.01"
                        value={item.qty || ""}
                        onChange={e => updateLineItem(idx, "qty", parseFloat(e.target.value) || 0)}
                        className="text-xs h-8"
                        onWheel={e => (e.target as HTMLInputElement).blur()}
                        data-testid={`input-item-qty-${idx}`}
                      />
                    )}
                  </td>
                  <td className="px-2 py-1.5">
                    <Select value={item.unit} onValueChange={v => updateLineItem(idx, "unit", v)}>
                      <SelectTrigger className="h-8 text-xs" data-testid={`select-item-unit-${idx}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {LINE_ITEM_UNITS.map(u => (
                          <SelectItem key={u} value={u}>{u}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </td>
                  {hasLead && (
                    <td className="px-2 py-1.5">
                      {item.category === "transport" ? (
                        <div className="space-y-0.5">
                          <Input
                            type="number"
                            step="0.01"
                            value={item.leadDistance || ""}
                            onChange={e => updateLineItem(idx, "leadDistance", parseFloat(e.target.value) || 0)}
                            placeholder="ONE-WAY KM"
                            className="text-xs h-8"
                            onWheel={e => (e.target as HTMLInputElement).blur()}
                            data-testid={`input-item-lead-${idx}`}
                          />
                          {item.leadDistance && item.leadDistance > 0 && (
                            <span className="text-[10px] text-muted-foreground">RT: {(item.leadDistance * 2).toFixed(2)} KM</span>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">-</span>
                      )}
                    </td>
                  )}
                  <td className="px-2 py-1.5">
                    <div className="flex items-center gap-1">
                      <Input
                        type="number"
                        step="0.01"
                        value={item.rate || ""}
                        onChange={e => updateLineItem(idx, "rate", parseFloat(e.target.value) || 0)}
                        className="text-xs h-8"
                        onWheel={e => (e.target as HTMLInputElement).blur()}
                        data-testid={`input-item-rate-${idx}`}
                      />
                      {item.rate > 0 && item.equipmentId && item.source === "auto" && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 flex-shrink-0"
                          title="Apply rate to similar equipment rows"
                          onClick={() => applyRateToSimilar(idx)}
                          data-testid={`button-apply-rate-${idx}`}
                        >
                          <Copy className="w-3.5 h-3.5 text-blue-600" />
                        </Button>
                      )}
                    </div>
                  </td>
                  <td className="px-2 py-1.5 text-right font-semibold bg-amber-50 dark:bg-amber-900/20">
                    <span className="text-xs" data-testid={`text-item-amount-${idx}`}>{formatCurrency(item.amount)}</span>
                  </td>
                  <td className="px-2 py-1.5">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeLineItem(idx)} data-testid={`button-remove-item-${idx}`}>
                      <Trash2 className="w-3.5 h-3.5 text-destructive" />
                    </Button>
                  </td>
                </tr>
              );

              return (
                <table className="w-full text-sm" style={{ minWidth: 900 }}>
                  <thead>
                    <tr className="border-b text-xs text-muted-foreground uppercase">
                      <th className="px-2 py-2 text-left w-8">#</th>
                      <th className="px-2 py-2 text-left w-28">Date</th>
                      <th className="px-2 py-2 text-center w-16">Type</th>
                      <th className="px-2 py-2 text-left">Description</th>
                      <th className="px-2 py-2 text-left w-24">Qty</th>
                      <th className="px-2 py-2 text-left w-20">Unit</th>
                      {hasLead && <th className="px-2 py-2 text-left w-28">Lead (KM)</th>}
                      <th className="px-2 py-2 text-left w-32">Rate (₹)</th>
                      <th className="px-2 py-2 text-right w-36">Amount (₹)</th>
                      <th className="px-2 py-2 w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {shouldGroup ? (
                      <>
                        {categories.map(cat => {
                          const catItems = lineItems.map((item, idx) => ({ item, idx })).filter(({ item }) => item.category === cat);
                          if (catItems.length === 0) return null;
                          const catTotal = catItems.reduce((sum, { item }) => sum + (item.amount || 0), 0);
                          return (
                            <Fragment key={cat}>
                              <tr className={`${getCategoryBadgeClass(cat)} border-b`}>
                                <td colSpan={totalColSpan} className="px-3 py-2 font-semibold text-xs uppercase tracking-wider">
                                  <Badge variant="outline" className={`${getCategoryBadgeClass(cat)} mr-2 no-default-hover-elevate no-default-active-elevate`}>
                                    {catLabels[cat]}
                                  </Badge>
                                  {catItems.length} item{catItems.length !== 1 ? "s" : ""}
                                </td>
                              </tr>
                              {catItems.map(({ item, idx }) => renderItemRow(item, idx))}
                              <tr className="border-b bg-muted/40">
                                <td colSpan={labelColSpan} className="px-2 py-2 text-right text-xs font-semibold uppercase" data-testid={`text-subtotal-label-${cat}`}>
                                  {catLabels[cat]} Sub-total
                                </td>
                                <td className="px-2 py-2 text-right text-xs font-semibold" data-testid={`text-subtotal-amount-${cat}`}>Rs. {formatCurrency(catTotal)}</td>
                                <td></td>
                              </tr>
                            </Fragment>
                          );
                        })}
                      </>
                    ) : (
                      lineItems.map((item, idx) => renderItemRow(item, idx))
                    )}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-amber-500 bg-amber-50 dark:bg-amber-900/20">
                      <td colSpan={labelColSpan} className="px-2 py-3 text-right font-bold text-base">TOTAL</td>
                      <td className="px-2 py-3 text-right font-bold text-base" data-testid="text-total-amount">Rs. {formatCurrency(totalAmount)}</td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              );
            })()}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="py-4 space-y-4">
            <div className="space-y-3">
              <p className="text-xs font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wider">Adjustments</p>

              {(() => {
                const isGrouped = billType === "all";
                const hasEquipmentItems = (categorySubtotals["equipment"] || 0) !== 0;
                const hasMaterialItems = (categorySubtotals["material"] || 0) !== 0;
                const hasTransportItems = (categorySubtotals["transport"] || 0) !== 0;
                const gstRows = isGrouped
                  ? [
                      ...(hasEquipmentItems ? [{ label: "GST ON EQUIPMENT", rate: gstRateEquipment, setRate: setGstRateEquipment, subtotal: categorySubtotals["equipment"] || 0, amount: gstAmountEquipment, testId: "gst-equipment" }] : []),
                      ...(hasMaterialItems ? [{ label: "GST ON MATERIAL", rate: gstRateMaterial, setRate: setGstRateMaterial, subtotal: categorySubtotals["material"] || 0, amount: gstAmountMaterial, testId: "gst-material" }] : []),
                      ...(hasTransportItems ? [{ label: "GST ON TRANSPORT", rate: gstRateTransport, setRate: setGstRateTransport, subtotal: categorySubtotals["transport"] || 0, amount: gstAmountTransport, testId: "gst-transport" }] : []),
                    ]
                  : (() => {
                      const singleType = billType === "equipment" ? { label: "GST", rate: gstRateEquipment, setRate: setGstRateEquipment, subtotal: totalAmount, amount: gstAmountEquipment, testId: "gst-equipment" }
                        : billType === "material" ? { label: "GST", rate: gstRateMaterial, setRate: setGstRateMaterial, subtotal: totalAmount, amount: gstAmountMaterial, testId: "gst-material" }
                        : billType === "transport" ? { label: "GST", rate: gstRateTransport, setRate: setGstRateTransport, subtotal: totalAmount, amount: gstAmountTransport, testId: "gst-transport" }
                        : null;
                      return singleType ? [singleType] : [];
                    })();
                return (
                  <>
                    {gstRows.map(row => (
                      <div key={row.testId} className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
                        <div className="md:col-span-2">
                          <Label className="text-xs uppercase">{row.label}</Label>
                          <p className="text-xs text-muted-foreground">On Rs. {formatCurrency(row.subtotal)}</p>
                        </div>
                        <div>
                          <Label className="text-xs uppercase">Rate %</Label>
                          <Input
                            type="number"
                            step="0.01"
                            value={row.rate || ""}
                            onChange={e => row.setRate(parseFloat(e.target.value) || 0)}
                            placeholder="e.g. 18"
                            onWheel={e => (e.target as HTMLInputElement).blur()}
                            data-testid={`input-${row.testId}-rate`}
                          />
                        </div>
                        <div>
                          <Label className="text-xs uppercase">GST Amount</Label>
                          <p className="text-sm font-semibold text-green-700 dark:text-green-400 pt-2" data-testid={`text-${row.testId}-amount`}>
                            {row.rate ? `+ Rs. ${formatCurrency(row.amount)}` : "—"}
                          </p>
                        </div>
                      </div>
                    ))}

                    <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end border-t pt-3">
                      <div className="md:col-span-2">
                        <Label className="text-xs uppercase">Advance Deduction</Label>
                      </div>
                      <div className="md:col-span-2">
                        <Label className="text-xs uppercase">Amount (negative to deduct)</Label>
                        <Input
                          type="number"
                          step="0.01"
                          value={adjustmentAmount || ""}
                          onChange={e => setAdjustmentAmount(parseFloat(e.target.value) || 0)}
                          placeholder="e.g. -50000"
                          onWheel={e => (e.target as HTMLInputElement).blur()}
                          data-testid="input-adjustment-amount"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
                      <div className="md:col-span-2">
                        <Label className="text-xs uppercase">IT TDS</Label>
                        <p className="text-xs text-muted-foreground">On Rs. {formatCurrency(totalAmount)}</p>
                      </div>
                      <div>
                        <Label className="text-xs uppercase">Rate %</Label>
                        <Input
                          type="number"
                          step="0.01"
                          value={tdsRate || ""}
                          onChange={e => setTdsRate(parseFloat(e.target.value) || 0)}
                          placeholder="e.g. 2"
                          onWheel={e => (e.target as HTMLInputElement).blur()}
                          data-testid="input-tds-rate"
                        />
                      </div>
                      <div>
                        <Label className="text-xs uppercase">TDS Amount</Label>
                        <p className="text-sm font-semibold text-red-600 dark:text-red-400 pt-2" data-testid="text-tds-amount">
                          {tdsRate ? `- Rs. ${formatCurrency(tdsAmount)}` : "—"}
                        </p>
                      </div>
                    </div>
                  </>
                );
              })()}

              {(totalGstAmount !== 0 || adjustmentAmount !== 0 || tdsAmount !== 0) && (
                <div className="space-y-1 p-3 rounded-md bg-amber-100 dark:bg-amber-900/30 border border-amber-300 dark:border-amber-700">
                  {totalGstAmount !== 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="font-semibold uppercase">TOTAL GST</span>
                      <span className="font-semibold text-green-700 dark:text-green-400">+ Rs. {formatCurrency(totalGstAmount)}</span>
                    </div>
                  )}
                  {adjustmentAmount !== 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="font-semibold uppercase">{adjustmentLabel || "ADVANCE DEDUCTION"}</span>
                      <span className="font-semibold">{adjustmentAmount >= 0 ? "+" : ""} Rs. {formatCurrency(adjustmentAmount)}</span>
                    </div>
                  )}
                  {tdsAmount !== 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="font-semibold uppercase">IT TDS @ {tdsRate}%</span>
                      <span className="font-semibold text-red-600 dark:text-red-400">- Rs. {formatCurrency(tdsAmount)}</span>
                    </div>
                  )}
                  <div className="flex justify-end pt-1 border-t border-amber-400 dark:border-amber-600">
                    <span className="text-base font-bold" data-testid="text-net-total">NET TOTAL: Rs. {formatCurrency(netTotal)}</span>
                  </div>
                </div>
              )}
            </div>
            <div>
              <Label className="text-xs uppercase">Notes / Remarks</Label>
              <Textarea
                value={notes}
                onChange={e => setNotes(e.target.value.toUpperCase())}
                placeholder="ENTER NOTES OR REMARKS"
                className="uppercase"
                data-testid="input-notes"
              />
            </div>
            <div className="flex justify-end gap-2 flex-wrap">
              <Button variant="outline" onClick={() => { resetForm(); setView("list"); }} data-testid="button-cancel">
                CANCEL
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={createMutation.isPending || updateMutation.isPending}
                data-testid="button-save-bill"
              >
                {(createMutation.isPending || updateMutation.isPending) && <Loader2 className="w-4 h-4 animate-spin mr-1" />}
                {editingBillId ? "UPDATE BILL" : "SAVE BILL"}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Dialog open={showSetRatesDialog} onOpenChange={setShowSetRatesDialog}>
          <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>SET RATES</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              {(["equipment", "material", "transport", "other"] as const).map(cat => {
                const catGroups = uniqueRateGroups.filter(g => g.category === cat);
                if (catGroups.length === 0) return null;
                const catLabel = cat === "equipment" ? "EQUIPMENT" : cat === "material" ? "MATERIAL" : cat === "transport" ? "TRANSPORT" : "OTHER";
                return (
                  <div key={cat} className="space-y-3">
                    <div className="flex items-center gap-2 border-b pb-1">
                      <Badge variant="outline" className={`text-[10px] ${getCategoryBadgeClass(cat)} no-default-hover-elevate no-default-active-elevate`}>
                        {catLabel}
                      </Badge>
                      <span className="text-xs text-muted-foreground">{catGroups.length} group{catGroups.length !== 1 ? "s" : ""}</span>
                    </div>
                    {catGroups.map(group => (
                      <div key={group.key} className="border rounded-md p-3 space-y-2">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <div>
                            <p className="text-sm font-semibold" data-testid={`text-rate-group-${group.key}`}>{group.groupName}</p>
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-muted-foreground">{group.entryType}</span>
                              <Badge variant="outline" className="text-[9px] px-1 py-0">{group.unit}</Badge>
                              <span className="text-xs text-muted-foreground">({group.count} row{group.count !== 1 ? "s" : ""})</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 flex-wrap">
                          <div className="flex-1 min-w-[120px]">
                            <Label className="text-xs uppercase">Rate (₹)</Label>
                            <Input
                              type="number"
                              step="0.01"
                              value={bulkRates[group.key]?.rate || ""}
                              onChange={e => setBulkRates(prev => ({ ...prev, [group.key]: { ...prev[group.key], rate: parseFloat(e.target.value) || 0 } }))}
                              placeholder="0"
                              data-testid={`input-bulk-rate-${group.key}`}
                            />
                          </div>
                          {group.category === "transport" && (
                            <div className="flex-1 min-w-[120px]">
                              <Label className="text-xs uppercase">Lead Distance (KM)</Label>
                              <Input
                                type="number"
                                step="0.01"
                                value={bulkRates[group.key]?.leadDistance || ""}
                                onChange={e => setBulkRates(prev => ({ ...prev, [group.key]: { ...prev[group.key], leadDistance: parseFloat(e.target.value) || 0 } }))}
                                placeholder="0"
                                data-testid={`input-bulk-lead-${group.key}`}
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })}
              <div className="flex justify-end gap-2 pt-2 flex-wrap">
                <Button variant="outline" onClick={() => setShowSetRatesDialog(false)} data-testid="button-cancel-rates">
                  CANCEL
                </Button>
                <Button onClick={applyBulkRates} data-testid="button-apply-rates">
                  <Check className="w-4 h-4 mr-1" /> APPLY RATES
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {showPinAuth && (
          <PinAuth
            targetRole="any"
            onSuccess={handlePinSuccess}
            onClose={() => { setShowPinAuth(false); setPendingStatusAction(null); }}
          />
        )}
      </div>
    );
  }

  if (view === "detail" && (billDetail || selectedBillId)) {
    const bill = billDetail;
    if (!bill) {
      return (
        <div className="max-w-5xl mx-auto p-4 flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      );
    }

    const currentStatusIdx = STATUS_ORDER.indexOf(bill.status as any);
    const nextStatus = currentStatusIdx < STATUS_ORDER.length - 1 ? STATUS_ORDER[currentStatusIdx + 1] : null;

    return (
      <div className="max-w-5xl mx-auto space-y-4 p-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => { setSelectedBillId(null); setView("list"); }} data-testid="button-back-detail">
              <ChevronLeft className="w-5 h-5" />
            </Button>
            <h1 className="text-xl font-bold" data-testid="text-detail-title">BILL DETAIL</h1>
          </div>
          <div className="flex gap-2 flex-wrap">
            {["verified", "approved", "paid"].includes(bill.status) && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const link = document.createElement("a");
                  link.href = `/api/vendor-bills/${bill.id}/pdf`;
                  link.download = `VendorBill-${bill.billNo}.pdf`;
                  link.click();
                }}
                data-testid="button-export-pdf"
              >
                <Download className="w-4 h-4 mr-1" /> EXPORT PDF
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => handlePrint(bill)} data-testid="button-print">
              <Printer className="w-4 h-4 mr-1" /> PRINT
            </Button>
            <Button size="sm" onClick={() => handleEditBill(bill)} data-testid="button-edit-bill">
              <Edit className="w-4 h-4 mr-1" /> EDIT
            </Button>
          </div>
        </div>

        <Card>
          <CardContent className="py-4 space-y-4">
            <div className="flex justify-between items-start flex-wrap gap-3">
              <div>
                <p className="text-xs text-muted-foreground uppercase">Vendor</p>
                <p className="text-xl font-bold" data-testid="text-vendor-name">{bill.vendorName}</p>
              </div>
              <Badge variant="outline" className={`uppercase text-sm ${getStatusBadgeClass(bill.status)} no-default-hover-elevate no-default-active-elevate`} data-testid="badge-bill-status">
                {bill.status}
              </Badge>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-xs text-muted-foreground uppercase">Bill Number</p>
                <p className="text-sm font-semibold" data-testid="text-bill-no">{bill.billNo}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase">Bill Date</p>
                <p className="text-sm font-semibold" data-testid="text-bill-date">{formatDate(bill.billDate)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase">Bill Type</p>
                <p className="text-sm font-semibold" data-testid="text-bill-type">{getBillTypeLabel(bill.billType)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase">Period</p>
                <p className="text-sm font-semibold" data-testid="text-period">
                  {bill.periodFrom && bill.periodTo ? `${formatDate(bill.periodFrom)} to ${formatDate(bill.periodTo)}` : "-"}
                </p>
              </div>
            </div>

            <div className="border-t pt-4">
              <p className="text-xs font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wider mb-2">Status Progress</p>
              {renderStatusSteps(bill.status)}
            </div>

            <div className="flex gap-2 pt-2 flex-wrap">
              {nextStatus && (
                <Button
                  size="sm"
                  onClick={() => handleStatusChange(bill.id, nextStatus)}
                  disabled={statusMutation.isPending}
                  data-testid="button-advance-status"
                >
                  {statusMutation.isPending && <Loader2 className="w-3 h-3 animate-spin mr-1" />}
                  MARK AS {nextStatus.toUpperCase()}
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                className="text-destructive"
                onClick={() => handleDeleteBill(bill)}
                disabled={deleteMutation.isPending}
                data-testid="button-delete-bill"
              >
                {deleteMutation.isPending && <Loader2 className="w-3 h-3 animate-spin mr-1" />}
                <Trash2 className="w-3 h-3 mr-1" /> DELETE BILL
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <span className="font-bold text-amber-600 dark:text-amber-400" data-testid="text-detail-total">
              TOTAL: {formatCurrency(bill.totalAmount)}
            </span>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            {(() => {
              const hasLead = bill.items.some((it: any) => it.leadDistance && it.leadDistance > 0);
              const totalCols = hasLead ? 9 : 8;
              const labelCols = hasLead ? 7 : 6;
              const catSubs = computeCategorySubTotals(bill.items);
              const shouldGroup = catSubs.length > 1;
              const categories = ["equipment", "material", "transport", "other"] as const;
              const catLabels: Record<string, string> = { equipment: "EQUIPMENT", material: "MATERIAL", transport: "TRANSPORT", other: "OTHER" };

              const renderDetailRow = (item: any, idx: number) => (
                <tr key={item.id || idx} className="border-b">
                  <td className="px-2 py-2 text-muted-foreground text-xs">{idx + 1}</td>
                  <td className="px-2 py-2 text-xs font-mono" data-testid={`text-detail-item-date-${idx}`}>{formatDate(item.date)}</td>
                  <td className="px-2 py-2 text-center">
                    {item.category ? (
                      <Badge
                        variant="outline"
                        className={`text-[10px] ${getCategoryBadgeClass(item.category)} no-default-hover-elevate no-default-active-elevate`}
                      >
                        {getCategoryLabel(item.category)}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px] text-muted-foreground">
                        {item.source === "auto" ? "AUTO" : "-"}
                      </Badge>
                    )}
                  </td>
                  <td className="px-2 py-2 font-medium text-xs" data-testid={`text-detail-item-desc-${idx}`}>
                    <div className="space-y-1">
                      <span>{item.description}</span>
                      <div className="flex items-center gap-1 flex-wrap">
                        {(() => {
                          const badge = parseSiteBadge(item);
                          return badge ? (
                            <Badge variant="outline" className={`text-[10px] ${getSiteBadgeClass(badge.type)} no-default-hover-elevate no-default-active-elevate`} data-testid={`badge-site-${idx}`}>
                              {badge.label}
                            </Badge>
                          ) : null;
                        })()}
                        {extractDiesel(item.description) > 0 && (
                          <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-700 no-default-hover-elevate no-default-active-elevate">
                            <Fuel className="w-3 h-3 mr-1" />
                            {extractDiesel(item.description)}L DIESEL
                          </Badge>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-2 py-2 text-xs">{formatQty(item.qty)}</td>
                  <td className="px-2 py-2 text-xs">{item.unit}</td>
                  {hasLead && (
                    <td className="px-2 py-2 text-xs">
                      {item.leadDistance && item.leadDistance > 0 ? (
                        <span>{formatQty(item.leadDistance)} <span className="text-muted-foreground">(RT: {formatQty(item.leadDistance * 2)})</span></span>
                      ) : "-"}
                    </td>
                  )}
                  <td className="px-2 py-2 text-right text-xs">{formatCurrency(item.rate)}</td>
                  <td className="px-2 py-2 text-right font-semibold bg-amber-50 dark:bg-amber-900/20 text-xs" data-testid={`text-detail-item-amount-${idx}`}>
                    {formatCurrency(item.amount)}
                  </td>
                </tr>
              );

              return (
                <table className="w-full text-sm" style={{ minWidth: 800 }}>
                  <thead>
                    <tr className="border-b text-xs text-muted-foreground uppercase">
                      <th className="px-2 py-2 text-left w-8">#</th>
                      <th className="px-2 py-2 text-left w-24">Date</th>
                      <th className="px-2 py-2 text-center w-16">Type</th>
                      <th className="px-2 py-2 text-left">Description</th>
                      <th className="px-2 py-2 text-left w-24">Qty</th>
                      <th className="px-2 py-2 text-left w-16">Unit</th>
                      {hasLead && <th className="px-2 py-2 text-left w-28">Lead (KM)</th>}
                      <th className="px-2 py-2 text-right w-32">Rate (₹)</th>
                      <th className="px-2 py-2 text-right w-36">Amount (₹)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shouldGroup ? (
                      <>
                        {categories.map(cat => {
                          const catItems = bill.items.map((item: any, idx: number) => ({ item, idx })).filter(({ item }: any) => item.category === cat);
                          if (catItems.length === 0) return null;
                          const catTotal = catItems.reduce((sum: number, { item }: any) => sum + (item.amount || 0), 0);
                          const catGstRate = cat === "equipment" ? (bill as any).gstRateEquipment : cat === "material" ? (bill as any).gstRateMaterial : cat === "transport" ? (bill as any).gstRateTransport : 0;
                          const catGstAmount = catGstRate ? catTotal * catGstRate / 100 : 0;
                          return (
                            <Fragment key={cat}>
                              <tr className={`${getCategoryBadgeClass(cat)} border-b`}>
                                <td colSpan={totalCols} className="px-3 py-2 font-semibold text-xs uppercase tracking-wider">
                                  <Badge variant="outline" className={`${getCategoryBadgeClass(cat)} mr-2 no-default-hover-elevate no-default-active-elevate`}>
                                    {catLabels[cat]}
                                  </Badge>
                                  {catItems.length} item{catItems.length !== 1 ? "s" : ""}
                                </td>
                              </tr>
                              {catItems.map(({ item, idx }: any) => renderDetailRow(item, idx))}
                              <tr className="border-b bg-muted/40">
                                <td colSpan={labelCols} className="px-2 py-2 text-right text-xs font-semibold uppercase">
                                  {catLabels[cat]} Sub-total
                                </td>
                                <td className="px-2 py-2 text-right text-xs font-semibold" colSpan={2}>Rs. {formatCurrency(catTotal)}</td>
                              </tr>
                              {catGstRate > 0 && (
                                <tr className="border-b bg-green-50 dark:bg-green-900/10">
                                  <td colSpan={labelCols} className="px-2 py-1 text-right text-xs font-semibold text-green-700 dark:text-green-400 uppercase">
                                    GST ON {catLabels[cat]} @ {catGstRate}%
                                  </td>
                                  <td className="px-2 py-1 text-right text-xs font-semibold text-green-700 dark:text-green-400" colSpan={2}>+ Rs. {formatCurrency(catGstAmount)}</td>
                                </tr>
                              )}
                            </Fragment>
                          );
                        })}
                      </>
                    ) : (
                      bill.items.map((item: any, idx: number) => renderDetailRow(item, idx))
                    )}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-amber-500 bg-amber-50 dark:bg-amber-900/20">
                      <td colSpan={labelCols} className="px-2 py-3 text-right font-bold">TOTAL</td>
                      <td className="px-2 py-3 text-right font-bold text-base" colSpan={2}>Rs. {formatCurrency(bill.totalAmount)}</td>
                    </tr>
                    {(() => {
                      const b = bill as any;
                      const isAllType = bill.billType?.toLowerCase() === "all";
                      const detailCatSubs: Record<string, number> = {};
                      bill.items.forEach((it: any) => { const c = it.category || "other"; detailCatSubs[c] = (detailCatSubs[c] || 0) + (it.amount || 0); });
                      const gstEq = b.gstRateEquipment ? (detailCatSubs["equipment"] || 0) * b.gstRateEquipment / 100 : 0;
                      const gstMat = b.gstRateMaterial ? (detailCatSubs["material"] || 0) * b.gstRateMaterial / 100 : 0;
                      const gstTr = b.gstRateTransport ? (detailCatSubs["transport"] || 0) * b.gstRateTransport / 100 : 0;
                      const usePerGroupGst = isAllType || shouldGroup;
                      const singleGstRate = !usePerGroupGst
                        ? (bill.billType?.toLowerCase() === "equipment" ? b.gstRateEquipment
                          : bill.billType?.toLowerCase() === "material" ? b.gstRateMaterial
                          : bill.billType?.toLowerCase() === "transport" ? b.gstRateTransport : 0) || 0
                        : 0;
                      const singleGstAmt = singleGstRate ? (bill.totalAmount || 0) * singleGstRate / 100 : 0;
                      const totalGst = usePerGroupGst ? gstEq + gstMat + gstTr : singleGstAmt;
                      const advAmt = b.adjustmentAmount || 0;
                      const advLabel = b.adjustmentLabel || "ADVANCE DEDUCTION";
                      const tdsR = b.tdsRate || 0;
                      const tdsAmt = tdsR ? (bill.totalAmount || 0) * tdsR / 100 : 0;
                      const hasAny = totalGst !== 0 || advAmt !== 0 || tdsAmt !== 0;
                      if (!hasAny) return null;
                      const billNetTotal = (bill.totalAmount || 0) + totalGst + advAmt - tdsAmt;
                      return (
                        <>
                          {!usePerGroupGst && singleGstRate > 0 && (
                            <tr className="bg-green-50 dark:bg-green-900/10">
                              <td colSpan={labelCols} className="px-2 py-2 text-right text-sm font-semibold text-green-700 dark:text-green-400 uppercase">GST @ {singleGstRate}%</td>
                              <td className="px-2 py-2 text-right text-sm font-semibold text-green-700 dark:text-green-400" colSpan={2}>+ Rs. {formatCurrency(singleGstAmt)}</td>
                            </tr>
                          )}
                          {usePerGroupGst && totalGst > 0 && (
                            <tr className="bg-green-50 dark:bg-green-900/10">
                              <td colSpan={labelCols} className="px-2 py-2 text-right text-sm font-semibold text-green-700 dark:text-green-400 uppercase">TOTAL GST</td>
                              <td className="px-2 py-2 text-right text-sm font-semibold text-green-700 dark:text-green-400" colSpan={2}>+ Rs. {formatCurrency(totalGst)}</td>
                            </tr>
                          )}
                          {advAmt !== 0 && (
                            <tr className="bg-muted/20">
                              <td colSpan={labelCols} className="px-2 py-2 text-right text-sm font-semibold uppercase">{advLabel}</td>
                              <td className="px-2 py-2 text-right text-sm font-semibold" colSpan={2}>Rs. {formatCurrency(advAmt)}</td>
                            </tr>
                          )}
                          {tdsAmt > 0 && (
                            <tr className="bg-red-50 dark:bg-red-900/10">
                              <td colSpan={labelCols} className="px-2 py-2 text-right text-sm font-semibold text-red-600 dark:text-red-400 uppercase">IT TDS @ {tdsR}%</td>
                              <td className="px-2 py-2 text-right text-sm font-semibold text-red-600 dark:text-red-400" colSpan={2}>- Rs. {formatCurrency(tdsAmt)}</td>
                            </tr>
                          )}
                          <tr className="border-t-2 border-amber-600 bg-amber-100 dark:bg-amber-900/30">
                            <td colSpan={labelCols} className="px-2 py-3 text-right font-bold text-base">NET TOTAL</td>
                            <td className="px-2 py-3 text-right font-bold text-base" colSpan={2}>Rs. {formatCurrency(billNetTotal)}</td>
                          </tr>
                        </>
                      );
                    })()}
                  </tfoot>
                </table>
              );
            })()}
          </CardContent>
        </Card>

        {bill.notes && (
          <Card>
            <CardContent className="py-4">
              <p className="text-xs font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wider mb-2">Notes</p>
              <p className="text-sm text-muted-foreground" data-testid="text-notes">{bill.notes}</p>
            </CardContent>
          </Card>
        )}

        {showPinAuth && (
          <PinAuth
            targetRole="any"
            onSuccess={handlePinSuccess}
            onClose={() => { setShowPinAuth(false); setPendingStatusAction(null); }}
          />
        )}

        {showEditPinAuth && (
          <PinAuth
            targetRole="admin"
            onSuccess={handleEditPinSuccess}
            onClose={() => { setShowEditPinAuth(false); setPendingEditAction(null); }}
          />
        )}

        {showDeleteConfirm && (
          <Dialog open={showDeleteConfirm} onOpenChange={(open) => { if (!open) { setShowDeleteConfirm(false); setPendingDeleteAction(null); } }}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle className="text-red-600">DELETE VENDOR BILL</DialogTitle>
              </DialogHeader>
              {pendingDeleteAction?.billNo && (
                <p className="text-sm font-semibold">Bill: {pendingDeleteAction.billNo} <span className="uppercase">({pendingDeleteAction.status || "draft"})</span></p>
              )}
              {pendingDeleteAction?.status && ["approved", "paid"].includes(pendingDeleteAction.status) && (
                <div className="bg-red-50 dark:bg-red-950 border border-red-300 dark:border-red-800 rounded p-3 text-sm text-red-700 dark:text-red-300">
                  <strong>WARNING:</strong> This bill is currently <span className="uppercase font-bold">{pendingDeleteAction.status}</span>. Deleting an {pendingDeleteAction.status} bill is a significant action and may affect financial records.
                </div>
              )}
              <p className="text-sm text-muted-foreground">THIS WILL PERMANENTLY DELETE THIS VENDOR BILL AND ALL ITS LINE ITEMS. THIS ACTION CANNOT BE UNDONE.</p>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => { setShowDeleteConfirm(false); setPendingDeleteAction(null); }} data-testid="button-delete-dismiss">
                  CANCEL
                </Button>
                <Button
                  variant="destructive"
                  disabled={deleteMutation.isPending}
                  onClick={() => { setShowDeleteConfirm(false); setShowDeletePinAuth(true); }}
                  data-testid="button-confirm-delete"
                >
                  {deleteMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Trash2 className="w-4 h-4 mr-1" />}
                  DELETE PERMANENTLY
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
        {showDeletePinAuth && (
          <PinAuth
            targetRole="admin"
            onSuccess={handleDeletePinSuccess}
            onClose={() => { setShowDeletePinAuth(false); setPendingDeleteAction(null); }}
          />
        )}
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-4 p-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-4">
          <Link href={backLink}>
            <Button variant="ghost" size="icon" data-testid="button-back">
              <ChevronLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2" data-testid="text-page-title">
              <FileText className="w-5 h-5 text-amber-500" />
              VENDOR BILLS
            </h1>
            <p className="text-xs text-muted-foreground">Manage vendor/supplier billing and payments</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="icon" onClick={() => setShowAliasPinAuth(true)} title="Vendor Aliases" data-testid="button-vendor-aliases">
            <Settings className="w-4 h-4" />
          </Button>
          <Button onClick={() => { resetForm(); setView("form"); }} data-testid="button-new-bill">
            <Plus className="w-4 h-4 mr-1" /> NEW BILL
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="py-3 text-center">
            <p className="text-xs text-muted-foreground uppercase" data-testid="label-total">Total Bills</p>
            <p className="text-xl font-bold" data-testid="text-summary-total">{billSummary?.total || 0}</p>
            <p className="text-xs text-muted-foreground">{formatCurrency(billSummary?.totalAmount)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 text-center">
            <p className="text-xs text-muted-foreground uppercase" data-testid="label-draft">Draft</p>
            <p className="text-xl font-bold text-amber-600 dark:text-amber-400" data-testid="text-summary-draft">{billSummary?.draft || 0}</p>
            <p className="text-xs text-muted-foreground">{formatCurrency(billSummary?.draftAmount)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 text-center">
            <p className="text-xs text-muted-foreground uppercase" data-testid="label-verified">Verified</p>
            <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400" data-testid="text-summary-verified">{billSummary?.verified || 0}</p>
            <p className="text-xs text-muted-foreground">{formatCurrency(billSummary?.verifiedAmount)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 text-center">
            <p className="text-xs text-muted-foreground uppercase" data-testid="label-paid">Paid</p>
            <p className="text-xl font-bold text-blue-600 dark:text-blue-400" data-testid="text-summary-paid">{billSummary?.paid || 0}</p>
            <p className="text-xs text-muted-foreground">{formatCurrency(billSummary?.paidAmount)}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="py-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <Label className="text-xs uppercase">Date From</Label>
              <div className="relative">
                <Input type="date" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)} data-testid="filter-date-from" />
                {filterDateFrom && (
                  <Button size="icon" variant="ghost" className="absolute right-0 top-0 h-full w-8" onClick={() => setFilterDateFrom("")} data-testid="button-clear-date-from">
                    <X className="w-3 h-3" />
                  </Button>
                )}
              </div>
            </div>
            <div>
              <Label className="text-xs uppercase">Date To</Label>
              <div className="relative">
                <Input type="date" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)} data-testid="filter-date-to" />
                {filterDateTo && (
                  <Button size="icon" variant="ghost" className="absolute right-0 top-0 h-full w-8" onClick={() => setFilterDateTo("")} data-testid="button-clear-date-to">
                    <X className="w-3 h-3" />
                  </Button>
                )}
              </div>
            </div>
            <div>
              <Label className="text-xs uppercase">Vendor</Label>
              <div className="flex items-center gap-1">
                <Select value={filterVendor} onValueChange={setFilterVendor}>
                  <SelectTrigger data-testid="filter-vendor" className="flex-1">
                    <SelectValue placeholder="ALL VENDORS" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">ALL VENDORS</SelectItem>
                    {vendorNames.map(name => (
                      <SelectItem key={name} value={name}>{name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {filterVendor !== "all" && (
                  <Button size="icon" variant="ghost" onClick={() => setFilterVendor("all")} data-testid="button-clear-vendor">
                    <X className="w-3 h-3" />
                  </Button>
                )}
              </div>
            </div>
            <div>
              <Label className="text-xs uppercase">Status</Label>
              <div className="flex items-center gap-1">
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger data-testid="filter-status" className="flex-1">
                    <SelectValue placeholder="ALL STATUS" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">ALL STATUS</SelectItem>
                    <SelectItem value="draft">DRAFT</SelectItem>
                    <SelectItem value="verified">VERIFIED</SelectItem>
                    <SelectItem value="approved">APPROVED</SelectItem>
                    <SelectItem value="paid">PAID</SelectItem>
                  </SelectContent>
                </Select>
                {filterStatus !== "all" && (
                  <Button size="icon" variant="ghost" onClick={() => setFilterStatus("all")} data-testid="button-clear-status">
                    <X className="w-3 h-3" />
                  </Button>
                )}
              </div>
            </div>
          </div>
          {(filterDateFrom || filterDateTo || filterVendor !== "all" || filterStatus !== "all") && (
            <div className="flex justify-end mt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => { setFilterDateFrom(""); setFilterDateTo(""); setFilterVendor("all"); setFilterStatus("all"); }}
                data-testid="button-clear-all-filters"
              >
                <X className="w-3 h-3 mr-1" />
                CLEAR FILTERS
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      ) : filteredBills.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <FileText className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground" data-testid="text-empty">No vendor bills found</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredBills.map(bill => (
            <Card
              key={bill.id}
              className="hover-elevate cursor-pointer"
              onClick={() => openBillDetail(bill)}
              data-testid={`card-bill-${bill.id}`}
            >
              <CardContent className="py-3">
                <div className="flex justify-between items-center flex-wrap gap-2">
                  <div className="min-w-0">
                    <p className="font-bold text-sm uppercase truncate" data-testid={`text-bill-vendor-${bill.id}`}>{bill.vendorName}</p>
                    <p className="text-xs text-muted-foreground" data-testid={`text-bill-meta-${bill.id}`}>
                      {bill.billNo} &bull; {getBillTypeLabel(bill.billType)}
                      {bill.periodFrom && bill.periodTo && ` \u2022 ${formatDate(bill.periodFrom)} to ${formatDate(bill.periodTo)}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className={`font-bold text-base ${getStatusColor(bill.status)}`} data-testid={`text-bill-amount-${bill.id}`}>
                        {formatCurrency(bill.totalAmount)}
                      </p>
                      <p className="text-xs text-muted-foreground">{bill.items?.length || 0} line items</p>
                    </div>
                    <Badge variant="outline" className={`uppercase ${getStatusBadgeClass(bill.status)} no-default-hover-elevate no-default-active-elevate`} data-testid={`badge-bill-status-${bill.id}`}>
                      {bill.status}
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {showPinAuth && (
        <PinAuth
          targetRole="admin"
          onSuccess={handlePinSuccess}
          onClose={() => { setShowPinAuth(false); setPendingStatusAction(null); }}
        />
      )}

      {showAliasPinAuth && (
        <PinAuth
          targetRole="admin"
          onSuccess={() => {
            setShowAliasPinAuth(false);
            setShowAliasDialog(true);
          }}
          onClose={() => setShowAliasPinAuth(false)}
        />
      )}

      <Dialog open={showAliasDialog} onOpenChange={setShowAliasDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>VENDOR ALIASES</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">
            Group vendor name spelling variations so billing pulls records from all variants.
          </p>
          <div className="space-y-3 mt-2">
            <div className="grid grid-cols-5 gap-2 items-end">
              <div className="col-span-2">
                <Label className="text-xs uppercase">Canonical Name</Label>
                <Select value={aliasCanonical} onValueChange={setAliasCanonical}>
                  <SelectTrigger className="h-8 text-xs" data-testid="select-alias-canonical">
                    <SelectValue placeholder="SELECT VENDOR..." />
                  </SelectTrigger>
                  <SelectContent>
                    {vendorNames.map(name => (
                      <SelectItem key={name} value={name}>{name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2">
                <Label className="text-xs uppercase">Alias (Alternate Spelling)</Label>
                <Input
                  value={aliasValue}
                  onChange={e => setAliasValue(e.target.value.toUpperCase())}
                  placeholder="ALTERNATE NAME"
                  className="text-xs h-8 uppercase"
                  data-testid="input-alias-value"
                />
              </div>
              <Button
                size="sm"
                className="h-8"
                disabled={!aliasCanonical || !aliasValue || addAliasMutation.isPending}
                onClick={() => addAliasMutation.mutate({ canonicalName: aliasCanonical, alias: aliasValue })}
                data-testid="button-add-alias"
              >
                {addAliasMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
              </Button>
            </div>

            <div className="border rounded-md max-h-60 overflow-y-auto">
              {(!vendorAliasesData || vendorAliasesData.length === 0) ? (
                <p className="text-xs text-muted-foreground text-center py-4">No aliases configured</p>
              ) : (
                <div className="divide-y">
                  {vendorAliasesData.map(a => (
                    <div key={a.id} className="flex items-center justify-between px-3 py-2 text-xs">
                      <div>
                        <span className="font-semibold">{a.canonicalName}</span>
                        <span className="text-muted-foreground mx-2">=</span>
                        <span className="text-amber-600 dark:text-amber-400">{a.alias}</span>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => deleteAliasMutation.mutate(a.id)}
                        data-testid={`button-delete-alias-${a.id}`}
                      >
                        <X className="w-3 h-3 text-destructive" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
