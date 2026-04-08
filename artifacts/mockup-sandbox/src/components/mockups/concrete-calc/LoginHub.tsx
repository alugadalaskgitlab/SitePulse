import React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { HardHat, Building2, ChevronRight, LogOut, ShieldAlert } from "lucide-react";

export function LoginHub() {
  return (
    <div className="min-h-[100dvh] flex flex-col bg-gradient-to-br from-amber-50 to-orange-100 dark:from-slate-900 dark:to-slate-800 selection:bg-amber-200">
      {/* Header */}
      <header className="px-6 py-8 md:px-12 md:py-10">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight text-slate-900 dark:text-white">
              High Lane Constructions
            </h1>
            <p className="text-lg text-amber-700 dark:text-amber-400 font-medium mt-1">
              Rate Analysis Portal
            </p>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 px-6 pb-12 md:px-12 flex flex-col justify-center">
        <div className="max-w-6xl mx-auto w-full">
          <div className="mb-8 md:mb-12 text-center md:text-left">
            <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Select a module</h2>
            <p className="text-slate-600 dark:text-slate-400 mt-2">Choose which calculator you want to open for analysis.</p>
          </div>

          <div className="grid md:grid-cols-2 gap-6 md:gap-10">
            {/* Tile 1: Bituminous Mix */}
            <Card className="group relative overflow-hidden border-2 border-transparent hover:border-amber-400 transition-all duration-300 hover:shadow-xl hover:shadow-amber-900/5 dark:hover:shadow-amber-900/20 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md">
              <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/10 rounded-bl-full -mr-8 -mt-8 transition-transform group-hover:scale-110" />
              <CardHeader>
                <div className="w-14 h-14 rounded-2xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center mb-4 text-amber-600 dark:text-amber-500 group-hover:scale-110 transition-transform">
                  <HardHat className="w-8 h-8" />
                </div>
                <CardTitle className="text-2xl font-bold text-slate-900 dark:text-slate-100">Bituminous Mix Calculator</CardTitle>
                <CardDescription className="text-base text-slate-600 dark:text-slate-400 leading-relaxed">
                  Hot mix rate analysis · Price scenarios · Job estimator · Contractor profitability
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 mb-2 text-sm text-slate-500 dark:text-slate-400">
                  <li className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-amber-400" /> BC & DBM analysis</li>
                  <li className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-amber-400" /> Plant dispatch metrics</li>
                  <li className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-amber-400" /> Real-time material costing</li>
                </ul>
              </CardContent>
              <CardFooter className="pt-2">
                <Button className="w-full bg-amber-500 hover:bg-amber-600 text-white shadow-md shadow-amber-500/20 group-hover:translate-x-1 transition-transform group-hover:shadow-amber-500/40">
                  Open Calculator
                  <ChevronRight className="w-4 h-4 ml-2" />
                </Button>
              </CardFooter>
            </Card>

            {/* Tile 2: Concrete */}
            <Card className="group relative overflow-hidden border-2 border-transparent hover:border-blue-500 transition-all duration-300 hover:shadow-xl hover:shadow-blue-900/5 dark:hover:shadow-blue-900/20 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md">
              <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 rounded-bl-full -mr-8 -mt-8 transition-transform group-hover:scale-110" />
              <div className="absolute top-4 right-4">
                <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100 dark:bg-blue-900/40 dark:text-blue-400 border-none font-semibold">NEW</Badge>
              </div>
              <CardHeader>
                <div className="w-14 h-14 rounded-2xl bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center mb-4 text-blue-600 dark:text-blue-500 group-hover:scale-110 transition-transform">
                  <Building2 className="w-8 h-8" />
                </div>
                <CardTitle className="text-2xl font-bold text-slate-900 dark:text-slate-100">Concrete Rate Calculator</CardTitle>
                <CardDescription className="text-base text-slate-600 dark:text-slate-400 leading-relaxed">
                  BOQ rate build-up · Earthwork · RCC with shuttering · HYSD reinforcement · Hidden factor analysis
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 mb-2 text-sm text-slate-500 dark:text-slate-400">
                  <li className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-blue-500" /> Itemised cost breakdown</li>
                  <li className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-blue-500" /> Structural steel tracking</li>
                  <li className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-blue-500" /> Formwork calculations</li>
                </ul>
              </CardContent>
              <CardFooter className="pt-2">
                <Button className="w-full bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-600/20 group-hover:translate-x-1 transition-transform group-hover:shadow-blue-600/40">
                  Open Calculator
                  <ChevronRight className="w-4 h-4 ml-2" />
                </Button>
              </CardFooter>
            </Card>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="px-6 py-6 md:px-12 mt-auto relative z-10 border-t border-amber-200/50 dark:border-slate-800/50 bg-white/30 dark:bg-slate-900/30 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <Badge variant="outline" className="bg-white/50 dark:bg-slate-800/50 backdrop-blur-sm border-amber-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 py-1.5 px-3 text-sm">
            <ShieldAlert className="w-4 h-4 mr-2 text-amber-500" />
            Admin Access
          </Badge>
          <Button variant="ghost" size="sm" className="text-slate-600 dark:text-slate-400 hover:text-slate-900 hover:bg-white/50 dark:hover:bg-slate-800/50">
            <LogOut className="w-4 h-4 mr-2" />
            Sign Out
          </Button>
        </div>
      </footer>

      {/* Footer Background Decoration */}
      <div className="fixed bottom-0 left-0 w-full h-64 bg-gradient-to-t from-orange-200/50 dark:from-slate-900 to-transparent pointer-events-none -z-10" />
    </div>
  );
}

export default LoginHub;
