import { useState, useMemo } from "react";
import { usePersistedFilters } from "@/hooks/use-persisted-filters";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";
import { useOrigin } from "@/hooks/use-origin";
import { ChevronLeft, Layers, Package, Loader2, Search, Calendar, Download, Printer, RefreshCw, ArrowRightLeft, X } from "lucide-react";
import { format, subDays } from "date-fns";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
import { NegativeBalanceBannerMulti } from "@/components/NegativeBalanceBanner";
import type { Party, PlantMaterial, StockLedgerEntry } from "@shared/schema";

type StockBalanceAsOf = {
  materialId: number;
  partyId: number | null;
  uom: string;
  totalIn: number;
  totalOut: number;
};

export default function PlantStock() {
  const { toast } = useToast();
  const { sectionCan, isAdmin } = useAuth();
  const canExport = sectionCan("plant_stock", "view_reports");
  const canReconcile = isAdmin;
  const { getPlantBackLink, appendPlantContext } = useOrigin();
  const queryClient = useQueryClient();
  const backLink = getPlantBackLink({ defaultTab: "stock" });
  // Filter state — persisted across visits in localStorage so the page
  // re-opens with the user's last-used filter set. URL params (if any are
  // ever added for shareable links) win over the saved set.
  const PLANT_STOCK_FILTER_URL_KEYS = [
    "dateFrom", "dateTo", "selectedPartyId", "selectedMaterialId", "selectedTransactionType", "issuedToFilter",
  ];
  const urlHasStockFilterParams = (() => {
    if (typeof window === "undefined") return false;
    const sp = new URLSearchParams(window.location.search);
    return PLANT_STOCK_FILTER_URL_KEYS.some((k) => sp.has(k));
  })();
  const [persistedFilters, setPersistedFilters, resetPersistedFilters] = usePersistedFilters(
    "plant-stock:last-filters:v1",
    {
      dateFrom: "",
      dateTo: "",
      selectedPartyId: "all",
      selectedMaterialId: "all",
      selectedTransactionType: "all",
      issuedToFilter: "",
    },
    { shouldHydrate: !urlHasStockFilterParams },
  );
  const { dateFrom, dateTo, selectedPartyId, selectedMaterialId, selectedTransactionType, issuedToFilter } = persistedFilters;
  const setDateFrom = (v: string) => setPersistedFilters((f) => ({ ...f, dateFrom: v }));
  const setDateTo = (v: string) => setPersistedFilters((f) => ({ ...f, dateTo: v }));
  const setSelectedPartyId = (v: string) => setPersistedFilters((f) => ({ ...f, selectedPartyId: v }));
  const setSelectedMaterialId = (v: string) => setPersistedFilters((f) => ({ ...f, selectedMaterialId: v }));
  const setSelectedTransactionType = (v: string) => setPersistedFilters((f) => ({ ...f, selectedTransactionType: v }));
  const setIssuedToFilter = (v: string) => setPersistedFilters((f) => ({ ...f, issuedToFilter: v }));


  // Reconciliation mutation to backfill missing ledger entries
  const reconcileMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/plant-module/reconcile-equipment-usage-ledger', { method: 'POST' });
      if (!res.ok) throw new Error('Reconciliation failed');
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/stock-ledger"] });
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/stock-balances"] });
      const created = data.ledgerEntries?.created || 0;
      const cleaned = data.ledgerEntries?.cleaned || 0;
      let description = "";
      if (created > 0) description += `Created ${created} ledger entries. `;
      if (cleaned > 0) description += `Cleaned ${cleaned} orphan entries. `;
      description += "Stock balances updated.";
      toast({
        title: "Data Reconciled",
        description: description.trim(),
      });
    },
    onError: () => {
      toast({
        title: "Reconciliation Failed",
        description: "Please try again or contact support.",
        variant: "destructive",
      });
    },
  });

  const [activeTab, setActiveTab] = useState("summary");

  const { data: parties } = useQuery<Party[]>({ queryKey: ["/api/plant-module/parties"] });
  const { data: materials } = useQuery<PlantMaterial[]>({ queryKey: ["/api/plant-module/materials"] });
  const { data: allStockBalances } = useQuery<{ id: number; partyId: number | null; materialId: number; balance: number; uom: string }[]>({
    queryKey: ["/api/plant-module/stock-balances"],
  });

  // Filtered ledger URL (with date filter) for Stock Summary and Ledger Details tabs
  const buildLedgerUrl = () => {
    const params = new URLSearchParams();
    if (selectedPartyId !== "all") params.set("partyId", selectedPartyId);
    if (selectedMaterialId !== "all") params.set("materialId", selectedMaterialId);
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
    return `/api/plant-module/stock-ledger?${params.toString()}`;
  };

  // All-time ledger URL (NO date filter) for Current Balances - shows true balances from beginning
  const buildAllTimeLedgerUrl = () => {
    const params = new URLSearchParams();
    if (selectedPartyId !== "all") params.set("partyId", selectedPartyId);
    if (selectedMaterialId !== "all") params.set("materialId", selectedMaterialId);
    // No date filters - fetch ALL entries from beginning
    return `/api/plant-module/stock-ledger-all?${params.toString()}`;
  };

  // Balance-as-of URL: aggregate query returning per-(material,party,uom) sums up to dateFrom
  const buildBalanceAsOfUrl = () => {
    if (!dateFrom) return null;
    const params = new URLSearchParams({ date: dateFrom });
    if (selectedPartyId !== "all") params.set("partyId", selectedPartyId);
    if (selectedMaterialId !== "all") params.set("materialId", selectedMaterialId);
    return `/api/plant-module/stock-balance-as-of?${params.toString()}`;
  };

  const { data: ledger, isLoading: ledgerLoading } = useQuery<StockLedgerEntry[]>({ 
    queryKey: [buildLedgerUrl()] 
  });

  // All-time ledger for Current Balances tab — only fetched when that tab is active
  const { data: allTimeLedger, isLoading: allTimeLedgerLoading } = useQuery<StockLedgerEntry[]>({ 
    queryKey: [buildAllTimeLedgerUrl()],
    enabled: activeTab === "balances",
  });

  // Aggregate opening-balance query — used instead of full allTimeLedger when dateFrom is set
  const balanceAsOfUrl = buildBalanceAsOfUrl();
  const { data: balanceAsOf, isLoading: balanceAsOfLoading } = useQuery<StockBalanceAsOf[]>({
    queryKey: [balanceAsOfUrl],
    enabled: !!balanceAsOfUrl,
  });

  const getMaterialName = (id: number) => materials?.find((m) => m.id === id)?.name || `Material ${id}`;
  const getPartyName = (id: number | null) => id ? parties?.find((p) => p.id === id)?.name || `Party ${id}` : "Unknown";

  // Filter out old equipment_issue entries (legacy - no longer created) and calculate running balances
  const processedLedger = useMemo(() => {
    if (!ledger) return [];
    
    // Exclude old equipment_issue entries - they are legacy and should not affect calculations
    const validEntries = ledger.filter(e => e.transactionType !== 'equipment_issue');
    
    // Transaction type priority: opening/receipt first, then issues/dispatches
    const getTypePriority = (type: string) => {
      switch (type) {
        case 'opening': return 1;
        case 'receipt': return 2;
        case 'adjustment': return 3;
        case 'return': return 4;
        case 'direct_purchase': return 5;
        case 'equipment_usage': return 6;
        case 'dpr_equipment_usage': return 6;
        case 'issue': return 7;
        case 'dispatch': return 8;
        default: return 9;
      }
    };
    
    // Sort chronologically (oldest first) for running balance calculation
    const sorted = [...validEntries].sort((a, b) => {
      const dateCompare = a.date.localeCompare(b.date);
      if (dateCompare !== 0) return dateCompare;
      // Within same date, sort by transaction type priority (receipts before issues)
      const typePriorityA = getTypePriority(a.transactionType);
      const typePriorityB = getTypePriority(b.transactionType);
      if (typePriorityA !== typePriorityB) return typePriorityA - typePriorityB;
      // Then by creation time
      const aCreated = a.createdAt ? String(a.createdAt) : '';
      const bCreated = b.createdAt ? String(b.createdAt) : '';
      return aCreated.localeCompare(bCreated);
    });
    
    // Helper to convert quantity based on entry UOM vs material conversion settings
    const getConvertedQty = (entry: StockLedgerEntry, qty: number | null): number => {
      if (!qty) return 0;
      const material = materials?.find(m => m.id === entry.materialId);
      if (!material?.conversionFactor || !material?.conversionFromUom || !material?.conversionToUom) {
        return qty;
      }
      // Only convert if entry UOM matches the source UOM (e.g., CFT)
      if (entry.uom?.toUpperCase() === material.conversionFromUom.toUpperCase()) {
        return qty * material.conversionFactor;
      }
      return qty;
    };

    // Round to avoid floating-point accumulation errors (e.g. 1.14e-13 instead of 0)
    const roundBalance = (val: number) => Math.round(val * 1e9) / 1e9;
    
    // When a date filter is applied, seed running balances from the balance-as-of aggregate
    // (server-side SUM query). Returns zeros until the aggregate resolves, then updates.
    const groupBalances: Record<string, number> = {};

    if (dateFrom && balanceAsOf) {
      // Use the efficient server-side aggregate — one row per (material, party, uom)
      balanceAsOf.forEach(row => {
        const key = `${row.materialId}-${row.partyId ?? 0}`;
        if (groupBalances[key] === undefined) groupBalances[key] = 0;
        const material = materials?.find(m => m.id === row.materialId);
        const factor = (material?.conversionFactor && material?.conversionFromUom && material?.conversionToUom &&
          row.uom?.toUpperCase() === material.conversionFromUom.toUpperCase())
          ? material.conversionFactor : 1;
        groupBalances[key] = roundBalance(groupBalances[key] + (row.totalIn * factor) - (row.totalOut * factor));
      });
    }

    // Build synthetic opening-balance rows (one per material+party group) so the
    // ledger table always shows a "B/F" line when a date filter is active.
    const syntheticRows: (StockLedgerEntry & { calculatedBalance: number; isSynthetic?: boolean })[] = [];

    if (dateFrom && balanceAsOf) {
      const filteredGroups = new Set(sorted.map(e => `${e.materialId}-${e.partyId ?? 0}`));
      for (const key of filteredGroups) {
        const [materialIdStr, partyIdStr] = key.split('-');
        const materialId = Number(materialIdStr);
        const partyId = Number(partyIdStr) === 0 ? null : Number(partyIdStr);
        const openingBalance = groupBalances[key] ?? 0;
        const material = materials?.find(m => m.id === materialId);
        const targetUom = material?.conversionToUom || material?.defaultUom || 'Ton';
        syntheticRows.push({
          id: -(materialId * 10000 + (partyId ?? 0)),
          date: dateFrom,
          partyId,
          materialId,
          transactionType: 'opening_balance',
          referenceId: null,
          quantityIn: openingBalance >= 0 ? openingBalance : null,
          quantityOut: openingBalance < 0 ? Math.abs(openingBalance) : null,
          balanceAfter: openingBalance,
          uom: targetUom,
          notes: `Opening balance (B/F) as of ${dateFrom}`,
          createdAt: null,
          calculatedBalance: openingBalance,
          isSynthetic: true,
        } as StockLedgerEntry & { calculatedBalance: number; isSynthetic?: boolean });
      }
    }

    const mainRows = sorted.map(entry => {
      const key = `${entry.materialId}-${entry.partyId ?? 0}`;
      if (groupBalances[key] === undefined) groupBalances[key] = 0;
      
      // Convert quantities before accumulating running balance
      const convertedIn = getConvertedQty(entry, entry.quantityIn);
      const convertedOut = getConvertedQty(entry, entry.quantityOut);
      groupBalances[key] = roundBalance(groupBalances[key] + convertedIn - convertedOut);
      
      return {
        ...entry,
        calculatedBalance: groupBalances[key]
      };
    });

    // Synthetic rows come first (oldest); they appear last when the display reverses the array
    return [...syntheticRows, ...mainRows];
  }, [ledger, balanceAsOf, materials, dateFrom]);

  // For display, reverse to show most recent first and filter by transaction type + issuedTo search
  const ledgerForDisplay = useMemo(() => {
    let entries = [...processedLedger].reverse();
    if (selectedTransactionType !== "all") {
      // Always keep synthetic opening_balance rows — they're context, not real transactions
      entries = entries.filter(e => e.transactionType === selectedTransactionType || e.transactionType === 'opening_balance');
    }
    if (issuedToFilter.trim()) {
      const q = issuedToFilter.trim().toLowerCase();
      // Always keep synthetic opening-balance rows for context; apply text filter to real entries only
      entries = entries.filter(e => e.transactionType === 'opening_balance' || (e.notes || "").toLowerCase().includes(q));
    }
    return entries;
  }, [processedLedger, selectedTransactionType, issuedToFilter]);

  // Calculate totals for filtered ledger data - with UOM conversion (exclude synthetic opening_balance rows)
  const ledgerTotals = useMemo(() => {
    if (!ledgerForDisplay?.length || !materials) return { totalIn: 0, totalOut: 0, netChange: 0 };
    
    return ledgerForDisplay.filter(e => e.transactionType !== 'opening_balance').reduce((acc, entry) => {
      const material = materials.find(m => m.id === entry.materialId);
      const convFactor = material?.conversionFactor;
      const convFromUom = material?.conversionFromUom;
      const convToUom = material?.conversionToUom;
      
      // Check if this entry needs conversion (entry UOM matches source UOM like CFT)
      const needsConversion = convFactor && convFromUom && convToUom &&
        entry.uom?.toUpperCase() === convFromUom.toUpperCase();
      
      const qtyIn = needsConversion ? (entry.quantityIn || 0) * convFactor : (entry.quantityIn || 0);
      const qtyOut = needsConversion ? (entry.quantityOut || 0) * convFactor : (entry.quantityOut || 0);
      
      return {
        totalIn: acc.totalIn + qtyIn,
        totalOut: acc.totalOut + qtyOut,
        netChange: acc.netChange + qtyIn - qtyOut
      };
    }, { totalIn: 0, totalOut: 0, netChange: 0 });
  }, [ledgerForDisplay, materials]);

  const computeStockSummary = () => {
    if (!ledger || !materials) return [];

    const summaryMap: Record<string, {
      materialId: number;
      materialName: string;
      partyId: number | null;
      partyName: string;
      uom: string;
      openingStock: number;
      received: number;
      consumed: number;
      closing: number;
      conversionFactor: number | null;
      conversionFromUom: string | null;
      conversionToUom: string | null;
      convertedOpening: number | null;
      convertedReceived: number | null;
      convertedConsumed: number | null;
      convertedClosing: number | null;
    }> = {};

    // Use processedLedger which excludes equipment_issue entries
    processedLedger.forEach((entry) => {
      const key = `${entry.materialId}-${entry.partyId ?? 0}`;
      const material = materials?.find(m => m.id === entry.materialId);
      const convFactor = material?.conversionFactor || null;
      const convFromUom = material?.conversionFromUom || null;
      const convToUom = material?.conversionToUom || null;
      
      if (!summaryMap[key]) {
        // Use target UOM if material has conversion, otherwise use entry UOM
        const targetUom = convToUom || entry.uom || "Ton";
        summaryMap[key] = {
          materialId: entry.materialId,
          materialName: getMaterialName(entry.materialId),
          partyId: entry.partyId,
          partyName: getPartyName(entry.partyId),
          uom: targetUom,
          openingStock: 0,
          received: 0,
          consumed: 0,
          closing: 0,
          conversionFactor: convFactor,
          conversionFromUom: convFromUom,
          conversionToUom: convToUom,
          convertedOpening: null,
          convertedReceived: null,
          convertedConsumed: null,
          convertedClosing: null,
        };
      }

      // Check if this entry needs conversion (entry UOM matches source UOM like CFT)
      const entryNeedsConversion = convFactor && convFromUom && convToUom &&
        entry.uom?.toUpperCase() === convFromUom.toUpperCase();
      
      // Get quantity, converting if needed
      const getConvertedQty = (qty: number | null) => {
        if (!qty) return 0;
        return entryNeedsConversion ? qty * convFactor : qty;
      };

      // Synthetic opening balance row (B/F) prepended when date filter is active
      if (entry.transactionType === "opening_balance") {
        const bfBalance = (entry.quantityIn || 0) - (entry.quantityOut || 0);
        summaryMap[key].openingStock += bfBalance;
      }
      // Opening stock entries (from Masters -> Opening Stock)
      else if (entry.transactionType === "opening") {
        summaryMap[key].openingStock += getConvertedQty(entry.quantityIn);
      }
      // Receipts (from Material Receipts) and adjustments
      else if (entry.transactionType === "receipt" || entry.transactionType === "adjustment") {
        summaryMap[key].received += getConvertedQty(entry.quantityIn);
      }
      // Returns: materials returned from site back to stock — treated as received (add-back)
      else if (entry.transactionType === "return") {
        summaryMap[key].received += getConvertedQty(Math.abs(entry.quantityIn || 0));
      }
      // Consumed: dispatch, issue, equipment_usage (equipment_issue excluded from processedLedger)
      else if (entry.transactionType === "dispatch" || entry.transactionType === "issue" || entry.transactionType === "equipment_usage" || entry.transactionType === "dpr_equipment_usage") {
        summaryMap[key].consumed += getConvertedQty(Math.abs(entry.quantityOut || 0));
      }
      // Direct purchases bypass plant stock - tracked but no balance impact
      // (quantityIn and quantityOut are equal, net effect is zero)
    });

    // Calculate closing balance - round to eliminate floating-point accumulation errors
    Object.values(summaryMap).forEach((item) => {
      const raw = item.openingStock + item.received - item.consumed;
      item.closing = Math.round(raw * 1e9) / 1e9;
      if (Math.abs(item.closing) < 1e-9) item.closing = 0;
    });

    return Object.values(summaryMap);
  };

  const stockSummary = computeStockSummary();

  // Compute ALL-TIME balances from allTimeLedger (no date filter) for Current Balances tab
  // This shows Total Receipts, Total Issues, and Balance from the very beginning
  const allTimeBalances = useMemo(() => {
    if (!allTimeLedger || !materials) return [];

    const summaryMap: Record<string, {
      materialId: number;
      materialName: string;
      partyId: number | null;
      partyName: string;
      uom: string;
      totalReceipts: number;
      totalIssues: number;
      balance: number;
      conversionFactor: number | null;
      conversionFromUom: string | null;
      conversionToUom: string | null;
      convertedBalance: number | null;
    }> = {};

    // Filter out legacy equipment_issue entries
    const validEntries = allTimeLedger.filter(e => e.transactionType !== 'equipment_issue');

    validEntries.forEach((entry) => {
      const key = `${entry.materialId}-${entry.partyId ?? 0}`;
      // Get material conversion info
      const material = materials.find(m => m.id === entry.materialId);
      const convFactor = material?.conversionFactor || null;
      const convFromUom = material?.conversionFromUom || null;
      const convToUom = material?.conversionToUom || null;
      
      if (!summaryMap[key]) {
        // Use target UOM if material has conversion, otherwise use entry UOM
        const targetUom = convToUom || entry.uom || "Ton";
        summaryMap[key] = {
          materialId: entry.materialId,
          materialName: getMaterialName(entry.materialId),
          partyId: entry.partyId,
          partyName: getPartyName(entry.partyId),
          uom: targetUom,
          totalReceipts: 0,
          totalIssues: 0,
          balance: 0,
          conversionFactor: convFactor,
          conversionFromUom: convFromUom,
          conversionToUom: convToUom,
          convertedBalance: null,
        };
      }

      // Check if this entry needs conversion (entry UOM matches source UOM like CFT)
      const entryNeedsConversion = convFactor && convFromUom && convToUom &&
        entry.uom?.toUpperCase() === convFromUom.toUpperCase();
      
      // Get quantity, converting if needed
      const getConvertedQty = (qty: number | null) => {
        if (!qty) return 0;
        return entryNeedsConversion ? qty * convFactor : qty;
      };

      // Receipts: opening, receipt, adjustment, return
      if (entry.transactionType === "opening" || entry.transactionType === "receipt" || entry.transactionType === "adjustment") {
        summaryMap[key].totalReceipts += getConvertedQty(entry.quantityIn);
      }
      // Returns: material returned from site reduces net issues (adds back to receipts side)
      if (entry.transactionType === "return") {
        summaryMap[key].totalReceipts += getConvertedQty(Math.abs(entry.quantityIn || 0));
      }
      // Issues: dispatch, issue, equipment_usage, dpr_equipment_usage
      if (entry.transactionType === "dispatch" || entry.transactionType === "issue" || entry.transactionType === "equipment_usage" || entry.transactionType === "dpr_equipment_usage") {
        summaryMap[key].totalIssues += getConvertedQty(Math.abs(entry.quantityOut || 0));
      }
      // Direct purchases bypass plant stock - not counted in balance
      // (quantityIn and quantityOut are equal, net effect is zero)
    });

    // Calculate balance - round to eliminate floating-point accumulation errors
    Object.values(summaryMap).forEach((item) => {
      const rawBalance = item.totalReceipts - item.totalIssues;
      item.balance = Math.round(rawBalance * 1e9) / 1e9;
      // Treat sub-epsilon values as exactly 0
      if (Math.abs(item.balance) < 1e-9) item.balance = 0;
    });

    return Object.values(summaryMap);
  }, [allTimeLedger, materials, parties]);

  // Filter all-time balances based on party/material selection (but NOT date - always all-time)
  const filteredBalances = allTimeBalances?.filter((b) => {
    if (selectedPartyId !== "all" && String(b.partyId ?? "") !== selectedPartyId && selectedPartyId !== "common") return false;
    if (selectedPartyId === "common" && b.partyId !== null) return false;
    if (selectedMaterialId !== "all" && b.materialId !== Number(selectedMaterialId)) return false;
    return true;
  });

  // Handler to jump to ledger tab with material/party filter
  const jumpToLedger = (materialId: number, partyId: number | null) => {
    setSelectedMaterialId(String(materialId));
    if (partyId !== null) {
      setSelectedPartyId(String(partyId));
    }
    setActiveTab("ledger");
  };

  // Build filename with date range and filters
  const buildFilename = (extension: string) => {
    const timestamp = format(new Date(), "yyyyMMdd_HHmm");
    const fromDate = dateFrom || "All";
    const toDate = dateTo || "All";
    const partyFilter = selectedPartyId !== "all" 
      ? (selectedPartyId === "common" ? "PlantCommon" : parties?.find(p => p.id === parseInt(selectedPartyId))?.name?.replace(/\s+/g, '') || "")
      : "";
    const materialFilter = selectedMaterialId !== "all" 
      ? materials?.find(m => m.id === parseInt(selectedMaterialId))?.name?.replace(/\s+/g, '') || ""
      : "";
    const filters = [partyFilter, materialFilter].filter(Boolean).join("_");
    return `SiteLog_Plant_Stock_${fromDate}_to_${toDate}${filters ? "_" + filters : ""}_${timestamp}.${extension}`;
  };

  // Universal download function that works on all devices including iPad
  const triggerDownload = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 100);
  };

  // Helper to get converted quantities for export/print
  const getConvertedEntryData = (entry: typeof processedLedger[0]) => {
    const material = materials?.find(m => m.id === entry.materialId);
    const convFactor = material?.conversionFactor;
    const convFromUom = material?.conversionFromUom;
    const convToUom = material?.conversionToUom;
    const hasConversion = convFactor && convFromUom && convToUom;
    const needsConversion = hasConversion && entry.uom?.toUpperCase() === convFromUom.toUpperCase();
    
    const displayIn = needsConversion ? (entry.quantityIn ?? 0) * convFactor : (entry.quantityIn ?? 0);
    const displayOut = needsConversion ? (entry.quantityOut ?? 0) * convFactor : (entry.quantityOut ?? 0);
    // calculatedBalance is already converted to target UOM
    const displayBalance = entry.calculatedBalance ?? 0;
    // Use target UOM for In/Out only when converted, otherwise use entry's original UOM
    // For balance, always use target UOM if material has conversion (since balance is accumulated in target UOM)
    const displayUom = needsConversion ? convToUom : entry.uom;
    const balanceUom = hasConversion ? convToUom : entry.uom;
    
    return { displayIn, displayOut, displayBalance, displayUom, balanceUom };
  };

  const exportToExcel = async () => {
    try {
      const summaryData = stockSummary.map(item => ({
        Material: item.materialName,
        "Stock Owner": item.partyName,
        Opening: item.openingStock.toFixed(3),
        Received: item.received.toFixed(3),
        Consumed: item.consumed.toFixed(3),
        Closing: item.closing.toFixed(3),
        UOM: item.uom,
      }));
      
      const ledgerData = processedLedger.filter(e => e.transactionType !== 'opening_balance').map(entry => {
        const { displayIn, displayOut, displayBalance, balanceUom } = getConvertedEntryData(entry);
        return {
          Date: entry.date,
          Material: getMaterialName(entry.materialId),
          "Stock Owner": getPartyName(entry.partyId),
          Type: entry.transactionType === 'receipt' ? 'Receipt' : entry.transactionType === 'dispatch' ? 'Dispatch' : entry.transactionType === 'issue' ? 'Issue' : entry.transactionType === 'opening' ? 'Opening' : entry.transactionType === 'adjustment' ? 'Adjustment' : entry.transactionType === 'return' ? 'Return' : entry.transactionType === 'equipment_usage' ? 'Equip. Usage' : entry.transactionType === 'dpr_equipment_usage' ? 'DPR Equip. Usage' : entry.transactionType === 'direct_purchase' ? 'Direct Site Purchase' : entry.transactionType,
          "Issued To": entry.transactionType === 'equipment_usage' && entry.notes?.startsWith('Diesel issued to ') 
            ? entry.notes.replace('Diesel issued to ', '')
            : entry.transactionType === 'dpr_equipment_usage' && entry.notes?.startsWith('DPR diesel issued to ')
            ? entry.notes.replace('DPR diesel issued to ', '').replace(/ at .*$/, '') + ' (DPR)'
            : entry.transactionType === 'direct_purchase' && entry.notes?.startsWith('Direct purchase at ')
            ? entry.notes.replace('Direct purchase at ', '')
            : entry.transactionType === 'issue' && entry.notes?.startsWith('Issue to ')
            ? entry.notes.replace('Issue to ', '').split(' - ')[0]
            : entry.notes || '-',
          In: displayIn > 0 ? displayIn.toFixed(3) : "-",
          Out: displayOut > 0 ? displayOut.toFixed(3) : "-",
          Balance: displayBalance.toFixed(3),
          UOM: balanceUom,
        };
      });
      
      const wb = XLSX.utils.book_new();
      const wsSummary = XLSX.utils.json_to_sheet(summaryData);
      const wsLedger = XLSX.utils.json_to_sheet(ledgerData);
      XLSX.utils.book_append_sheet(wb, wsSummary, "Stock Summary");
      XLSX.utils.book_append_sheet(wb, wsLedger, "Stock Ledger");
      
      const filename = buildFilename("xlsx");
      
      // Try File System Access API for save dialog (Chrome/Edge desktop)
      if ('showSaveFilePicker' in window) {
        try {
          const handle = await (window as any).showSaveFilePicker({
            suggestedName: filename,
            types: [{
              description: 'Excel Files',
              accept: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'] }
            }]
          });
          const writable = await handle.createWritable();
          const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
          await writable.write(buffer);
          await writable.close();
          toast({ title: "File saved successfully" });
          return;
        } catch (err: any) {
          if (err.name === 'AbortError') return;
          // Fall through to standard download
        }
      }
      
      // Standard download for Safari, mobile, and other browsers
      const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      triggerDownload(blob, filename);
      toast({ title: "File download started", description: "Check your Downloads or Files app." });
    } catch (err) {
      toast({ title: "Export failed", description: "Please try again.", variant: "destructive" });
    }
  };

  const exportToPDF = async () => {
    try {
      const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
      doc.setFontSize(16);
      doc.text("Stock Balances & Ledger Report", 14, 15);
      doc.setFontSize(10);
      doc.text(`Period: ${dateFrom} to ${dateTo}`, 14, 22);
      doc.text(`Generated: ${format(new Date(), "dd MMM yyyy HH:mm")}`, 14, 28);
      
      // Stock Summary section
      doc.setFontSize(12);
      doc.text("Stock Summary", 14, 36);
      
      const summaryTableData = stockSummary.map(item => [
        item.materialName,
        item.partyName,
        item.openingStock.toFixed(3),
        item.received.toFixed(3),
        item.consumed.toFixed(3),
        item.closing.toFixed(3),
        item.uom,
      ]);
      
      autoTable(doc, {
        startY: 40,
        head: [["Material", "Stock Owner", "Opening", "Received", "Consumed", "Closing", "UOM"]],
        body: summaryTableData,
        theme: "striped",
        headStyles: { fillColor: [59, 130, 246] },
        styles: { fontSize: 8 },
        margin: { left: 14, right: 14 },
      });
      
      // Ledger Details section on new page
      doc.addPage();
      doc.setFontSize(12);
      doc.text("Ledger Details", 14, 15);
      
      const getTransactionTypeLabel = (type: string) => {
        switch(type) {
          case 'receipt': return 'Receipt';
          case 'dispatch': return 'Dispatch';
          case 'issue': return 'Issue';
          case 'opening': return 'Opening';
          case 'adjustment': return 'Adjustment';
          case 'equipment_usage': return 'Equip. Usage';
          case 'dpr_equipment_usage': return 'DPR Equip. Usage';
          case 'direct_purchase': return 'Direct Site Purchase';
          default: return type;
        }
      };
      
      const ledgerTableData = processedLedger.filter(e => e.transactionType !== 'opening_balance').map(entry => {
        const { displayIn, displayOut, displayBalance, balanceUom } = getConvertedEntryData(entry);
        return [
          entry.date,
          getMaterialName(entry.materialId),
          getPartyName(entry.partyId),
          getTransactionTypeLabel(entry.transactionType),
          entry.transactionType === 'equipment_usage' && entry.notes?.startsWith('Diesel issued to ') 
            ? entry.notes.replace('Diesel issued to ', '').replace(' (backfilled)', '')
            : entry.transactionType === 'dpr_equipment_usage' && entry.notes?.startsWith('DPR diesel issued to ')
            ? entry.notes.replace('DPR diesel issued to ', '').replace(/ at .*$/, '') + ' (DPR)'
            : entry.transactionType === 'direct_purchase' && entry.notes?.startsWith('Direct purchase at ')
            ? entry.notes.replace('Direct purchase at ', '')
            : entry.transactionType === 'issue' && entry.notes?.startsWith('Issue to ')
            ? entry.notes.replace('Issue to ', '').split(' - ')[0]
            : entry.notes || '-',
          displayIn > 0 ? displayIn.toFixed(3) : "-",
          displayOut > 0 ? displayOut.toFixed(3) : "-",
          displayBalance.toFixed(3),
          balanceUom,
        ];
      });
      
      autoTable(doc, {
        startY: 20,
        head: [["Date", "Material", "Stock Owner", "Type", "Notes/Issued To", "In", "Out", "Balance", "UOM"]],
        body: ledgerTableData,
        theme: "striped",
        headStyles: { fillColor: [59, 130, 246] },
        styles: { fontSize: 7 },
        margin: { left: 14, right: 14 },
      });
      
      const filename = buildFilename("pdf");
      
      // Standard download - works reliably across all browsers
      const pdfBlob = doc.output('blob');
      triggerDownload(pdfBlob, filename);
      toast({ title: "File download started", description: "Check your Downloads or Files app." });
    } catch (err) {
      toast({ title: "Export failed", description: "Please try again.", variant: "destructive" });
    }
  };

  const handlePrint = () => {
    const getTransactionTypeLabel = (type: string) => {
      switch(type) {
        case 'receipt': return 'Receipt';
        case 'dispatch': return 'Dispatch';
        case 'issue': return 'Issue';
        case 'opening': return 'Opening';
        case 'adjustment': return 'Adjustment';
        case 'equipment_usage': return 'Equip. Usage';
        case 'dpr_equipment_usage': return 'DPR Equip. Usage';
        case 'direct_purchase': return 'Direct Site Purchase';
        default: return type;
      }
    };
    
    const printContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Stock Balances & Ledger Report</title>
          <style>
            @page { size: A4 landscape; margin: 10mm; }
            * { box-sizing: border-box; }
            body { font-family: Arial, sans-serif; padding: 0; margin: 0; font-size: 10px; }
            .header { margin-bottom: 10px; }
            h1 { color: #333; margin: 0 0 5px 0; font-size: 16px; }
            h2 { color: #333; margin: 20px 0 5px 0; font-size: 14px; page-break-before: always; }
            h2:first-of-type { page-break-before: avoid; }
            .date { color: #666; margin: 0; font-size: 9px; }
            table { width: 100%; border-collapse: collapse; margin-top: 8px; page-break-inside: auto; }
            tr { page-break-inside: avoid; page-break-after: auto; }
            th, td { border: 1px solid #ccc; padding: 4px 3px; text-align: left; font-size: 8px; }
            th { background-color: #f0f0f0; font-weight: bold; }
            tr:nth-child(even) { background-color: #fafafa; }
            .text-right { text-align: right; }
            .text-green { color: #16a34a; }
            .text-red { color: #dc2626; }
            .section-title { font-size: 12px; font-weight: bold; margin: 15px 0 5px 0; color: #333; }
            @media print {
              body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            }
          </style>
        </head>
        <body>
          <div class="company-header" style="text-align: center; border-bottom: 2px solid #333; padding-bottom: 8px; margin-bottom: 8px;">
            <img src="${window.location.origin}/hlc-logo.jpg" style="height: 40px; margin-bottom: 3px;" onerror="this.style.display='none'" />
            <h2 style="margin: 0; font-size: 12px; font-weight: bold;">High Lane Constructions Pvt Ltd</h2>
          </div>
          <div class="header">
            <h1>Stock Balances & Ledger Report</h1>
            <p class="date">Period: ${dateFrom} to ${dateTo} | Generated: ${format(new Date(), "dd MMM yyyy HH:mm")}</p>
          </div>
          
          <div class="section-title">Stock Summary</div>
          <table>
            <thead>
              <tr>
                <th>Material</th>
                <th>Stock Owner</th>
                <th class="text-right">Opening</th>
                <th class="text-right">Received</th>
                <th class="text-right">Consumed</th>
                <th class="text-right">Closing</th>
                <th>UOM</th>
              </tr>
            </thead>
            <tbody>
              ${stockSummary.map(item => `
                <tr>
                  <td>${item.materialName}</td>
                  <td>${item.partyName}</td>
                  <td class="text-right">${item.openingStock.toFixed(3)}</td>
                  <td class="text-right text-green">+${item.received.toFixed(3)}</td>
                  <td class="text-right text-red">-${item.consumed.toFixed(3)}</td>
                  <td class="text-right"><strong>${item.closing.toFixed(3)}</strong></td>
                  <td>${item.uom}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          
          <h2>Ledger Details</h2>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Material</th>
                <th>Stock Owner</th>
                <th>Type</th>
                <th>Notes/Issued To</th>
                <th class="text-right">In</th>
                <th class="text-right">Out</th>
                <th class="text-right">Balance</th>
                <th>UOM</th>
              </tr>
            </thead>
            <tbody>
              ${processedLedger.filter(e => e.transactionType !== 'opening_balance').map(entry => {
                const convData = getConvertedEntryData(entry);
                const notes = entry.transactionType === 'equipment_usage' && entry.notes?.startsWith('Diesel issued to ') 
                  ? entry.notes.replace('Diesel issued to ', '').replace(' (backfilled)', '')
                  : entry.transactionType === 'dpr_equipment_usage' && entry.notes?.startsWith('DPR diesel issued to ')
                  ? entry.notes.replace('DPR diesel issued to ', '').replace(/ at .*$/, '') + ' (DPR)'
                  : entry.transactionType === 'direct_purchase' && entry.notes?.startsWith('Direct purchase at ')
                  ? entry.notes.replace('Direct purchase at ', '')
                  : entry.transactionType === 'issue' && entry.notes?.startsWith('Issue to ')
                  ? entry.notes.replace('Issue to ', '').split(' - ')[0]
                  : entry.notes || '-';
                return `
                <tr>
                  <td>${entry.date}</td>
                  <td>${getMaterialName(entry.materialId)}</td>
                  <td>${getPartyName(entry.partyId)}</td>
                  <td>${getTransactionTypeLabel(entry.transactionType)}</td>
                  <td>${notes}</td>
                  <td class="text-right text-green">${convData.displayIn > 0 ? convData.displayIn.toFixed(3) : '-'}</td>
                  <td class="text-right text-red">${convData.displayOut > 0 ? convData.displayOut.toFixed(3) : '-'}</td>
                  <td class="text-right"><strong>${convData.displayBalance.toFixed(3)}</strong></td>
                  <td>${convData.balanceUom}</td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        <script>window.onload=function(){setTimeout(function(){window.print();},300);}</script>
        </body>
      </html>
    `;
    
    const iframe = document.createElement('iframe');
    iframe.style.position = 'absolute';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = 'none';
    iframe.style.left = '-9999px';

    document.body.appendChild(iframe);
    iframe.srcdoc = printContent;
    setTimeout(() => { if (iframe.parentNode) iframe.parentNode.removeChild(iframe); }, 30000);
  };

  const handleExportExcelClick = () => exportToExcel();
  const handleExportPdfClick = () => exportToPDF();
  const handlePrintClick = () => handlePrint();
  const handleReconcileClick = () => reconcileMutation.mutate();

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <NegativeBalanceBannerMulti
        balances={allStockBalances ?? []}
        parties={parties}
        materials={materials}
        testid="banner-negative-stock"
      />
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-4">
          <Link href={backLink}>
            <Button variant="ghost" size="icon" data-testid="button-back">
              <ChevronLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold">Stock Balances & Ledger</h1>
            <p className="text-muted-foreground">View party-wise and plant-common stock</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {canReconcile && (
            <Button 
              size="sm" 
              variant="default" 
              className="gap-1" 
              onClick={handleReconcileClick} 
              disabled={reconcileMutation.isPending}
              data-testid="button-reconcile-data"
            >
              {reconcileMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
              Reconcile Data
            </Button>
          )}
          {canExport && (
            <Button size="sm" variant="outline" className="gap-1" onClick={handleExportExcelClick} disabled={!stockSummary.length} data-testid="button-export-excel">
              <Download className="w-4 h-4" /> Export Excel
            </Button>
          )}
          {canExport && (
            <Button size="sm" variant="outline" className="gap-1" onClick={handleExportPdfClick} disabled={!stockSummary.length} data-testid="button-export-pdf">
              <Download className="w-4 h-4" /> Export PDF
            </Button>
          )}
          {canExport && (
            <Button size="sm" variant="outline" className="gap-1" onClick={handlePrintClick} data-testid="button-print">
              <Printer className="w-4 h-4" /> Print
            </Button>
          )}
          <Link href={appendPlantContext("/plant/stock-reassign", { defaultTab: "stock" })}>
            <Button size="sm" variant="outline" className="gap-1 border-amber-300 text-amber-700 dark:text-amber-400" data-testid="link-stock-reassign">
              <ArrowRightLeft className="w-4 h-4" /> Reassign Ledger
            </Button>
          </Link>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2">
              <Search className="w-5 h-5" />
              Filters
            </CardTitle>
            {(dateFrom || dateTo || selectedPartyId !== "all" || selectedMaterialId !== "all" || selectedTransactionType !== "all" || issuedToFilter.trim()) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={resetPersistedFilters}
                data-testid="button-reset-filters"
                aria-label="Reset filters to defaults"
              >
                <X className="w-3.5 h-3.5 mr-1" /> Reset filters
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <div>
              <Label>Party / Stock Owner</Label>
              <Select value={selectedPartyId} onValueChange={setSelectedPartyId}>
                <SelectTrigger data-testid="select-filter-party">
                  <SelectValue placeholder="All Parties" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Parties</SelectItem>
                  {parties?.map((p) => (
                    <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Material</Label>
              <Select value={selectedMaterialId} onValueChange={setSelectedMaterialId}>
                <SelectTrigger data-testid="select-filter-material">
                  <SelectValue placeholder="All Materials" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Materials</SelectItem>
                  {materials?.map((m) => (
                    <SelectItem key={m.id} value={String(m.id)}>{m.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Transaction Type</Label>
              <Select value={selectedTransactionType} onValueChange={setSelectedTransactionType}>
                <SelectTrigger data-testid="select-filter-transaction-type">
                  <SelectValue placeholder="All Types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="opening">Opening</SelectItem>
                  <SelectItem value="receipt">Receipt</SelectItem>
                  <SelectItem value="adjustment">Adjustment</SelectItem>
                  <SelectItem value="equipment_usage">Equip. Usage</SelectItem>
                  <SelectItem value="dpr_equipment_usage">DPR Equip. Usage</SelectItem>
                  <SelectItem value="direct_purchase">Direct Site Purchase</SelectItem>
                  <SelectItem value="issue">Issue</SelectItem>
                  <SelectItem value="dispatch">Dispatch</SelectItem>
                  <SelectItem value="return">Return</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>From Date</Label>
              <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} data-testid="input-date-from" />
            </div>
            <div>
              <Label>To Date</Label>
              <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} data-testid="input-date-to" />
            </div>
          </div>
          {activeTab === "ledger" && (
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label>Issued / Equipment (search notes)</Label>
                <Input
                  value={issuedToFilter}
                  onChange={(e) => setIssuedToFilter(e.target.value)}
                  placeholder="e.g. 600 KVA, JCB, Hot Oil..."
                  data-testid="input-issued-to-filter"
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="summary" className="gap-2">
            <Layers className="w-4 h-4" />
            Stock Summary
          </TabsTrigger>
          <TabsTrigger value="balances" className="gap-2">
            <Package className="w-4 h-4" />
            Current Balances
          </TabsTrigger>
          <TabsTrigger value="ledger" className="gap-2">
            <Calendar className="w-4 h-4" />
            Ledger Details
          </TabsTrigger>
        </TabsList>

        <TabsContent value="summary" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Layers className="w-5 h-5" />
                Stock Summary (Period: {dateFrom} to {dateTo})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {ledgerLoading ? (
                <div className="flex justify-center p-8">
                  <Loader2 className="w-6 h-6 animate-spin" />
                </div>
              ) : stockSummary.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">No stock movements found for this period.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-3 px-2">Material</th>
                        <th className="text-left py-3 px-2">Stock Owner</th>
                        <th className="text-right py-3 px-2">Opening</th>
                        <th className="text-right py-3 px-2">Received</th>
                        <th className="text-right py-3 px-2">Consumed</th>
                        <th className="text-right py-3 px-2">Closing</th>
                        <th className="text-left py-3 px-2">UOM</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stockSummary.map((item, idx) => {
                        const hasConversion = item.conversionFactor && item.convertedClosing !== null;
                        return (
                          <tr key={idx} className="border-b last:border-0">
                            <td className="py-3 px-2 font-medium">{item.materialName}</td>
                            <td className="py-3 px-2">
                              <span className={`px-2 py-0.5 text-xs rounded ${
                                item.partyId ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300' : 
                                'bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300'
                              }`}>
                                {item.partyName}
                              </span>
                            </td>
                            <td className="py-3 px-2 text-right">
                              {dateFrom && balanceAsOfLoading ? (
                                <div className="h-4 w-16 bg-amber-200 dark:bg-amber-800/50 rounded ml-auto animate-pulse" data-testid={`skeleton-opening-${idx}`} />
                              ) : hasConversion ? (
                                <span title={`${item.openingStock.toFixed(3)} ${item.uom}`}>
                                  {item.convertedOpening?.toFixed(3)}
                                </span>
                              ) : item.openingStock.toFixed(3)}
                            </td>
                            <td className="py-3 px-2 text-right text-green-600 dark:text-green-400">
                              +{hasConversion ? item.convertedReceived?.toFixed(3) : item.received.toFixed(3)}
                            </td>
                            <td className="py-3 px-2 text-right text-red-600 dark:text-red-400">
                              -{hasConversion ? item.convertedConsumed?.toFixed(3) : item.consumed.toFixed(3)}
                            </td>
                            <td className="py-3 px-2 text-right font-bold">
                              {hasConversion ? item.convertedClosing?.toFixed(3) : item.closing.toFixed(3)}
                            </td>
                            <td className="py-3 px-2">
                              {hasConversion ? item.conversionToUom : item.uom}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="balances" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Package className="w-5 h-5" />
                Current Stock Balances
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                All-time stock positions. Click on a card to view ledger details.
              </p>
            </CardHeader>
            <CardContent>
              {allTimeLedgerLoading ? (
                <div className="flex justify-center p-8">
                  <Loader2 className="w-6 h-6 animate-spin" />
                </div>
              ) : !filteredBalances?.length ? (
                <p className="text-muted-foreground text-center py-8">No stock balances found.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filteredBalances.map((b, idx) => (
                    <div 
                      key={idx}
                      onClick={() => jumpToLedger(b.materialId, b.partyId)}
                      className={`p-4 rounded-lg border cursor-pointer transition-all hover-elevate ${
                        b.balance < 10 
                          ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800' 
                          : 'bg-card border-border hover:border-primary/30'
                      }`}
                      data-testid={`card-balance-${b.materialId}-${b.partyId}`}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <h3 className="font-semibold text-foreground">{b.materialName}</h3>
                        {b.balance < 0 ? (
                          <span className="px-2 py-0.5 text-xs rounded bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400 font-medium">
                            NEGATIVE
                          </span>
                        ) : b.balance < 10 ? (
                          <span className="px-2 py-0.5 text-xs rounded bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400 font-medium">
                            LOW
                          </span>
                        ) : null}
                      </div>
                      {b.balance < 0 && (
                        <p className="text-xs text-red-500 dark:text-red-400 mb-2">
                          Balance is negative — check for missing receipts or data entry errors.
                        </p>
                      )}
                      
                      <div className={`text-2xl font-bold ${b.convertedBalance !== null ? 'mb-1' : 'mb-3'} ${
                        b.balance < 0 ? 'text-red-600 dark:text-red-400' : 
                        b.balance < 10 ? 'text-amber-600 dark:text-amber-400' : 'text-primary'
                      }`}>
                        {Math.abs(b.balance) < 1e-9 ? '0.000' : b.balance.toFixed(3)} <span className="text-base font-normal text-muted-foreground">{b.uom}</span>
                      </div>
                      {b.convertedBalance !== null && b.conversionToUom && (
                        <div className="text-sm text-muted-foreground mb-3">
                          = {b.convertedBalance.toFixed(3)} {b.conversionToUom}
                        </div>
                      )}
                      
                      <div className="grid grid-cols-2 gap-2 text-sm mb-3">
                        <div className="bg-green-50 dark:bg-green-900/20 rounded p-2">
                          <div className="text-xs text-muted-foreground">Total Receipts</div>
                          <div className="font-semibold text-green-600 dark:text-green-400">+{b.totalReceipts.toFixed(3)}</div>
                        </div>
                        <div className="bg-red-50 dark:bg-red-900/20 rounded p-2">
                          <div className="text-xs text-muted-foreground">Total Issues</div>
                          <div className="font-semibold text-red-600 dark:text-red-400">-{b.totalIssues.toFixed(3)}</div>
                        </div>
                      </div>
                      
                      <div className="flex items-center justify-between">
                        <span className={`px-2 py-0.5 text-xs rounded ${
                          b.partyId ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300' : 
                          'bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300'
                        }`}>
                          {b.partyName}
                        </span>
                        <Button 
                          variant="ghost" 
                          size="sm"
                          className="text-xs"
                          onClick={(e) => {
                            e.stopPropagation();
                            jumpToLedger(b.materialId, b.partyId);
                          }}
                          data-testid={`button-view-ledger-${b.materialId}`}
                        >
                          View Ledger
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ledger" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="w-5 h-5" />
                Transaction Ledger
              </CardTitle>
            </CardHeader>
            <CardContent>
              {ledgerLoading ? (
                <div className="flex justify-center p-8">
                  <Loader2 className="w-6 h-6 animate-spin" />
                </div>
              ) : !ledgerForDisplay?.length && !(dateFrom && balanceAsOfLoading) ? (
                <p className="text-muted-foreground text-center py-8">No transactions found for this period.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="text-left p-3 font-semibold">Date</th>
                        <th className="text-left p-3 font-semibold">Material</th>
                        <th className="text-left p-3 font-semibold">Stock Owner</th>
                        <th className="text-left p-3 font-semibold">Type</th>
                        <th className="text-left p-3 font-semibold">Issued To</th>
                        <th className="text-right p-3 font-semibold text-green-600 dark:text-green-400">In</th>
                        <th className="text-right p-3 font-semibold text-red-600 dark:text-red-400">Out</th>
                        <th className="text-right p-3 font-semibold">Balance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dateFrom && balanceAsOfLoading && (
                        <tr className="border-b bg-amber-50 dark:bg-amber-900/20 animate-pulse">
                          <td className="p-3"><div className="h-4 w-20 bg-amber-200 dark:bg-amber-800/50 rounded" /></td>
                          <td className="p-3"><div className="h-4 w-24 bg-amber-200 dark:bg-amber-800/50 rounded" /></td>
                          <td className="p-3"><div className="h-4 w-16 bg-amber-200 dark:bg-amber-800/50 rounded" /></td>
                          <td className="p-3"><div className="h-5 w-28 bg-amber-200 dark:bg-amber-800/50 rounded" /></td>
                          <td className="p-3"><div className="h-4 w-32 bg-amber-200 dark:bg-amber-800/50 rounded" /></td>
                          <td className="p-3 text-right"><div className="h-4 w-14 bg-amber-200 dark:bg-amber-800/50 rounded ml-auto" /></td>
                          <td className="p-3 text-right"><div className="h-4 w-6 bg-amber-200 dark:bg-amber-800/50 rounded ml-auto" /></td>
                          <td className="p-3 text-right"><div className="h-4 w-16 bg-amber-200 dark:bg-amber-800/50 rounded ml-auto" /></td>
                        </tr>
                      )}
                      {ledgerForDisplay.slice(0, 100).filter(entry => {
                        // Suppress stale opening_balance rows while the fresh balance query is loading
                        // to prevent transient zero/stale B/F values appearing alongside the skeleton
                        if (entry.transactionType === 'opening_balance' && dateFrom && balanceAsOfLoading) return false;
                        return true;
                      }).map((entry) => {
                        // Use the same helper as exports for consistency
                        const { displayIn, displayOut, displayBalance, balanceUom } = getConvertedEntryData(entry);
                        const isBF = entry.transactionType === 'opening_balance';
                        
                        return (
                        <tr key={entry.id} className={`border-b ${isBF ? 'bg-amber-50 dark:bg-amber-900/20 font-semibold' : 'hover:bg-muted/30'}`}>
                          <td className="p-3">{entry.date}</td>
                          <td className="p-3 font-medium">{getMaterialName(entry.materialId)}</td>
                          <td className="p-3">
                            <span className={`px-2 py-0.5 text-xs rounded ${
                              entry.partyId ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300' : 
                              'bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300'
                            }`}>
                              {getPartyName(entry.partyId)}
                            </span>
                          </td>
                          <td className="p-3">
                            <span className={`px-2 py-0.5 text-xs rounded ${
                              isBF
                                ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300'
                                : entry.transactionType === 'receipt' || entry.transactionType === 'opening' || entry.transactionType === 'adjustment'
                                ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300' 
                                : entry.transactionType === 'return'
                                ? 'bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300'
                                : entry.transactionType === 'issue'
                                ? 'bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300'
                                : entry.transactionType === 'equipment_usage' || entry.transactionType === 'dpr_equipment_usage'
                                ? 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300'
                                : entry.transactionType === 'direct_purchase'
                                ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300'
                                : 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300'
                            }`}>
                              {isBF ? 'B/F Opening Bal.' : entry.transactionType === 'receipt' ? 'Receipt' : entry.transactionType === 'dispatch' ? 'Dispatch' : entry.transactionType === 'issue' ? 'Issue' : entry.transactionType === 'opening' ? 'Opening' : entry.transactionType === 'adjustment' ? 'Adjustment' : entry.transactionType === 'return' ? 'Return' : entry.transactionType === 'equipment_usage' ? 'Equip. Usage' : entry.transactionType === 'dpr_equipment_usage' ? 'DPR Equip. Usage' : entry.transactionType === 'direct_purchase' ? 'Direct Site Purchase' : entry.transactionType}
                            </span>
                          </td>
                          <td className="p-3 text-muted-foreground text-sm">
                            {isBF ? entry.notes
                              : entry.transactionType === 'equipment_usage' && entry.notes?.startsWith('Diesel issued to ') 
                              ? entry.notes.replace('Diesel issued to ', '')
                              : entry.transactionType === 'dpr_equipment_usage' && entry.notes?.startsWith('DPR diesel issued to ')
                              ? entry.notes.replace('DPR diesel issued to ', '').replace(/ at .*$/, '') + ' (DPR)'
                              : entry.transactionType === 'direct_purchase' && entry.notes?.startsWith('Direct purchase at ')
                              ? entry.notes.replace('Direct purchase at ', '')
                              : entry.transactionType === 'issue' && entry.notes?.startsWith('Issue to ')
                              ? entry.notes.replace('Issue to ', '').split(' - ')[0]
                              : entry.notes || '-'}
                          </td>
                          <td className="p-3 text-right text-green-600 dark:text-green-400 font-medium">
                            {isBF ? (displayBalance >= 0 ? displayBalance.toFixed(3) : '-') : (displayIn > 0 ? `${displayIn.toFixed(3)}` : '-')}
                          </td>
                          <td className="p-3 text-right text-red-600 dark:text-red-400 font-medium">
                            {isBF ? (displayBalance < 0 ? Math.abs(displayBalance).toFixed(3) : '-') : (displayOut > 0 ? `${displayOut.toFixed(3)}` : '-')}
                          </td>
                          <td className={`p-3 text-right font-bold ${displayBalance < -1e-9 ? 'text-red-600 dark:text-red-400' : ''}`}>
                            {Math.abs(displayBalance) < 1e-9 ? '0.000' : displayBalance.toFixed(3)} {balanceUom}
                            {displayBalance < -1e-9 && !isBF && (
                              <span className="ml-1 px-1.5 py-0.5 text-xs rounded bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400 font-medium">NEG</span>
                            )}
                          </td>
                        </tr>
                        );
                      })}
                    </tbody>
                    <tfoot className="bg-muted/70 border-t-2">
                      <tr>
                        <td colSpan={5} className="p-3 font-bold text-right">Filtered Totals:</td>
                        <td className="p-3 text-right text-green-600 dark:text-green-400 font-bold">
                          {ledgerTotals.totalIn.toFixed(3)}
                        </td>
                        <td className="p-3 text-right text-red-600 dark:text-red-400 font-bold">
                          {ledgerTotals.totalOut.toFixed(3)}
                        </td>
                        <td className="p-3 text-right font-bold">
                          Net: {ledgerTotals.netChange >= 0 ? '+' : ''}{ledgerTotals.netChange.toFixed(3)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                  {ledgerForDisplay.length > 100 && (
                    <p className="text-center text-muted-foreground text-sm py-4">
                      Showing first 100 of {ledgerForDisplay.length} transactions
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

    </div>
  );
}
