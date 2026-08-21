import { ChevronLeft, Send, Loader2, Fuel } from "lucide-react";
import { ReportHeader } from "@/components/ReportHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from "date-fns";
import { useQuery } from "@tanstack/react-query";
import type { Personnel, EquipmentMasterType } from "@shared/schema";

interface PreviewData {
  date: string;
  site: string;
  engineer: string;
  progress: any[];
  equipment: any[];
  labour: any[];
  materials: any[];
  sitePurchases?: any[];
  totalDiesel: number;
  materialsAbstract: { material: string; uom: string; trips: number; total: number }[];
}

interface SitePreviewProps {
  data: PreviewData;
  onBack: () => void;
  onSubmit: () => void;
  isSubmitting: boolean;
}

export default function SitePreview({ data, onBack, onSubmit, isSubmitting }: SitePreviewProps) {
  const { data: personnelList } = useQuery<Personnel[]>({
    queryKey: ["/api/personnel"],
  });

  const { data: equipmentList } = useQuery<EquipmentMasterType[]>({
    queryKey: ["/api/plant-module/equipment", { includeInactive: true }],
    queryFn: () => fetch("/api/plant-module/equipment?includeInactive=true").then(r => r.json()),
  });

  const getPersonnelNames = (ids: number[] | undefined) => {
    if (!ids?.length || !personnelList) return null;
    return ids.map(id => personnelList.find(p => p.id === id)?.name).filter(Boolean).join(", ");
  };

  const calculateHours = (startTime?: string, endTime?: string): string => {
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

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-20 print:p-0">
      {/* Header */}
      <div className="flex items-center justify-between print:hidden">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={onBack} data-testid="button-back-to-edit">
            <ChevronLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold font-display">Report Preview</h1>
            <p className="text-muted-foreground text-sm">Review before submitting</p>
          </div>
        </div>
        <Button 
          onClick={onSubmit} 
          disabled={isSubmitting}
          className="gap-2"
          data-testid="button-submit-report"
        >
          {isSubmitting ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Send className="w-4 h-4" />
          )}
          Submit Report
        </Button>
      </div>

      {/* Report Header with HLC Logo */}
      <ReportHeader 
        date={data.date} 
        site={data.site} 
        engineer={data.engineer}
      />

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-primary">{data.progress.filter(p => p.activity).length}</p>
            <p className="text-sm text-muted-foreground">Activities</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-primary">{data.equipment.filter(e => e.machine).length}</p>
            <p className="text-sm text-muted-foreground">Equipment</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-primary">{data.labour.reduce((sum, l) => sum + l.count, 0)}</p>
            <p className="text-sm text-muted-foreground">Workers</p>
          </CardContent>
        </Card>
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="p-4 text-center">
            <div className="flex items-center justify-center gap-2">
              <Fuel className="w-5 h-5 text-primary" />
              <p className="text-2xl font-bold text-primary">{data.totalDiesel.toFixed(3)} L</p>
            </div>
            <p className="text-sm text-muted-foreground">Total Diesel</p>
          </CardContent>
        </Card>
      </div>

      {/* Activity Progress */}
      {data.progress.some(p => p.activity) && (
        <Card>
          <CardHeader>
            <CardTitle>Activity Progress</CardTitle>
          </CardHeader>
          <CardContent>
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
                {data.progress.filter(p => p.activity).map((item, i) => {
                  const personnelNames = getPersonnelNames(item.personnelIds);
                  if (item.noSiteWork) {
                    return (
                      <TableRow key={i}>
                        <TableCell className="font-medium">
                          <div>{item.activity}</div>
                          {item.noSiteWorkDescription && (
                            <div className="text-sm text-muted-foreground mt-1">{item.noSiteWorkDescription}</div>
                          )}
                          {personnelNames && (
                            <div className="text-sm text-muted-foreground mt-1">Personnel: {personnelNames}</div>
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
                    <TableRow key={i}>
                      <TableCell className="font-medium">
                        <div>{item.activity}</div>
                        {/* Batch 06V: incidental badge */}
                        {item.isIncidental && (
                          <div className="mt-1">
                            <Badge variant="outline" className="text-[10px] border-amber-400 text-amber-700 dark:text-amber-400">
                              Incidental / Non-BOQ · No BOQ Credit
                            </Badge>
                            {item.incidentalDescription && (
                              <div className="text-xs text-muted-foreground mt-0.5">{item.incidentalDescription}</div>
                            )}
                          </div>
                        )}
                        {personnelNames && (
                          <div className="text-sm text-muted-foreground mt-1">Personnel: {personnelNames}</div>
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
          </CardContent>
        </Card>
      )}

      {/* Equipment Log */}
      {data.equipment.some(e => e.machine) && (
        <Card>
          <CardHeader>
            <CardTitle>Equipment Log</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Machine</TableHead>
                  <TableHead>Operator</TableHead>
                  <TableHead>Task</TableHead>
                  <TableHead>Start</TableHead>
                  <TableHead>End</TableHead>
                  <TableHead className="text-right">Opening</TableHead>
                  <TableHead className="text-right">Closing</TableHead>
                  <TableHead className="text-right">Hours</TableHead>
                  <TableHead className="text-right">Diesel (L)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.equipment.filter(e => e.machine).map((item, i) => {
                  const et = item.entryType || "time_meter";
                  const meterDiff = (item.openingReading != null && item.closingReading != null)
                    ? item.closingReading - item.openingReading : null;
                  const meterHours = (meterDiff != null && meterDiff >= 0) ? meterDiff.toFixed(3) : null;
                  const timeHours = calculateHours(item.startTime, item.endTime);
                  const isTripBased = et === "trip_based";
                  const displayHours = meterHours || timeHours;
                  return (
                  <TableRow key={i}>
                    <TableCell className="font-medium">
                      <div>
                        {item.machine}
                        {et === "hourly" && <Badge variant="outline" className="ml-1 text-[12px] bg-blue-50 text-blue-700 border-blue-200">HOURLY</Badge>}
                        {et === "daily" && <Badge variant="outline" className="ml-1 text-[12px] bg-amber-50 text-amber-700 border-amber-200">DAILY HIRE</Badge>}
                        {et === "monthly" && <Badge variant="outline" className="ml-1 text-[12px] bg-purple-50 text-purple-700 border-purple-200">MONTHLY HIRE</Badge>}
                        {isTripBased && <Badge variant="outline" className="ml-1 text-[12px] bg-green-50 text-green-700 border-green-200">TRIP BASED</Badge>}
                      </div>
                      {item.vehicleNo && (
                        <div className="text-sm text-muted-foreground" data-testid={`text-vehicle-no-${i}`}>Reg: {item.vehicleNo}</div>
                      )}
                      {(() => {
                        const equip = item.equipmentId && equipmentList ? equipmentList.find(e => e.id === item.equipmentId) : null;
                        if (equip) {
                          return (
                            <div className="text-sm text-muted-foreground" data-testid={`text-owner-info-${i}`}>
                              {equip.ownership === "hired" ? `HIRED: ${equip.vendorName || "Unknown Vendor"}` : "HLC OWN"}
                            </div>
                          );
                        }
                        return null;
                      })()}
                    </TableCell>
                    <TableCell>{item.operator || '-'}</TableCell>
                    <TableCell className="text-sm">{item.task || '-'}</TableCell>
                    <TableCell>{item.startTime || '-'}</TableCell>
                    <TableCell>{item.endTime || '-'}</TableCell>
                    <TableCell className="text-right">{item.openingReading != null ? item.openingReading : '-'}</TableCell>
                    <TableCell className="text-right">{item.closingReading != null ? item.closingReading : '-'}</TableCell>
                    <TableCell className="text-right text-sm">
                      {displayHours || '-'}
                      {isTripBased && item.numberOfTrips && item.tripDistance && (
                        <div className="text-[12px] text-muted-foreground">{item.numberOfTrips} trips × {item.tripDistance} km = {(item.numberOfTrips * item.tripDistance * 2).toFixed(1)} km</div>
                      )}
                    </TableCell>
                    <TableCell className="text-right">{item.diesel || '-'}</TableCell>
                  </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Labour Strength */}
      {data.labour.some(l => l.count > 0) && (
        <Card>
          <CardHeader>
            <CardTitle>Labour Strength</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Category</TableHead>
                  <TableHead>Gender</TableHead>
                  <TableHead className="text-right">Count</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.labour.filter(l => l.count > 0).map((item, i) => (
                  <TableRow key={i}>
                    <TableCell>{item.category}</TableCell>
                    <TableCell>{item.gender}</TableCell>
                    <TableCell className="text-right font-mono font-bold">{item.count}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Materials Log */}
      {data.materials.some(m => m.material) && (
        <Card>
          <CardHeader>
            <CardTitle>Materials Log</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="overflow-x-auto">
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
                {data.materials.filter(m => m.material).map((item, i) => (
                  <TableRow key={i} data-testid={`row-material-preview-${i}`}>
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
            </div>

            {/* Materials Summary */}
            {data.materialsAbstract.length > 0 && (
              <div className="pt-4 border-t">
                <h4 className="text-sm font-semibold text-muted-foreground mb-3">Materials Summary</h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {data.materialsAbstract.map((item, i) => (
                    <div 
                      key={i} 
                      className="p-3 bg-muted/50 border rounded-lg"
                      data-testid={`card-material-abstract-${i}`}
                    >
                      <p className="text-sm font-medium">{item.material}</p>
                      <div className="flex items-baseline gap-1 mt-1">
                        <p className="text-lg font-bold text-primary">{item.total.toFixed(3)}</p>
                        <p className="text-sm text-muted-foreground">{item.uom}</p>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {item.trips} trip{item.trips > 1 ? 's' : ''}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Site Purchases */}
      {data.sitePurchases && data.sitePurchases.some(p => p.itemDescription) && (
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
                {data.sitePurchases.filter(p => p.itemDescription).map((item, i) => (
                  <TableRow key={i} data-testid={`row-site-purchase-preview-${i}`}>
                    <TableCell className="font-medium">{item.itemDescription}</TableCell>
                    <TableCell>{item.vendor || '-'}</TableCell>
                    <TableCell>{item.billNo || '-'}</TableCell>
                    <TableCell className="text-right font-semibold">{item.amount ? item.amount.toFixed(3) : '-'}</TableCell>
                    <TableCell className="text-right">{item.quantity ? item.quantity.toFixed(3) : '-'}</TableCell>
                    <TableCell className="text-muted-foreground">{item.uom || '-'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Submit Button (bottom) */}
      <div className="flex justify-between pt-4 print:hidden">
        <Button variant="outline" onClick={onBack} data-testid="button-back-edit">
          <ChevronLeft className="w-4 h-4 mr-1" />
          Back to Edit
        </Button>
        <Button 
          onClick={onSubmit} 
          disabled={isSubmitting}
          className="gap-2"
          data-testid="button-submit-final"
        >
          {isSubmitting ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Send className="w-4 h-4" />
          )}
          Submit Report
        </Button>
      </div>
    </div>
  );
}
