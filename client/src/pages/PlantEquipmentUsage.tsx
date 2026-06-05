import { useState, useEffect, useMemo, useCallback } from "react";
import { AutoSaveIndicator } from "@/components/AutoSaveIndicator";
import { DraftRestoredBanner } from "@/components/DraftRestoredBanner";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";
import { useOrigin } from "@/hooks/use-origin";
import { useFormDraft } from "@/hooks/use-form-draft";
import { Checkbox } from "@/components/ui/checkbox";
import { ChevronLeft, ChevronRight, Plus, Gauge, Loader2, Edit, Trash2, Download, Printer, ArrowRightLeft } from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
import { useFeatureFlags } from "@/lib/featureFlags";
import { format } from "date-fns";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { EquipmentMasterType, EquipmentUsage, Site } from "@shared/schema";
import { METER_TYPES } from "@shared/schema";

export default function PlantEquipmentUsage() {
  const { toast } = useToast();
  const { sectionCan, isAdmin } = useAuth();
  const { companyName, logoFile } = useFeatureFlags();
  const canCreate = sectionCan("plant_equipment", "create");
  const canEdit = sectionCan("plant_equipment", "edit");
  const canDelete = isAdmin;
  const canExport = sectionCan("plant_equipment", "view_reports");
  const { getPlantBackLink } = useOrigin();
  const backLink = getPlantBackLink({ defaultTab: "operations" });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingUsage, setEditingUsage] = useState<EquipmentUsage | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [equipmentId, setEquipmentId] = useState<string>("");
  const [openingReading, setOpeningReading] = useState("");
  const [closingReading, setClosingReading] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [openingDiesel, setOpeningDiesel] = useState("");
  const [dieselIssued, setDieselIssued] = useState("");
  const [dieselIncluded, setDieselIncluded] = useState(false);
  const [dieselSource, setDieselSource] = useState<string>("plant_stock");
  const [fuelStation, setFuelStation] = useState("");
  const [billNumber, setBillNumber] = useState("");
  const [amountPaid, setAmountPaid] = useState("");
  const [siteName, setSiteName] = useState("");
  const [workingPlant, setWorkingPlant] = useState("HMP PLANT");
  const [numberOfTrips, setNumberOfTrips] = useState("");
  const [tripDistance, setTripDistance] = useState("");
  const [tripBasedEntry, setTripBasedEntry] = useState(false);
  const [entryType, setEntryType] = useState<string>("time_meter");
  const [dieselBalanceInTank, setDieselBalanceInTank] = useState("");
  const [dieselBalanceConfirmed, setDieselBalanceConfirmed] = useState(false);
  const [remarks, setRemarks] = useState("");
  const [previousDieselBalance, setPreviousDieselBalance] = useState<number | null>(null);
  const [isLoadingBalance, setIsLoadingBalance] = useState(false);
  const [userModifiedOpening, setUserModifiedOpening] = useState(false);
  const [hireAmount, setHireAmount] = useState("");
  const [shiftFrom, setShiftFrom] = useState("");
  const [shiftTo, setShiftTo] = useState("");
  const [transportEquipmentId, setTransportEquipmentId] = useState("");
  const [transportDistance, setTransportDistance] = useState("");
  
  const [newEquipmentDialogOpen, setNewEquipmentDialogOpen] = useState(false);
  const [newEquipmentName, setNewEquipmentName] = useState("");
  const [newEquipmentRegNo, setNewEquipmentRegNo] = useState("");
  const [newEquipmentMeterType, setNewEquipmentMeterType] = useState<string>("hour_meter");
  const [newEquipmentNorm, setNewEquipmentNorm] = useState("");
  const [newEquipmentOwnership, setNewEquipmentOwnership] = useState<string>("hired");
  const [newEquipmentVendor, setNewEquipmentVendor] = useState("");

  interface EquipmentFormData {
    date: string;
    equipmentId: string;
    openingReading: string;
    closingReading: string;
    startTime: string;
    endTime: string;
    openingDiesel: string;
    dieselIssued: string;
    dieselIncluded: boolean;
    dieselSource: string;
    fuelStation: string;
    billNumber: string;
    amountPaid: string;
    siteName: string;
    workingPlant: string;
    numberOfTrips: string;
    tripDistance: string;
    tripBasedEntry: boolean;
    entryType: string;
    dieselBalanceInTank: string;
    dieselBalanceConfirmed: boolean;
    remarks: string;
    hireAmount: string;
    shiftFrom: string;
    shiftTo: string;
    transportEquipmentId: string;
    transportDistance: string;
  }

  const formData = useMemo<EquipmentFormData>(() => ({
    date, equipmentId, openingReading, closingReading, startTime, endTime, openingDiesel, dieselIssued, dieselIncluded, dieselSource, fuelStation, billNumber, amountPaid, siteName, workingPlant, numberOfTrips, tripDistance, tripBasedEntry, entryType, dieselBalanceInTank, dieselBalanceConfirmed, remarks, hireAmount, shiftFrom, shiftTo, transportEquipmentId, transportDistance
  }), [date, equipmentId, openingReading, closingReading, startTime, endTime, openingDiesel, dieselIssued, dieselIncluded, dieselSource, fuelStation, billNumber, amountPaid, siteName, workingPlant, numberOfTrips, tripDistance, tripBasedEntry, entryType, dieselBalanceInTank, dieselBalanceConfirmed, remarks, hireAmount, shiftFrom, shiftTo, transportEquipmentId, transportDistance]);

  const [draftRestored, setDraftRestored] = useState(false);

  const handleRestoreDraft = useCallback((data: EquipmentFormData) => {
    setDate(data.date);
    setEquipmentId(data.equipmentId);
    setOpeningReading(data.openingReading);
    setClosingReading(data.closingReading);
    setStartTime(data.startTime);
    setEndTime(data.endTime);
    setOpeningDiesel(data.openingDiesel);
    setDieselIssued(data.dieselIssued);
    setDieselIncluded(data.dieselIncluded || false);
    setDieselSource(data.dieselSource ?? "plant_stock");
    setFuelStation(data.fuelStation ?? "");
    setBillNumber(data.billNumber ?? "");
    setAmountPaid(data.amountPaid ?? "");
    setSiteName(data.siteName || "");
    setWorkingPlant(data.workingPlant || "HMP PLANT");
    setNumberOfTrips(data.numberOfTrips || "");
    setTripDistance(data.tripDistance || "");
    setTripBasedEntry(data.tripBasedEntry || false);
    setEntryType(data.entryType ?? "time_meter");
    setDieselBalanceInTank(data.dieselBalanceInTank ?? "");
    setDieselBalanceConfirmed(data.dieselBalanceConfirmed || false);
    setRemarks(data.remarks);
    setHireAmount(data.hireAmount ?? "");
    setShiftFrom(data.shiftFrom ?? "");
    setShiftTo(data.shiftTo ?? "");
    setTransportEquipmentId(data.transportEquipmentId ?? "");
    setTransportDistance(data.transportDistance ?? "");
    setDraftRestored(true);
  }, []);

  const { clearDraft, lastSavedAt: draftLastSavedAt, draftSavedAt: equipmentDraftSavedAt } = useFormDraft<EquipmentFormData>(
    "plant-equipment-usage-new",
    formData,
    handleRestoreDraft,
    { enabled: dialogOpen && !editingUsage }
  );

  // Auto-dismiss the "Draft restored" banner after 8 seconds.
  useEffect(() => {
    if (!draftRestored) return;
    const t = setTimeout(() => setDraftRestored(false), 8000);
    return () => clearTimeout(t);
  }, [draftRestored]);

  const FILTER_SESSION_KEY = "plant-equipment-usage-filter";

  const [filterDateFrom, setFilterDateFrom] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("dateFrom")) return params.get("dateFrom")!;
    try {
      const stored = sessionStorage.getItem(FILTER_SESSION_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as { dateFrom?: string; dateTo?: string };
        return parsed.dateFrom || "";
      }
    } catch { /* ignore */ }
    return "";
  });
  const [filterDateTo, setFilterDateTo] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("dateTo")) return params.get("dateTo")!;
    try {
      const stored = sessionStorage.getItem(FILTER_SESSION_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as { dateFrom?: string; dateTo?: string };
        return parsed.dateTo || "";
      }
    } catch { /* ignore */ }
    return "";
  });
  const [filterEquipmentId, setFilterEquipmentId] = useState("all");
  const [filterWorkingPlant, setFilterWorkingPlant] = useState<string>(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("workingPlant")) return params.get("workingPlant")!;
    try {
      const stored = sessionStorage.getItem(FILTER_SESSION_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as { dateFrom?: string; dateTo?: string; workingPlant?: string };
        return parsed.workingPlant || "all";
      }
    } catch { /* ignore */ }
    return "all";
  });

  useEffect(() => {
    try {
      sessionStorage.setItem(FILTER_SESSION_KEY, JSON.stringify({ dateFrom: filterDateFrom, dateTo: filterDateTo, workingPlant: filterWorkingPlant }));
    } catch { /* ignore */ }
  }, [filterDateFrom, filterDateTo, filterWorkingPlant]);


  const { data: usage, isLoading } = useQuery<EquipmentUsage[]>({
    queryKey: ["/api/plant-module/equipment-usage"],
  });

  // Read plant context from URL (passed by Plant.tsx OperationsTab via ?plant=...)
  const contextPlantName = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("plant") || null;
  }, []);

  // When contextPlantName is set, allow operator to override and show all plants' equipment
  const [showAllPlantEquipment, setShowAllPlantEquipment] = useState(false);

  // If plant context is set and override not active, filter the API call to plant + shared equipment
  const effectivePlantFilter = contextPlantName && !showAllPlantEquipment ? contextPlantName : undefined;

  const { data: equipment } = useQuery<EquipmentMasterType[]>({
    queryKey: ["/api/plant-module/equipment", "all", effectivePlantFilter ?? "all"],
    queryFn: async () => {
      const url = effectivePlantFilter
        ? `/api/plant-module/equipment?includeInactive=true&plantName=${encodeURIComponent(effectivePlantFilter)}`
        : "/api/plant-module/equipment?includeInactive=true";
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  // When plant context is set, sort within results: own-plant first, then shared (null), then others
  const activeEquipment = useMemo(() => {
    const active = equipment?.filter(e => e.isActive === 1) || [];
    if (!contextPlantName) return active;
    return [...active].sort((a, b) => {
      const aPlant = (a as any).plantName as string | null;
      const bPlant = (b as any).plantName as string | null;
      const aScore = aPlant === contextPlantName ? 0 : aPlant === null ? 1 : 2;
      const bScore = bPlant === contextPlantName ? 0 : bPlant === null ? 1 : 2;
      return aScore - bScore;
    });
  }, [equipment, contextPlantName]);

  const { data: sitesList } = useQuery<Site[]>({
    queryKey: ["/api/sites"],
  });

  const createEquipmentMutation = useMutation({
    mutationFn: async (data: { name: string; registrationNumber?: string; meterType: string; consumptionNorm?: number; ownership?: string; vendorName?: string }) => {
      const response = await apiRequest("POST", "/api/plant-module/equipment", data);
      return response.json() as Promise<EquipmentMasterType>;
    },
    onSuccess: (newEquipment: EquipmentMasterType) => {
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/equipment"] });
      setEquipmentId(String(newEquipment.id));
      setNewEquipmentDialogOpen(false);
      resetNewEquipmentForm();
      toast({ title: "Equipment added successfully" });
    },
    onError: () => {
      toast({ title: "Failed to add equipment", variant: "destructive" });
    },
  });

  const resetNewEquipmentForm = () => {
    setNewEquipmentName("");
    setNewEquipmentRegNo("");
    setNewEquipmentMeterType("hour_meter");
    setNewEquipmentNorm("");
    setNewEquipmentOwnership("hired");
    setNewEquipmentVendor("");
  };

  const createMutation = useMutation({
    mutationFn: (data: any) =>
      apiRequest("POST", "/api/plant-module/equipment-usage", data),
    onSuccess: () => {
      clearDraft();
      setDraftRestored(false);
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/equipment-usage"] });
      setDialogOpen(false);
      resetForm();
      toast({ title: "Equipment usage recorded successfully" });
    },
    onError: () => {
      toast({ title: "Failed to record equipment usage. Please try again.", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) =>
      apiRequest("PUT", `/api/plant-module/equipment-usage/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/equipment-usage"] });
      setDialogOpen(false);
      setEditingUsage(null);
      resetForm();
      toast({ title: "Equipment usage updated successfully" });
    },
    onError: (err: Error) => {
      if (err.message.startsWith("423")) {
        toast({
          title: "Record is locked",
          description: "Click the Unlock button next to this entry first, then save.",
          variant: "destructive",
        });
      } else {
        toast({ title: "Failed to update equipment usage. Please try again.", variant: "destructive" });
      }
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) =>
      apiRequest("DELETE", `/api/plant-module/equipment-usage/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/equipment-usage"] });
      setDeleteConfirmId(null);
      toast({ title: "Equipment usage deleted successfully" });
    },
  });

  const resetForm = () => {
    setDate(format(new Date(), "yyyy-MM-dd"));
    setEquipmentId("");
    setOpeningReading("");
    setClosingReading("");
    setStartTime("");
    setEndTime("");
    setOpeningDiesel("");
    setDieselIssued("");
    setDieselIncluded(false);
    setDieselSource("plant_stock");
    setFuelStation("");
    setBillNumber("");
    setAmountPaid("");
    setSiteName("");
    setWorkingPlant("HMP PLANT");
    setNumberOfTrips("");
    setTripDistance("");
    setTripBasedEntry(false);
    setEntryType("time_meter");
    setDieselBalanceInTank("");
    setDieselBalanceConfirmed(false);
    setRemarks("");
    setHireAmount("");
    setEditingUsage(null);
    setPreviousDieselBalance(null);
    setIsLoadingBalance(false);
    setUserModifiedOpening(false);
    setShiftFrom("");
    setShiftTo("");
    setTransportEquipmentId("");
    setTransportDistance("");
  };

  const openEditDialog = (entry: EquipmentUsage) => {
    setEditingUsage(entry);
    setDate(entry.date);
    setEquipmentId(String(entry.equipmentId));
    setOpeningReading(entry.openingReading ? String(entry.openingReading) : "");
    setClosingReading(entry.closingReading ? String(entry.closingReading) : "");
    setStartTime((entry as any).startTime || "");
    setEndTime((entry as any).endTime || "");
    setOpeningDiesel((entry as any).openingDiesel ? String((entry as any).openingDiesel) : "0");
    setDieselIssued(entry.dieselIssued ? String(entry.dieselIssued) : "");
    setDieselIncluded((entry as any).dieselIncluded || false);
    setDieselSource((entry as any).dieselSource ?? "plant_stock");
    setFuelStation((entry as any).fuelStation ?? "");
    setBillNumber((entry as any).billNumber ?? "");
    setAmountPaid((entry as any).amountPaid ? String((entry as any).amountPaid) : "");
    const rawSiteName = (entry as any).siteName || "";
    if (rawSiteName === "HMP PLANT" || rawSiteName === "RMC PLANT") {
      setWorkingPlant(rawSiteName);
      setSiteName("");
    } else if (rawSiteName) {
      setWorkingPlant("OTHER");
      setSiteName(rawSiteName);
    } else {
      setWorkingPlant("HMP PLANT");
      setSiteName("");
    }
    setNumberOfTrips((entry as any).numberOfTrips ? String((entry as any).numberOfTrips) : "");
    setTripDistance((entry as any).tripDistance ? String((entry as any).tripDistance) : "");
    setTripBasedEntry((entry as any).tripBasedEntry === true);
    const loadedEntryType = (entry as any).entryType ?? ((entry as any).tripBasedEntry === true ? "trip_based" : "time_meter");
    setEntryType(loadedEntryType);
    setDieselBalanceInTank((entry as any).dieselBalanceInTank != null ? String((entry as any).dieselBalanceInTank) : "");
    setDieselBalanceConfirmed((entry as any).dieselBalanceConfirmed === true);
    setRemarks(entry.remarks || "");
    setHireAmount((entry as any).hireAmount != null ? String((entry as any).hireAmount) : "");
    setPreviousDieselBalance((entry as any).openingDiesel || 0);
    setUserModifiedOpening(true);
    setShiftFrom((entry as any).shiftFrom || "");
    setShiftTo((entry as any).shiftTo || "");
    setTransportEquipmentId((entry as any).transportEquipmentId ? String((entry as any).transportEquipmentId) : "");
    setTransportDistance((entry as any).transportDistance ? String((entry as any).transportDistance) : "");
    setDialogOpen(true);
  };

  const handleEquipmentChange = async (value: string) => {
    setEquipmentId(value);
    setUserModifiedOpening(false);
    const selectedEquip = activeEquipment.find(e => e.id === Number(value));
    if (selectedEquip && (selectedEquip as any).ownership !== "hired" && entryType !== "shifting") {
      setEntryType("time_meter");
      setTripBasedEntry(false);
      setNumberOfTrips("");
      setTripDistance("");
    }
    
    if (value && !editingUsage) {
      setIsLoadingBalance(true);
      try {
        const res = await fetch(`/api/plant-module/equipment-usage/previous-balance/${value}`);
        if (res.ok) {
          const data = await res.json();
          setPreviousDieselBalance(data.previousBalance);
          setOpeningDiesel(String(data.previousBalance));
          // Auto-populate opening reading from previous closing reading
          if (data.previousClosingReading) {
            setOpeningReading(String(data.previousClosingReading));
          }
        } else {
          setPreviousDieselBalance(0);
          setOpeningDiesel("0");
        }
      } catch {
        setPreviousDieselBalance(0);
        setOpeningDiesel("0");
      }
      setIsLoadingBalance(false);
    }
  };
  
  const handleOpeningDieselChange = (value: string) => {
    setOpeningDiesel(value);
    setUserModifiedOpening(true);
  };

  const handleSubmit = () => {
    if (entryType === "shifting") {
      if (!equipmentId || !shiftFrom || !shiftTo || !transportEquipmentId) {
        toast({ title: "Please fill in equipment, from, to, and transport vehicle", variant: "destructive" });
        return;
      }
      const data = {
        date,
        equipmentId: parseInt(equipmentId),
        entryType: "shifting",
        shiftFrom: shiftFrom.toUpperCase(),
        shiftTo: shiftTo.toUpperCase(),
        transportEquipmentId: parseInt(transportEquipmentId),
        transportDistance: transportDistance ? parseFloat(transportDistance) : null,
        openingReading: null,
        closingReading: null,
        startTime: null,
        endTime: null,
        numberOfTrips: null,
        tripDistance: null,
        tripBasedEntry: false,
        openingDiesel: null,
        dieselIssued: null,
        dieselIncluded: false,
        dieselSource: "contractor",
        fuelStation: null,
        billNumber: null,
        amountPaid: null,
        hireAmount: hireAmount ? parseFloat(hireAmount) : null,
        siteName: workingPlant === "OTHER" ? (siteName.toUpperCase() || null) : workingPlant,
        dieselBalanceInTank: null,
        dieselBalanceConfirmed: false,
        remarks: remarks.toUpperCase(),
      };
      if (editingUsage) {
        updateMutation.mutate({ id: editingUsage.id, data });
      } else {
        createMutation.mutate(data);
      }
      return;
    }

    const hasMeterReading = openingReading && closingReading;
    const hasTimeEntry = startTime && endTime;
    const hasTripEntry = (entryType === "trip_based" || tripBasedEntry) && numberOfTrips && tripDistance;
    const hasPartialEntry = openingReading && !closingReading && !hasTimeEntry && !hasTripEntry;
    
    if (!equipmentId || (!hasMeterReading && !hasTimeEntry && !hasTripEntry && !hasPartialEntry)) {
      toast({ title: "Please provide at least an opening reading, or complete meter/time/trip details", variant: "destructive" });
      return;
    }
    
    const effectiveDieselSource = dieselIncluded ? "contractor" : dieselSource;
    
    const data = {
      date,
      equipmentId: parseInt(equipmentId),
      entryType,
      openingReading: openingReading ? parseFloat(openingReading) : null,
      closingReading: closingReading ? parseFloat(closingReading) : null,
      startTime: startTime || null,
      endTime: endTime || null,
      numberOfTrips: (entryType === "trip_based" || tripBasedEntry) && numberOfTrips ? parseInt(numberOfTrips) : null,
      tripDistance: (entryType === "trip_based" || tripBasedEntry) && tripDistance ? parseFloat(tripDistance) : null,
      tripBasedEntry: entryType === "trip_based" || tripBasedEntry,
      openingDiesel: effectiveDieselSource === "contractor" ? null : (openingDiesel ? parseFloat(openingDiesel) : 0),
      dieselIssued: effectiveDieselSource === "contractor" ? null : (dieselIssued ? parseFloat(dieselIssued) : 0),
      dieselIncluded,
      dieselSource: effectiveDieselSource,
      fuelStation: effectiveDieselSource === "direct_purchase" ? fuelStation.toUpperCase() : null,
      billNumber: effectiveDieselSource === "direct_purchase" ? billNumber.toUpperCase() : null,
      amountPaid: effectiveDieselSource === "direct_purchase" && amountPaid ? parseFloat(amountPaid) : null,
      hireAmount: ["hourly", "daily", "monthly", "trip_based"].includes(entryType) && hireAmount ? parseFloat(hireAmount) : null,
      siteName: workingPlant === "OTHER" ? (siteName.toUpperCase() || null) : workingPlant,
      dieselBalanceInTank: effectiveDieselSource !== "contractor" && dieselBalanceInTank !== "" ? parseFloat(dieselBalanceInTank) : null,
      dieselBalanceConfirmed: effectiveDieselSource !== "contractor" && dieselBalanceInTank !== "" ? dieselBalanceConfirmed : false,
      remarks: remarks.toUpperCase(),
    };

    if (editingUsage) {
      updateMutation.mutate({ id: editingUsage.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const handleEditClick = (entry: EquipmentUsage) => {
    openEditDialog(entry);
  };

  const handleDeleteClick = (usageId: number) => {
    setDeleteConfirmId(usageId);
  };

  const handleExportExcelClick = () => {
    exportToExcel();
  };

  const handleExportPdfClick = () => {
    exportToPdf();
  };

  const handlePrintClick = () => {
    handlePrint();
  };

  const handleCompleteClick = (entry: EquipmentUsage) => {
    openEditDialog(entry);
  };

  const isPartialEntry = (entry: EquipmentUsage) => {
    return entry.openingReading != null && entry.closingReading == null && !(entry as any).tripBasedEntry;
  };

  const selectedEquipment = equipment?.find(e => e.id === parseInt(equipmentId));
  
  // Calculate runtime from meter readings or time entry (meter takes priority)
  const calculateTimeHours = (start?: string, end?: string) => {
    if (!start || !end) return 0;
    try {
      const [startHour, startMin] = start.split(':').map(Number);
      const [endHour, endMin] = end.split(':').map(Number);
      const startMins = startHour * 60 + startMin;
      const endMins = endHour * 60 + endMin;
      const diff = endMins - startMins;
      return diff > 0 ? diff / 60 : 0;
    } catch {
      return 0;
    }
  };
  
  const meterRuntime = openingReading && closingReading ? parseFloat(closingReading) - parseFloat(openingReading) : 0;
  const timeHours = calculateTimeHours(startTime, endTime);
  const tripTotalKm = numberOfTrips && tripDistance ? parseInt(numberOfTrips) * parseFloat(tripDistance) * 2 : 0;
  
  // Average speed assumption for converting L/hr to L/km (for trip-based calculation)
  const AVERAGE_SPEED_KMPH = 25; // km/hr typical for heavy vehicles/tankers
  const isHourMeter = selectedEquipment?.meterType === "hour_meter";
  
  // For odometer equipment using time entry, convert hours to estimated km
  // For hour_meter equipment, time directly gives hours
  const timeRuntime = isHourMeter ? timeHours : timeHours * AVERAGE_SPEED_KMPH;
  const runtime = meterRuntime > 0 ? meterRuntime : timeRuntime;
  
  // Expected diesel calculation:
  // If tripBasedEntry is checked, ALWAYS use trip-based calculation (even if meter/time exists)
  // For trip-based: convert L/hr norm to L/km using average speed
  // L/km = L/hr ÷ km/hr
  const norm = selectedEquipment?.consumptionNorm || 0;
  
  let expectedDiesel = 0;
  if (tripBasedEntry && tripTotalKm > 0) {
    // Trip-based: convert L/hr to L/km if equipment has hour-based norm
    const normPerKm = isHourMeter ? norm / AVERAGE_SPEED_KMPH : norm;
    expectedDiesel = tripTotalKm * normPerKm;
  } else if (runtime > 0) {
    // Meter/time based
    expectedDiesel = runtime * norm;
  }

  const filteredUsage = usage?.filter(u => {
    if (filterDateFrom && u.date < filterDateFrom) return false;
    if (filterDateTo && u.date > filterDateTo) return false;
    if (filterEquipmentId !== "all" && u.equipmentId !== parseInt(filterEquipmentId)) return false;
    if (filterWorkingPlant !== "all") {
      const loc = (u as any).siteName as string | null;
      if (filterWorkingPlant === "HMP PLANT" && loc !== "HMP PLANT") return false;
      if (filterWorkingPlant === "RMC PLANT" && loc !== "RMC PLANT") return false;
      if (filterWorkingPlant === "other" && (loc === "HMP PLANT" || loc === "RMC PLANT")) return false;
    }
    return true;
  }) || [];

  // Calculate totals for filtered data (exclude entries where dieselIncluded = true)
  const dieselTotals = useMemo(() => {
    return filteredUsage
      .filter(entry => !(entry as any).dieselIncluded)
      .reduce((acc, entry) => ({
        totalIssued: acc.totalIssued + (entry.dieselIssued || 0),
        totalExpected: acc.totalExpected + (entry.expectedDiesel || 0),
        entriesCount: acc.entriesCount + 1,
      }), { totalIssued: 0, totalExpected: 0, entriesCount: 0 });
  }, [filteredUsage]);

  const groupedUsage = filteredUsage.reduce((acc, entry) => {
    const dateKey = entry.date;
    if (!acc[dateKey]) acc[dateKey] = [];
    acc[dateKey].push(entry);
    return acc;
  }, {} as Record<string, EquipmentUsage[]>);

  const sortedDates = Object.keys(groupedUsage).sort((a, b) => new Date(b).getTime() - new Date(a).getTime());

  // Build filename with date range and filters
  const buildFilename = (extension: string) => {
    const timestamp = format(new Date(), "yyyyMMdd_HHmm");
    const fromDate = filterDateFrom || "All";
    const toDate = filterDateTo || "All";
    const equipFilter = filterEquipmentId !== "all" 
      ? equipment?.find(e => e.id === parseInt(filterEquipmentId))?.name?.replace(/\s+/g, '') || ""
      : "";
    const filters = equipFilter ? `_${equipFilter}` : "";
    return `SiteLog_Plant_EquipmentUsage_${fromDate}_to_${toDate}${filters}_${timestamp}.${extension}`;
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

  const getExportData = () => {
    return filteredUsage.map(entry => {
      const equip = equipment?.find(e => e.id === entry.equipmentId);
      const equipName = equip?.name || "Unknown";
      const regNo = (equip as any)?.registrationNumber || "-";
      const ownership = !equip
        ? "-"
        : (equip as any).ownership === "hired"
          ? `HIRED${(equip as any)?.vendorName ? `: ${(equip as any).vendorName}` : ""}`
          : "HLC OWN";
      const meterType = equip?.meterType || "hour_meter";
      const norm = equip?.consumptionNorm;
      const normLabel = norm != null ? `${norm} ${meterType === "hour_meter" ? "L/hr" : "L/km"}` : "-";

      if ((entry as any).entryType === "shifting") {
        const tEquip = equipment?.find(e => e.id === (entry as any).transportEquipmentId);
        const transportName = tEquip
          ? `${tEquip.name}${(tEquip as any).registrationNumber ? ` (${(tEquip as any).registrationNumber})` : ""}`
          : "-";
        return {
          Date: entry.date,
          Equipment: equipName,
          "Reg#": regNo,
          Ownership: ownership,
          "Entry Type": "MOBILIZATION",
          "Time / Meter": `${(entry as any).shiftFrom || "?"} → ${(entry as any).shiftTo || "?"}`,
          "Runtime": (entry as any).transportDistance ? `${(entry as any).transportDistance} km` : "-",
          "Diesel Issued (L)": "-",
          "Consumed (L)": "-",
          "Efficiency": "-",
          "Norm": "-",
          "Transport Vehicle (Mobilization)": transportName,
          Remarks: entry.remarks || "",
        };
      }

      const isTripBased = (entry as any).entryType === "trip_based" || (entry as any).tripBasedEntry;
      const hasMeterReading = entry.openingReading != null && entry.closingReading != null;
      const hasTime = (entry as any).startTime && (entry as any).endTime;

      let timeMeterCell = "-";
      if (isTripBased && (entry as any).numberOfTrips) {
        timeMeterCell = `${(entry as any).numberOfTrips} trips × ${(entry as any).tripDistance || "?"} km`;
      } else if (hasMeterReading) {
        timeMeterCell = `${entry.openingReading} → ${entry.closingReading}`;
      } else if (hasTime) {
        timeMeterCell = `${(entry as any).startTime} → ${(entry as any).endTime}`;
      } else if (entry.openingReading != null) {
        timeMeterCell = `${entry.openingReading} → (pending)`;
      }

      const runtime = entry.hoursOrKmRun ?? (isTripBased ? (entry as any).totalKm : null);
      const runtimeUnit = isTripBased ? "km" : meterType === "hour_meter" ? "hrs" : "km";
      const runtimeLabel = runtime != null ? `${runtime.toFixed(3)} ${runtimeUnit}` : "-";

      const openingDieselVal = (entry as any).openingDiesel ?? 0;
      const dieselIssuedVal = entry.dieselIssued ?? 0;
      const isDieselIncluded = (entry as any).dieselIncluded;
      // Match inline view: actual consumption = opening + issued - closing when closing is tracked
      const closingDieselEntry = (entry as any).closingDiesel;
      const consumed = closingDieselEntry != null
        ? Math.max(0, openingDieselVal + dieselIssuedVal - closingDieselEntry)
        : (entry.expectedDiesel ?? 0);

      let efficiencyLabel = "-";
      if (!isPartialEntry(entry) && !isDieselIncluded && runtime && runtime > 0 && consumed > 0) {
        const effVal = consumed / runtime;
        const effUnit = isTripBased ? "L/km" : meterType === "hour_meter" ? "L/hr" : "L/km";
        efficiencyLabel = `${effVal.toFixed(3)} ${effUnit}`;
      }

      const entryTypeLabel = ((entry as any).entryType || "time_meter").replace(/_/g, " ").toUpperCase();

      return {
        Date: entry.date,
        Equipment: equipName,
        "Reg#": regNo,
        Ownership: ownership,
        "Entry Type": entryTypeLabel,
        "Time / Meter": timeMeterCell,
        "Runtime": runtimeLabel,
        "Diesel Issued (L)": dieselIssuedVal > 0 ? dieselIssuedVal.toFixed(3) : ((entry as any).dieselIncluded ? "CONTRACTOR" : "-"),
        "Consumed (L)": consumed > 0 ? consumed.toFixed(3) : "-",
        "Efficiency": efficiencyLabel,
        "Norm": normLabel,
        "Transport Vehicle (Mobilization)": "-",
        Remarks: entry.remarks || "",
      };
    });
  };

  const exportToExcel = async () => {
    try {
      const data = getExportData();
      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Equipment Usage");

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

  const exportToPdf = async () => {
    try {
      const data = getExportData();
      const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
      doc.setFontSize(16);
      doc.text("Equipment Usage Report", 14, 15);
      doc.setFontSize(10);
      doc.text(`Generated: ${format(new Date(), "dd MMM yyyy HH:mm")}`, 14, 22);
      if (filterDateFrom || filterDateTo) {
        doc.text(`Date Range: ${filterDateFrom || "Start"} to ${filterDateTo || "End"}`, 14, 28);
      }
      
      autoTable(doc, {
        startY: filterDateFrom || filterDateTo ? 34 : 28,
        head: [["Date", "Equipment", "Reg#", "Ownership", "Entry Type", "Time / Meter", "Runtime", "Issued (L)", "Consumed (L)", "Efficiency", "Norm", "Remarks"]],
        body: data.map(row => [
          row.Date,
          row.Equipment,
          row["Reg#"],
          row.Ownership,
          row["Entry Type"],
          row["Time / Meter"],
          row["Runtime"],
          row["Diesel Issued (L)"],
          row["Consumed (L)"],
          row["Efficiency"],
          row["Norm"],
          row.Remarks,
        ]),
        styles: { fontSize: 7 },
        headStyles: { fillColor: [41, 128, 185] },
        columnStyles: {
          0: { cellWidth: 20 },
          1: { cellWidth: 28 },
          2: { cellWidth: 18 },
          3: { cellWidth: 22 },
          4: { cellWidth: 20 },
          5: { cellWidth: 30 },
          6: { cellWidth: 18 },
          7: { cellWidth: 18 },
          8: { cellWidth: 18 },
          9: { cellWidth: 18 },
          10: { cellWidth: 16 },
        },
        margin: { left: 10, right: 10 },
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
    const data = getExportData();
    const printContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Equipment Usage Report</title>
          <style>
            @page { size: A4 landscape; margin: 10mm; }
            * { box-sizing: border-box; }
            body { font-family: Arial, sans-serif; padding: 0; margin: 0; font-size: 10px; }
            .header { margin-bottom: 10px; }
            h1 { color: #333; margin: 0 0 4px 0; font-size: 15px; }
            .date { color: #666; margin: 0; font-size: 9px; }
            table { width: 100%; border-collapse: collapse; margin-top: 8px; page-break-inside: auto; }
            tr { page-break-inside: avoid; page-break-after: auto; }
            th, td { border: 1px solid #ccc; padding: 4px 3px; text-align: left; font-size: 8px; }
            th { background-color: #f0f0f0; font-weight: bold; }
            tr:nth-child(even) { background-color: #fafafa; }
            @media print {
              body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            }
          </style>
        </head>
        <body>
          <div class="company-header" style="text-align: center; border-bottom: 2px solid #333; padding-bottom: 10px; margin-bottom: 10px;">
            <img src="${window.location.origin}/${logoFile}" style="height: 45px; margin-bottom: 4px;" onerror="this.style.display='none'" />
            <h2 style="margin: 0; font-size: 13px; font-weight: bold;">${companyName}</h2>
          </div>
          <div class="header">
            <h1>Equipment Usage Report</h1>
            <p class="date">Generated: ${format(new Date(), "dd MMM yyyy HH:mm")}${filterDateFrom || filterDateTo ? ` | Range: ${filterDateFrom || "Start"} to ${filterDateTo || "End"}` : ""}</p>
          </div>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Equipment</th>
                <th>Reg#</th>
                <th>Ownership</th>
                <th>Entry Type</th>
                <th>Time / Meter</th>
                <th>Runtime</th>
                <th>Issued (L)</th>
                <th>Consumed (L)</th>
                <th>Efficiency</th>
                <th>Norm</th>
                <th>Remarks</th>
              </tr>
            </thead>
            <tbody>
              ${data.map(row => `
                <tr>
                  <td>${row.Date}</td>
                  <td>${row.Equipment}</td>
                  <td>${row["Reg#"]}</td>
                  <td>${row.Ownership}</td>
                  <td>${row["Entry Type"]}</td>
                  <td>${row["Time / Meter"]}</td>
                  <td>${row["Runtime"]}</td>
                  <td>${row["Diesel Issued (L)"]}</td>
                  <td>${row["Consumed (L)"]}</td>
                  <td>${row["Efficiency"]}</td>
                  <td>${row["Norm"]}</td>
                  <td>${row.Remarks}</td>
                </tr>
              `).join('')}
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
    setTimeout(() => {
      if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
    }, 30000);
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
            <h1 className="text-2xl font-bold">Equipment Usage</h1>
            <p className="text-muted-foreground">Track meter readings and fuel consumption</p>
          </div>
        </div>
        <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) { resetForm(); setDraftRestored(false); } }}>
          {canCreate && (
            <DialogTrigger asChild>
              <Button className="gap-2" data-testid="button-add-usage">
                <Plus className="w-4 h-4" /> New Entry
              </Button>
            </DialogTrigger>
          )}
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-3">
                {editingUsage ? "Edit Equipment Usage" : "Record Equipment Usage"}
                {!editingUsage && <AutoSaveIndicator lastSavedAt={draftLastSavedAt} />}
              </DialogTitle>
            </DialogHeader>
            <DraftRestoredBanner
              show={draftRestored && !editingUsage}
              draftSavedAt={equipmentDraftSavedAt}
              onDismiss={() => setDraftRestored(false)}
              onDiscard={() => { clearDraft(); setDraftRestored(false); resetForm(); }}
            />
            <div className="space-y-4 pt-4">
              <div>
                <Label>Date</Label>
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} data-testid="input-usage-date" />
              </div>

              <div>
                <Label>Working Plant / Location</Label>
                <Select value={workingPlant} onValueChange={setWorkingPlant}>
                  <SelectTrigger data-testid="select-working-plant">
                    <SelectValue placeholder="Select working location" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="HMP PLANT">HMP Plant</SelectItem>
                    <SelectItem value="RMC PLANT">RMC Plant</SelectItem>
                    <SelectItem value="OTHER">Other / Site Work</SelectItem>
                  </SelectContent>
                </Select>
                {workingPlant === "OTHER" && (
                  <Input
                    className="mt-2"
                    value={siteName}
                    onChange={(e) => setSiteName(e.target.value.toUpperCase())}
                    placeholder="Enter location or site name"
                    data-testid="input-working-location-custom"
                  />
                )}
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <Label>Equipment</Label>
                  {contextPlantName && (
                    <button
                      type="button"
                      onClick={() => setShowAllPlantEquipment(v => !v)}
                      className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
                    >
                      {showAllPlantEquipment ? `Show ${contextPlantName} only` : "Show all plants"}
                    </button>
                  )}
                </div>
                <Select 
                  value={equipmentId} 
                  onValueChange={(value) => {
                    if (value === "__add_new__") {
                      setNewEquipmentDialogOpen(true);
                    } else {
                      handleEquipmentChange(value);
                    }
                  }}
                >
                  <SelectTrigger data-testid="select-equipment">
                    <SelectValue placeholder="Select equipment" />
                  </SelectTrigger>
                  <SelectContent>
                    {activeEquipment.map((equip) => {
                      const eqPlant = (equip as any).plantName as string | null;
                      return (
                        <SelectItem key={equip.id} value={String(equip.id)}>
                          {equip.name} {(equip as any).registrationNumber ? `(${(equip as any).registrationNumber})` : ""} - {equip.meterType === "hour_meter" ? "hrs" : "km"} | {(equip as any).ownership === "hired" ? `HIRED: ${(equip as any).vendorName}` : "HLC OWN"}{eqPlant ? ` | ${eqPlant}` : ""}
                        </SelectItem>
                      );
                    })}
                    <SelectItem value="__add_new__" className="text-primary font-medium">
                      <span className="flex items-center gap-1"><Plus className="h-3 w-3" /> Add New Equipment</span>
                    </SelectItem>
                  </SelectContent>
                </Select>
                {selectedEquipment && (
                  <p className="text-sm text-muted-foreground mt-1">
                    Norm: {selectedEquipment.consumptionNorm} {selectedEquipment.meterType === "hour_meter" ? "L/hr" : "L/km"}
                  </p>
                )}
                {selectedEquipment && (
                  <div className="mt-2 py-2 px-3 bg-blue-50 dark:bg-blue-900/20 rounded-md border border-blue-200 dark:border-blue-800 space-y-2">
                    <Label className="text-sm font-medium">Entry Type</Label>
                    <div className="flex items-center gap-2">
                      <Select
                        value={entryType}
                        onValueChange={(val) => {
                          setEntryType(val);
                          if (val === "trip_based") {
                            setTripBasedEntry(true);
                          } else {
                            setTripBasedEntry(false);
                            setNumberOfTrips("");
                            setTripDistance("");
                          }
                          if (val === "shifting") {
                            setShiftFrom("");
                            setShiftTo("");
                            setTransportEquipmentId("");
                            setTransportDistance("");
                          }
                        }}
                      >
                        <SelectTrigger data-testid="select-entry-type" className="w-48">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="time_meter">Time / Meter Reading</SelectItem>
                          {(selectedEquipment as any).ownership === "hired" && (
                            <>
                              <SelectItem value="hourly">Hourly Hire</SelectItem>
                              <SelectItem value="daily">Daily Hire</SelectItem>
                              <SelectItem value="trip_based">Trip Based</SelectItem>
                              <SelectItem value="monthly">Monthly Hire</SelectItem>
                            </>
                          )}
                          <SelectItem value="shifting">Shifting / Mobilization</SelectItem>
                        </SelectContent>
                      </Select>
                      {(entryType === "daily" || entryType === "monthly") && (
                        <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
                          {entryType === "daily" ? "DAILY HIRE" : "MONTHLY HIRE"}
                        </Badge>
                      )}
                      {entryType === "shifting" && (
                        <Badge variant="outline" className="bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-900/30 dark:text-teal-300 dark:border-teal-700">
                          MOBILIZATION
                        </Badge>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <p className="text-sm text-muted-foreground italic">
                {entryType === "shifting" ? "Record equipment transfer between sites." : entryType === "hourly" ? "Enter time worked for hourly hire billing." : "Enter meter readings OR time."}
              </p>

              {entryType === "shifting" && (
                <div className="space-y-4 p-3 bg-teal-50/50 dark:bg-teal-900/10 rounded-md border border-teal-200/50 dark:border-teal-800/50">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-sm">From</Label>
                      <Select value={shiftFrom} onValueChange={setShiftFrom}>
                        <SelectTrigger data-testid="select-shift-from">
                          <SelectValue placeholder="Origin" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="PLANT">PLANT</SelectItem>
                          {sitesList?.filter(s => s.isActive === 1).map((site) => (
                            <SelectItem key={site.id} value={site.name}>{site.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-sm">To</Label>
                      <Select value={shiftTo} onValueChange={setShiftTo}>
                        <SelectTrigger data-testid="select-shift-to">
                          <SelectValue placeholder="Destination" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="PLANT">PLANT</SelectItem>
                          {sitesList?.filter(s => s.isActive === 1).map((site) => (
                            <SelectItem key={site.id} value={site.name}>{site.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div>
                    <Label className="text-sm">Transport Vehicle</Label>
                    <Select value={transportEquipmentId} onValueChange={setTransportEquipmentId}>
                      <SelectTrigger data-testid="select-transport-vehicle">
                        <SelectValue placeholder="Select transport vehicle" />
                      </SelectTrigger>
                      <SelectContent>
                        {activeEquipment.map((equip) => (
                          <SelectItem key={equip.id} value={String(equip.id)}>
                            {equip.name}{(equip as any).registrationNumber ? ` (${(equip as any).registrationNumber})` : ""} | {(equip as any).ownership === "hired" ? `HIRED: ${(equip as any).vendorName || "Unknown"}` : "HLC OWN"}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {transportEquipmentId && (() => {
                      const tEquip = activeEquipment.find(e => e.id === parseInt(transportEquipmentId));
                      return tEquip ? (
                        <p className="text-sm text-muted-foreground mt-1">
                          {(tEquip as any).ownership === "hired" ? `Owner: ${(tEquip as any).vendorName || "N/A"}` : "HLC Owned Vehicle"}
                        </p>
                      ) : null;
                    })()}
                  </div>
                  <div>
                    <Label className="text-sm">Distance (km) - One Way</Label>
                    <Input
                      type="number"
                      step="0.1"
                      min="0"
                      value={transportDistance}
                      onChange={(e) => setTransportDistance(e.target.value)}
                      placeholder="e.g., 25"
                      data-testid="input-transport-distance"
                    />
                  </div>
                </div>
              )}

              {entryType !== "shifting" && (
              <>
              <div className="text-sm font-semibold text-muted-foreground border-b pb-1">Morning Entry</div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Opening {selectedEquipment?.meterType === "hour_meter" ? "Hrs" : "KM"}</Label>
                  <Input type="number" step="0.1" value={openingReading} onChange={(e) => setOpeningReading(e.target.value)} placeholder="0.0" data-testid="input-opening-reading" />
                </div>
                <div className="flex flex-col">
                  <div className="text-sm font-semibold text-muted-foreground border-b pb-1 mb-2">Evening Entry (can be added later)</div>
                  <Label>Closing {selectedEquipment?.meterType === "hour_meter" ? "Hrs" : "KM"}</Label>
                  <Input type="number" step="0.1" value={closingReading} onChange={(e) => setClosingReading(e.target.value)} placeholder="0.0" data-testid="input-closing-reading" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Start Time</Label>
                  <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} data-testid="input-start-time" />
                </div>
                <div>
                  <Label>End Time</Label>
                  <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} data-testid="input-end-time" />
                </div>
              </div>

              {(entryType === "trip_based" || tripBasedEntry) && (
                <div className="p-3 bg-blue-50/50 dark:bg-blue-900/10 rounded-md border border-blue-200/50 dark:border-blue-800/50 space-y-3">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-sm">No. of Trips</Label>
                      <Input 
                        type="number" 
                        min="0" 
                        step="1" 
                        value={numberOfTrips} 
                        onChange={(e) => setNumberOfTrips(e.target.value)} 
                        placeholder="e.g., 3" 
                        data-testid="input-number-of-trips" 
                      />
                    </div>
                    <div>
                      <Label className="text-sm">Distance to Source (km)</Label>
                      <Input 
                        type="number" 
                        min="0" 
                        step="0.1" 
                        value={tripDistance} 
                        onChange={(e) => setTripDistance(e.target.value)} 
                        placeholder="e.g., 6" 
                        data-testid="input-trip-distance" 
                      />
                    </div>
                  </div>
                  {numberOfTrips && tripDistance && (
                    <p className="text-sm text-muted-foreground">
                      Total: {(parseInt(numberOfTrips) * parseFloat(tripDistance) * 2).toFixed(3)} km ({numberOfTrips} trips × {tripDistance} km × 2)
                    </p>
                  )}
                </div>
              )}

              {(runtime > 0 || (tripBasedEntry && tripTotalKm > 0)) && selectedEquipment && (
                <div className="p-3 bg-muted rounded-md text-sm">
                  {runtime > 0 ? (
                    <p>Runtime: <strong>{runtime.toFixed(3)} {selectedEquipment.meterType === "hour_meter" ? "hrs" : "km"}</strong> {meterRuntime > 0 ? "(from meter)" : "(from time)"}</p>
                  ) : tripTotalKm > 0 ? (
                    <p>Distance: <strong>{tripTotalKm.toFixed(3)} km</strong> (from trips)</p>
                  ) : null}
                  {!dieselIncluded && <p>Expected Diesel: <strong>{expectedDiesel.toFixed(3)} L</strong></p>}
                </div>
              )}

              <div className="space-y-2">
                <Label>Diesel Source</Label>
                <Select value={dieselIncluded ? "contractor" : dieselSource} onValueChange={(value) => {
                  if (value === "contractor") {
                    setDieselIncluded(true);
                    setDieselSource("contractor");
                  } else {
                    setDieselIncluded(false);
                    setDieselSource(value);
                  }
                }}>
                  <SelectTrigger data-testid="select-diesel-source">
                    <SelectValue placeholder="Select diesel source" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="plant_stock">Plant Stock (deducts from HLC)</SelectItem>
                    <SelectItem value="direct_purchase">Direct Site Purchase</SelectItem>
                    <SelectItem value="contractor">Contractor Provided (no stock impact)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-sm text-muted-foreground">
                  {dieselSource === "plant_stock" && !dieselIncluded && "Diesel will be deducted from plant HLC stock"}
                  {dieselSource === "direct_purchase" && !dieselIncluded && "Track diesel purchased directly at site"}
                  {(dieselSource === "contractor" || dieselIncluded) && "Tracking only - diesel is contractor's responsibility"}
                </p>
              </div>

              {!dieselIncluded && dieselSource !== "contractor" && (
                <>
                  {dieselSource === "direct_purchase" && (
                    <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-md border border-blue-200 dark:border-blue-800 space-y-3">
                      <p className="text-sm font-medium text-blue-700 dark:text-blue-300">Direct Site Purchase Details</p>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label className="text-sm">Site Name</Label>
                          <Input 
                            value={siteName} 
                            onChange={(e) => setSiteName(e.target.value.toUpperCase())} 
                            placeholder="Site location" 
                            data-testid="input-site-name"
                          />
                        </div>
                        <div>
                          <Label className="text-sm">Fuel Station</Label>
                          <Input 
                            value={fuelStation} 
                            onChange={(e) => setFuelStation(e.target.value.toUpperCase())} 
                            placeholder="HP / BPCL / etc." 
                            data-testid="input-fuel-station"
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label className="text-sm">Bill Number</Label>
                          <Input 
                            value={billNumber} 
                            onChange={(e) => setBillNumber(e.target.value.toUpperCase())} 
                            placeholder="Receipt number" 
                            data-testid="input-bill-number"
                          />
                        </div>
                        <div>
                          <Label className="text-sm">Amount Paid (Rs)</Label>
                          <Input 
                            type="number" 
                            step="0.01" 
                            value={amountPaid} 
                            onChange={(e) => setAmountPaid(e.target.value)} 
                            placeholder="0.00" 
                            data-testid="input-amount-paid"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Opening Diesel Tank (L)</Label>
                      <div className="relative">
                        <Input 
                          type="number" 
                          step="0.1" 
                          value={openingDiesel} 
                          onChange={(e) => handleOpeningDieselChange(e.target.value)} 
                          placeholder="Previous balance" 
                          data-testid="input-opening-diesel"
                          disabled={isLoadingBalance}
                        />
                        {isLoadingBalance && (
                          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-muted-foreground" />
                        )}
                      </div>
                      {previousDieselBalance !== null && !editingUsage && (
                        <p className="text-sm text-muted-foreground mt-1">Auto-filled from previous: {previousDieselBalance.toFixed(3)} L</p>
                      )}
                    </div>
                    <div>
                      <Label>Diesel Issued (L)</Label>
                      <Input type="number" step="0.1" value={dieselIssued} onChange={(e) => setDieselIssued(e.target.value)} placeholder="0" data-testid="input-diesel-issued" />
                    </div>
                  </div>

                  {openingDiesel && dieselIssued !== undefined && expectedDiesel > 0 && (
                    <div className="p-3 bg-primary/10 rounded-md text-sm">
                      <p>Closing Tank Balance: <strong>{(parseFloat(openingDiesel || "0") + parseFloat(dieselIssued || "0") - expectedDiesel).toFixed(3)} L</strong></p>
                    </div>
                  )}

                  {(dieselIncluded ? "contractor" : dieselSource) !== "contractor" && (
                    <div className="border rounded-md p-3 space-y-3 bg-blue-50/50 dark:bg-blue-900/10">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label>Diesel Balance in Tank (L)</Label>
                          <Input
                            type="number"
                            step="0.1"
                            value={dieselBalanceInTank}
                            onChange={(e) => setDieselBalanceInTank(e.target.value)}
                            placeholder="Closing dip (L) — enter even if no diesel issued"
                            data-testid="input-diesel-balance"
                          />
                        </div>
                        <div className="flex items-end pb-2">
                          <div className="flex items-center gap-2">
                            <Checkbox
                              id="diesel-balance-confirmed"
                              checked={dieselBalanceConfirmed}
                              onCheckedChange={(checked) => setDieselBalanceConfirmed(checked === true)}
                              data-testid="checkbox-diesel-balance-confirmed"
                            />
                            <Label htmlFor="diesel-balance-confirmed" className="text-sm cursor-pointer">Balance Confirmed</Label>
                          </div>
                        </div>
                      </div>
                      {dieselBalanceInTank !== "" && openingDiesel !== "" && (() => {
                        const opening = parseFloat(openingDiesel || "0");
                        const issued = parseFloat(dieselIssued || "0");
                        const balance = parseFloat(dieselBalanceInTank || "0");
                        const consumed = opening + issued - balance;
                        const avgPerHr = runtime > 0 ? consumed / runtime : null;
                        return (
                          <div className="p-2 bg-blue-100/50 dark:bg-blue-900/20 rounded text-sm space-y-1" data-testid="panel-actual-consumption">
                            <p>Actual Consumption (L): <strong data-testid="text-actual-consumption">{consumed.toFixed(3)}</strong></p>
                            <p>L/Hr: <strong data-testid="text-actual-l-per-hr">{avgPerHr != null ? avgPerHr.toFixed(3) : "—"}</strong></p>
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </>
              )}
              </>
              )}

              {["hourly", "daily", "monthly", "trip_based"].includes(entryType) && (
                <div className="p-3 bg-amber-50 dark:bg-amber-900/20 rounded-md border border-amber-200 dark:border-amber-800 space-y-2">
                  <p className="text-sm font-medium text-amber-700 dark:text-amber-300">Hire Charge</p>
                  <div>
                    <Label className="text-sm">Hire Amount (₹)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={hireAmount}
                      onChange={(e) => setHireAmount(e.target.value)}
                      placeholder="Total hire charge for this entry"
                      data-testid="input-hire-amount"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      {entryType === "hourly" ? "Hourly hire charge for the hours worked" : entryType === "daily" ? "Daily hire rate for this equipment" : entryType === "monthly" ? "Monthly hire charge (prorated if partial)" : "Hire charge for trips performed"}
                    </p>
                  </div>
                </div>
              )}

              <div>
                <Label>Remarks</Label>
                <Textarea value={remarks} onChange={(e) => setRemarks(e.target.value.toUpperCase())} placeholder="Optional notes" data-testid="input-usage-remarks" />
              </div>

              <Button 
                onClick={handleSubmit} 
                className="w-full" 
                disabled={createMutation.isPending || updateMutation.isPending || !equipmentId || (entryType === "shifting" ? (!shiftFrom || !shiftTo || !transportEquipmentId) : (!openingReading && (!startTime || !endTime) && !((entryType === "trip_based" || tripBasedEntry) && numberOfTrips && tripDistance)))} 
                data-testid="button-save-usage"
              >
                {(createMutation.isPending || updateMutation.isPending) ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : entryType === "shifting" ? (
                  editingUsage ? "Update Entry" : "Save Entry"
                ) : editingUsage ? (
                  editingUsage.openingReading != null && editingUsage.closingReading == null && closingReading ? "Complete Entry" : "Update Entry"
                ) : (
                  openingReading && !closingReading && !startTime && !endTime && !((entryType === "trip_based" || tripBasedEntry) && numberOfTrips && tripDistance) ? "Save Morning Entry" : "Save Entry"
                )}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4 flex-wrap">
          <CardTitle className="text-base">Filters</CardTitle>
          <div className="flex items-center gap-2 flex-wrap">
            <Button size="sm" variant="outline" className="gap-1" onClick={handleExportExcelClick} disabled={!filteredUsage.length} data-testid="button-export-excel" style={{ display: canExport ? undefined : "none" }}>
              <Download className="w-4 h-4" /> Excel
            </Button>
            <Button size="sm" variant="outline" className="gap-1" onClick={handleExportPdfClick} disabled={!filteredUsage.length} data-testid="button-export-pdf" style={{ display: canExport ? undefined : "none" }}>
              <Download className="w-4 h-4" /> PDF
            </Button>
            <Button size="sm" variant="outline" className="gap-1" onClick={handlePrintClick} data-testid="button-print" style={{ display: canExport ? undefined : "none" }}>
              <Printer className="w-4 h-4" /> Print
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row items-start md:items-end gap-4 flex-wrap">
            <div className="flex-1 min-w-[150px]">
              <Label className="text-sm text-muted-foreground">DATE FROM</Label>
              <Input
                type="date"
                value={filterDateFrom}
                onChange={(e) => setFilterDateFrom(e.target.value)}
                data-testid="input-filter-date-from"
              />
            </div>
            <div className="flex-1 min-w-[150px]">
              <Label className="text-sm text-muted-foreground">DATE TO</Label>
              <Input
                type="date"
                value={filterDateTo}
                onChange={(e) => setFilterDateTo(e.target.value)}
                data-testid="input-filter-date-to"
              />
            </div>
            <div className="flex-1 min-w-[200px]">
              <Label className="text-sm text-muted-foreground">EQUIPMENT</Label>
              <Select value={filterEquipmentId} onValueChange={setFilterEquipmentId}>
                <SelectTrigger data-testid="select-filter-equipment">
                  <SelectValue placeholder="All Equipment" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Equipment</SelectItem>
                  {equipment?.map((equip) => (
                    <SelectItem key={equip.id} value={String(equip.id)}>
                      {equip.name}{(equip as any).registrationNumber ? ` - ${(equip as any).registrationNumber}` : ""}{(equip as any).ownership === "hired" ? ` (HIRED${(equip as any).vendorName ? `: ${(equip as any).vendorName}` : ""})` : (equip as any).ownership === "owned" ? " (HLC OWN)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1 min-w-[220px]">
              <Label className="text-sm text-muted-foreground">WORKING PLANT</Label>
              <div className="flex flex-wrap gap-1.5 mt-1" data-testid="filter-working-plant-chips">
                {[
                  { value: "all", label: "All" },
                  { value: "HMP PLANT", label: "HMP Plant" },
                  { value: "RMC PLANT", label: "RMC Plant" },
                  { value: "other", label: "Other" },
                ].map(({ value, label }) => (
                  <button
                    key={value}
                    type="button"
                    data-testid={`chip-working-plant-${value}`}
                    onClick={() => setFilterWorkingPlant(value)}
                    className={[
                      "px-2.5 py-0.5 rounded-full text-xs font-medium border transition-colors",
                      filterWorkingPlant === value
                        ? value === "HMP PLANT"
                          ? "bg-orange-100 text-orange-700 border-orange-400 dark:bg-orange-900/40 dark:text-orange-300 dark:border-orange-600"
                          : value === "RMC PLANT"
                            ? "bg-teal-100 text-teal-700 border-teal-400 dark:bg-teal-900/40 dark:text-teal-300 dark:border-teal-600"
                            : "bg-primary text-primary-foreground border-primary"
                        : "bg-background text-muted-foreground border-border hover:bg-muted",
                    ].join(" ")}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setFilterDateFrom("");
                setFilterDateTo("");
                setFilterEquipmentId("all");
                setFilterWorkingPlant("all");
              }}
              data-testid="button-clear-filters"
            >
              Clear
            </Button>
          </div>
        </CardContent>
      </Card>

      <Dialog open={deleteConfirmId !== null} onOpenChange={(open) => !open && setDeleteConfirmId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Delete</DialogTitle>
          </DialogHeader>
          <p>Are you sure you want to delete this equipment usage entry?</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmId(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => deleteConfirmId && deleteMutation.mutate(deleteConfirmId)} disabled={deleteMutation.isPending}>
              {deleteMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={newEquipmentDialogOpen} onOpenChange={(open) => { if (!open) { setNewEquipmentDialogOpen(false); resetNewEquipmentForm(); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New Equipment</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Equipment Name *</Label>
              <Input 
                value={newEquipmentName} 
                onChange={(e) => setNewEquipmentName(e.target.value.toUpperCase())} 
                placeholder="e.g., JCB 3DX, Tata Tipper"
                data-testid="input-new-equipment-name"
              />
            </div>
            <div>
              <Label>Registration Number</Label>
              <Input 
                value={newEquipmentRegNo} 
                onChange={(e) => setNewEquipmentRegNo(e.target.value.toUpperCase())} 
                placeholder="e.g., MH12AB1234"
                data-testid="input-new-equipment-regno"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Meter Type *</Label>
                <Select value={newEquipmentMeterType} onValueChange={setNewEquipmentMeterType}>
                  <SelectTrigger data-testid="select-new-equipment-meter-type">
                    <SelectValue placeholder="Select meter type" />
                  </SelectTrigger>
                  <SelectContent>
                    {METER_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>
                        {type === "hour_meter" ? "Hour Meter (hrs)" : "Odometer (km)"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Consumption Norm</Label>
                <Input 
                  type="number" 
                  step="0.01"
                  value={newEquipmentNorm} 
                  onChange={(e) => setNewEquipmentNorm(e.target.value)} 
                  placeholder={newEquipmentMeterType === "hour_meter" ? "L/hr" : "L/km"}
                  data-testid="input-new-equipment-norm"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Ownership</Label>
                <Select value={newEquipmentOwnership} onValueChange={setNewEquipmentOwnership}>
                  <SelectTrigger data-testid="select-new-equipment-ownership">
                    <SelectValue placeholder="Select ownership" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="owned">Owned</SelectItem>
                    <SelectItem value="hired">Hired</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {newEquipmentOwnership === "hired" && (
                <div>
                  <Label>Vendor Name</Label>
                  <Input 
                    value={newEquipmentVendor} 
                    onChange={(e) => setNewEquipmentVendor(e.target.value.toUpperCase())} 
                    placeholder="Vendor name"
                    data-testid="input-new-equipment-vendor"
                  />
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setNewEquipmentDialogOpen(false); resetNewEquipmentForm(); }}>
              Cancel
            </Button>
            <Button 
              onClick={() => {
                if (!newEquipmentName.trim()) {
                  toast({ title: "Equipment name is required", variant: "destructive" });
                  return;
                }
                createEquipmentMutation.mutate({
                  name: newEquipmentName.trim(),
                  registrationNumber: newEquipmentRegNo.trim() || undefined,
                  meterType: newEquipmentMeterType,
                  consumptionNorm: newEquipmentNorm ? parseFloat(newEquipmentNorm) : undefined,
                  ownership: newEquipmentOwnership || undefined,
                  vendorName: newEquipmentVendor.trim() || undefined,
                });
              }}
              disabled={createEquipmentMutation.isPending}
              data-testid="button-save-new-equipment"
            >
              {createEquipmentMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Add Equipment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 flex-wrap">
            <Gauge className="w-5 h-5" />
            Usage Log
            {filteredUsage.length > 0 && (
              <Badge variant="secondary" className="ml-2">{filteredUsage.length} entries</Badge>
            )}
          </CardTitle>
          {dieselTotals.totalIssued > 0 && (
            <div className="flex flex-wrap gap-4 mt-2 text-sm" data-testid="diesel-totals-container">
              <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-blue-50 dark:bg-blue-900/20" data-testid="diesel-total-issued">
                <span className="text-blue-600 dark:text-blue-400 font-medium">Total Diesel Issued:</span>
                <span className="font-bold text-blue-700 dark:text-blue-300">{dieselTotals.totalIssued.toFixed(3)} L</span>
              </div>
              <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-orange-50 dark:bg-orange-900/20" data-testid="diesel-total-expected">
                <span className="text-orange-600 dark:text-orange-400 font-medium">Expected Consumption:</span>
                <span className="font-bold text-orange-700 dark:text-orange-300">{dieselTotals.totalExpected.toFixed(3)} L</span>
              </div>
              {dieselTotals.totalIssued >= dieselTotals.totalExpected && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-green-50 dark:bg-green-900/20" data-testid="diesel-total-surplus">
                  <span className="text-green-600 dark:text-green-400 font-medium">Balance in Tanks:</span>
                  <span className="font-bold text-green-700 dark:text-green-300">{(dieselTotals.totalIssued - dieselTotals.totalExpected).toFixed(3)} L</span>
                </div>
              )}
              {dieselTotals.totalExpected > dieselTotals.totalIssued && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-red-50 dark:bg-red-900/20" data-testid="diesel-total-deficit">
                  <span className="text-red-600 dark:text-red-400 font-medium">Over-Consumed:</span>
                  <span className="font-bold text-red-700 dark:text-red-300">{(dieselTotals.totalExpected - dieselTotals.totalIssued).toFixed(3)} L</span>
                </div>
              )}
            </div>
          )}
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center p-8">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          ) : !filteredUsage.length ? (
            <p className="text-muted-foreground text-center py-8">No usage recorded yet.</p>
          ) : (
            <div className="space-y-6">
              {sortedDates.map((dateKey) => {
                const dayUsage = groupedUsage[dateKey];
                const varianceRows = (() => {
                  const map = new Map<number, { name: string; meterUnit: string; runtime: number; actual: number; expected: number }>();
                  dayUsage.forEach((entry) => {
                    if (entry.dieselIncluded === true) return;
                    if (isPartialEntry(entry)) return;
                    if (entry.entryType === "shifting") return;
                    const equip = equipment?.find(e => e.id === entry.equipmentId);
                    if (!equip) return;
                    const openingDieselVal = entry.openingDiesel ?? 0;
                    const dieselIssuedVal = entry.dieselIssued ?? 0;
                    const closingDieselEntry = entry.closingDiesel ?? entry.dieselBalanceInTank;
                    const expected = entry.expectedDiesel ?? 0;
                    const consumed = closingDieselEntry != null
                      ? Math.max(0, openingDieselVal + dieselIssuedVal - closingDieselEntry)
                      : expected;
                    const totalKmVal = entry.totalKm ?? 0;
                    const runtime = entry.hoursOrKmRun || totalKmVal || 0;
                    if (runtime <= 0 && consumed <= 0 && expected <= 0) return;
                    const isTripBased = !entry.hoursOrKmRun && totalKmVal > 0;
                    const meterUnit = isTripBased ? "km" : (equip.meterType === "hour_meter" ? "hrs" : "km");
                    const key = entry.equipmentId;
                    const existing = map.get(key);
                    if (existing) {
                      existing.runtime += runtime;
                      existing.actual += consumed;
                      existing.expected += expected;
                    } else {
                      map.set(key, {
                        name: equip.name + (equip.registrationNumber ? ` (${equip.registrationNumber})` : ""),
                        meterUnit,
                        runtime,
                        actual: consumed,
                        expected,
                      });
                    }
                  });
                  return Array.from(map.values());
                })();
                return (
                  <div key={dateKey}>
                    <div className="sticky top-14 z-10 bg-background border-b pb-2 mb-3 pt-1">
                      <h3 className="font-semibold text-lg">{format(new Date(dateKey), "EEEE, dd MMM yyyy")}</h3>
                    </div>
                    <div className="space-y-2">
                      {dayUsage.map((entry) => {
                        const equip = equipment?.find(e => e.id === entry.equipmentId);
                        const isDieselIncluded = (entry as any).dieselIncluded === true;
                        const openingDieselVal = (entry as any).openingDiesel ?? 0;
                        const dieselIssuedVal = entry.dieselIssued ?? 0;
                        const closingDieselEntry = (entry as any).closingDiesel;
                        // Actual consumed = opening + issued - closing; fallback to expected if closing not tracked
                        const consumed = closingDieselEntry != null 
                          ? Math.max(0, openingDieselVal + dieselIssuedVal - closingDieselEntry)
                          : (entry.expectedDiesel ?? 0);
                        const isExpanded = expandedIds.has(entry.id);
                        const ownerLabel = equip ? ((equip as any).ownership === "hired" ? `HIRED${(equip as any).vendorName ? `: ${(equip as any).vendorName}` : ""}` : "HLC OWN") : "";
                        const runtimeDisplay = isPartialEntry(entry) ? "Pending"
                          : (entry as any).totalKm > 0 && !entry.hoursOrKmRun ? `${((entry as any).totalKm || 0).toFixed(1)} km`
                          : entry.hoursOrKmRun != null ? `${entry.hoursOrKmRun.toFixed(2)} ${equip?.meterType === "hour_meter" ? "hrs" : "km"}` : "—";
                        const runtime = entry.hoursOrKmRun || (entry as any).totalKm || 0;
                        const norm = equip?.consumptionNorm || 0;
                        const isTripBased = !entry.hoursOrKmRun && (entry as any).totalKm > 0;
                        const effUnit = isTripBased ? "L/km" : (equip?.meterType === "hour_meter" ? "L/hr" : "L/km");
                        const efficiencyValue = (!isPartialEntry(entry) && !isDieselIncluded && runtime > 0 && consumed > 0)
                          ? consumed / runtime : null;
                        const efficiencyIsGood = norm > 0 ? (efficiencyValue != null ? efficiencyValue <= norm : true) : true;
                        const needsExpand = !!(entry.remarks?.trim()) || (entry as any).dieselSource === "direct_purchase";
                        return (
                          <div key={entry.id} className="rounded-lg bg-muted/50 overflow-hidden">
                            <div
                              className={`flex items-start gap-2 px-3 py-2.5${needsExpand ? " cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 transition-colors" : ""}`}
                              onClick={needsExpand ? () => setExpandedIds(prev => { const s = new Set(prev); s.has(entry.id) ? s.delete(entry.id) : s.add(entry.id); return s; }) : undefined}
                            >
                              {needsExpand
                                ? <ChevronRight className={`w-4 h-4 shrink-0 text-muted-foreground mt-0.5 transition-transform duration-150 ${isExpanded ? "rotate-90" : ""}`} />
                                : <div className="w-4 shrink-0" />}
                              <div className="flex-1 min-w-0">
                                {/* Line 1: name, ownership, entry-type badges */}
                                <div className="flex items-center gap-x-3 gap-y-1 flex-wrap text-sm">
                                  <span className="font-semibold">{equip?.name || "Unknown"}{(equip as any)?.registrationNumber ? ` (${(equip as any).registrationNumber})` : ""}</span>
                                  {equip && <span className="text-xs text-muted-foreground">{ownerLabel}</span>}
                                  {(() => {
                                    const loc = (entry as any).siteName;
                                    if (!loc) return null;
                                    if (loc === "HMP PLANT") return <Badge variant="outline" className="text-xs bg-orange-50 text-orange-700 border-orange-300 dark:bg-orange-900/20 dark:text-orange-300 dark:border-orange-700">HMP</Badge>;
                                    if (loc === "RMC PLANT") return <Badge variant="outline" className="text-xs bg-teal-50 text-teal-700 border-teal-300 dark:bg-teal-900/20 dark:text-teal-300 dark:border-teal-700">RMC</Badge>;
                                    return <Badge variant="outline" className="text-xs bg-slate-50 text-slate-600 border-slate-300 dark:bg-slate-800 dark:text-slate-300">{loc}</Badge>;
                                  })()}
                                  {(entry as any).entryType === "hourly" && <Badge variant="outline" className="text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-blue-300 dark:border-blue-700">Hourly Hire</Badge>}
                                  {(entry as any).entryType === "daily" && <Badge variant="outline" className="text-xs bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-700">Daily Hire</Badge>}
                                  {(entry as any).entryType === "monthly" && <Badge variant="outline" className="text-xs bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 border-purple-300 dark:border-purple-700">Monthly Hire</Badge>}
                                  {(entry as any).entryType === "trip_based" && <Badge variant="outline" className="text-xs bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 border-green-300 dark:border-green-700">Trip Based</Badge>}
                                  {(entry as any).entryType === "shifting" && <Badge variant="outline" className="text-xs bg-cyan-100 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-300 border-cyan-300 dark:border-cyan-700">Mobilization</Badge>}
                                  {isDieselIncluded && <Badge variant="outline" className="text-xs bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-700">Diesel by Contractor</Badge>}
                                  {isPartialEntry(entry) && <Badge variant="outline" className="text-xs bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300 border-yellow-300 dark:border-yellow-700">Pending Closing</Badge>}
                                </div>
                                {/* Line 2: inline operational detail */}
                                {(entry as any).entryType === "shifting" ? (
                                  <div className="flex items-center gap-x-4 gap-y-0.5 flex-wrap text-xs text-muted-foreground mt-1">
                                    <span className="font-medium text-foreground">{(entry as any).shiftFrom || "?"} → {(entry as any).shiftTo || "?"}</span>
                                    {(() => {
                                      const tEquip = equipment?.find(e => e.id === (entry as any).transportEquipmentId);
                                      return tEquip ? <span>{tEquip.name}{(tEquip as any).registrationNumber ? ` (${(tEquip as any).registrationNumber})` : ""}</span> : null;
                                    })()}
                                    {(entry as any).transportDistance ? <span>{(entry as any).transportDistance} km</span> : null}
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-x-4 gap-y-0.5 flex-wrap text-xs text-muted-foreground mt-1">
                                    {/* Time or meter range */}
                                    {!isPartialEntry(entry) && entry.openingReading != null && entry.closingReading != null && (
                                      <span>Meter: {entry.openingReading} → {entry.closingReading}</span>
                                    )}
                                    {!isPartialEntry(entry) && !(entry.openingReading != null && entry.closingReading != null) && entry.startTime && entry.endTime && (
                                      <span>{entry.startTime} → {entry.endTime}</span>
                                    )}
                                    {isPartialEntry(entry) && entry.openingReading != null && (
                                      <span>Opening: {entry.openingReading}</span>
                                    )}
                                    {/* Runtime */}
                                    {isTripBased && !isPartialEntry(entry) ? (
                                      <span className="font-medium text-foreground">{(entry as any).numberOfTrips || 0} trips × {(entry as any).tripDistance} km × 2 = {((entry as any).totalKm || 0).toFixed(1)} km</span>
                                    ) : (
                                      <span className="font-medium text-foreground">{runtimeDisplay}</span>
                                    )}
                                    {/* Diesel issued + consumed */}
                                    {!isDieselIncluded && !isPartialEntry(entry) && (
                                      <span>Issued: {dieselIssuedVal.toFixed(1)} L · Consumed: {consumed.toFixed(1)} L</span>
                                    )}
                                    {/* Efficiency */}
                                    {efficiencyValue != null && (
                                      <span className={efficiencyIsGood ? "font-medium text-green-600 dark:text-green-400" : "font-medium text-red-600 dark:text-red-400"}>
                                        {efficiencyValue.toFixed(2)} {effUnit}{norm > 0 ? ` (norm: ${norm})` : ""}
                                      </span>
                                    )}
                                    {/* Tank balance inline chip */}
                                    {(entry as any).dieselBalanceInTank != null && (
                                      <span className="font-medium text-blue-600 dark:text-blue-400">
                                        Bal: {((entry as any).dieselBalanceInTank as number).toFixed(1)} L{(entry as any).dieselBalanceConfirmed ? " ✓" : ""}{dieselIssuedVal > 0 ? ` (net: ${(dieselIssuedVal - (entry as any).dieselBalanceInTank).toFixed(1)} L)` : ""}
                                      </span>
                                    )}
                                  </div>
                                )}
                              </div>
                              <div className="flex gap-1 shrink-0 ml-2" onClick={e => e.stopPropagation()}>
                                {isPartialEntry(entry) && (
                                  <Button size="sm" variant="outline" onClick={() => handleCompleteClick(entry)} className="gap-1 text-yellow-700 dark:text-yellow-300 border-yellow-300" data-testid={`button-complete-usage-${entry.id}`}>
                                    <Gauge className="w-3 h-3" /> Complete
                                  </Button>
                                )}
                                <Button size="icon" variant="ghost" onClick={() => handleEditClick(entry)} data-testid={`button-edit-usage-${entry.id}`}>
                                  <Edit className="w-4 h-4" />
                                </Button>
                                <Button size="icon" variant="ghost" onClick={() => handleDeleteClick(entry.id)} data-testid={`button-delete-usage-${entry.id}`}>
                                  <Trash2 className="w-4 h-4 text-destructive" />
                                </Button>
                              </div>
                            </div>
                            {needsExpand && isExpanded && (
                              <div className="px-4 pb-3 pt-2 border-t border-border/50 space-y-1.5">
                                {(entry as any).hireAmount != null && (
                                  <div className="text-xs flex flex-wrap gap-x-4 gap-y-0.5">
                                    <span className="text-amber-600 font-medium">Hire Charge</span>
                                    <span><span className="text-muted-foreground">Amount: </span><span className="font-medium text-amber-700">₹{((entry as any).hireAmount as number).toFixed(0)}</span></span>
                                  </div>
                                )}
                                {(entry as any).dieselSource === "direct_purchase" && (
                                  <div className="text-xs flex flex-wrap gap-x-4 gap-y-0.5">
                                    <span className="text-muted-foreground">Direct Purchase</span>
                                    {(entry as any).fuelStation && <span><span className="text-muted-foreground">Station: </span><span className="font-medium">{(entry as any).fuelStation}</span></span>}
                                    {(entry as any).billNumber && <span><span className="text-muted-foreground">Bill#: </span><span className="font-medium">{(entry as any).billNumber}</span></span>}
                                    {(entry as any).amountPaid != null && <span><span className="text-muted-foreground">Amt: </span><span className="font-medium">₹{((entry as any).amountPaid as number).toFixed(0)}</span></span>}
                                    {(entry as any).siteName && <span><span className="text-muted-foreground">Site: </span><span className="font-medium">{(entry as any).siteName}</span></span>}
                                  </div>
                                )}
                                {entry.remarks?.trim() && (
                                  <div className="text-xs">
                                    <span className="text-muted-foreground">Remarks: </span>
                                    <span className="font-medium">{entry.remarks}</span>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    {varianceRows.length > 0 && (
                      <div className="mt-3 border rounded-md overflow-hidden" data-testid={`variance-summary-${dateKey}`}>
                        <div className="px-3 py-2 bg-muted/40 text-sm font-medium">Norm vs Actual — {format(new Date(dateKey), "dd MMM")}</div>
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead className="bg-muted/20 text-muted-foreground">
                              <tr>
                                <th className="text-left px-3 py-2 font-medium">Equipment</th>
                                <th className="text-right px-3 py-2 font-medium">Run</th>
                                <th className="text-right px-3 py-2 font-medium">Actual L</th>
                                <th className="text-right px-3 py-2 font-medium">Norm L</th>
                                <th className="text-right px-3 py-2 font-medium">Variance L</th>
                                <th className="text-right px-3 py-2 font-medium">±%</th>
                              </tr>
                            </thead>
                            <tbody>
                              {varianceRows.map((row, idx) => {
                                const variance = row.actual - row.expected;
                                const variancePct = row.expected > 0 ? (variance / row.expected) * 100 : null;
                                return (
                                  <tr key={idx} className="border-t" data-testid={`variance-row-${dateKey}-${idx}`}>
                                    <td className="px-3 py-2">{row.name}</td>
                                    <td className="px-3 py-2 text-right">{row.runtime.toFixed(2)} {row.meterUnit}</td>
                                    <td className="px-3 py-2 text-right">{row.actual.toFixed(2)}</td>
                                    <td className="px-3 py-2 text-right">{row.expected.toFixed(2)}</td>
                                    <td className="px-3 py-2 text-right">
                                      {variance > 0 ? "+" : ""}{variance.toFixed(2)}
                                    </td>
                                    <td className="px-3 py-2 text-right text-muted-foreground">
                                      {variancePct == null ? "—" : `${variancePct > 0 ? "+" : ""}${variancePct.toFixed(1)}%`}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

    </div>
  );
}
