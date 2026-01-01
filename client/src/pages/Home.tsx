import { Link } from "wouter";
import { HardHat, Factory, BarChart3, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background p-4">
      <div className="text-center mb-12">
        <h1 className="text-4xl md:text-5xl font-bold font-display tracking-tight text-foreground mb-3">
          SiteLog
        </h1>
        <p className="text-muted-foreground text-lg">
          Daily Progress Report System
        </p>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-2xl">
        <Link href="/site">
          <Card className="hover-elevate cursor-pointer transition-all border-2 hover:border-primary/50">
            <CardContent className="p-8 flex flex-col items-center text-center">
              <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                <HardHat className="w-10 h-10 text-primary" />
              </div>
              <h2 className="text-2xl font-bold mb-2">Site Report</h2>
              <p className="text-muted-foreground text-sm">
                Create and manage daily progress reports for construction sites
              </p>
            </CardContent>
          </Card>
        </Link>

        <Card className="cursor-not-allowed opacity-60 border-2">
          <CardContent className="p-8 flex flex-col items-center text-center">
            <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center mb-4">
              <Factory className="w-10 h-10 text-muted-foreground" />
            </div>
            <h2 className="text-2xl font-bold mb-2">Plant Report</h2>
            <p className="text-muted-foreground text-sm">
              Coming soon - Plant production reporting
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="mt-8 flex gap-4">
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
      </div>
    </div>
  );
}
