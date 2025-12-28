import { useDpr } from "@/hooks/use-dprs";
import { Link, useRoute } from "wouter";
import { ChevronLeft, Calendar, User, MapPin, Loader2, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default function DprDetails() {
  const [, params] = useRoute("/dpr/:id");
  const id = parseInt(params?.id || "0");
  const { data: dpr, isLoading, error } = useDpr(id);

  if (isLoading) return <div className="flex justify-center p-20"><Loader2 className="animate-spin w-8 h-8" /></div>;
  if (error || !dpr) return <div className="p-20 text-center text-red-500">Failed to load report.</div>;

  return (
    <div className="max-w-5xl mx-auto space-y-8 animate-in fade-in duration-300 print:p-0">
      {/* Header Actions */}
      <div className="flex items-center justify-between print:hidden">
        <div className="flex items-center gap-4">
          <Link href="/">
            <Button variant="ghost" size="icon">
              <ChevronLeft className="w-5 h-5" />
            </Button>
          </Link>
          <h1 className="text-2xl font-bold font-display">Report Details</h1>
        </div>
        <Button variant="outline" onClick={() => window.print()} className="gap-2">
          <Printer className="w-4 h-4" /> Print
        </Button>
      </div>

      {/* Report Info Header */}
      <div className="bg-card border rounded-xl p-6 shadow-sm grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600">
            <Calendar className="w-5 h-5" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Date</p>
            <p className="font-semibold">{format(new Date(dpr.date), "PPP")}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
           <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center text-orange-600">
            <MapPin className="w-5 h-5" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Site Name</p>
            <p className="font-semibold">{dpr.site}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
           <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center text-green-600">
            <User className="w-5 h-5" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Engineer</p>
            <p className="font-semibold">{dpr.engineer}</p>
          </div>
        </div>
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
                  <TableHead className="text-right">Quantity</TableHead>
                  <TableHead>UOM</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dpr.progress.map((item: any, i: number) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium">{item.activity}</TableCell>
                    <TableCell><Badge variant="outline">{item.side}</Badge></TableCell>
                    <TableCell>{item.chainageFrom}</TableCell>
                    <TableCell>{item.chainageTo}</TableCell>
                    <TableCell className="text-right">{item.quantity}</TableCell>
                    <TableCell className="text-muted-foreground">{item.uom}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Two Column Layout for Resources */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
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
                    <TableHead>Operator</TableHead>
                    <TableHead className="text-right">Diesel (L)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dpr.equipment.map((item: any, i: number) => (
                    <TableRow key={i}>
                      <TableCell className="font-medium">{item.machine}</TableCell>
                      <TableCell>{item.operator}</TableCell>
                      <TableCell className="text-right">{item.diesel}</TableCell>
                    </TableRow>
                  ))}
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
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dpr.labour.map((item: any, i: number) => (
                    <TableRow key={i}>
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

      <Card>
        <CardHeader>
          <CardTitle>Materials Log</CardTitle>
        </CardHeader>
        <CardContent>
          {dpr.materials.length === 0 ? (
              <p className="text-muted-foreground italic">No materials recorded.</p>
            ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Material</TableHead>
                  <TableHead className="text-right">Quantity</TableHead>
                  <TableHead>UOM</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dpr.materials.map((item: any, i: number) => (
                  <TableRow key={i}>
                    <TableCell>
                      <Badge variant={item.type === 'Received' ? 'default' : 'secondary'}>
                        {item.type}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium">{item.material}</TableCell>
                    <TableCell className="text-right">{item.quantity}</TableCell>
                    <TableCell className="text-muted-foreground">{item.uom}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
