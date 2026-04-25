import { Link } from "wouter";
import { Factory } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/lib/auth-context";
import companyLogo from "@assets/1B61665A-8ECB-443A-98A5-FB3676935BB8_1_102_a_1767081845854.jpeg";

export default function PlantHome() {
  const { sectionVisible } = useAuth();
  const canSeePlant =
    sectionVisible("plant_stock") ||
    sectionVisible("plant_production") ||
    sectionVisible("plant_equipment") ||
    sectionVisible("plant_shift_logs") ||
    sectionVisible("plant_daily_reports") ||
    sectionVisible("plant_heating") ||
    sectionVisible("vendor_bills");

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background p-4">
      <div className="text-center mb-12">
        <img src={companyLogo} alt="HLC" className="h-20 w-20 rounded-lg object-cover mx-auto mb-4" />
        <h1 className="text-3xl md:text-4xl font-bold font-display tracking-tight text-foreground mb-3">
          High Lane Constructions Pvt Ltd
        </h1>
        <p className="text-muted-foreground text-lg">
          Plant Production Report
        </p>
      </div>

      <div className="w-full max-w-md">
        {canSeePlant ? (
          <Link href="/plant/dashboard">
            <Card className="hover-elevate cursor-pointer transition-all border-2 hover:border-purple-500/50" data-testid="card-plant-report">
              <CardContent className="p-8 flex flex-col items-center text-center">
                <img src={companyLogo} alt="HLC" className="w-16 h-16 rounded-lg object-cover mb-4" />
                <div className="w-12 h-12 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center mb-3">
                  <Factory className="w-6 h-6 text-purple-600 dark:text-purple-400" />
                </div>
                <h2 className="text-2xl font-bold mb-2">Plant Report</h2>
                <p className="text-muted-foreground text-sm">
                  Hot-mix plant operations and material tracking
                </p>
              </CardContent>
            </Card>
          </Link>
        ) : (
          <div className="text-center text-sm text-muted-foreground" data-testid="text-no-plant-access">
            You don't have access to plant reports.
          </div>
        )}
      </div>
    </div>
  );
}
