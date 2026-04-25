import { useRoute, Link, useLocation } from "wouter";
import { useOrigin } from "@/hooks/use-origin";
import { useQuery, useMutation } from "@tanstack/react-query";
import { format } from "date-fns";
import { ChevronLeft, Factory, Package, Trash2, Loader2, Edit } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/lib/auth-context";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { PlantReportWithDetails } from "@shared/schema";

export default function PlantDetails() {
  const [, params] = useRoute("/plant/:id");
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { sectionCan, isAdmin } = useAuth();
  const canEdit = sectionCan("plant_daily_reports", "edit");
  const canDelete = isAdmin;
  const { appendOrigin, getPlantBackLink } = useOrigin();
  const backLink = getPlantBackLink({ defaultTab: "operations" });

  const { data: report, isLoading, error } = useQuery<PlantReportWithDetails>({
    queryKey: ["/api/plant", params?.id],
    queryFn: async () => {
      const res = await fetch(`/api/plant/${params?.id}`);
      if (!res.ok) throw new Error("Failed to fetch plant report");
      return res.json();
    },
    enabled: !!params?.id,
  });

  const cloneMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/plant/${params?.id}/clone`, {});
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Report cloned",
        description: "A new copy has been created for editing.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/plant"] });
      setLocation(appendOrigin(`/plant/${data.id}`));
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to clone report.",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/plant/${params?.id}`);
    },
    onSuccess: () => {
      toast({
        title: "Report deleted",
        description: "The plant report has been deleted.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/plant"] });
      setLocation(appendOrigin("/plant/dashboard"));
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete report.",
        variant: "destructive",
      });
    },
  });

  const handleEditClick = () => {
    cloneMutation.mutate();
  };

  const handleDeleteClick = () => {
    if (confirm("Are you sure you want to delete this plant report? This cannot be undone.")) {
      deleteMutation.mutate();
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Plant report not found.</p>
        <Link href={backLink}>
          <Button variant="outline" className="mt-4">Back to Plant Reports</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-4 flex-wrap">
          <Link href={backLink}>
            <Button variant="ghost" size="icon" data-testid="button-back">
              <ChevronLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold font-display">{report.siteName}</h1>
            </div>
            <p className="text-muted-foreground text-sm">
              {format(new Date(report.date), "MMMM d, yyyy")}
            </p>
          </div>
        </div>

        <div className="flex gap-2 flex-wrap">
          {canEdit && (
            <Button
              variant="outline"
              onClick={handleEditClick}
              disabled={cloneMutation.isPending}
              className="gap-2"
              data-testid="button-clone-edit"
            >
              {cloneMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Edit className="w-4 h-4" />
              )}
              Edit Report
            </Button>
          )}

          {canDelete && (
            <Button
              variant="destructive"
              className="gap-2"
              onClick={handleDeleteClick}
              disabled={deleteMutation.isPending}
              data-testid="button-delete"
            >
              {deleteMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Trash2 className="w-4 h-4" />
              )}
              Delete
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardHeader className="border-b">
          <CardTitle className="flex items-center gap-2">
            <Factory className="w-5 h-5 text-muted-foreground" />
            Plant Report Details
          </CardTitle>
        </CardHeader>
        <CardContent className="p-6 space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Date</p>
              <p className="font-medium">{format(new Date(report.date), "MMM d, yyyy")}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Site Name</p>
              <p className="font-medium">{report.siteName}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Role</p>
              <p className="font-medium capitalize">{report.role || "Engineer"}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {report.production && report.production.length > 0 && (
        <Card>
          <CardHeader className="border-b">
            <CardTitle className="flex items-center gap-2">
              <Package className="w-5 h-5 text-muted-foreground" />
              Production Log
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left p-3 font-medium text-sm">Material</th>
                    <th className="text-left p-3 font-medium text-sm">Quantity</th>
                    <th className="text-left p-3 font-medium text-sm">UOM</th>
                    <th className="text-left p-3 font-medium text-sm">Supplier</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {report.production.map((item, idx) => (
                    <tr key={idx} className="hover-elevate">
                      <td className="p-3">{item.material}</td>
                      <td className="p-3">{item.quantity || "-"}</td>
                      <td className="p-3">{item.uom || "-"}</td>
                      <td className="p-3">{item.supplier || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {(!report.production || report.production.length === 0) && (
        <Card>
          <CardContent className="p-12 text-center text-muted-foreground">
            No production entries in this report.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
