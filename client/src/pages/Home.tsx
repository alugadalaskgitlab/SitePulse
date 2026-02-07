import { Link } from "wouter";
import { HardHat, Factory, BarChart3, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AdminNotifications } from "@/components/AdminNotifications";
import companyLogo from "@assets/1B61665A-8ECB-443A-98A5-FB3676935BB8_1_102_a_1767081845854.jpeg";

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background p-4">
      <div className="text-center mb-12">
        <img src={companyLogo} alt="HLC" className="h-20 w-20 rounded-lg object-cover mx-auto mb-4" />
        <h1 className="text-3xl md:text-4xl font-bold font-display tracking-tight text-foreground mb-3">
          High Lane Constructions Pvt Ltd
        </h1>
        <p className="text-muted-foreground text-lg">
          Daily Progress Report System
        </p>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-2xl">
        <Link href="/site">
          <Card className="hover-elevate cursor-pointer transition-all border-2 hover:border-primary/50" data-testid="card-site-report">
            <CardContent className="p-8 flex flex-col items-center text-center">
              <img src={companyLogo} alt="HLC" className="w-16 h-16 rounded-lg object-cover mb-4" />
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-3">
                <HardHat className="w-6 h-6 text-primary" />
              </div>
              <h2 className="text-2xl font-bold mb-2">Site Report</h2>
              <p className="text-muted-foreground text-sm">
                Create and manage daily progress reports for construction sites
              </p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/plant/dashboard?origin=portal">
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
      </div>

      <div className="mt-8 flex items-center gap-4">
        <Link href="/admin/reports">
          <Button variant="outline" className="gap-2" data-testid="button-admin-reports">
            <BarChart3 className="w-4 h-4" />
            Admin Reports
          </Button>
        </Link>
        <Link href="/admin/settings">
          <Button variant="ghost" className="gap-2" data-testid="button-admin-settings">
            <Settings className="w-4 h-4" />
            Settings
          </Button>
        </Link>
        <AdminNotifications />
      </div>
    </div>
  );
}
