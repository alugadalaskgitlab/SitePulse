import { Calendar, MapPin, User, Clock } from "lucide-react";
import { format } from "date-fns";
import hlcLogo from "/hlc-logo.jpg";

interface ReportHeaderProps {
  date: string;
  site: string;
  engineer: string;
  submittedAt?: string;
  showLogo?: boolean;
  workType?: string;
}

export function ReportHeader({ date, site, engineer, submittedAt, showLogo = true, workType }: ReportHeaderProps) {
  return (
    <div className="bg-card border rounded-xl p-6 shadow-sm print:shadow-none print:border-gray-300">
      {showLogo && (
        <div className="flex items-center justify-between mb-4 pb-4 border-b">
          <img 
            src={hlcLogo} 
            alt="High Lane Constructions Pvt Ltd" 
            className="h-12 w-auto object-contain print:h-16"
            data-testid="img-hlc-logo"
          />
          <div className="text-right">
            <div className="flex items-center justify-end gap-2">
              <h2 className="text-lg font-bold text-foreground print:text-black">Daily Progress Report</h2>
              {workType && (
                <span
                  className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border print:border ${
                    workType === "structure"
                      ? "bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-700 print:bg-blue-50 print:text-blue-800 print:border-blue-300"
                      : "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-700 print:bg-amber-50 print:text-amber-800 print:border-amber-300"
                  }`}
                  data-testid="badge-worktype-print"
                >
                  {workType === "structure" ? "Structure" : "Road"}
                </span>
              )}
            </div>
            <p className="text-sm text-muted-foreground print:text-gray-600">High Lane Constructions Pvt Ltd</p>
          </div>
        </div>
      )}
      <div className={`grid grid-cols-1 md:grid-cols-3 ${submittedAt ? 'lg:grid-cols-4' : ''} gap-6`}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400 print:bg-blue-50">
            <Calendar className="w-5 h-5" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground print:text-gray-500">Date</p>
            <p className="font-semibold print:text-black" data-testid="text-report-date">{format(new Date(date), "PPP")}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center text-orange-600 dark:text-orange-400 print:bg-orange-50">
            <MapPin className="w-5 h-5" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground print:text-gray-500">Site Name</p>
            <p className="font-semibold print:text-black" data-testid="text-report-site">{site}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center text-green-600 dark:text-green-400 print:bg-green-50">
            <User className="w-5 h-5" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground print:text-gray-500">Engineer</p>
            <p className="font-semibold print:text-black" data-testid="text-report-engineer">{engineer}</p>
          </div>
        </div>
        {submittedAt && (
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center text-purple-600 dark:text-purple-400 print:bg-purple-50">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground print:text-gray-500">Submitted At</p>
              <p className="font-semibold text-sm print:text-black" data-testid="text-report-submitted">{submittedAt}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
