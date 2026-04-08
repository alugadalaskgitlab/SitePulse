import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, ChevronRight, Search, Plus, ArrowLeft, LogOut, FileText, Copy, Trash2, Calendar, HardHat } from "lucide-react";

// Types
type StructureType = "Drain" | "Box Culvert" | "Bridge" | "Retaining Wall";

interface Estimate {
  id: string;
  name: string;
  grade: string;
  structure: StructureType;
  volume: number;
  cost: number;
  date: string;
}

interface ContractorGroup {
  contractorName: string;
  estimates: Estimate[];
}

// Sample Data
const sampleData: ContractorGroup[] = [
  {
    contractorName: "M/s Sharma Constructions",
    estimates: [
      {
        id: "est-1",
        name: "NH-48 Drain Works — Km 12 to 18",
        grade: "RCC M25",
        structure: "Drain",
        volume: 1072,
        cost: 48.2,
        date: "Apr 2, 2026"
      },
      {
        id: "est-2",
        name: "Box Culvert BK-07",
        grade: "RCC M30",
        structure: "Box Culvert",
        volume: 380,
        cost: 19.8,
        date: "Mar 28, 2026"
      }
    ]
  },
  {
    contractorName: "M/s Patel Infrastructure",
    estimates: [
      {
        id: "est-3",
        name: "Bridge Pier & Abutment — Ch 45+200",
        grade: "RCC M35",
        structure: "Bridge",
        volume: 620,
        cost: 38.5,
        date: "Apr 5, 2026"
      }
    ]
  },
  {
    contractorName: "M/s L&T Construction",
    estimates: [
      {
        id: "est-4",
        name: "Retaining Wall — Sector 4",
        grade: "RCC M20",
        structure: "Retaining Wall",
        volume: 1250,
        cost: 65.0,
        date: "Apr 10, 2026"
      }
    ]
  }
];

const structureColors: Record<StructureType, string> = {
  "Drain": "bg-blue-100 text-blue-800 border-blue-200",
  "Box Culvert": "bg-indigo-100 text-indigo-800 border-indigo-200",
  "Bridge": "bg-violet-100 text-violet-800 border-violet-200",
  "Retaining Wall": "bg-cyan-100 text-cyan-800 border-cyan-200",
};

export function ConcreteEstimatesList() {
  const [searchQuery, setSearchQuery] = useState("");
  const [structureFilter, setStructureFilter] = useState<string>("All");
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({
    "M/s Sharma Constructions": true,
    "M/s Patel Infrastructure": true,
    "M/s L&T Construction": true,
  });

  const toggleGroup = (contractorName: string) => {
    setExpandedGroups(prev => ({ ...prev, [contractorName]: !prev[contractorName] }));
  };

  // Filter logic
  const filteredData = sampleData.map(group => {
    const isContractorMatch = group.contractorName.toLowerCase().includes(searchQuery.toLowerCase());
    
    const filteredEstimates = group.estimates.filter(est => {
      const isStructureMatch = structureFilter === "All" || est.structure === structureFilter;
      const isNameMatch = est.name.toLowerCase().includes(searchQuery.toLowerCase());
      return isStructureMatch && (isContractorMatch || isNameMatch);
    });

    return { ...group, estimates: filteredEstimates };
  }).filter(group => group.estimates.length > 0);

  const hasNoResults = filteredData.length === 0;
  const isSearchActive = searchQuery !== "" || structureFilter !== "All";

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      {/* Top Bar */}
      <header className="bg-white border-b border-slate-200 px-4 sm:px-6 py-3 flex items-center justify-between sticky top-0 z-10 shadow-sm">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" className="text-slate-500 hover:text-slate-900 hidden sm:flex">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Hub
          </Button>
          <div className="flex items-center">
            <div className="h-8 w-8 rounded bg-amber-500 text-white flex items-center justify-center font-bold text-sm mr-3 shadow-sm">
              HLC
            </div>
            <h1 className="text-lg font-semibold text-slate-800 tracking-tight">
              <span className="text-blue-700 hidden sm:inline">HLC</span>
              <span className="text-slate-300 hidden sm:inline mx-2">—</span>
              <span className="text-slate-800">Concrete Rate Estimates</span>
            </h1>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button className="bg-blue-600 hover:bg-blue-700 text-white shadow-sm transition-colors">
            <Plus className="h-4 w-4 mr-2" />
            <span className="hidden sm:inline">New Estimate</span>
            <span className="sm:hidden">New</span>
          </Button>
          <Button variant="ghost" size="icon" className="text-slate-500" title="Logout">
            <LogOut className="h-5 w-5" />
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-5xl w-full mx-auto p-4 sm:p-6 lg:p-8 flex flex-col gap-6">
        
        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input 
              placeholder="Search contractors or estimates..." 
              className="pl-9 bg-slate-50 border-slate-200 focus-visible:ring-blue-500"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="w-full sm:w-[200px]">
            <Select value={structureFilter} onValueChange={setStructureFilter}>
              <SelectTrigger className="bg-slate-50 border-slate-200">
                <SelectValue placeholder="Structure Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="All">All Structures</SelectItem>
                <SelectItem value="Drain">Drain</SelectItem>
                <SelectItem value="Box Culvert">Box Culvert</SelectItem>
                <SelectItem value="Bridge">Bridge</SelectItem>
                <SelectItem value="Retaining Wall">Retaining Wall</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* List Content */}
        <div className="flex flex-col gap-4">
          {hasNoResults ? (
            <div className="flex flex-col items-center justify-center py-16 px-4 text-center bg-white rounded-xl border border-blue-100 border-dashed shadow-sm">
              <div className="h-16 w-16 bg-blue-50 rounded-full flex items-center justify-center mb-4">
                <FileText className="h-8 w-8 text-blue-400" />
              </div>
              <h3 className="text-xl font-semibold text-slate-800 mb-2">
                {isSearchActive ? "No matching estimates found" : "No concrete estimates yet"}
              </h3>
              <p className="text-slate-500 max-w-md mb-6">
                {isSearchActive 
                  ? "Try adjusting your filters or search terms." 
                  : "Create your first concrete rate analysis estimate to get started."}
              </p>
              {!isSearchActive && (
                <Button className="bg-blue-600 hover:bg-blue-700">
                  <Plus className="h-4 w-4 mr-2" />
                  Create First Estimate
                </Button>
              )}
            </div>
          ) : (
            filteredData.map((group) => (
              <Collapsible 
                key={group.contractorName} 
                open={expandedGroups[group.contractorName]} 
                onOpenChange={() => toggleGroup(group.contractorName)}
                className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden"
              >
                <CollapsibleTrigger className="flex items-center justify-between w-full p-4 sm:px-6 bg-slate-50/50 hover:bg-slate-50 transition-colors group">
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center">
                      <HardHat className="h-4 w-4 text-blue-600" />
                    </div>
                    <h2 className="font-medium text-slate-900">{group.contractorName}</h2>
                    <Badge variant="secondary" className="bg-slate-200 text-slate-600 ml-2 hidden sm:inline-flex">
                      {group.estimates.length} {group.estimates.length === 1 ? 'Estimate' : 'Estimates'}
                    </Badge>
                  </div>
                  {expandedGroups[group.contractorName] ? (
                    <ChevronDown className="h-5 w-5 text-slate-400 group-hover:text-slate-600 transition-colors" />
                  ) : (
                    <ChevronRight className="h-5 w-5 text-slate-400 group-hover:text-slate-600 transition-colors" />
                  )}
                </CollapsibleTrigger>
                
                <CollapsibleContent>
                  <div className="p-4 sm:p-6 grid gap-4 border-t border-slate-100 bg-white">
                    {group.estimates.map((est) => (
                      <Card key={est.id} className="border-slate-200 shadow-none hover:border-blue-300 hover:shadow-sm transition-all group/card">
                        <CardContent className="p-4 sm:p-5 flex flex-col md:flex-row gap-4 md:items-center justify-between">
                          
                          <div className="flex-1 space-y-3">
                            <div className="flex items-start justify-between md:justify-start gap-3">
                              <h3 className="font-semibold text-slate-800 text-lg leading-tight group-hover/card:text-blue-700 transition-colors">
                                {est.name}
                              </h3>
                              <Badge className={`md:hidden shrink-0 font-medium ${structureColors[est.structure]}`}>
                                {est.structure}
                              </Badge>
                            </div>
                            
                            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-slate-600">
                              <div className="flex items-center gap-1.5 bg-slate-100 px-2 py-1 rounded-md font-medium text-slate-700">
                                {est.grade}
                              </div>
                              <div className="flex items-center gap-1.5">
                                <span className="text-slate-400">•</span>
                                <span className="font-medium text-slate-800">{est.volume.toLocaleString()} CUM</span>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <span className="text-slate-400">•</span>
                                <span className="font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">₹{est.cost}L</span>
                              </div>
                              <div className="flex items-center gap-1.5 text-slate-500">
                                <span className="text-slate-400">•</span>
                                <Calendar className="h-3.5 w-3.5" />
                                {est.date}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center justify-between md:justify-end gap-4 mt-2 md:mt-0 pt-4 md:pt-0 border-t md:border-0 border-slate-100">
                            <Badge className={`hidden md:inline-flex font-medium ${structureColors[est.structure]}`}>
                              {est.structure}
                            </Badge>
                            
                            <div className="flex items-center gap-2">
                              <Button variant="outline" size="sm" className="border-slate-200 text-blue-600 hover:bg-blue-50 hover:text-blue-700">
                                Open
                              </Button>
                              <div className="flex gap-1">
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-slate-600" title="Clone">
                                  <Copy className="h-4 w-4" />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-red-600 hover:bg-red-50" title="Delete">
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                          </div>

                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            ))
          )}
        </div>
      </main>
    </div>
  );
}

export default ConcreteEstimatesList;
