import { ChevronLeft, Send, Loader2, Calendar, MapPin, User, Fuel } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from "date-fns";

interface PreviewData {
  date: string;
  site: string;
  engineer: string;
  progress: any[];
  equipment: any[];
  labour: any[];
  materials: any[];
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
  const calculateHours = (startTime?: string, endTime?: string): string => {
    if (!startTime || !endTime) return '-';
    try {
      const [startHour, startMin] = startTime.split(':').map(Number);
      const [endHour, endMin] = endTime.split(':').map(Number);
      const startMins = startHour * 60 + startMin;
      const endMins = endHour * 60 + endMin;
      const diff = endMins - startMins;
      if (diff < 0) return '-';
      return (diff / 60).toFixed(2);
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

      {/* Report Header */}
      <div className="bg-card border rounded-xl p-6 shadow-sm grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400">
            <Calendar className="w-5 h-5" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Date</p>
            <p className="font-semibold">{format(new Date(data.date), "PPP")}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center text-orange-600 dark:text-orange-400">
            <MapPin className="w-5 h-5" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Site Name</p>
            <p className="font-semibold">{data.site}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center text-green-600 dark:text-green-400">
            <User className="w-5 h-5" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Engineer</p>
            <p className="font-semibold">{data.engineer}</p>
          </div>
        </div>
      </div>

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
              <p className="text-2xl font-bold text-primary">{data.totalDiesel.toFixed(1)} L</p>
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
                  <TableHead className="text-right">Dimensions</TableHead>
                  <TableHead className="text-right">Quantity</TableHead>
                  <TableHead>UOM</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.progress.filter(p => p.activity).map((item, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium">{item.activity}</TableCell>
                    <TableCell><Badge variant="outline">{item.side || '-'}</Badge></TableCell>
                    <TableCell>{item.chainageFrom || '-'}</TableCell>
                    <TableCell>{item.chainageTo || '-'}</TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground">
                      {item.length || item.width || item.thickness 
                        ? `${item.length || '-'}m x ${item.width || '-'}m ${item.thickness ? `x ${item.thickness}m` : ''}` 
                        : '-'}
                    </TableCell>
                    <TableCell className="text-right font-semibold">{item.quantity?.toFixed(2) || '-'}</TableCell>
                    <TableCell className="text-muted-foreground">{item.uom}</TableCell>
                  </TableRow>
                ))}
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
                  <TableHead className="text-right">Hours</TableHead>
                  <TableHead className="text-right">Diesel (L)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.equipment.filter(e => e.machine).map((item, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium">{item.machine}</TableCell>
                    <TableCell>{item.operator || '-'}</TableCell>
                    <TableCell className="text-sm">{item.task || '-'}</TableCell>
                    <TableCell className="text-right">{calculateHours(item.startTime, item.endTime)}</TableCell>
                    <TableCell className="text-right">{item.diesel || '-'}</TableCell>
                  </TableRow>
                ))}
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
          </CardContent>
        </Card>
      )}

      {/* Materials Abstract */}
      {data.materialsAbstract.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Materials Abstract</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {data.materialsAbstract.map((item, i) => (
                <div 
                  key={i} 
                  className="p-4 bg-muted/50 border rounded-lg"
                  data-testid={`card-material-abstract-${i}`}
                >
                  <p className="text-lg font-semibold">{item.material}</p>
                  <div className="flex items-baseline gap-2 mt-1">
                    <p className="text-2xl font-bold text-primary">{item.total.toFixed(1)}</p>
                    <p className="text-sm text-muted-foreground">{item.uom}</p>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {item.trips} trip{item.trips > 1 ? 's' : ''}
                  </p>
                </div>
              ))}
            </div>
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
