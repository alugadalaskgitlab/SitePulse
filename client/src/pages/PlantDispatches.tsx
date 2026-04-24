import { useState, useMemo, useCallback, useEffect } from "react";
import { usePersistedFilters } from "@/hooks/use-persisted-filters";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";
import { useOrigin } from "@/hooks/use-origin";
import { useAutosave } from "@/hooks/use-autosave";
import { DraftRestoreBanner } from "@/components/DraftRestoreBanner";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { ChevronLeft, Plus, Truck, Loader2, Lock, Trash2, Edit, Download, Printer, AlertTriangle, ChevronsUpDown, Check, X } from "lucide-react";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { PinAuth } from "@/components/PinAuth";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import type { Party, MixTemplate, TruckDispatch, MixType, Site, EquipmentMasterType } from "@shared/schema";

export default function PlantDispatches() {
  const { toast } = useToast();
  const { getPlantBackLink } = useOrigin();
  const backLink = getPlantBackLink({ defaultTab: "operations" });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingDispatch, setEditingDispatch] = useState<TruckDispatch | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  
  // Filter state — persisted across visits in localStorage so the page
  // re-opens with the user's last-used filter set. URL params (if any are
  // ever added for shareable links) win over the saved set.
  const PLANT_DISPATCHES_FILTER_URL_KEYS = [
    "filterDateFrom", "filterDateTo", "filterPartyId", "filterMixType", "filterVehicle", "filterOwner",
  ];
  const urlHasDispatchFilterParams = (() => {
    if (typeof window === "undefined") return false;
    const sp = new URLSearchParams(window.location.search);
    return PLANT_DISPATCHES_FILTER_URL_KEYS.some((k) => sp.has(k));
  })();
  const [persistedFilters, setPersistedFilters, resetPersistedFilters] = usePersistedFilters(
    "plant-dispatches:last-filters:v1",
    {
      filterDateFrom: "",
      filterDateTo: "",
      filterPartyId: "all",
      filterMixType: "all",
      filterVehicle: "all",
      filterOwner: "all",
    },
    { shouldHydrate: !urlHasDispatchFilterParams },
  );
  const { filterDateFrom, filterDateTo, filterPartyId, filterMixType, filterVehicle, filterOwner } = persistedFilters;
  const setFilterDateFrom = (v: string) => setPersistedFilters((f) => ({ ...f, filterDateFrom: v }));
  const setFilterDateTo = (v: string) => setPersistedFilters((f) => ({ ...f, filterDateTo: v }));
  const setFilterPartyId = (v: string) => setPersistedFilters((f) => ({ ...f, filterPartyId: v }));
  const setFilterMixType = (v: string) => setPersistedFilters((f) => ({ ...f, filterMixType: v }));
  const setFilterVehicle = (v: string) => setPersistedFilters((f) => ({ ...f, filterVehicle: v }));
  const setFilterOwner = (v: string) => setPersistedFilters((f) => ({ ...f, filterOwner: v }));
  
  // PIN auth state for per-action authentication
  const [showPinAuth, setShowPinAuth] = useState(false);
  const [pinAuthTarget, setPinAuthTarget] = useState<"admin" | "manager">("admin");
  const [pendingAction, setPendingAction] = useState<{ type: "edit" | "delete" | "export-excel" | "export-pdf" | "print"; dispatchId?: number } | null>(null);
  const [authenticatedRole, setAuthenticatedRole] = useState<string>("manager");
  
  // Form state
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [time, setTime] = useState(format(new Date(), "HH:mm"));
  const [partyId, setPartyId] = useState<string>("");
  const [mixTemplateId, setMixTemplateId] = useState<string>("");
  const [truckNumber, setTruckNumber] = useState("");
  const [loadWeight, setLoadWeight] = useState("");
  const [deliveryLocation, setDeliveryLocation] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [driverName, setDriverName] = useState("");
  const [actualBitumenPercent, setActualBitumenPercent] = useState("");
  const [actualLdoPerTon, setActualLdoPerTon] = useState("");
  const [bitumenTankNumber, setBitumenTankNumber] = useState("1");
  const [ldoTankNumber, setLdoTankNumber] = useState("2");
  const [transportEquipmentId, setTransportEquipmentId] = useState<number | null>(null);
  const [truckComboOpen, setTruckComboOpen] = useState(false);
  
  // Tolerance constant (±10%)
  const TOLERANCE_PERCENT = 10;

  interface DispatchFormData {
    date: string;
    time: string;
    partyId: string;
    mixTemplateId: string;
    truckNumber: string;
    loadWeight: string;
    deliveryLocation: string;
    ownerName: string;
    driverName: string;
    actualBitumenPercent: string;
    actualLdoPerTon: string;
    bitumenTankNumber: string;
    ldoTankNumber: string;
  }

  const formData = useMemo<DispatchFormData>(() => ({
    date, time, partyId, mixTemplateId, truckNumber, loadWeight, deliveryLocation, ownerName, driverName, actualBitumenPercent, actualLdoPerTon, bitumenTankNumber, ldoTankNumber
  }), [date, time, partyId, mixTemplateId, truckNumber, loadWeight, deliveryLocation, ownerName, driverName, actualBitumenPercent, actualLdoPerTon, bitumenTankNumber, ldoTankNumber]);

  const handleRestoreDraft = useCallback((data: DispatchFormData) => {
    setDate(data.date);
    setTime(data.time);
    setPartyId(data.partyId);
    setMixTemplateId(data.mixTemplateId);
    setTruckNumber(data.truckNumber);
    setLoadWeight(data.loadWeight);
    setDeliveryLocation(data.deliveryLocation);
    setOwnerName(data.ownerName || "");
    setDriverName(data.driverName || "");
    setActualBitumenPercent(data.actualBitumenPercent);
    setActualLdoPerTon(data.actualLdoPerTon || "");
    setBitumenTankNumber(data.bitumenTankNumber || "1");
    setLdoTankNumber(data.ldoTankNumber || "2");
  }, []);

  const { hasDraft, draftAge, restoreDraft, discardDraft, clearDraft } = useAutosave<DispatchFormData>({
    formKey: "plant-dispatch-new",
    data: formData,
    enabled: dialogOpen && !editingDispatch,
    onRestore: handleRestoreDraft,
  });

  const { data: dispatches, isLoading } = useQuery<TruckDispatch[]>({
    queryKey: ["/api/plant-module/dispatches"],
  });

  const { data: parties } = useQuery<Party[]>({
    queryKey: ["/api/plant-module/parties"],
  });

  const { data: templates } = useQuery<MixTemplate[]>({
    queryKey: ["/api/plant-module/mix-templates"],
  });

  const { data: mixTypes } = useQuery<MixType[]>({
    queryKey: ["/api/plant-module/mix-types"],
  });

  const { data: sitesList } = useQuery<Site[]>({
    queryKey: ["/api/sites"],
  });

  const { data: equipmentList } = useQuery<EquipmentMasterType[]>({
    queryKey: ["/api/plant-module/equipment"],
  });

  const filteredSites = useMemo(() => {
    if (!sitesList) return [];
    if (!partyId) return sitesList.filter(s => s.isActive !== 0);
    const pid = parseInt(partyId);
    return sitesList.filter(s => s.isActive !== 0 && (!s.partyId || s.partyId === pid));
  }, [sitesList, partyId]);

  // Shortage confirmation state — shown when the owner's stock can't cover
  // a dispatch and the operator must explicitly approve borrowing from HLC.
  type ShortageInfo = {
    needsConfirmation: true;
    ownerPartyId: number;
    ownerPartyName: string;
    fallbackPartyId: number | null;
    fallbackPartyName: string | null;
    shortages: { materialId: number; materialName: string; required: number; available: number; shortfall: number; uom: string }[];
  };
  type DispatchPayload = Record<string, unknown>;
  type DispatchResult = { __confirmationRequired: true } | Record<string, unknown>;
  const [pendingDispatchPayload, setPendingDispatchPayload] = useState<DispatchPayload | null>(null);
  const [shortageInfo, setShortageInfo] = useState<ShortageInfo | null>(null);

  const createMutation = useMutation<DispatchResult, Error, DispatchPayload>({
    mutationFn: async (data) => {
      // Custom fetch so HTTP 409 (owner-stock shortage) can be surfaced
      // structurally to the UI instead of being thrown.
      const res = await fetch("/api/plant-module/dispatches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });
      if (res.status === 409) {
        const body = (await res.json()) as ShortageInfo;
        setPendingDispatchPayload(data);
        setShortageInfo(body);
        return { __confirmationRequired: true };
      }
      if (!res.ok) {
        const text = (await res.text()) || res.statusText;
        throw new Error(`${res.status}: ${text}`);
      }
      return res.json();
    },
    onSuccess: async (result) => {
      if ("__confirmationRequired" in result && result.__confirmationRequired) return;
      await clearDraft();
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/dispatches"] });
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/stock-balances"] });
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/stock-ledger"] });
      setDialogOpen(false);
      resetForm();
      toast({ title: "Dispatch recorded successfully" });
    },
  });

  const confirmHlcBorrow = () => {
    if (!pendingDispatchPayload) return;
    createMutation.mutate({ ...pendingDispatchPayload, allowHlcFallback: true });
    setShortageInfo(null);
    setPendingDispatchPayload(null);
  };

  const cancelHlcBorrow = () => {
    setShortageInfo(null);
    setPendingDispatchPayload(null);
  };

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) =>
      apiRequest("PUT", `/api/plant-module/dispatches/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/dispatches"] });
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/stock-balances"] });
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/stock-ledger"] });
      setDialogOpen(false);
      setEditingDispatch(null);
      resetForm();
      toast({ title: "Dispatch updated successfully" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) =>
      apiRequest("DELETE", `/api/plant-module/dispatches/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/dispatches"] });
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/stock-balances"] });
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/stock-ledger"] });
      setDeleteConfirmId(null);
      toast({ title: "Dispatch deleted successfully" });
    },
  });

  const resetForm = () => {
    setDate(format(new Date(), "yyyy-MM-dd"));
    setTime(format(new Date(), "HH:mm"));
    setPartyId("");
    setMixTemplateId("");
    setTruckNumber("");
    setLoadWeight("");
    setDeliveryLocation("");
    setOwnerName("");
    setDriverName("");
    setActualBitumenPercent("");
    setActualLdoPerTon("");
    setBitumenTankNumber("1");
    setLdoTankNumber("2");
    setTransportEquipmentId(null);
    setEditingDispatch(null);
  };

  const openEditDialog = (dispatch: TruckDispatch) => {
    setEditingDispatch(dispatch);
    setDate(dispatch.date);
    setTime(dispatch.time || "");
    setPartyId(String(dispatch.partyId));
    setMixTemplateId(String(dispatch.mixTemplateId));
    setTruckNumber(dispatch.truckNumber);
    setLoadWeight(String(dispatch.loadWeight));
    setDeliveryLocation(dispatch.deliveryLocation || "");
    setOwnerName(dispatch.ownerName || "");
    setDriverName(dispatch.driverName || "");
    setActualBitumenPercent(dispatch.actualBitumenPercent ? String(dispatch.actualBitumenPercent) : "");
    const weight = dispatch.loadWeight || 0;
    if (dispatch.actualLdoQty && weight > 0) {
      setActualLdoPerTon(String((dispatch.actualLdoQty / weight).toFixed(3)));
    } else {
      setActualLdoPerTon("");
    }
    setBitumenTankNumber(dispatch.bitumenTankNumber ? String(dispatch.bitumenTankNumber) : "1");
    setLdoTankNumber(dispatch.ldoTankNumber ? String(dispatch.ldoTankNumber) : "2");
    setTransportEquipmentId(dispatch.transportEquipmentId || null);
    setDialogOpen(true);
  };

  // Calculate theoretical values for validation
  const theoreticalValues = useMemo(() => {
    const template = templates?.find(t => t.id === parseInt(mixTemplateId));
    const weight = parseFloat(loadWeight) || 0;
    if (!template || !weight) return null;
    
    const bitumenPercent = template.bitumenPercent || 0;
    const ldoNorm = template.ldoNorm || 6;
    const theoreticalBitumenQty = (weight * bitumenPercent) / 100;
    const theoreticalLdoQty = weight * ldoNorm;
    
    return {
      bitumenPercent,
      bitumenQty: theoreticalBitumenQty,
      ldoQty: theoreticalLdoQty,
      ldoNorm,
    };
  }, [templates, mixTemplateId, loadWeight]);
  
  // Validate actual values against tolerance
  const validationStatus = useMemo(() => {
    if (!theoreticalValues) return { bitumen: "ok", ldo: "ok" };
    
    const result = { bitumen: "ok" as "ok" | "warning" | "error", ldo: "ok" as "ok" | "warning" | "error" };
    
    // Check bitumen (guard against divide-by-zero)
    if (actualBitumenPercent && theoreticalValues.bitumenPercent > 0) {
      const actualPercent = parseFloat(actualBitumenPercent);
      const variance = ((actualPercent - theoreticalValues.bitumenPercent) / theoreticalValues.bitumenPercent) * 100;
      if (!isNaN(variance)) {
        if (Math.abs(variance) > TOLERANCE_PERCENT) {
          result.bitumen = "error";
        } else if (Math.abs(variance) > 5) {
          result.bitumen = "warning";
        }
      }
    }
    
    // Check LDO L/ton against theoretical norm (guard against divide-by-zero)
    if (actualLdoPerTon && theoreticalValues.ldoNorm > 0) {
      const actualRate = parseFloat(actualLdoPerTon);
      const variance = ((actualRate - theoreticalValues.ldoNorm) / theoreticalValues.ldoNorm) * 100;
      if (!isNaN(variance)) {
        if (Math.abs(variance) > TOLERANCE_PERCENT) {
          result.ldo = "error";
        } else if (Math.abs(variance) > 5) {
          result.ldo = "warning";
        }
      }
    }
    
    return result;
  }, [theoreticalValues, actualBitumenPercent, actualLdoPerTon, TOLERANCE_PERCENT]);
  
  // Check if values exceed tolerance (block submission)
  const hasToleranceError = validationStatus.bitumen === "error" || validationStatus.ldo === "error";

  const handleSubmit = () => {
    if (!partyId || !mixTemplateId || !truckNumber || !loadWeight) return;
    
    // Block submission if actual values exceed tolerance
    if (hasToleranceError) {
      toast({
        title: "Tolerance Exceeded",
        description: "Actual consumption values must be within ±10% of theoretical. Please adjust or contact admin.",
        variant: "destructive",
      });
      return;
    }
    
    const weight = parseFloat(loadWeight) || 0;
    const computedActualLdoQty = (actualLdoPerTon && weight > 0) ? parseFloat(actualLdoPerTon) * weight : null;

    if (editingDispatch) {
      updateMutation.mutate({
        id: editingDispatch.id,
        data: {
          date,
          time,
          partyId: parseInt(partyId),
          mixTemplateId: parseInt(mixTemplateId),
          truckNumber: truckNumber.toUpperCase(),
          loadWeight: weight,
          deliveryLocation: deliveryLocation.toUpperCase(),
          ownerName: ownerName.toUpperCase() || null,
          driverName: driverName.toUpperCase() || null,
          actualBitumenPercent: actualBitumenPercent ? parseFloat(actualBitumenPercent) : null,
          actualLdoQty: computedActualLdoQty,
          adjustedBy: authenticatedRole,
          bitumenTankNumber: parseInt(bitumenTankNumber) || 1,
          ldoTankNumber: parseInt(ldoTankNumber) || 2,
          transportEquipmentId: transportEquipmentId || null,
        }
      });
    } else {
      createMutation.mutate({
        date,
        time,
        partyId: parseInt(partyId),
        mixTemplateId: parseInt(mixTemplateId),
        truckNumber: truckNumber.toUpperCase(),
        loadWeight: weight,
        deliveryLocation: deliveryLocation.toUpperCase(),
        ownerName: ownerName.toUpperCase() || null,
        driverName: driverName.toUpperCase() || null,
        actualBitumenPercent: actualBitumenPercent ? parseFloat(actualBitumenPercent) : null,
        actualLdoQty: computedActualLdoQty,
        bitumenTankNumber: parseInt(bitumenTankNumber) || 1,
        ldoTankNumber: parseInt(ldoTankNumber) || 2,
        transportEquipmentId: transportEquipmentId || null,
      });
    }
  };

  // Per-action PIN authentication handlers
  const requestPinAuth = (action: typeof pendingAction) => {
    setPendingAction(action);
    setPinAuthTarget("admin");
    setShowPinAuth(true);
  };

  const handlePinSuccess = (role: "manager" | "admin", pin: string) => {
    setShowPinAuth(false);
    setAuthenticatedRole(role);
    if (!pendingAction) return;

    switch (pendingAction.type) {
      case "edit":
        if (pendingAction.dispatchId) {
          const dispatch = dispatches?.find(d => d.id === pendingAction.dispatchId);
          if (dispatch) openEditDialog(dispatch);
        }
        break;
      case "delete":
        if (pendingAction.dispatchId) {
          setDeleteConfirmId(pendingAction.dispatchId);
        }
        break;
      case "export-excel":
        exportToExcel();
        break;
      case "export-pdf":
        exportToPDF();
        break;
      case "print":
        handlePrint();
        break;
    }
    setPendingAction(null);
  };

  const handleEditClick = (dispatch: TruckDispatch) => {
    requestPinAuth({ type: "edit", dispatchId: dispatch.id });
  };

  const handleDeleteClick = (dispatchId: number) => {
    requestPinAuth({ type: "delete", dispatchId });
  };

  const handleExportExcelClick = () => {
    requestPinAuth({ type: "export-excel" });
  };

  const handleExportPdfClick = () => {
    requestPinAuth({ type: "export-pdf" });
  };

  const handlePrintClick = () => {
    requestPinAuth({ type: "print" });
  };

  const selectedTemplate = templates?.find(t => t.id === parseInt(mixTemplateId));
  const uniqueVehicles = Array.from(new Set(dispatches?.map(d => d.truckNumber) || [])).sort();
  const uniqueOwners = Array.from(new Set(dispatches?.map(d => d.ownerName).filter(Boolean) || [])).sort() as string[];

  // Filter dispatches
  const filteredDispatches = dispatches?.filter(d => {
    if (filterDateFrom && d.date < filterDateFrom) return false;
    if (filterDateTo && d.date > filterDateTo) return false;
    if (filterPartyId !== "all" && d.partyId !== parseInt(filterPartyId)) return false;
    if (filterMixType !== "all") {
      const template = templates?.find(t => t.id === d.mixTemplateId);
      if (template?.mixType?.toUpperCase() !== filterMixType) return false;
    }
    if (filterVehicle !== "all" && d.truckNumber !== filterVehicle) return false;
    if (filterOwner !== "all" && d.ownerName !== filterOwner) return false;
    return true;
  }) || [];

  const isFiltered = filterDateFrom || filterDateTo || filterPartyId !== "all" || filterMixType !== "all" || filterVehicle !== "all" || filterOwner !== "all";

  const allTotals = useMemo(() => {
    const all = dispatches || [];
    return {
      count: all.length,
      loadWeight: all.reduce((sum, d) => sum + (d.loadWeight || 0), 0),
      bitumen: all.reduce((sum, d) => sum + (d.theoreticalBitumenQty || 0), 0),
      ldo: all.reduce((sum, d) => sum + (d.theoreticalLdoQty || 0), 0),
    };
  }, [dispatches]);

  const filteredTotals = useMemo(() => {
    return {
      count: filteredDispatches.length,
      loadWeight: filteredDispatches.reduce((sum, d) => sum + (d.loadWeight || 0), 0),
      bitumen: filteredDispatches.reduce((sum, d) => sum + (d.theoreticalBitumenQty || 0), 0),
      ldo: filteredDispatches.reduce((sum, d) => sum + (d.theoreticalLdoQty || 0), 0),
    };
  }, [filteredDispatches]);

  // Group filtered dispatches by date
  const groupedDispatches = filteredDispatches.reduce((acc, dispatch) => {
    const dateKey = dispatch.date;
    if (!acc[dateKey]) acc[dateKey] = [];
    acc[dateKey].push(dispatch);
    return acc;
  }, {} as Record<string, TruckDispatch[]>);

  // Sort dates descending, and entries within each date by time descending
  const sortedDates = Object.keys(groupedDispatches).sort((a, b) => new Date(b).getTime() - new Date(a).getTime());

  const getPartyName = (id: number | null) => id ? parties?.find(p => p.id === id)?.name || "Unknown" : "Unknown";
  const getTemplateName = (id: number | null) => id ? templates?.find(t => t.id === id)?.name || "Unknown" : "Unknown";

  // Build filename with date range and filters
  const buildFilename = (extension: string) => {
    const timestamp = format(new Date(), "yyyyMMdd_HHmm");
    const fromDate = filterDateFrom || "All";
    const toDate = filterDateTo || "All";
    const partyFilter = filterPartyId !== "all" 
      ? parties?.find(p => p.id === parseInt(filterPartyId))?.name?.replace(/\s+/g, '') || ""
      : "";
    const mixTypeFilter = filterMixType !== "all" ? filterMixType : "";
    const vehicleFilter = filterVehicle !== "all" ? filterVehicle.replace(/\s+/g, '') : "";
    const ownerFilter = filterOwner !== "all" ? filterOwner.replace(/\s+/g, '') : "";
    const filters = [partyFilter, mixTypeFilter, vehicleFilter, ownerFilter].filter(Boolean).join("_");
    return `SiteLog_Plant_Dispatches_${fromDate}_to_${toDate}${filters ? "_" + filters : ""}_${timestamp}.${extension}`;
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

  // Export functions
  const exportToExcel = async () => {
    try {
      const data = filteredDispatches.map(d => {
        const template = templates?.find(t => t.id === d.mixTemplateId);
        return {
          Date: d.date,
          Time: d.time || "",
          Party: getPartyName(d.partyId),
          Site: d.deliveryLocation || "",
          "Mix Type": template?.mixType || "",
          "Load (MT)": d.loadWeight,
          Vehicle: d.truckNumber,
          Owner: d.ownerName || "",
          Driver: d.driverName || "",
          "Bitumen (MT)": d.theoreticalBitumenQty?.toFixed(3) || "0",
          "LDO (L)": d.theoreticalLdoQty?.toFixed(3) || "0",
        };
      });
      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Dispatches");
      
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
      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      doc.setFontSize(16);
      doc.text("Plant Production and Dispatches Report", 14, 15);
      doc.setFontSize(10);
      doc.text(`Generated: ${format(new Date(), "dd MMM yyyy HH:mm")}`, 14, 22);
      if (filterDateFrom || filterDateTo) {
        doc.text(`Date Range: ${filterDateFrom || "Start"} to ${filterDateTo || "End"}`, 14, 28);
      }
      
      const tableData = filteredDispatches.map(d => {
        const template = templates?.find(t => t.id === d.mixTemplateId);
        return [
          d.date,
          d.time || "-",
          getPartyName(d.partyId),
          d.deliveryLocation || "-",
          template?.mixType || "-",
          `${d.loadWeight}`,
          d.truckNumber,
          d.ownerName || "-",
          d.driverName || "-",
          d.theoreticalBitumenQty?.toFixed(3) || "0",
          d.theoreticalLdoQty?.toFixed(3) || "0",
        ];
      });
      
      autoTable(doc, {
        startY: filterDateFrom || filterDateTo ? 34 : 28,
        head: [["Date", "Time", "Party", "Site", "Mix", "Load", "Vehicle", "Owner", "Driver", "Bitumen", "LDO"]],
        body: tableData,
        theme: "striped",
        headStyles: { fillColor: [59, 130, 246] },
        styles: { fontSize: 8 },
        margin: { left: 14, right: 14 },
      });
      
      const filename = buildFilename("pdf");
      
      // Try File System Access API for save dialog (Chrome/Edge desktop)
      if ('showSaveFilePicker' in window) {
        try {
          const handle = await (window as any).showSaveFilePicker({
            suggestedName: filename,
            types: [{
              description: 'PDF Files',
              accept: { 'application/pdf': ['.pdf'] }
            }]
          });
          const writable = await handle.createWritable();
          const pdfBlob = doc.output('blob');
          await writable.write(pdfBlob);
          await writable.close();
          toast({ title: "File saved successfully" });
          return;
        } catch (err: any) {
          if (err.name === 'AbortError') return;
          // Fall through to standard download
        }
      }
      
      // Standard download for Safari, mobile, and other browsers
      const pdfBlob = doc.output('blob');
      triggerDownload(pdfBlob, filename);
      toast({ title: "File download started", description: "Check your Downloads or Files app." });
    } catch (err) {
      toast({ title: "Export failed", description: "Please try again.", variant: "destructive" });
    }
  };

  const handlePrint = () => {
    const printContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Plant Production and Dispatches Report</title>
          <style>
            @page { size: A4 portrait; margin: 15mm; }
            * { box-sizing: border-box; }
            body { font-family: Arial, sans-serif; padding: 0; margin: 0; font-size: 11px; }
            .header { margin-bottom: 15px; }
            h1 { color: #333; margin: 0 0 5px 0; font-size: 18px; }
            .date { color: #666; margin: 0; font-size: 10px; }
            table { width: 100%; border-collapse: collapse; margin-top: 10px; page-break-inside: auto; }
            tr { page-break-inside: avoid; page-break-after: auto; }
            th, td { border: 1px solid #ccc; padding: 6px 4px; text-align: left; font-size: 9px; }
            th { background-color: #f0f0f0; font-weight: bold; }
            tr:nth-child(even) { background-color: #fafafa; }
            @media print {
              body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            }
          </style>
        </head>
        <body>
          <div class="company-header" style="text-align: center; border-bottom: 2px solid #333; padding-bottom: 12px; margin-bottom: 12px;">
            <img src="${window.location.origin}/hlc-logo.jpg" style="height: 50px; margin-bottom: 5px;" onerror="this.style.display='none'" />
            <h2 style="margin: 0; font-size: 14px; font-weight: bold;">High Lane Constructions Pvt Ltd</h2>
          </div>
          <div class="header">
            <h1>Plant Production and Dispatches Report</h1>
            <p class="date">Generated: ${format(new Date(), "dd MMM yyyy HH:mm")}${filterDateFrom || filterDateTo ? ` | Range: ${filterDateFrom || "Start"} to ${filterDateTo || "End"}` : ""}</p>
          </div>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Time</th>
                <th>Party</th>
                <th>Site</th>
                <th>Mix</th>
                <th>Load (MT)</th>
                <th>Vehicle</th>
                <th>Owner</th>
                <th>Driver</th>
                <th>Bitumen</th>
                <th>LDO</th>
              </tr>
            </thead>
            <tbody>
              ${filteredDispatches.map(d => {
                const template = templates?.find(t => t.id === d.mixTemplateId);
                return `
                <tr>
                  <td>${d.date}</td>
                  <td>${d.time || '-'}</td>
                  <td>${getPartyName(d.partyId)}</td>
                  <td>${d.deliveryLocation || '-'}</td>
                  <td>${template?.mixType || '-'}</td>
                  <td>${d.loadWeight}</td>
                  <td>${d.truckNumber}</td>
                  <td>${d.ownerName || '-'}</td>
                  <td>${d.driverName || '-'}</td>
                  <td>${d.theoreticalBitumenQty?.toFixed(3) || '0'}</td>
                  <td>${d.theoreticalLdoQty?.toFixed(3) || '0'}</td>
                </tr>
              `}).join('')}
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

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {showPinAuth && (
        <PinAuth
          targetRole={pinAuthTarget}
          onSuccess={handlePinSuccess}
          onClose={() => {
            setShowPinAuth(false);
            setPendingAction(null);
          }}
        />
      )}

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-4">
          <Link href={backLink}>
            <Button variant="ghost" size="icon" data-testid="button-back">
              <ChevronLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold">Plant Production and Dispatches</h1>
            <p className="text-muted-foreground">Record outgoing mix loads by party/job</p>
          </div>
        </div>
        <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
          <DialogTrigger asChild>
            <Button className="gap-2" data-testid="button-add-dispatch">
              <Plus className="w-4 h-4" /> New Dispatch
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingDispatch ? "Edit Dispatch" : "Record Production Dispatch"}</DialogTitle>
            </DialogHeader>
            {hasDraft && !editingDispatch && (
              <DraftRestoreBanner
                draftAge={draftAge}
                onRestore={restoreDraft}
                onDiscard={discardDraft}
              />
            )}
            <div className="space-y-4 pt-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Date</Label>
                  <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} data-testid="input-dispatch-date" />
                </div>
                <div>
                  <Label>Time</Label>
                  <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} data-testid="input-dispatch-time" />
                </div>
              </div>

              <div>
                <Label>Party/Job</Label>
                <Select value={partyId} onValueChange={(v) => { setPartyId(v); setDeliveryLocation(""); }}>
                  <SelectTrigger data-testid="select-dispatch-party">
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
                <Label>Mix Template</Label>
                <Select value={mixTemplateId} onValueChange={setMixTemplateId}>
                  <SelectTrigger data-testid="select-mix-template">
                    <SelectValue placeholder="Select mix template" />
                  </SelectTrigger>
                  <SelectContent>
                    {templates?.map((template) => (
                      <SelectItem key={template.id} value={String(template.id)}>
                        {template.name} ({template.mixType} - {template.bitumenPercent}%)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedTemplate && (
                  <p className="text-sm text-muted-foreground mt-1">
                    Theoretical Bitumen: {selectedTemplate.bitumenPercent}%
                  </p>
                )}
              </div>

              <div>
                <Label>Truck / Vehicle</Label>
                <Popover open={truckComboOpen} onOpenChange={setTruckComboOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={truckComboOpen}
                      className="w-full justify-between font-normal"
                      data-testid="input-truck-number"
                    >
                      {truckNumber || "Select or type truck number..."}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                    <Command>
                      <CommandInput
                        placeholder="Search or type truck number..."
                        value={truckNumber}
                        onValueChange={(val) => {
                          setTruckNumber(val.toUpperCase());
                          setTransportEquipmentId(null);
                        }}
                        data-testid="input-truck-search"
                      />
                      <CommandList>
                        <CommandEmpty>
                          {truckNumber ? (
                            <button
                              className="w-full text-left px-2 py-1.5 text-sm cursor-pointer"
                              onClick={() => {
                                setTruckComboOpen(false);
                              }}
                              data-testid="button-use-custom-truck"
                            >
                              Use "{truckNumber}" as custom entry
                            </button>
                          ) : (
                            "Type a truck number or search equipment..."
                          )}
                        </CommandEmpty>
                        <CommandGroup heading="Equipment Master">
                          {(equipmentList || [])
                            .filter(eq => eq.isActive === 1)
                            .filter(eq => {
                              if (!truckNumber) return true;
                              const search = truckNumber.toLowerCase();
                              return (
                                eq.name?.toLowerCase().includes(search) ||
                                eq.registrationNumber?.toLowerCase().includes(search) ||
                                eq.vendorName?.toLowerCase().includes(search)
                              );
                            })
                            .map((eq) => (
                              <CommandItem
                                key={eq.id}
                                value={`${eq.name} ${eq.registrationNumber || ""} ${eq.vendorName || ""}`}
                                onSelect={() => {
                                  setTruckNumber(eq.registrationNumber?.toUpperCase() || eq.name.toUpperCase());
                                  setTransportEquipmentId(eq.id);
                                  if (eq.vendorName && !ownerName) {
                                    setOwnerName(eq.vendorName.toUpperCase());
                                  }
                                  setTruckComboOpen(false);
                                }}
                                data-testid={`option-equipment-${eq.id}`}
                              >
                                <Check className={cn("mr-2 h-4 w-4", transportEquipmentId === eq.id ? "opacity-100" : "opacity-0")} />
                                <div className="flex flex-col">
                                  <span className="font-medium">{eq.name} {eq.registrationNumber ? `(${eq.registrationNumber})` : ""}</span>
                                  {eq.vendorName && <span className="text-xs text-muted-foreground">{eq.vendorName}</span>}
                                </div>
                              </CommandItem>
                            ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
                {transportEquipmentId && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Linked to Equipment Master #{transportEquipmentId}
                  </p>
                )}
              </div>

              <div>
                <Label>Load Weight (MT)</Label>
                <Input type="number" step="0.1" value={loadWeight} onChange={(e) => setLoadWeight(e.target.value)} placeholder="e.g., 20.5" data-testid="input-load-weight" />
              </div>

              <div>
                <Label>Delivery Site (optional)</Label>
                <Select value={deliveryLocation || "__none__"} onValueChange={(v) => setDeliveryLocation(v === "__none__" ? "" : v)}>
                  <SelectTrigger data-testid="input-delivery-location">
                    <SelectValue placeholder="Select site" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">-- None --</SelectItem>
                    {filteredSites.map(s => (
                      <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Bitumen Tank</Label>
                  <Select value={bitumenTankNumber} onValueChange={setBitumenTankNumber}>
                    <SelectTrigger data-testid="select-bitumen-tank">
                      <SelectValue placeholder="Select tank" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">Tank 1</SelectItem>
                      <SelectItem value="2">Tank 2</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>LDO Tank</Label>
                  <Select value={ldoTankNumber} onValueChange={setLdoTankNumber}>
                    <SelectTrigger data-testid="select-ldo-tank">
                      <SelectValue placeholder="Select tank" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">Boiler Meter</SelectItem>
                      <SelectItem value="2">Dryer Meter</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Owner Name (optional)</Label>
                  <Input value={ownerName} onChange={(e) => setOwnerName(e.target.value.toUpperCase())} placeholder="Vehicle owner" data-testid="input-owner-name" />
                </div>
                <div>
                  <Label>Driver Name (optional)</Label>
                  <Input value={driverName} onChange={(e) => setDriverName(e.target.value.toUpperCase())} placeholder="Driver name" data-testid="input-driver-name" />
                </div>
              </div>

              {/* Theoretical Values Display */}
              {theoreticalValues && (
                <div className="p-3 rounded-lg bg-muted/50 border">
                  <p className="text-sm font-medium mb-2">Theoretical Consumption (from mix formula)</p>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>Bitumen: <span className="font-mono">{theoreticalValues.bitumenPercent}%</span> = <span className="font-mono">{theoreticalValues.bitumenQty.toFixed(3)} MT</span></div>
                    <div>LDO: <span className="font-mono">{theoreticalValues.ldoNorm} L/MT</span> = <span className="font-mono">{theoreticalValues.ldoQty.toFixed(3)} L</span></div>
                  </div>
                </div>
              )}

              {editingDispatch && (
                <div className={`p-3 rounded-lg border ${hasToleranceError ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800' : 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800'}`}>
                  <div className="flex items-center gap-2 mb-3">
                    <Lock className="w-4 h-4 text-amber-600" />
                    <span className="text-sm font-medium text-amber-700 dark:text-amber-300">Actual Consumption (Manager/Admin)</span>
                  </div>
                  
                  <div className="space-y-3">
                    <div>
                      <div className="flex items-center justify-between">
                        <Label>Actual Bitumen %</Label>
                        {validationStatus.bitumen !== "ok" && (
                          <Badge variant={validationStatus.bitumen === "error" ? "destructive" : "secondary"} className="text-xs">
                            {validationStatus.bitumen === "error" ? "Exceeds ±10%" : "Variance"}
                          </Badge>
                        )}
                      </div>
                      <Input 
                        type="number" 
                        step="0.1" 
                        value={actualBitumenPercent} 
                        onChange={(e) => setActualBitumenPercent(e.target.value)} 
                        placeholder={theoreticalValues ? `Theoretical: ${theoreticalValues.bitumenPercent}%` : "Leave blank to use theoretical"} 
                        className={validationStatus.bitumen === "error" ? "border-red-500" : validationStatus.bitumen === "warning" ? "border-amber-500" : ""}
                        data-testid="input-actual-bitumen" 
                      />
                    </div>
                    
                    <div>
                      <div className="flex items-center justify-between">
                        <Label>Actual LDO (L/ton)</Label>
                        {validationStatus.ldo !== "ok" && (
                          <Badge variant={validationStatus.ldo === "error" ? "destructive" : "secondary"} className="text-xs">
                            {validationStatus.ldo === "error" ? "Exceeds ±10%" : "Variance"}
                          </Badge>
                        )}
                      </div>
                      <Input 
                        type="number" 
                        step="0.1" 
                        value={actualLdoPerTon} 
                        onChange={(e) => setActualLdoPerTon(e.target.value)} 
                        placeholder={theoreticalValues ? `Norm: ${theoreticalValues.ldoNorm} L/ton` : "Leave blank to use theoretical"} 
                        className={validationStatus.ldo === "error" ? "border-red-500" : validationStatus.ldo === "warning" ? "border-amber-500" : ""}
                        data-testid="input-actual-ldo" 
                      />
                      {actualLdoPerTon && parseFloat(loadWeight) > 0 && (
                        <p className="text-sm text-muted-foreground mt-1">
                          Total: {(parseFloat(actualLdoPerTon) * parseFloat(loadWeight)).toFixed(3)} L for {loadWeight} MT
                        </p>
                      )}
                    </div>
                  </div>
                  
                  <p className="text-sm text-muted-foreground mt-2">
                    Tolerance: ±{TOLERANCE_PERCENT}% from theoretical. Stock deduction uses theoretical values. Adjustments are logged for audit.
                  </p>
                </div>
              )}

              <Button onClick={handleSubmit} className="w-full" disabled={createMutation.isPending || updateMutation.isPending || !partyId || !mixTemplateId || !truckNumber || !loadWeight || hasToleranceError} data-testid="button-save-dispatch">
                {(createMutation.isPending || updateMutation.isPending) ? <Loader2 className="w-4 h-4 animate-spin" /> : editingDispatch ? "Update Dispatch" : "Save Dispatch"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Export/Print Actions */}
      <div className="flex flex-wrap items-center gap-2 p-4 rounded-lg bg-muted/50">
        <Button size="sm" variant="outline" className="gap-1" onClick={handleExportExcelClick} disabled={!filteredDispatches.length} data-testid="button-export-excel">
          <Download className="w-4 h-4" /> Export Excel
        </Button>
        <Button size="sm" variant="outline" className="gap-1" onClick={handleExportPdfClick} disabled={!filteredDispatches.length} data-testid="button-export-pdf">
          <Download className="w-4 h-4" /> Export PDF
        </Button>
        <Button size="sm" variant="outline" className="gap-1" onClick={handlePrintClick} data-testid="button-print">
          <Printer className="w-4 h-4" /> Print
        </Button>
      </div>

      {/* Filter Bar */}
      <Card>
        <CardContent className="pt-6">
          {isFiltered && (
            <div className="flex justify-end mb-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={resetPersistedFilters}
                data-testid="button-reset-filters"
                aria-label="Reset filters to defaults"
              >
                <X className="w-3.5 h-3.5 mr-1" /> Reset filters
              </Button>
            </div>
          )}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <div>
              <Label className="text-sm text-muted-foreground">DATE FROM</Label>
              <Input
                type="date"
                value={filterDateFrom}
                onChange={(e) => setFilterDateFrom(e.target.value)}
                data-testid="input-filter-date-from"
              />
            </div>
            <div>
              <Label className="text-sm text-muted-foreground">DATE TO</Label>
              <Input
                type="date"
                value={filterDateTo}
                onChange={(e) => setFilterDateTo(e.target.value)}
                data-testid="input-filter-date-to"
              />
            </div>
            <div>
              <Label className="text-sm text-muted-foreground">PARTY</Label>
              <Select value={filterPartyId} onValueChange={setFilterPartyId}>
                <SelectTrigger data-testid="select-filter-party">
                  <SelectValue placeholder="All Parties" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Parties</SelectItem>
                  {parties?.map((party) => (
                    <SelectItem key={party.id} value={String(party.id)}>{party.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-sm text-muted-foreground">MIX TYPE</Label>
              <Select value={filterMixType} onValueChange={setFilterMixType}>
                <SelectTrigger data-testid="select-filter-mix-type">
                  <SelectValue placeholder="All Types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  {mixTypes?.map(type => (
                    <SelectItem key={type.id} value={type.name}>{type.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-sm text-muted-foreground">VEHICLE NO</Label>
              <Select value={filterVehicle} onValueChange={setFilterVehicle}>
                <SelectTrigger data-testid="select-filter-vehicle">
                  <SelectValue placeholder="All Vehicles" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Vehicles</SelectItem>
                  {uniqueVehicles.map(vehicle => (
                    <SelectItem key={vehicle} value={vehicle}>{vehicle}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-sm text-muted-foreground">OWNER</Label>
              <Select value={filterOwner} onValueChange={setFilterOwner}>
                <SelectTrigger data-testid="select-filter-owner">
                  <SelectValue placeholder="All Owners" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Owners</SelectItem>
                  {uniqueOwners.map(owner => (
                    <SelectItem key={owner} value={owner}>{owner}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Totals Summary */}
      {dispatches && dispatches.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {isFiltered ? (
            <>
              <Card>
                <CardContent className="pt-4 pb-4">
                  <p className="text-sm text-muted-foreground mb-1">FILTERED DISPATCHES</p>
                  <p className="text-2xl font-bold" data-testid="text-filtered-count">{filteredTotals.count}</p>
                  <p className="text-sm text-muted-foreground">of {allTotals.count} total</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 pb-4">
                  <p className="text-sm text-muted-foreground mb-1">FILTERED LOAD (MT)</p>
                  <p className="text-2xl font-bold" data-testid="text-filtered-load">{filteredTotals.loadWeight.toFixed(3)}</p>
                  <p className="text-sm text-muted-foreground">of {allTotals.loadWeight.toFixed(3)} total</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 pb-4">
                  <p className="text-sm text-muted-foreground mb-1">FILTERED BITUMEN (MT)</p>
                  <p className="text-2xl font-bold" data-testid="text-filtered-bitumen">{filteredTotals.bitumen.toFixed(3)}</p>
                  <p className="text-sm text-muted-foreground">of {allTotals.bitumen.toFixed(3)} total</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 pb-4">
                  <p className="text-sm text-muted-foreground mb-1">FILTERED LDO (L)</p>
                  <p className="text-2xl font-bold" data-testid="text-filtered-ldo">{filteredTotals.ldo.toFixed(3)}</p>
                  <p className="text-sm text-muted-foreground">of {allTotals.ldo.toFixed(3)} total</p>
                </CardContent>
              </Card>
            </>
          ) : (
            <>
              <Card>
                <CardContent className="pt-4 pb-4">
                  <p className="text-sm text-muted-foreground mb-1">TOTAL DISPATCHES</p>
                  <p className="text-2xl font-bold" data-testid="text-total-count">{allTotals.count}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 pb-4">
                  <p className="text-sm text-muted-foreground mb-1">TOTAL LOAD (MT)</p>
                  <p className="text-2xl font-bold" data-testid="text-total-load">{allTotals.loadWeight.toFixed(3)}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 pb-4">
                  <p className="text-sm text-muted-foreground mb-1">TOTAL BITUMEN (MT)</p>
                  <p className="text-2xl font-bold" data-testid="text-total-bitumen">{allTotals.bitumen.toFixed(3)}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 pb-4">
                  <p className="text-sm text-muted-foreground mb-1">TOTAL LDO (L)</p>
                  <p className="text-2xl font-bold" data-testid="text-total-ldo">{allTotals.ldo.toFixed(3)}</p>
                </CardContent>
              </Card>
            </>
          )}
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteConfirmId !== null} onOpenChange={(open) => !open && setDeleteConfirmId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Delete</DialogTitle>
          </DialogHeader>
          <p>Are you sure you want to delete this dispatch? This will reverse the stock ledger entries.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmId(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => deleteConfirmId && deleteMutation.mutate(deleteConfirmId)} disabled={deleteMutation.isPending}>
              {deleteMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Truck className="w-5 h-5" />
            Dispatch Log
            {filteredDispatches.length > 0 && (
              <Badge variant="secondary">{filteredDispatches.length} records</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center p-8">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          ) : !filteredDispatches.length ? (
            <p className="text-muted-foreground text-center py-8">
              {dispatches?.length ? "No dispatches match the current filters." : "No dispatches recorded yet."}
            </p>
          ) : (
            <div className="space-y-6">
              {sortedDates.map((dateKey) => {
                const dayDispatches = groupedDispatches[dateKey].sort((a, b) => (b.time || "").localeCompare(a.time || ""));
                return (
                  <div key={dateKey}>
                    <h3 className="font-semibold text-lg mb-3 border-b pb-2">{format(new Date(dateKey), "EEEE, dd MMM yyyy")}</h3>
                    <div className="space-y-2">
                      {dayDispatches.map((dispatch) => {
                        const template = templates?.find(t => t.id === dispatch.mixTemplateId);
                        return (
                          <div key={dispatch.id} className="flex items-center justify-between p-4 rounded-lg bg-muted/50 hover-elevate">
                            <div className="flex-1 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-x-4 gap-y-2 text-sm">
                              <div>
                                <span className="text-muted-foreground text-sm block">Time</span>
                                <span className="font-medium">{dispatch.time || "-"}</span>
                              </div>
                              <div>
                                <span className="text-muted-foreground text-sm block">Truck</span>
                                <span className="font-medium">{dispatch.truckNumber}</span>
                                {dispatch.transportEquipmentId && (() => {
                                  const eq = equipmentList?.find(e => e.id === dispatch.transportEquipmentId);
                                  if (!eq) return null;
                                  const ownerInfo = eq.ownershipStatus === "hired" && eq.vendorName ? `HIRED: ${eq.vendorName}` : "HLC OWN";
                                  return (
                                    <span className="text-xs text-muted-foreground block">{eq.name}{eq.registrationNumber ? ` (${eq.registrationNumber})` : ""} — {ownerInfo}</span>
                                  );
                                })()}
                              </div>
                              <div>
                                <span className="text-muted-foreground text-sm block">Load</span>
                                <span className="font-medium">{dispatch.loadWeight} MT</span>
                              </div>
                              <div>
                                <span className="text-muted-foreground text-sm block">Mix</span>
                                <Badge variant="outline" className="text-xs">{template?.mixType || "-"}</Badge>
                              </div>
                              <div>
                                <span className="text-muted-foreground text-sm block">Party</span>
                                <span className="font-medium">{getPartyName(dispatch.partyId)}</span>
                              </div>
                              <div>
                                <span className="text-muted-foreground text-sm block">Site</span>
                                <span className="font-medium">{dispatch.deliveryLocation || "-"}</span>
                              </div>
                              <div>
                                <span className="text-muted-foreground text-sm block">Owner</span>
                                <span className="font-medium" data-testid={`text-owner-${dispatch.id}`}>{dispatch.ownerName || "-"}</span>
                              </div>
                              <div>
                                <span className="text-muted-foreground text-sm block">Driver</span>
                                <span className="font-medium" data-testid={`text-driver-${dispatch.id}`}>{dispatch.driverName || "-"}</span>
                              </div>
                              <div>
                                <span className="text-muted-foreground text-sm block">Bitumen (MT)</span>
                                <span className="font-medium">{dispatch.theoreticalBitumenQty?.toFixed(3) || "0"}</span>
                              </div>
                              <div>
                                <span className="text-muted-foreground text-sm block">LDO (L)</span>
                                <span className="font-medium">{dispatch.theoreticalLdoQty?.toFixed(3) || "0"}</span>
                              </div>
                              <div>
                                <span className="text-muted-foreground text-sm block">Tanks</span>
                                <span className="font-medium text-sm">B{dispatch.bitumenTankNumber || 1} / L{dispatch.ldoTankNumber || 2}</span>
                              </div>
                              {((dispatch.bitumenVariancePercent != null && Number(dispatch.bitumenVariancePercent) !== 0) ||
                                (dispatch.ldoVariancePercent != null && Number(dispatch.ldoVariancePercent) !== 0)) && (
                                <div className="flex items-center" title="Variance recorded — see Variance Report for details" data-testid={`indicator-variance-${dispatch.id}`}>
                                  <AlertTriangle className="w-4 h-4 text-amber-500" />
                                </div>
                              )}
                            </div>
                            <div className="flex items-center gap-1 ml-4">
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => handleEditClick(dispatch)}
                                data-testid={`button-edit-dispatch-${dispatch.id}`}
                              >
                                <Edit className="w-4 h-4" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => handleDeleteClick(dispatch.id)}
                                data-testid={`button-delete-dispatch-${dispatch.id}`}
                              >
                                <Trash2 className="w-4 h-4 text-destructive" />
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Owner-stock shortage confirmation — operator must explicitly OK borrowing from HLC */}
      <Dialog open={!!shortageInfo} onOpenChange={(o) => { if (!o) cancelHlcBorrow(); }}>
        <DialogContent className="max-w-lg" data-testid="dialog-stock-shortage">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
              <AlertTriangle className="w-5 h-5" />
              Owner stock is short
            </DialogTitle>
          </DialogHeader>
          {shortageInfo && (
            <div className="space-y-3 text-sm">
              <p>
                <span className="font-semibold">{shortageInfo.ownerPartyName}</span> does not have enough
                stock for this dispatch. The shortfall would have to be borrowed from{" "}
                <span className="font-semibold">{shortageInfo.fallbackPartyName || "HLC"}</span>.
              </p>
              <div className="rounded-md border bg-muted/40">
                <table className="w-full text-xs">
                  <thead className="border-b bg-muted/60">
                    <tr>
                      <th className="text-left p-2">Material</th>
                      <th className="text-right p-2">Required</th>
                      <th className="text-right p-2">Owner has</th>
                      <th className="text-right p-2 text-amber-700 dark:text-amber-400">Borrow from HLC</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shortageInfo.shortages.map((s) => (
                      <tr key={s.materialId} className="border-b last:border-0" data-testid={`row-shortage-${s.materialId}`}>
                        <td className="p-2 font-medium">{s.materialName}</td>
                        <td className="p-2 text-right tabular-nums">{s.required.toFixed(3)} {s.uom}</td>
                        <td className="p-2 text-right tabular-nums">{s.available.toFixed(3)} {s.uom}</td>
                        <td className="p-2 text-right tabular-nums font-semibold text-amber-700 dark:text-amber-400">
                          {s.shortfall.toFixed(3)} {s.uom}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-muted-foreground">
                Borrowed quantities will be tagged "(Borrowed from HLC)" in the stock ledger so they remain
                visible for later reconciliation. If this is wrong, cancel and check whether a recent
                receipt is missing for {shortageInfo.ownerPartyName}.
              </p>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={cancelHlcBorrow} data-testid="button-cancel-borrow">
              Cancel dispatch
            </Button>
            <Button
              onClick={confirmHlcBorrow}
              disabled={createMutation.isPending}
              className="bg-amber-600 hover:bg-amber-700 text-white"
              data-testid="button-confirm-borrow"
            >
              {createMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Borrow from HLC and save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
