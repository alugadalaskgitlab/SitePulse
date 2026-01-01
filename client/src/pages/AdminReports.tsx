import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, Filter, Loader2, Fuel, Clock, Package, Activity, MapPin, Calendar } from "lucide-react";
import { Link, useLocation } from "wouter";
import { format } from "date-fns";
import { PinAuth } from "@/components/PinAuth";
import { useToast } from "@/hooks/use-toast";
import type { DprWithDetails } from "@shared/schema";

export default function AdminReports() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [showPinAuth, setShowPinAuth] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selectedSite, setSelectedSite] = useState<string>("all");
  const [selectedActivity, setSelectedActivity] = useState<string>("all");
  const [selectedMaterial, setSelectedMaterial] = useState<string>("all");
  const [selectedEquipment, setSelectedEquipment] = useState<string>("all");
  const [selectedSupplier, setSelectedSupplier] = useState<string>("all");

  const { data: dprs = [], isLoading } = useQuery<DprWithDetails[]>({
    queryKey: ["/api/dprs"],
    enabled: authenticated,
  });

  const handlePinAuthSuccess = (role: "manager" | "admin") => {
    if (role === "admin") {
      setAuthenticated(true);
      setShowPinAuth(false);
    } else {
      toast({
        title: "Access Denied",
        description: "Admin PIN required to access reports.",
        variant: "destructive",
      });
    }
  };

  const uniqueSites = useMemo(() => {
    const sites = new Set<string>();
    dprs.forEach(d => sites.add(d.site));
    return Array.from(sites).sort();
  }, [dprs]);

  const uniqueActivities = useMemo(() => {
    const activities = new Set<string>();
    dprs.forEach(d => d.progress?.forEach(p => p.activity && activities.add(p.activity)));
    return Array.from(activities).sort();
  }, [dprs]);

  const uniqueMaterials = useMemo(() => {
    const materials = new Set<string>();
    dprs.forEach(d => d.materials?.forEach(m => m.material && materials.add(m.material)));
    return Array.from(materials).sort();
  }, [dprs]);

  const uniqueEquipment = useMemo(() => {
    const equipment = new Set<string>();
    dprs.forEach(d => d.equipment?.forEach(e => e.machine && equipment.add(e.machine)));
    return Array.from(equipment).sort();
  }, [dprs]);

  const uniqueSuppliers = useMemo(() => {
    const suppliers = new Set<string>();
    dprs.forEach(d => d.materials?.forEach(m => m.supplier && suppliers.add(m.supplier)));
    return Array.from(suppliers).sort();
  }, [dprs]);

  const filteredDprs = useMemo(() => {
    return dprs.filter(dpr => {
      if (dateFrom && dpr.date < dateFrom) return false;
      if (dateTo && dpr.date > dateTo) return false;
      if (selectedSite !== "all" && dpr.site !== selectedSite) return false;
      if (selectedActivity !== "all" && !dpr.progress?.some(p => p.activity === selectedActivity)) return false;
      if (selectedMaterial !== "all" && !dpr.materials?.some(m => m.material === selectedMaterial)) return false;
      if (selectedEquipment !== "all" && !dpr.equipment?.some(e => e.machine === selectedEquipment)) return false;
      if (selectedSupplier !== "all" && !dpr.materials?.some(m => m.supplier === selectedSupplier)) return false;
      return true;
    });
  }, [dprs, dateFrom, dateTo, selectedSite, selectedActivity, selectedMaterial, selectedEquipment, selectedSupplier]);

  const summaryStats = useMemo(() => {
    let totalDiesel = 0;
    let totalHours = 0;
    const materialTotals: Record<string, { quantity: number; trips: number; uom: string }> = {};
    const equipmentStats: Record<string, { hours: number; diesel: number; count: number }> = {};
    const activityStats: Record<string, { quantity: number; uom: string; count: number }> = {};

    filteredDprs.forEach(dpr => {
      dpr.equipment?.forEach(e => {
        const diesel = e.diesel || 0;
        totalDiesel += diesel;
        
        let hours = 0;
        if (e.startTime && e.endTime) {
          try {
            const [startHour, startMin] = e.startTime.split(':').map(Number);
            const [endHour, endMin] = e.endTime.split(':').map(Number);
            hours = ((endHour * 60 + endMin) - (startHour * 60 + startMin)) / 60;
            if (hours < 0) hours = 0;
          } catch { hours = 0; }
        }
        totalHours += hours;

        if (e.machine) {
          if (!equipmentStats[e.machine]) {
            equipmentStats[e.machine] = { hours: 0, diesel: 0, count: 0 };
          }
          equipmentStats[e.machine].hours += hours;
          equipmentStats[e.machine].diesel += diesel;
          equipmentStats[e.machine].count += 1;
        }
      });

      dpr.materials?.forEach(m => {
        if (m.material) {
          const key = `${m.material}|${m.uom}`;
          if (!materialTotals[key]) {
            materialTotals[key] = { quantity: 0, trips: 0, uom: m.uom || '' };
          }
          materialTotals[key].quantity += m.quantity || 0;
          materialTotals[key].trips += 1;
        }
      });

      dpr.progress?.forEach(p => {
        if (p.activity) {
          const key = `${p.activity}|${p.uom}`;
          if (!activityStats[key]) {
            activityStats[key] = { quantity: 0, uom: p.uom || '', count: 0 };
          }
          activityStats[key].quantity += p.quantity || 0;
          activityStats[key].count += 1;
        }
      });
    });

    return {
      totalDiesel,
      totalHours,
      materialTotals: Object.entries(materialTotals).map(([key, v]) => ({
        material: key.split('|')[0],
        ...v,
      })),
      equipmentStats: Object.entries(equipmentStats).map(([machine, v]) => ({
        machine,
        ...v,
      })),
      activityStats: Object.entries(activityStats).map(([key, v]) => ({
        activity: key.split('|')[0],
        ...v,
      })),
    };
  }, [filteredDprs]);

  const clearFilters = () => {
    setDateFrom("");
    setDateTo("");
    setSelectedSite("all");
    setSelectedActivity("all");
    setSelectedMaterial("all");
    setSelectedEquipment("all");
    setSelectedSupplier("all");
  };

  if (showPinAuth && !authenticated) {
    return (
      <PinAuth
        targetRole="admin"
        onSuccess={handlePinAuthSuccess}
        onClose={() => window.history.back()}
      />
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-20 animate-in fade-in duration-300">
      <div className="flex items-center gap-4">
        <Link href="/">
          <Button variant="ghost" size="icon" data-testid="button-back">
            <ChevronLeft className="w-5 h-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold font-display">Admin Reports</h1>
          <p className="text-muted-foreground text-sm">Generate filtered summary reports</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="w-5 h-5" />
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label>Date From</Label>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                data-testid="input-date-from"
              />
            </div>
            <div className="space-y-2">
              <Label>Date To</Label>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                data-testid="input-date-to"
              />
            </div>
            <div className="space-y-2">
              <Label>Site</Label>
              <Select value={selectedSite} onValueChange={setSelectedSite}>
                <SelectTrigger data-testid="select-site">
                  <SelectValue placeholder="All Sites" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Sites</SelectItem>
                  {uniqueSites.map(site => (
                    <SelectItem key={site} value={site}>{site}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Activity</Label>
              <Select value={selectedActivity} onValueChange={setSelectedActivity}>
                <SelectTrigger data-testid="select-activity">
                  <SelectValue placeholder="All Activities" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Activities</SelectItem>
                  {uniqueActivities.map(activity => (
                    <SelectItem key={activity} value={activity}>{activity}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Material</Label>
              <Select value={selectedMaterial} onValueChange={setSelectedMaterial}>
                <SelectTrigger data-testid="select-material">
                  <SelectValue placeholder="All Materials" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Materials</SelectItem>
                  {uniqueMaterials.map(material => (
                    <SelectItem key={material} value={material}>{material}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Supplier</Label>
              <Select value={selectedSupplier} onValueChange={setSelectedSupplier}>
                <SelectTrigger data-testid="select-supplier">
                  <SelectValue placeholder="All Suppliers" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Suppliers</SelectItem>
                  {uniqueSuppliers.map(supplier => (
                    <SelectItem key={supplier} value={supplier}>{supplier}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Equipment</Label>
              <Select value={selectedEquipment} onValueChange={setSelectedEquipment}>
                <SelectTrigger data-testid="select-equipment">
                  <SelectValue placeholder="All Equipment" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Equipment</SelectItem>
                  {uniqueEquipment.map(eq => (
                    <SelectItem key={eq} value={eq}>{eq}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button variant="outline" onClick={clearFilters} className="w-full" data-testid="button-clear-filters">
                Clear Filters
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="flex justify-center p-20">
          <Loader2 className="w-8 h-8 animate-spin" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-4 text-center">
                <div className="flex items-center justify-center gap-2">
                  <Calendar className="w-5 h-5 text-blue-500" />
                  <p className="text-2xl font-bold text-blue-500" data-testid="text-total-reports">{filteredDprs.length}</p>
                </div>
                <p className="text-sm text-muted-foreground">Total Reports</p>
              </CardContent>
            </Card>
            <Card className="border-primary/30 bg-primary/5">
              <CardContent className="p-4 text-center">
                <div className="flex items-center justify-center gap-2">
                  <Fuel className="w-5 h-5 text-primary" />
                  <p className="text-2xl font-bold text-primary" data-testid="text-total-diesel">{summaryStats.totalDiesel.toFixed(1)} L</p>
                </div>
                <p className="text-sm text-muted-foreground">Total Diesel</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <div className="flex items-center justify-center gap-2">
                  <Clock className="w-5 h-5 text-green-500" />
                  <p className="text-2xl font-bold text-green-500" data-testid="text-total-hours">{summaryStats.totalHours.toFixed(1)} hrs</p>
                </div>
                <p className="text-sm text-muted-foreground">Equipment Hours</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <div className="flex items-center justify-center gap-2">
                  <Package className="w-5 h-5 text-orange-500" />
                  <p className="text-2xl font-bold text-orange-500" data-testid="text-total-materials">{summaryStats.materialTotals.length}</p>
                </div>
                <p className="text-sm text-muted-foreground">Material Types</p>
              </CardContent>
            </Card>
          </div>

          {summaryStats.materialTotals.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Package className="w-5 h-5" />
                  Materials Summary
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {summaryStats.materialTotals.map((m, i) => (
                    <div key={i} className="p-3 bg-muted/50 border rounded-lg" data-testid={`card-material-summary-${i}`}>
                      <p className="font-semibold">{m.material}</p>
                      <p className="text-lg font-bold text-primary">{m.quantity.toFixed(1)} {m.uom}</p>
                      <p className="text-xs text-muted-foreground">{m.trips} trip{m.trips > 1 ? 's' : ''}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {summaryStats.equipmentStats.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="w-5 h-5" />
                  Equipment Usage Summary
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Machine</TableHead>
                      <TableHead className="text-right">Usage Count</TableHead>
                      <TableHead className="text-right">Total Hours</TableHead>
                      <TableHead className="text-right">Total Diesel (L)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {summaryStats.equipmentStats.map((e, i) => (
                      <TableRow key={i} data-testid={`row-equipment-summary-${i}`}>
                        <TableCell className="font-medium">{e.machine}</TableCell>
                        <TableCell className="text-right">{e.count}</TableCell>
                        <TableCell className="text-right">{e.hours.toFixed(1)}</TableCell>
                        <TableCell className="text-right font-semibold">{e.diesel.toFixed(1)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {summaryStats.activityStats.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="w-5 h-5" />
                  Activities Summary
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Activity</TableHead>
                      <TableHead className="text-right">Occurrences</TableHead>
                      <TableHead className="text-right">Total Quantity</TableHead>
                      <TableHead>UOM</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {summaryStats.activityStats.map((a, i) => (
                      <TableRow key={i} data-testid={`row-activity-summary-${i}`}>
                        <TableCell className="font-medium">{a.activity}</TableCell>
                        <TableCell className="text-right">{a.count}</TableCell>
                        <TableCell className="text-right font-semibold">{a.quantity.toFixed(2)}</TableCell>
                        <TableCell className="text-muted-foreground">{a.uom}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MapPin className="w-5 h-5" />
                Filtered Reports ({filteredDprs.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {filteredDprs.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">No reports match the selected filters.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Site</TableHead>
                      <TableHead>Engineer</TableHead>
                      <TableHead className="text-right">Activities</TableHead>
                      <TableHead className="text-right">Equipment</TableHead>
                      <TableHead className="text-right">Diesel (L)</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredDprs.slice(0, 50).map((dpr) => (
                      <TableRow key={dpr.id} data-testid={`row-report-${dpr.id}`}>
                        <TableCell>{format(new Date(dpr.date), "dd MMM yyyy")}</TableCell>
                        <TableCell className="font-medium">{dpr.site}</TableCell>
                        <TableCell>{dpr.engineer}</TableCell>
                        <TableCell className="text-right">{dpr.progress?.length || 0}</TableCell>
                        <TableCell className="text-right">{dpr.equipment?.length || 0}</TableCell>
                        <TableCell className="text-right">
                          {(dpr.equipment?.reduce((sum, e) => sum + (e.diesel || 0), 0) || 0).toFixed(1)}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setLocation(`/site/report/${dpr.id}`)}
                            data-testid={`button-view-${dpr.id}`}
                          >
                            View
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
              {filteredDprs.length > 50 && (
                <p className="text-sm text-muted-foreground text-center mt-4">
                  Showing first 50 of {filteredDprs.length} reports
                </p>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
