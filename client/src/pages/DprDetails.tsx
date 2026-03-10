import { useState } from "react";
import { useDpr } from "@/hooks/use-dprs";
import { Link, useRoute, useLocation } from "wouter";
import { ChevronLeft, Loader2, Printer, Edit, Trash2 } from "lucide-react";
import { ReportHeader } from "@/components/ReportHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PinAuth } from "@/components/PinAuth";
import { useAccess } from "@/lib/access-context";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { EquipmentMasterType } from "@shared/schema";

export default function DprDetails() {
  const [, params] = useRoute("/dpr/:id");
  const [, setLocation] = useLocation();
  const id = parseInt(params?.id || "0");
  const { data: dpr, isLoading, error } = useDpr(id);
  const { access, canEdit, canDelete } = useAccess();
  const { toast } = useToast();

  const { data: equipmentList = [] } = useQuery<EquipmentMasterType[]>({
    queryKey: ["/api/plant-module/equipment", "all"],
    queryFn: async () => {
      const res = await fetch("/api/plant-module/equipment?includeInactive=true");
      return res.json();
    },
  });
  
  const [showPinModal, setShowPinModal] = useState(false);
  const [targetRole, setTargetRole] = useState<"manager" | "admin">("manager");
  const [pendingAction, setPendingAction] = useState<"edit" | "delete" | null>(null);
  const [authenticatedPin, setAuthenticatedPin] = useState<string | null>(() => {
    return sessionStorage.getItem(`auth_pin_${id}`);
  });
  
  const getRoleLabel = (role?: string) => {
    switch(role) {
      case "engineer": return "Site Engineer (View Only)";
      case "manager": return "Project Manager (Can Edit)";
      case "admin": return "Admin (Full Control)";
      default: return "Unknown";
    }
  };

  const cloneMutation = useMutation({
    mutationFn: async ({ role, pin }: { role: string; pin: string }) => {
      const response = await apiRequest("POST", `/api/dprs/${id}/clone`, { editedBy: role, pin });
      return response.json();
    },
    onSuccess: (newDpr) => {
      queryClient.invalidateQueries({ queryKey: ["/api/dprs"] });
      queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0]?.toString().startsWith("/api/site-purchases") || false });
      queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0]?.toString().startsWith("/api/plant-module/stock-ledger") || false });
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/stock-balances"] });
      toast({
        title: "Report Cloned",
        description: "A copy has been created for editing. Redirecting...",
      });
      setLocation(`/dpr/${newDpr.id}`);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to clone report",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (pin: string) => {
      await apiRequest("DELETE", `/api/dprs/${id}`, { pin });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/dprs"] });
      queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0]?.toString().startsWith("/api/site-purchases") || false });
      queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0]?.toString().startsWith("/api/plant-module/stock-ledger") || false });
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/stock-balances"] });
      toast({
        title: "Report Deleted",
        description: "The report has been deleted.",
      });
      setLocation("/");
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete report",
        variant: "destructive",
      });
    },
  });

  const handleEditClick = () => {
    if (canEdit && authenticatedPin) {
      cloneMutation.mutate({ role: access, pin: authenticatedPin });
    } else {
      setPendingAction("edit");
      setTargetRole("manager");
      setShowPinModal(true);
    }
  };

  const handleDeleteClick = () => {
    if (canDelete && authenticatedPin) {
      if (confirm("Are you sure you want to delete this report? This cannot be undone.")) {
        deleteMutation.mutate(authenticatedPin);
      }
    } else {
      setPendingAction("delete");
      setTargetRole("admin");
      setShowPinModal(true);
    }
  };

  const handlePinSuccess = (role: "manager" | "admin", pin: string) => {
    setShowPinModal(false);
    setAuthenticatedPin(pin);
    sessionStorage.setItem(`auth_pin_${id}`, pin);
    
    if (pendingAction === "delete" && role === "admin") {
      if (confirm("Are you sure you want to delete this report? This cannot be undone.")) {
        deleteMutation.mutate(pin);
      }
    } else if (pendingAction === "edit") {
      cloneMutation.mutate({ role, pin });
    }
    setPendingAction(null);
  };

  if (isLoading) return <div className="flex justify-center p-20"><Loader2 className="animate-spin w-8 h-8" /></div>;
  if (error || !dpr) return <div className="p-20 text-center text-red-500">Failed to load report.</div>;

  // Group materials by Material + UOM + Supplier for detailed abstract
  const materialAbstract = dpr.materials.reduce((acc: any[], m: any) => {
    const key = `${m.material}|${m.uom}|${m.supplier || 'Unknown'}`;
    const existing = acc.find(item => item.key === key);
    if (existing) {
      existing.totalQty += m.quantity || 0;
      existing.trips += 1;
    } else {
      acc.push({
        key,
        material: m.material,
        uom: m.uom,
        supplier: m.supplier || 'Unknown',
        totalQty: m.quantity || 0,
        trips: 1,
      });
    }
    return acc;
  }, []);

  // Group by material for summary cards
  const materialSummary = dpr.materials.reduce((acc: any[], m: any) => {
    const key = `${m.material}|${m.uom}`;
    const existing = acc.find(item => item.key === key);
    if (existing) {
      existing.totalQty += m.quantity || 0;
      existing.trips += 1;
    } else {
      acc.push({
        key,
        material: m.material,
        uom: m.uom,
        totalQty: m.quantity || 0,
        trips: 1,
      });
    }
    return acc;
  }, []);

  return (
    <div className="max-w-5xl mx-auto space-y-8 animate-in fade-in duration-300 print:p-0">
      {showPinModal && (
        <PinAuth
          targetRole={targetRole}
          onSuccess={handlePinSuccess}
          onClose={() => {
            setShowPinModal(false);
            setPendingAction(null);
          }}
        />
      )}

      {/* Header Actions */}
      <div className="flex items-center justify-between print:hidden flex-col md:flex-row gap-4">
        <div className="flex items-center gap-4">
          <Link href="/">
            <Button variant="ghost" size="icon" data-testid="button-back">
              <ChevronLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold font-display">Report Details</h1>
            <p className="text-xs text-muted-foreground mt-1">
              Current Access: {getRoleLabel(access)}
            </p>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap justify-end">
          <Button 
            variant="secondary" 
            className="gap-2"
            onClick={handleEditClick}
            disabled={cloneMutation.isPending}
            data-testid="button-edit-dpr"
          >
            <Edit className="w-4 h-4" />
            {cloneMutation.isPending ? "Cloning..." : "Edit Report"}
          </Button>
          <Button 
            variant="destructive" 
            size="sm" 
            className="gap-2"
            onClick={handleDeleteClick}
            disabled={deleteMutation.isPending}
            data-testid="button-delete-dpr"
          >
            <Trash2 className="w-4 h-4" />
            {deleteMutation.isPending ? "Deleting..." : "Delete Report"}
          </Button>
          <Button variant="outline" onClick={() => window.print()} className="gap-2" data-testid="button-print">
            <Printer className="w-4 h-4" /> Print
          </Button>
        </div>
      </div>

      {/* Report Info Header with HLC Logo */}
      <ReportHeader 
        date={dpr.date} 
        site={dpr.site} 
        engineer={dpr.engineer}
      />

      {/* Activity Progress */}
      <Card>
        <CardHeader>
          <CardTitle>Activity Progress</CardTitle>
        </CardHeader>
        <CardContent>
          {dpr.progress.length === 0 ? (
            <p className="text-muted-foreground italic">No activities recorded.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Activity</TableHead>
                  <TableHead>Side</TableHead>
                  <TableHead>From</TableHead>
                  <TableHead>To</TableHead>
                  <TableHead className="text-right">Length (m)</TableHead>
                  <TableHead className="text-right">Width (m)</TableHead>
                  <TableHead className="text-right">Thickness (m)</TableHead>
                  <TableHead className="text-right">Quantity</TableHead>
                  <TableHead>UOM</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dpr.progress.map((item: any, i: number) => {
                  const calculateQty = (length?: number, width?: number, thickness?: number, uom?: string) => {
                    if (!length || !width || !uom) return null;
                    if (uom.toLowerCase() === 'sqm') {
                      return (length * width).toFixed(3);
                    } else if (uom.toLowerCase() === 'cum') {
                      if (!thickness) return null;
                      return (length * width * thickness).toFixed(3);
                    }
                    return null;
                  };
                  const calculated = calculateQty(item.length, item.width, item.thickness, item.uom);
                  const displayQty = item.quantity || calculated || '-';
                  
                  return (
                    <TableRow key={i} data-testid={`row-progress-${i}`}>
                      <TableCell className="font-medium">{item.activity}</TableCell>
                      <TableCell><Badge variant="outline">{item.side || '-'}</Badge></TableCell>
                      <TableCell>{item.chainageFrom || '-'}</TableCell>
                      <TableCell>{item.chainageTo || '-'}</TableCell>
                      <TableCell className="text-right">
                        {(() => {
                          const derivedLength = (!item.length && item.chainageFrom && item.chainageTo) 
                            ? Math.abs((parseFloat(item.chainageTo) - parseFloat(item.chainageFrom)) * 1000)
                            : null;
                          return item.length || (derivedLength ? derivedLength.toFixed(0) : null) || '-';
                        })()}
                      </TableCell>
                      <TableCell className="text-right">{item.width || '-'}</TableCell>
                      <TableCell className="text-right">{item.thickness || '-'}</TableCell>
                      <TableCell className="text-right font-semibold">{displayQty}</TableCell>
                      <TableCell className="text-muted-foreground">{item.uom}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Two Column Layout for Resources */}
      <div className="grid grid-cols-1 gap-8">
        <Card>
          <CardHeader>
            <CardTitle>Equipment Log</CardTitle>
          </CardHeader>
          <CardContent>
            {dpr.equipment.length === 0 ? (
              <p className="text-muted-foreground italic">No equipment usage recorded.</p>
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Machine</TableHead>
                      <TableHead>Operator</TableHead>
                      <TableHead>Task</TableHead>
                      <TableHead>Start</TableHead>
                      <TableHead>End</TableHead>
                      <TableHead className="text-right">Hours</TableHead>
                      <TableHead className="text-right">Diesel (L)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dpr.equipment.map((item: any, i: number) => {
                      const calculateHours = (startTime?: string, endTime?: string) => {
                        if (!startTime || !endTime) return '-';
                        try {
                          const [startHour, startMin] = startTime.split(':').map(Number);
                          const [endHour, endMin] = endTime.split(':').map(Number);
                          const startMins = startHour * 60 + startMin;
                          const endMins = endHour * 60 + endMin;
                          const diff = endMins - startMins;
                          if (diff < 0) return '-';
                          return (diff / 60).toFixed(3);
                        } catch {
                          return '-';
                        }
                      };
                      const hours = calculateHours(item.startTime, item.endTime);
                      
                      const masterEquip = item.equipmentId ? equipmentList.find((e: EquipmentMasterType) => e.id === item.equipmentId) : null;
                      const ownerLabel = masterEquip
                        ? masterEquip.ownership === "hired"
                          ? `HIRED: ${masterEquip.vendorName || "Unknown Vendor"}`
                          : "HLC OWN"
                        : null;
                      
                      return (
                        <TableRow key={i} data-testid={`row-equipment-${i}`}>
                          <TableCell className="font-medium">
                            <div>
                              <span>{item.machine}</span>
                              {item.vehicleNo && (
                                <p className="text-xs text-muted-foreground" data-testid={`text-vehicle-no-${i}`}>
                                  Reg: {item.vehicleNo}
                                </p>
                              )}
                              {ownerLabel && (
                                <p className="text-xs text-muted-foreground" data-testid={`text-owner-info-${i}`}>
                                  {ownerLabel}
                                </p>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>{item.operator || '-'}</TableCell>
                          <TableCell className="text-sm">{item.task || '-'}</TableCell>
                          <TableCell>{item.startTime || '-'}</TableCell>
                          <TableCell>{item.endTime || '-'}</TableCell>
                          <TableCell className="text-right">{hours}</TableCell>
                          <TableCell className="text-right">{item.diesel || '-'}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
                <div className="mt-4 p-4 bg-primary/5 border border-primary/20 rounded-lg">
                  <p className="text-sm text-muted-foreground">Total Diesel Issued</p>
                  <p className="text-2xl font-bold text-primary">
                    {dpr.equipment.reduce((sum: number, e: any) => sum + (e.diesel || 0), 0).toFixed(3)} L
                  </p>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Labour Strength</CardTitle>
          </CardHeader>
          <CardContent>
             {dpr.labour.length === 0 ? (
              <p className="text-muted-foreground italic">No labour recorded.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Category</TableHead>
                    <TableHead>Gender</TableHead>
                    <TableHead className="text-right">Count</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dpr.labour.map((item: any, i: number) => (
                    <TableRow key={i} data-testid={`row-labour-${i}`}>
                      <TableCell>{item.category}</TableCell>
                      <TableCell>{item.gender}</TableCell>
                      <TableCell className="text-right font-mono font-bold">{item.count}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Materials Abstract */}
      <Card>
        <CardHeader>
          <CardTitle>Material Abstract</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {dpr.materials.length === 0 ? (
            <p className="text-muted-foreground italic">No materials recorded.</p>
          ) : (
            <>
              {/* Detailed Table with Supplier-wise Breakdown */}
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Material</TableHead>
                    <TableHead>UOM</TableHead>
                    <TableHead>Supplier</TableHead>
                    <TableHead className="text-right">Total Quantity</TableHead>
                    <TableHead className="text-right">Trips</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {materialAbstract.map((item: any, i: number) => (
                    <TableRow key={i} data-testid={`row-material-abstract-${i}`}>
                      <TableCell className="font-medium">{item.material}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{item.uom}</Badge>
                      </TableCell>
                      <TableCell className="text-sm">{item.supplier}</TableCell>
                      <TableCell className="text-right font-semibold">{item.totalQty.toFixed(3)}</TableCell>
                      <TableCell className="text-right">{item.trips}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {/* Summary Cards by Material */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {materialSummary.map((item: any, i: number) => (
                  <div 
                    key={i} 
                    className="p-4 bg-muted/50 border rounded-lg"
                    data-testid={`card-material-summary-${i}`}
                  >
                    <p className="text-sm font-medium">{item.material}</p>
                    <p className="text-2xl font-bold">{item.totalQty.toFixed(3)} <span className="text-sm font-normal text-muted-foreground">{item.uom}</span></p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {item.trips} trip{item.trips > 1 ? 's' : ''}
                    </p>
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
