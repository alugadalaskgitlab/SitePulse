import { Link } from "wouter";
import { HardHat, Truck, Home } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import companyLogo from "@assets/1B61665A-8ECB-443A-98A5-FB3676935BB8_1_102_a_1767081845854.jpeg";

export default function SiteHome() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background p-4">
      <div className="absolute top-4 left-4">
        <Link href="/">
          <Button variant="ghost" size="icon" data-testid="button-home">
            <Home className="w-5 h-5" />
          </Button>
        </Link>
      </div>
      <div className="text-center mb-12">
        <img src={companyLogo} alt="HLC" className="h-20 w-20 rounded-lg object-cover mx-auto mb-4" />
        <h1 className="text-3xl md:text-4xl font-bold font-display tracking-tight text-foreground mb-3">
          High Lane Constructions Pvt Ltd
        </h1>
        <p className="text-muted-foreground text-lg">
          Site Daily Progress Report
        </p>
      </div>
      
      <div className="w-full max-w-md space-y-4">
        <Link href="/site/dashboard">
          <Card className="hover-elevate cursor-pointer transition-all border-2 hover:border-primary/50" data-testid="card-site-report">
            <CardContent className="p-8 flex flex-col items-center text-center">
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
        
        <Link href="/site/material-trips">
          <Card className="hover-elevate cursor-pointer transition-all border-2 hover:border-green-500/50" data-testid="card-material-trips">
            <CardContent className="p-8 flex flex-col items-center text-center">
              <div className="w-12 h-12 rounded-full bg-green-500/10 flex items-center justify-center mb-3">
                <Truck className="w-6 h-6 text-green-600" />
              </div>
              <h2 className="text-2xl font-bold mb-2">Quick Materials Entry</h2>
              <p className="text-muted-foreground text-sm">
                Log material trips in real-time as vehicles arrive at site
              </p>
            </CardContent>
          </Card>
        </Link>
      </div>
    </div>
  );
}
