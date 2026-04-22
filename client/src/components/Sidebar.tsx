import { Link, useLocation } from "wouter";
import { 
  LayoutDashboard, 
  FileText, 
  PlusCircle, 
  Settings,
  HardHat,
  ClipboardList,
  Factory,
} from "lucide-react";
import { cn } from "@/lib/utils";

export function Sidebar() {
  const [location] = useLocation();
  const today = new Date().toISOString().slice(0, 10);

  const links = [
    { href: "/", label: "Dashboard", icon: LayoutDashboard },
    { href: "/dpr/new", label: "New Report", icon: PlusCircle },
    { href: "/plant", label: "Plant Module", icon: Factory },
    { href: `/plant/shift-log/${today}`, label: "Plant Shift Log", icon: ClipboardList },
    { href: `/plant/daily-report/${today}`, label: "Daily Plant Report", icon: FileText },
  ];

  return (
    <aside className="fixed inset-y-0 left-0 w-64 bg-card border-r border-border z-20 hidden md:flex flex-col">
      <div className="p-6 border-b border-border/50">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center text-primary-foreground">
            <HardHat className="w-6 h-6" />
          </div>
          <div>
            <h1 className="font-display font-bold text-xl leading-none">HLC</h1>
            <p className="text-xs text-muted-foreground mt-1">Construction Manager</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 p-4 space-y-1">
        {links.map((link) => {
          const isActive = location === link.href;
          return (
            <Link key={link.href} href={link.href} className={cn(
              "flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all duration-200",
              isActive 
                ? "bg-primary/10 text-primary shadow-sm" 
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}>
              <link.icon className={cn("w-5 h-5", isActive ? "text-primary" : "text-muted-foreground")} />
              {link.label}
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-border/50">
        <button className="flex items-center gap-3 px-4 py-3 w-full rounded-lg text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-all">
          <Settings className="w-5 h-5" />
          Settings
        </button>
        <div className="mt-4 px-4 py-3 bg-muted/50 rounded-lg">
          <p className="text-xs font-medium text-foreground">Logged in as</p>
          <p className="text-sm text-muted-foreground truncate">Site Engineer</p>
        </div>
      </div>
    </aside>
  );
}
