import React, { useState } from 'react';
import { Sparkles, Edit2, X, ArrowRight, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface ParsedItem {
  id: string;
  name: string;
  qty: number;
  uom: string;
  purpose: string;
  urgency: 'Normal' | 'Urgent';
}

const PARSED_ITEMS: ParsedItem[] = [
  {
    id: '1',
    name: 'Bitumen VG-30',
    qty: 5,
    uom: 'MT',
    purpose: 'Road repair Km 12.4',
    urgency: 'Normal'
  },
  {
    id: '2',
    name: 'Aggregate 20mm',
    qty: 12,
    uom: 'MT',
    purpose: 'Road repair Km 12.4',
    urgency: 'Normal'
  },
  {
    id: '3',
    name: 'Stone Dust',
    qty: 2,
    uom: 'MT',
    purpose: 'Road repair Km 12.4',
    urgency: 'Urgent'
  }
];

export function IrnRaiseD() {
  const [items, setItems] = useState(PARSED_ITEMS);
  const [source, setSource] = useState('Site');
  const [text, setText] = useState(
    "5 MT bitumen VG-30 and 12 MT aggregate 20mm for road repair at Km 12.4, also 2 MT stone dust urgent"
  );

  return (
    <div className="flex flex-col min-h-[100dvh] bg-slate-50 font-sans">
      {/* TOP ZONE */}
      <div className="bg-slate-900 text-slate-50 px-4 pt-10 pb-8 flex flex-col gap-6 rounded-b-[2rem] shadow-sm z-10 relative">
        <div className="space-y-4 max-w-2xl mx-auto w-full">
          <label className="text-xl font-medium tracking-tight text-slate-200">
            What do you need?
          </label>
          <div className="relative group">
            <Textarea 
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="min-h-[120px] text-lg bg-slate-800/50 border-slate-700 text-white placeholder:text-slate-500 focus-visible:ring-indigo-500 focus-visible:ring-offset-0 focus-visible:border-indigo-500 resize-none p-4 rounded-xl leading-relaxed transition-all"
              placeholder="E.g., 50 bags of cement for foundation..."
            />
            <div className="absolute right-3 bottom-3">
              <Button size="icon" className="bg-indigo-500 hover:bg-indigo-600 text-white rounded-full h-10 w-10 shadow-md">
                <Sparkles className="w-5 h-5" />
              </Button>
            </div>
          </div>
          
          <div className="flex items-center gap-3 pt-2">
            <span className="text-sm text-slate-400 font-medium">Raised from:</span>
            <div className="flex gap-2">
              {['Site', 'HMP Plant', 'Equipment'].map((s) => (
                <button
                  key={s}
                  onClick={() => setSource(s)}
                  className={cn(
                    "text-xs px-3 py-1.5 rounded-full font-medium transition-colors border",
                    source === s 
                      ? "bg-slate-800 border-slate-700 text-white" 
                      : "bg-transparent border-slate-800 text-slate-400 hover:text-slate-300 hover:border-slate-700"
                  )}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* BOTTOM ZONE */}
      <div className="flex-1 px-4 py-8 max-w-2xl mx-auto w-full pb-32">
        <div className="flex items-center gap-2 mb-6">
          <Sparkles className="w-5 h-5 text-indigo-500" />
          <h2 className="text-lg font-semibold text-slate-900 tracking-tight">Parsed items — review before submitting</h2>
        </div>

        <div className="space-y-4">
          {items.map((item) => (
            <div 
              key={item.id} 
              className="bg-white rounded-xl shadow-sm border border-slate-200/60 p-4 relative overflow-hidden group flex items-start gap-4"
            >
              {/* Left Color Bar */}
              <div className={cn(
                "absolute left-0 top-0 bottom-0 w-1.5",
                item.urgency === 'Urgent' ? 'bg-red-500' : 'bg-slate-300'
              )} />
              
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <h3 className="font-semibold text-slate-900 text-base truncate">
                    {item.name}
                  </h3>
                  <div className="text-right whitespace-nowrap">
                    <span className="font-bold text-slate-900">{item.qty}</span>
                    <span className="text-slate-500 ml-1 font-medium">{item.uom}</span>
                  </div>
                </div>
                
                <div className="flex items-center gap-3 mt-2">
                  <p className="text-sm text-slate-500 truncate flex-1">
                    {item.purpose}
                  </p>
                  {item.urgency === 'Urgent' && (
                    <Badge variant="destructive" className="bg-red-50 text-red-700 hover:bg-red-50 hover:text-red-700 border-red-200 font-medium px-2 py-0">
                      Urgent
                    </Badge>
                  )}
                  {item.urgency === 'Normal' && (
                    <Badge variant="outline" className="bg-slate-50 text-slate-600 border-slate-200 font-medium px-2 py-0">
                      Normal
                    </Badge>
                  )}
                </div>
              </div>
              
              <div className="flex flex-col gap-2">
                <button className="text-slate-400 hover:text-indigo-600 transition-colors p-1" title="Edit item">
                  <Edit2 className="w-4 h-4" />
                </button>
                <button className="text-slate-400 hover:text-red-600 transition-colors p-1" title="Remove item">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>

        <button className="mt-6 flex items-center gap-2 text-indigo-600 font-medium text-sm hover:text-indigo-700 transition-colors px-2">
          <Plus className="w-4 h-4" />
          Add another item
        </button>
      </div>

      {/* STICKY FOOTER */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 p-4 pb-safe shadow-[0_-4px_20px_-10px_rgba(0,0,0,0.1)] z-20">
        <div className="max-w-2xl mx-auto flex items-center justify-between gap-4">
          <button className="text-sm font-medium text-slate-500 hover:text-slate-800 transition-colors px-2">
            Start over
          </button>
          <Button className="bg-slate-900 hover:bg-slate-800 text-white shadow-md font-medium px-6 py-6 rounded-xl flex items-center gap-2 text-base w-full sm:w-auto">
            {items.length} items confirmed — Submit to Stores
            <ArrowRight className="w-5 h-5 ml-1" />
          </Button>
        </div>
      </div>
    </div>
  );
}
