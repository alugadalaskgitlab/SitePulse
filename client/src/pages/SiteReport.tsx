import { useState, useEffect } from "react";
import { useDpr } from "@/hooks/use-dprs";
import { Link, useRoute, useLocation } from "wouter";
import { useOrigin } from "@/hooks/use-origin";
import { ChevronLeft, Loader2, Printer, Edit, Trash2, Fuel, Home, ShoppingCart } from "lucide-react";
import { ReportHeader } from "@/components/ReportHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PinAuth } from "@/components/PinAuth";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Personnel } from "@shared/schema";

const MANAGER_PIN = "1234";
const ADMIN_PIN = "5678";

export default function SiteReport() {
  const [, params] = useRoute("/site/report/:id");
  const [, setLocation] = useLocation();
  const id = parseInt(params?.id || "0");
  const { data: dpr, isLoading, error } = useDpr(id);
  const { toast } = useToast();
  const { data: personnelList } = useQuery<Personnel[]>({
    queryKey: ["/api/personnel"],
  });

  const getPersonnelNames = (ids: number[] | undefined) => {
    if (!ids?.length || !personnelList) return null;
    return ids.map(id => personnelList.find(p => p.id === id)?.name).filter(Boolean).join(", ");
  };
  const { appendOrigin } = useOrigin();
  const backLink = appendOrigin("/site/dashboard");
  
  const [showPinModal, setShowPinModal] = useState(false);
  const [authenticatedRole, setAuthenticatedRole] = useState<"manager" | "admin" | null>(null);
  const [authenticatedPin, setAuthenticatedPin] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Restore authenticated role from sessionStorage on mount
  useEffect(() => {
    const storedRole = sessionStorage.getItem(`auth_role_${id}`);
    const storedPin = sessionStorage.getItem(`edit_pin_${id}`);
    if (storedRole && storedPin) {
      setAuthenticatedRole(storedRole as "manager" | "admin");
      setAuthenticatedPin(storedPin);
    }
  }, [id]);

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
        description: "A new version has been created. Redirecting...",
      });
      setLocation(appendOrigin(`/site/report/${newDpr.id}`));
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
      setLocation(backLink);
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
    setShowPinModal(true);
  };

  const handlePinSuccess = (role: "manager" | "admin", pin: string) => {
    setShowPinModal(false);
    setAuthenticatedRole(role);
    setAuthenticatedPin(pin);
    
    // Store PIN and role in sessionStorage (not exposed in URL)
    sessionStorage.setItem(`edit_pin_${id}`, pin);
    sessionStorage.setItem(`auth_role_${id}`, role);
    // Stay on report page - user can now choose Edit or Delete
  };

  const handleAdminEdit = () => {
    if (authenticatedRole && authenticatedPin) {
      // Store PIN and role in sessionStorage (not exposed in URL)
      sessionStorage.setItem(`edit_pin_${id}`, authenticatedPin);
      sessionStorage.setItem(`auth_role_${id}`, authenticatedRole);
      setLocation(appendOrigin(`/site/edit/${id}`));
    }
  };

  const handleAdminDelete = () => {
    if (authenticatedRole === "admin") {
      setShowDeleteConfirm(true);
    }
  };

  const confirmDelete = () => {
    if (authenticatedPin) {
      deleteMutation.mutate(authenticatedPin);
    }
    setShowDeleteConfirm(false);
  };

  if (isLoading) return <div className="flex justify-center p-20"><Loader2 className="animate-spin w-8 h-8" /></div>;
  if (error || !dpr) return <div className="p-20 text-center text-red-500">Failed to load report.</div>;

  // Materials Abstract: Group by Material + UOM
  const materialsAbstract = dpr.materials.reduce((acc: any[], m: any) => {
    if (!m.material) return acc;
    const key = `${m.material}|${m.uom}`;
    const existing = acc.find(item => item.key === key);
    if (existing) {
      existing.total += m.quantity || 0;
      existing.trips += 1;
    } else {
      acc.push({
        key,
        material: m.material,
        uom: m.uom,
        total: m.quantity || 0,
        trips: 1,
      });
    }
    return acc;
  }, []);

  // Total Diesel
  const totalDiesel = dpr.equipment.reduce((sum: number, e: any) => sum + (e.diesel || 0), 0);

  return (
    <div className="max-w-5xl mx-auto space-y-8 animate-in fade-in duration-300 print:p-0">
      {showPinModal && (
        <PinAuth
          targetRole="any"
          onSuccess={handlePinSuccess}
          onClose={() => setShowPinModal(false)}
        />
      )}

      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="max-w-md w-full">
            <CardContent className="p-6">
              <h3 className="text-lg font-bold mb-2">Delete Report?</h3>
              <p className="text-muted-foreground mb-6">
                Are you sure you want to delete this report? This action cannot be undone.
              </p>
              <div className="flex gap-3 justify-end">
                <Button variant="outline" onClick={() => setShowDeleteConfirm(false)}>
                  Cancel
                </Button>
                <Button variant="destructive" onClick={confirmDelete} disabled={deleteMutation.isPending}>
                  {deleteMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Delete"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Header Actions */}
      <div className="flex items-center justify-between print:hidden flex-col md:flex-row gap-4">
        <div className="flex items-center gap-4">
          <Link href={backLink}>
            <Button variant="ghost" size="icon" data-testid="button-back">
              <ChevronLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold font-display">Site Report</h1>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap justify-end">
          {authenticatedRole ? (
            <>
              <Button 
                variant="secondary" 
                className="gap-2"
                onClick={handleAdminEdit}
                disabled={cloneMutation.isPending}
                data-testid="button-admin-edit"
              >
                <Edit className="w-4 h-4" />
                {cloneMutation.isPending ? "Saving..." : "Edit (Create Version)"}
              </Button>
              {authenticatedRole === "admin" && (
                <Button 
                  variant="destructive" 
                  className="gap-2"
                  onClick={handleAdminDelete}
                  disabled={deleteMutation.isPending}
                  data-testid="button-admin-delete"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete
                </Button>
              )}
            </>
          ) : (
            <Button 
              variant="secondary" 
              className="gap-2"
              onClick={handleEditClick}
              disabled={cloneMutation.isPending}
              data-testid="button-edit"
            >
              <Edit className="w-4 h-4" />
              {cloneMutation.isPending ? "Cloning..." : "Edit"}
            </Button>
          )}
          <Button variant="outline" onClick={() => window.print()} className="gap-2" data-testid="button-print">
            <Printer className="w-4 h-4" /> Print
          </Button>
          <Link href="/">
            <Button variant="ghost" className="gap-2" data-testid="button-home">
              <Home className="w-4 h-4" /> Home
            </Button>
          </Link>
        </div>
      </div>

      {/* Report Info Header with HLC Logo */}
      <ReportHeader 
        date={dpr.date} 
        site={dpr.site} 
        engineer={dpr.engineer} 
        submittedAt={dpr.submittedAt || undefined}
      />

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-primary">{dpr.progress.length}</p>
            <p className="text-sm text-muted-foreground">Activities</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-primary">{dpr.equipment.length}</p>
            <p className="text-sm text-muted-foreground">Equipment</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-primary">{dpr.labour.reduce((sum: number, l: any) => sum + l.count, 0)}</p>
            <p className="text-sm text-muted-foreground">Workers</p>
          </CardContent>
        </Card>
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="p-4 text-center">
            <div className="flex items-center justify-center gap-2">
              <Fuel className="w-5 h-5 text-primary" />
              <p className="text-2xl font-bold text-primary">{totalDiesel.toFixed(3)} L</p>
            </div>
            <p className="text-sm text-muted-foreground">Total Diesel</p>
          </CardContent>
        </Card>
        {dpr.sitePurchases && dpr.sitePurchases.length > 0 && (
          <Card className="border-teal-500/30 bg-teal-500/5">
            <CardContent className="p-4 text-center">
              <div className="flex items-center justify-center gap-2">
                <ShoppingCart className="w-5 h-5 text-teal-600" />
                <p className="text-2xl font-bold text-teal-600" data-testid="text-purchases-count">{dpr.sitePurchases.length}</p>
              </div>
              <p className="text-sm text-muted-foreground">Purchases</p>
            </CardContent>
          </Card>
        )}
      </div>

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
                  const personnelNames = getPersonnelNames(item.personnelIds);
                  if (item.noSiteWork) {
                    return (
                      <TableRow key={i} data-testid={`row-progress-${i}`}>
                        <TableCell className="font-medium">
                          <div>{item.activity}</div>
                          {item.noSiteWorkDescription && (
                            <div className="text-xs text-muted-foreground mt-1">{item.noSiteWorkDescription}</div>
                          )}
                          {personnelNames && (
                            <div className="text-xs text-muted-foreground mt-1">Personnel: {personnelNames}</div>
                          )}
                        </TableCell>
                        <TableCell colSpan={8} className="text-muted-foreground italic">No site work</TableCell>
                      </TableRow>
                    );
                  }

                  const derivedLength = (!item.length && item.chainageFrom && item.chainageTo) 
                    ? Math.abs((parseFloat(item.chainageTo) - parseFloat(item.chainageFrom)) * 1000)
                    : null;
                  const displayLength = item.length || (derivedLength ? derivedLength.toFixed(0) : null);
                  
                  return (
                    <TableRow key={i} data-testid={`row-progress-${i}`}>
                      <TableCell className="font-medium">
                        <div>{item.activity}</div>
                        {personnelNames && (
                          <div className="text-xs text-muted-foreground mt-1">Personnel: {personnelNames}</div>
                        )}
                      </TableCell>
                      <TableCell><Badge variant="outline">{item.side || '-'}</Badge></TableCell>
                      <TableCell>{item.chainageFrom || '-'}</TableCell>
                      <TableCell>{item.chainageTo || '-'}</TableCell>
                      <TableCell className="text-right">{displayLength || '-'}</TableCell>
                      <TableCell className="text-right">{item.width || '-'}</TableCell>
                      <TableCell className="text-right">{item.thickness || '-'}</TableCell>
                      <TableCell className="text-right font-semibold">{item.quantity?.toFixed(3) || '-'}</TableCell>
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
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Machine</TableHead>
                    <TableHead>Vehicle No</TableHead>
                    <TableHead>Operator</TableHead>
                    <TableHead>Task</TableHead>
                    <TableHead>Time/Meter</TableHead>
                    <TableHead className="text-right">Hours</TableHead>
                    <TableHead className="text-right">Diesel (L)</TableHead>
                    <TableHead>Diesel Source</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dpr.equipment.map((item: any, i: number) => {
                    const calculateTimeHours = (startTime?: string, endTime?: string) => {
                      if (!startTime || !endTime) return null;
                      try {
                        const [startHour, startMin] = startTime.split(':').map(Number);
                        const [endHour, endMin] = endTime.split(':').map(Number);
                        const startMins = startHour * 60 + startMin;
                        const endMins = endHour * 60 + endMin;
                        let diff = endMins - startMins;
                        if (diff < 0) diff += 24 * 60;
                        return diff / 60;
                      } catch {
                        return null;
                      }
                    };
                    const calculateMeterHours = (opening?: number, closing?: number) => {
                      if (opening == null || closing == null) return null;
                      const diff = closing - opening;
                      return diff >= 0 ? diff : null;
                    };
                    
                    const et = item.entryType || "time_meter";
                    const isTripBased = et === "trip_based";
                    
                    const meterHours = calculateMeterHours(item.openingReading, item.closingReading);
                    const timeHours = calculateTimeHours(item.startTime, item.endTime);
                    const hours = item.hoursWorked ?? meterHours ?? timeHours;
                    
                    const hasReading = item.openingReading != null && item.closingReading != null;
                    const hasTime = item.startTime && item.endTime;
                    const readingSource = hasReading 
                      ? `Meter: ${item.openingReading} - ${item.closingReading}`
                      : (hasTime ? `Time: ${item.startTime} - ${item.endTime}` : '-');

                    const dieselSourceLabel = item.dieselSource === 'direct_purchase' ? 'Direct Purchase'
                      : item.dieselSource === 'contractor' ? 'Contractor'
                      : item.dieselSource === 'plant_stock' ? 'Plant Stock' : '-';
                    
                    return (
                      <TableRow key={i} data-testid={`row-equipment-${i}`}>
                        <TableCell className="font-medium">
                          {item.machine}
                          {et === "hourly" && <Badge variant="outline" className="ml-1 text-[10px] bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-blue-300 dark:border-blue-700">Hourly Hire</Badge>}
                          {et === "daily" && <Badge variant="outline" className="ml-1 text-[10px] bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-700">Daily Hire</Badge>}
                          {et === "monthly" && <Badge variant="outline" className="ml-1 text-[10px] bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 border-purple-300 dark:border-purple-700">Monthly Hire</Badge>}
                          {et === "trip_based" && <Badge variant="outline" className="ml-1 text-[10px] bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 border-green-300 dark:border-green-700">Trip Based</Badge>}
                        </TableCell>
                        <TableCell>{item.vehicleNo || '-'}</TableCell>
                        <TableCell>{item.operator || '-'}</TableCell>
                        <TableCell className="text-sm">{item.task || '-'}</TableCell>
                        <TableCell className="text-xs">
                          {readingSource}
                          {isTripBased && item.numberOfTrips && item.tripDistance && (
                            <div className="text-[10px] text-muted-foreground">{item.numberOfTrips} trips × {item.tripDistance} km</div>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {hours != null ? hours.toFixed(3) : '-'}
                          {isTripBased && item.numberOfTrips && item.tripDistance && (
                            <div className="text-[10px] text-muted-foreground">{(item.numberOfTrips * item.tripDistance * 2).toFixed(1)} km</div>
                          )}
                        </TableCell>
                        <TableCell className="text-right">{item.diesel || '-'}</TableCell>
                        <TableCell>
                          <span className="text-xs">{dieselSourceLabel}</span>
                          {item.dieselSource === 'direct_purchase' && (
                            <div className="text-xs text-muted-foreground mt-0.5">
                              {item.fuelStation && <span>{item.fuelStation}</span>}
                              {item.billNumber && <span> | Bill: {item.billNumber}</span>}
                              {item.amountPaid && <span> | Rs. {item.amountPaid}</span>}
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
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
                    <TableHead>Task/Work</TableHead>
                    <TableHead>Contractor/Gang</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dpr.labour.map((item: any, i: number) => (
                    <TableRow key={i} data-testid={`row-labour-${i}`}>
                      <TableCell>{item.category}</TableCell>
                      <TableCell>{item.gender}</TableCell>
                      <TableCell className="text-right font-mono font-bold">{item.count}</TableCell>
                      <TableCell>{item.task || '-'}</TableCell>
                      <TableCell>{item.contractor || '-'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Materials Log */}
      <Card>
        <CardHeader>
          <CardTitle>Materials Log</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {dpr.materials.length === 0 ? (
            <p className="text-muted-foreground italic">No materials recorded.</p>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead>Material</TableHead>
                    <TableHead className="text-right">Quantity</TableHead>
                    <TableHead>UOM</TableHead>
                    <TableHead>Vehicle No.</TableHead>
                    <TableHead>Supplier</TableHead>
                    <TableHead>Location/Task</TableHead>
                    <TableHead>Receipt No.</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dpr.materials.map((item: any, i: number) => (
                    <TableRow key={i} data-testid={`row-material-${i}`}>
                      <TableCell>
                        <Badge variant={item.type === 'Received' ? 'default' : item.type === 'Issued' ? 'secondary' : 'outline'}>
                          {item.type || 'Received'}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-medium">{item.material}</TableCell>
                      <TableCell className="text-right font-semibold">{item.quantity?.toFixed(3) || '-'}</TableCell>
                      <TableCell className="text-muted-foreground">{item.uom}</TableCell>
                      <TableCell>{item.vehicleNumber || '-'}</TableCell>
                      <TableCell>{item.supplier || '-'}</TableCell>
                      <TableCell>{item.location || '-'}</TableCell>
                      <TableCell>{item.receiptNumber || '-'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {/* Materials Abstract Summary */}
              <div className="pt-4 border-t">
                <h4 className="text-sm font-semibold text-muted-foreground mb-3">Materials Summary</h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {materialsAbstract.map((item: any, i: number) => (
                    <div 
                      key={i} 
                      className="p-3 bg-muted/50 border rounded-lg"
                      data-testid={`card-material-abstract-${i}`}
                    >
                      <p className="text-sm font-medium">{item.material}</p>
                      <div className="flex items-baseline gap-1 mt-1">
                        <p className="text-xl font-bold text-primary">{item.total.toFixed(3)}</p>
                        <p className="text-xs text-muted-foreground">{item.uom}</p>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {item.trips} trip{item.trips > 1 ? 's' : ''}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Site Purchases */}
      {dpr.sitePurchases && dpr.sitePurchases.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Site Purchases</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item Description</TableHead>
                  <TableHead>Vendor</TableHead>
                  <TableHead>Bill No</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead>UOM</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dpr.sitePurchases.map((item: any, i: number) => (
                  <TableRow key={i} data-testid={`row-site-purchase-${i}`}>
                    <TableCell className="font-medium">{item.itemDescription}</TableCell>
                    <TableCell>{item.vendor || '-'}</TableCell>
                    <TableCell>{item.billNo || '-'}</TableCell>
                    <TableCell className="text-right font-semibold">{item.amount ? Number(item.amount).toFixed(3) : '-'}</TableCell>
                    <TableCell className="text-right">{item.quantity ? Number(item.quantity).toFixed(3) : '-'}</TableCell>
                    <TableCell className="text-muted-foreground">{item.uom || '-'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
