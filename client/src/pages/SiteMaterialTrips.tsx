import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link, useSearch } from "wouter";
import { format } from "date-fns";
import { Plus, Trash2, Loader2, ArrowLeft, Truck, Package, Camera, ImagePlus, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { SiteMaterialTrip, Site } from "@shared/schema";
import { useFeatureFlags } from "@/lib/featureFlags";
import { useUpload } from "@/hooks/use-upload";
import { AttachmentGallery } from "@/components/AttachmentGallery";

const MATERIAL_OPTIONS = [
  "WMM", "GSB", "Soil", "Dust", "6MM DOWN", "10/12MM", "20MM", "BC Mix", "DBM Mix", "Water", "Bitumen", "Emulsion", "Diesel"
];

const UOM_OPTIONS = ["CFT", "MT", "Cum", "Liters", "Trips", "Kgs", "Tons"];

export default function SiteMaterialTrips() {
  const { toast } = useToast();
  const { companyName, logoFile } = useFeatureFlags();
  const searchString = useSearch();
  const returnTo = (() => {
    try {
      const p = new URLSearchParams(searchString || "");
      return decodeURIComponent(p.get("returnTo") || "") || "/site/hub";
    } catch {
      return "/site/hub";
    }
  })();
  const { data: sitesList = [] } = useQuery<Site[]>({
    queryKey: ["/api/sites"],
  });
  const activeSites = sitesList.filter(s => s.isActive);
  const today = format(new Date(), "yyyy-MM-dd");
  const currentTime = format(new Date(), "HH:mm");

  const [dateFilter, setDateFilter] = useState(today);
  const [siteFilter, setSiteFilter] = useState("");
  
  const [newTrip, setNewTrip] = useState({
    date: today,
    time: currentTime,
    site: "",
    material: "",
    supplier: "",
    vehicleNumber: "",
    quantity: "",
    uom: "CFT",
    location: "",
    receiptNumber: "",
    enteredBy: "",
    notes: "",
  });

  // Photos are staged locally while creating a new trip (no DB id yet to
  // link an attachment to), then uploaded in one batch once the trip is saved.
  const [stagedPhotos, setStagedPhotos] = useState<File[]>([]);
  const { uploadFile } = useUpload();

  const addStagedPhotos = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const MAX_FILE_SIZE = 15 * 1024 * 1024;
    const valid = Array.from(files).filter((f) => {
      if (f.size > MAX_FILE_SIZE) {
        toast({ title: "File too large", description: `${f.name} exceeds 15MB.`, variant: "destructive" });
        return false;
      }
      if (!f.type.startsWith("image/") && f.type !== "application/pdf") {
        toast({ title: "Unsupported file", description: `${f.name} must be an image or PDF.`, variant: "destructive" });
        return false;
      }
      return true;
    });
    setStagedPhotos((prev) => [...prev, ...valid]);
  };
  const removeStagedPhoto = (idx: number) => setStagedPhotos((prev) => prev.filter((_, i) => i !== idx));
  const uploadStagedPhotos = async (tripId: number) => {
    for (const file of stagedPhotos) {
      const uploadResponse = await uploadFile(file);
      if (!uploadResponse) continue;
      try {
        await apiRequest("POST", "/api/attachments", {
          moduleType: "site_material_trip",
          linkedRecordId: tripId,
          fileName: file.name,
          objectPath: uploadResponse.objectPath,
          mimeType: file.type || "application/octet-stream",
          fileSize: file.size,
        });
      } catch {
        toast({ title: "Some photos failed to attach", description: file.name, variant: "destructive" });
      }
    }
  };

  const buildTripsUrl = () => {
    const params = new URLSearchParams();
    if (dateFilter) {
      params.set("dateFrom", dateFilter);
      params.set("dateTo", dateFilter);
    }
    if (siteFilter && siteFilter !== "all") params.set("site", siteFilter);
    const queryString = params.toString();
    return queryString ? `/api/site-material-trips?${queryString}` : "/api/site-material-trips";
  };

  const { data: trips, isLoading } = useQuery<SiteMaterialTrip[]>({
    queryKey: [buildTripsUrl()],
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof newTrip) => {
      const res = await apiRequest("POST", "/api/site-material-trips", {
        ...data,
        quantity: parseFloat(data.quantity) || 0,
      });
      return res.json();
    },
    onSuccess: async (trip: any) => {
      if (stagedPhotos.length > 0 && trip?.id) {
        await uploadStagedPhotos(trip.id);
        queryClient.invalidateQueries({ queryKey: ["/api/attachments", "site_material_trip", trip.id] });
      }
      setStagedPhotos([]);
      queryClient.invalidateQueries({ queryKey: ["/api/site-material-trips"] });
      queryClient.invalidateQueries({ predicate: (q) =>
        typeof q.queryKey[0] === "string" && q.queryKey[0].startsWith("/api/materials-received")
      });
      toast({ title: "Trip Logged", description: "Material trip has been recorded successfully." });
      setNewTrip({
        date: today,
        time: format(new Date(), "HH:mm"),
        site: newTrip.site,
        material: "",
        supplier: "",
        vehicleNumber: "",
        quantity: "",
        uom: "CFT",
        location: "",
        receiptNumber: "",
        enteredBy: newTrip.enteredBy,
        notes: "",
      });
    },
    onError: (error) => {
      toast({ title: "Error", description: "Failed to log material trip.", variant: "destructive" });
      console.error("Error creating trip:", error);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest("DELETE", `/api/site-material-trips/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/site-material-trips"] });
      toast({ title: "Deleted", description: "Trip entry has been removed." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete trip.", variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTrip.site || !newTrip.material || !newTrip.quantity) {
      toast({ title: "Required Fields", description: "Please fill in Site, Material, and Quantity.", variant: "destructive" });
      return;
    }
    createMutation.mutate(newTrip);
  };

  const todaysTrips = useMemo(() => {
    if (!trips) return [];
    return trips.filter(t => t.date === dateFilter);
  }, [trips, dateFilter]);

  const tripsByMaterial = useMemo(() => {
    const grouped: Record<string, { count: number; totalQty: number; uom: string }> = {};
    todaysTrips.forEach(trip => {
      const key = trip.material;
      if (!grouped[key]) {
        grouped[key] = { count: 0, totalQty: 0, uom: trip.uom };
      }
      grouped[key].count++;
      grouped[key].totalQty += trip.quantity || 0;
    });
    return grouped;
  }, [todaysTrips]);

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-card border-b sticky top-0 z-10">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center gap-3">
            <img src={`/${logoFile}`} alt={companyName} className="h-10 w-10 rounded-lg object-cover" />
            <div>
              <h1 className="text-lg font-bold">{companyName}</h1>
              <p className="text-sm text-muted-foreground">Quick Materials Entry</p>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto p-4 space-y-6">
        <div className="flex items-center gap-4 flex-wrap">
          <Link href={returnTo}>
            <Button variant="ghost" size="sm" data-testid="button-back">
              <ArrowLeft className="w-4 h-4 mr-1" /> Back
            </Button>
          </Link>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Truck className="w-5 h-5" />
              Log Material Trip
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <Label className="text-sm">Date</Label>
                  <Input
                    type="date"
                    value={newTrip.date}
                    onChange={(e) => setNewTrip({ ...newTrip, date: e.target.value })}
                    data-testid="input-trip-date"
                  />
                </div>
                <div>
                  <Label className="text-sm">Time</Label>
                  <Input
                    type="time"
                    value={newTrip.time}
                    onChange={(e) => setNewTrip({ ...newTrip, time: e.target.value })}
                    data-testid="input-trip-time"
                  />
                </div>
                <div>
                  <Label className="text-sm">Site *</Label>
                  <Select
                    value={newTrip.site}
                    onValueChange={(val) => setNewTrip({ ...newTrip, site: val })}
                  >
                    <SelectTrigger data-testid="select-trip-site">
                      <SelectValue placeholder="Select Site" />
                    </SelectTrigger>
                    <SelectContent>
                      {activeSites.map((s) => (
                        <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-sm">Material *</Label>
                  <Select
                    value={newTrip.material}
                    onValueChange={(val) => setNewTrip({ ...newTrip, material: val })}
                  >
                    <SelectTrigger data-testid="select-trip-material">
                      <SelectValue placeholder="Select Material" />
                    </SelectTrigger>
                    <SelectContent>
                      {MATERIAL_OPTIONS.map((mat) => (
                        <SelectItem key={mat} value={mat}>{mat}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <Label className="text-sm">Supplier</Label>
                  <Input
                    placeholder="e.g. Sanganna"
                    value={newTrip.supplier}
                    onChange={(e) => setNewTrip({ ...newTrip, supplier: e.target.value.toUpperCase() })}
                    className="uppercase"
                    data-testid="input-trip-supplier"
                  />
                </div>
                <div>
                  <Label className="text-sm">Vehicle Number</Label>
                  <Input
                    placeholder="e.g. TS15U1234"
                    value={newTrip.vehicleNumber}
                    onChange={(e) => setNewTrip({ ...newTrip, vehicleNumber: e.target.value.toUpperCase() })}
                    className="uppercase"
                    data-testid="input-trip-vehicle"
                  />
                </div>
                <div>
                  <Label className="text-sm">Quantity *</Label>
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="e.g. 500"
                    value={newTrip.quantity}
                    onChange={(e) => setNewTrip({ ...newTrip, quantity: e.target.value })}
                    data-testid="input-trip-quantity"
                  />
                </div>
                <div>
                  <Label className="text-sm">UOM</Label>
                  <Select
                    value={newTrip.uom}
                    onValueChange={(val) => setNewTrip({ ...newTrip, uom: val })}
                  >
                    <SelectTrigger data-testid="select-trip-uom">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {UOM_OPTIONS.map((uom) => (
                        <SelectItem key={uom} value={uom}>{uom}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <Label className="text-sm">Location/Chainage</Label>
                  <Input
                    placeholder="e.g. 5.200"
                    value={newTrip.location}
                    onChange={(e) => setNewTrip({ ...newTrip, location: e.target.value.toUpperCase() })}
                    data-testid="input-trip-location"
                  />
                </div>
                <div>
                  <Label className="text-sm">Receipt/Challan No.</Label>
                  <Input
                    placeholder="e.g. 12345"
                    value={newTrip.receiptNumber}
                    onChange={(e) => setNewTrip({ ...newTrip, receiptNumber: e.target.value.toUpperCase() })}
                    data-testid="input-trip-receipt"
                  />
                </div>
                <div>
                  <Label className="text-sm">Entered By</Label>
                  <Input
                    placeholder="Your name"
                    value={newTrip.enteredBy}
                    onChange={(e) => setNewTrip({ ...newTrip, enteredBy: e.target.value.toUpperCase() })}
                    className="uppercase"
                    data-testid="input-trip-enteredby"
                  />
                </div>
                <div className="flex items-end">
                  <Button 
                    type="submit" 
                    className="w-full"
                    disabled={createMutation.isPending}
                    data-testid="button-submit-trip"
                  >
                    {createMutation.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        <Plus className="w-4 h-4 mr-1" /> Add Trip
                      </>
                    )}
                  </Button>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-sm">Attachments <span className="text-muted-foreground">(receipt/challan photo)</span></Label>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  id="trip-photo-camera"
                  data-testid="input-trip-photo-camera"
                  onChange={(e) => { addStagedPhotos(e.target.files); e.target.value = ""; }}
                />
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  multiple
                  className="hidden"
                  id="trip-photo-gallery"
                  data-testid="input-trip-photo-gallery"
                  onChange={(e) => { addStagedPhotos(e.target.files); e.target.value = ""; }}
                />
                <div className="flex gap-2">
                  <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => document.getElementById("trip-photo-camera")?.click()} data-testid="button-trip-photo-camera">
                    <Camera className="w-4 h-4" /> Camera
                  </Button>
                  <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => document.getElementById("trip-photo-gallery")?.click()} data-testid="button-trip-photo-gallery">
                    <ImagePlus className="w-4 h-4" /> Gallery
                  </Button>
                </div>
                {stagedPhotos.length > 0 && (
                  <div className="grid grid-cols-4 sm:grid-cols-6 gap-2 max-w-xl">
                    {stagedPhotos.map((file, idx) => (
                      <div key={idx} className="relative border rounded-md overflow-hidden bg-muted aspect-square" data-testid={`card-staged-trip-photo-${idx}`}>
                        {file.type.startsWith("image/") ? (
                          <img src={URL.createObjectURL(file)} alt={file.name} className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex items-center justify-center h-full w-full text-xs text-center p-1 truncate">{file.name}</div>
                        )}
                        <button
                          type="button"
                          className="absolute top-1 right-1 bg-background/90 rounded-full p-1"
                          onClick={() => removeStagedPhoto(idx)}
                          data-testid={`button-remove-staged-trip-photo-${idx}`}
                        >
                          <X className="h-3.5 w-3.5 text-destructive" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <p className="text-xs text-muted-foreground">Photos are uploaded once you save the trip.</p>
              </div>
            </form>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {Object.entries(tripsByMaterial).map(([material, data]) => (
            <Card key={material} className="bg-primary/5">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Package className="w-4 h-4 text-primary" />
                  <span className="font-semibold">{material}</span>
                </div>
                <div className="text-2xl font-bold text-primary">
                  {data.totalQty.toFixed(3)} {data.uom}
                </div>
                <div className="text-sm text-muted-foreground">
                  {data.count} trip{data.count !== 1 ? 's' : ''} today
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <CardTitle>Today's Trips</CardTitle>
            <div className="flex items-center gap-2">
              <Input
                type="date"
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
                className="w-40"
                data-testid="input-filter-date"
              />
              <Select
                value={siteFilter}
                onValueChange={setSiteFilter}
              >
                <SelectTrigger className="w-40" data-testid="select-filter-site">
                  <SelectValue placeholder="All Sites" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Sites</SelectItem>
                  {activeSites.map((s) => (
                    <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin" />
              </div>
            ) : !todaysTrips.length ? (
              <p className="text-center text-muted-foreground py-8">No trips recorded for this date.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="text-left p-2">Time</th>
                      <th className="text-left p-2">Site</th>
                      <th className="text-left p-2">Material</th>
                      <th className="text-left p-2">Supplier</th>
                      <th className="text-left p-2">Vehicle</th>
                      <th className="text-right p-2">Qty</th>
                      <th className="text-left p-2">UOM</th>
                      <th className="text-left p-2">Location</th>
                      <th className="text-left p-2">Photos</th>
                      <th className="text-center p-2">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {todaysTrips.map((trip) => (
                      <tr key={trip.id} className="border-b hover:bg-muted/30" data-testid={`row-trip-${trip.id}`}>
                        <td className="p-2">{trip.time || '-'}</td>
                        <td className="p-2 font-medium">{trip.site}</td>
                        <td className="p-2">{trip.material}</td>
                        <td className="p-2">{trip.supplier || '-'}</td>
                        <td className="p-2">{trip.vehicleNumber || '-'}</td>
                        <td className="p-2 text-right font-mono">{trip.quantity?.toFixed(3)}</td>
                        <td className="p-2">{trip.uom}</td>
                        <td className="p-2">{trip.location || '-'}</td>
                        <td className="p-2">
                          <AttachmentGallery
                            moduleType="site_material_trip"
                            linkedRecordId={trip.id}
                            allowDelete={false}
                            emptyText="-"
                            className="flex flex-wrap gap-1 w-24"
                          />
                        </td>
                        <td className="p-2 text-center">
                          <Button 
                            variant="ghost" 
                            size="icon"
                            onClick={() => deleteMutation.mutate(trip.id)}
                            disabled={deleteMutation.isPending}
                            data-testid={`button-delete-trip-${trip.id}`}
                          >
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
