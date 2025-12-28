import { DprForm } from "@/components/DprForm";
import { ChevronLeft } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";

export default function NewDpr() {
  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center gap-4 mb-8">
        <Link href="/">
          <Button variant="ghost" size="icon" className="rounded-full">
            <ChevronLeft className="w-5 h-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold font-display tracking-tight">New Progress Report</h1>
          <p className="text-muted-foreground text-sm">Fill in the daily activities and resource logs.</p>
        </div>
      </div>

      <DprForm />
    </div>
  );
}
