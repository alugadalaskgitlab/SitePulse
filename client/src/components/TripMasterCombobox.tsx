import { useEffect, useId, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type MasterOption = { id: number; label: string };

/** Inline by design: options stay in the modal's focus/pointer and scroll subtree. */
export function TripMasterCombobox({
  id, value, options, selectedId, onChange, onSelect, disabled, placeholder, testId, searchable = true,
}: {
  id: string; value: string; options: MasterOption[]; selectedId?: number | null;
  onChange: (text: string) => void; onSelect: (id: number) => void;
  disabled?: boolean; placeholder: string; testId?: string; searchable?: boolean;
}) {
  const listId = useId();
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const expanded = open && searchable && !disabled;
  useEffect(() => {
    if (expanded && active >= 0) {
      list.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView?.({ block: "nearest" });
    }
  }, [active, expanded]);
  const select = (option: MasterOption) => {
    onSelect(option.id);
    input.current?.focus();
    setOpen(false);
    setActive(-1);
  };
  return <div onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setOpen(false);
      setActive(-1);
    }
  }}>
    <Input ref={input} id={id} value={value} disabled={disabled} placeholder={placeholder} data-testid={testId}
      role="combobox" autoComplete="off" aria-autocomplete="list" aria-expanded={expanded}
      aria-controls={expanded ? listId : undefined}
      aria-activedescendant={expanded && active >= 0 && options[active] ? `${listId}-${options[active].id}` : undefined}
      onFocus={() => { setOpen(true); setActive(-1); }}
      onChange={event => { onChange(event.target.value); setOpen(true); setActive(-1); }}
      onKeyDown={event => {
        if (event.key === "Escape" && open) {
          event.preventDefault();
          event.stopPropagation();
          setOpen(false);
          setActive(-1);
        } else if (searchable && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
          event.preventDefault();
          setOpen(true);
          setActive(current => options.length ? event.key === "ArrowDown"
            ? (current + 1) % options.length : (current <= 0 ? options.length : current) - 1 : -1);
        } else if (expanded && event.key === "Enter") {
          // Never accidentally submit the trip while reviewing suggestions.
          event.preventDefault();
          if (options[active]) select(options[active]);
        }
      }} />
    {expanded && <div className="mt-1 rounded-md border bg-popover text-popover-foreground shadow-sm">
      <div ref={list} id={listId} role="listbox" aria-labelledby={id} className="max-h-56 overflow-y-auto overscroll-contain p-1">
        {options.map((option, index) => <div key={option.id} id={`${listId}-${option.id}`} role="option"
          aria-selected={selectedId === option.id} tabIndex={-1} data-index={index}
          className={cn("min-h-11 cursor-pointer touch-manipulation rounded-sm px-3 py-3 text-sm hover:bg-accent hover:text-accent-foreground",
            active === index && "bg-accent text-accent-foreground")}
          onMouseDown={event => event.preventDefault()} onClick={() => select(option)}>
          {option.label}
        </div>)}
      </div>
      {!options.length && <p role="status" className="px-3 py-3 text-sm text-muted-foreground">No active Master match.</p>}
    </div>}
  </div>;
}
