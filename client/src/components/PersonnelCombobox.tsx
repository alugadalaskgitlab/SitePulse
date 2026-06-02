import { useState, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, Search, User } from "lucide-react";

type Personnel = { id: number; name: string; role?: string | null; isActive?: number | null };

interface PersonnelComboboxProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  "data-testid"?: string;
}

export function PersonnelCombobox({
  value,
  onChange,
  placeholder = "Search personnel…",
  className,
  "data-testid": testId,
}: PersonnelComboboxProps) {
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const { data: personnel = [] } = useQuery<Personnel[]>({
    queryKey: ["/api/personnel"],
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => { setQuery(value); }, [value]);

  const active = personnel.filter(p => p.isActive !== 0);
  const filtered = query.trim()
    ? active.filter(p => p.name.toLowerCase().includes(query.toLowerCase()))
    : active;

  function select(name: string) {
    onChange(name.toUpperCase());
    setQuery(name.toUpperCase());
    setOpen(false);
  }

  function handleBlur(e: React.FocusEvent) {
    if (listRef.current?.contains(e.relatedTarget as Node)) return;
    setOpen(false);
    if (query.trim() && query.toUpperCase() !== value.toUpperCase()) {
      onChange(query.trim().toUpperCase());
    }
  }

  return (
    <div className={`relative ${className ?? ""}`}>
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
        <input
          ref={inputRef}
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={handleBlur}
          placeholder={placeholder}
          className="h-9 w-full rounded-md border border-input bg-background pl-7 pr-2 text-sm outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500 placeholder:text-muted-foreground"
          autoComplete="off"
          data-testid={testId}
        />
      </div>
      {open && (
        <div
          ref={listRef}
          className="absolute z-50 mt-1 w-full rounded-md border bg-white dark:bg-zinc-900 shadow-lg max-h-52 overflow-auto text-sm"
          onMouseDown={e => e.preventDefault()}
        >
          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-gray-400 italic text-xs">
              {query.trim()
                ? `No match — "${query.trim()}" will be saved as-is`
                : "No active personnel found"}
            </div>
          ) : (
            filtered.map(p => (
              <div
                key={p.id}
                className="px-3 py-2 cursor-pointer hover:bg-amber-50 dark:hover:bg-amber-900/20 flex items-center justify-between gap-2 text-xs"
                onClick={() => select(p.name)}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <User className="h-3 w-3 text-gray-400 shrink-0" />
                  <span className="font-medium truncate">{p.name.toUpperCase()}</span>
                  {p.role && (
                    <span className="text-gray-400 shrink-0">{p.role}</span>
                  )}
                </div>
                {p.name.toUpperCase() === value.toUpperCase() && (
                  <Check className="h-3 w-3 text-amber-600 shrink-0" />
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
