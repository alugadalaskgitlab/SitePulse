import { Link } from "wouter";
import { ChevronRight } from "lucide-react";

export type TileAccent =
  | "orange" | "amber" | "yellow" | "emerald" | "green" | "teal"
  | "blue" | "indigo" | "violet" | "purple" | "rose" | "red" | "slate";

const ACCENT: Record<TileAccent, { border: string; icon: string; titleHover: string; badge: string }> = {
  orange: { border: "hover:border-orange-300", icon: "text-orange-600", titleHover: "group-hover:text-orange-600", badge: "bg-orange-50 text-orange-700" },
  amber:  { border: "hover:border-amber-300",  icon: "text-amber-600",  titleHover: "group-hover:text-amber-600",  badge: "bg-amber-50 text-amber-700"  },
  yellow: { border: "hover:border-yellow-300", icon: "text-yellow-600", titleHover: "group-hover:text-yellow-600", badge: "bg-yellow-50 text-yellow-700" },
  emerald:{ border: "hover:border-emerald-300",icon: "text-emerald-600",titleHover: "group-hover:text-emerald-600",badge: "bg-emerald-50 text-emerald-700"},
  green:  { border: "hover:border-green-300",  icon: "text-green-600",  titleHover: "group-hover:text-green-600",  badge: "bg-green-50 text-green-700"  },
  teal:   { border: "hover:border-teal-300",   icon: "text-teal-600",   titleHover: "group-hover:text-teal-600",   badge: "bg-teal-50 text-teal-700"   },
  blue:   { border: "hover:border-blue-300",   icon: "text-blue-600",   titleHover: "group-hover:text-blue-600",   badge: "bg-blue-50 text-blue-700"   },
  indigo: { border: "hover:border-indigo-300", icon: "text-indigo-600", titleHover: "group-hover:text-indigo-600", badge: "bg-indigo-50 text-indigo-700"},
  violet: { border: "hover:border-violet-300", icon: "text-violet-600", titleHover: "group-hover:text-violet-600", badge: "bg-violet-50 text-violet-700"},
  purple: { border: "hover:border-purple-300", icon: "text-purple-600", titleHover: "group-hover:text-purple-600", badge: "bg-purple-50 text-purple-700"},
  rose:   { border: "hover:border-rose-300",   icon: "text-rose-600",   titleHover: "group-hover:text-rose-600",   badge: "bg-rose-50 text-rose-700"   },
  red:    { border: "hover:border-red-300",    icon: "text-red-600",    titleHover: "group-hover:text-red-600",    badge: "bg-red-50 text-red-700"     },
  slate:  { border: "hover:border-slate-400",  icon: "text-slate-600",  titleHover: "group-hover:text-slate-600",  badge: "bg-slate-100 text-slate-700" },
};

interface HubActionTileProps {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  accent: TileAccent;
  iconBg: string;
  badge?: string;
  enabled?: boolean;
}

export function HubActionTile({
  href, icon: Icon, title, description, accent, iconBg, badge, enabled = true,
}: HubActionTileProps) {
  if (!enabled) return null;
  const c = ACCENT[accent];
  return (
    <Link href={href}>
      <a
        className={`group flex items-start gap-4 bg-white border border-slate-200 rounded-xl p-5 ${c.border} hover:shadow-md transition-all cursor-pointer`}
        data-testid={`tile-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
      >
        <div className={`p-3 ${iconBg} rounded-lg group-hover:scale-110 transition-transform flex-shrink-0`}>
          <Icon className={`w-5 h-5 ${c.icon}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className={`font-semibold text-slate-800 ${c.titleHover} transition-colors`}>{title}</h3>
            {badge && (
              <span className={`text-[12px] font-semibold px-2 py-0.5 rounded-full ${c.badge}`}>{badge}</span>
            )}
          </div>
          <p className="text-sm text-slate-500 mt-0.5">{description}</p>
        </div>
        <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-slate-500 flex-shrink-0 mt-0.5 group-hover:translate-x-0.5 transition-all" />
      </a>
    </Link>
  );
}
