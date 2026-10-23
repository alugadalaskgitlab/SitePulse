import { useEffect, useId, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type MasterOption = { id: number; label: string };

/** Inline by design: options stay in the modal's focus/pointer and scroll subtree. */
export function TripMasterCombobox({
  id, value, options, selectedId, onChange, onSelect, disabled, placeholder, testId, searchable = true,
  otherOptionLabel, otherSelected = false, onSelectOther, onDismiss,
}: {
  id: string; value: string; options: MasterOption[]; selectedId?: number | null;
  onChange: (text: string) => void; onSelect: (id: number) => void;
  disabled?: boolean; placeholder: string; testId?: string; searchable?: boolean;
  otherOptionLabel?: string; otherSelected?: boolean; onSelectOther?: () => void;
  onDismiss?: () => void;
}) {
  const listId = useId();
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const itemCount = options.length + (otherOptionLabel ? 1 : 0);
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
  const selectOther = () => {
    onSelectOther?.();
    input.current?.focus();
    setOpen(false);
    setActive(-1);
  };
  return <div onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setOpen(false);
      setActive(-1);
        onDismiss?.();
    }
  }}>
    <Input ref={input} id={id} value={value} disabled={disabled} placeholder={placeholder} data-testid={testId}
      role="combobox" autoComplete="off" aria-autocomplete="list" aria-expanded={expanded}
      aria-controls={expanded ? listId : undefined}
      aria-activedescendant={expanded && active >= 0
        ? active < options.length ? `${listId}-${options[active].id}` : otherOptionLabel ? `${listId}-other` : undefined
        : undefined}
      onFocus={() => { setOpen(true); setActive(-1); }}
      onChange={event => { onChange(event.target.value); setOpen(true); setActive(-1); }}
      onKeyDown={event => {
        if (event.key === "Escape" && open) {
          event.preventDefault();
          event.stopPropagation();
          setOpen(false);
          setActive(-1);
          onDismiss?.();
        } else if (searchable && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
          event.preventDefault();
          setOpen(true);
          setActive(current => itemCount ? event.key === "ArrowDown"
            ? (current + 1) % itemCount : (current <= 0 ? itemCount : current) - 1 : -1);
        } else if (expanded && event.key === "Enter") {
          // Never accidentally submit the trip while reviewing suggestions.
          event.preventDefault();
          if (options[active]) select(options[active]);
          else if (active === options.length && otherOptionLabel) selectOther();
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
        {otherOptionLabel && <div id={`${listId}-other`} role="option" aria-selected={otherSelected}
          tabIndex={-1} data-index={options.length}
          className={cn("min-h-11 cursor-pointer touch-manipulation rounded-sm px-3 py-3 text-sm hover:bg-accent hover:text-accent-foreground",
            active === options.length && "bg-accent text-accent-foreground")}
          onMouseDown={event => event.preventDefault()} onClick={selectOther}>
          {otherOptionLabel}
        </div>}
      </div>
      {!options.length && <p role="status" className="px-3 py-3 text-sm text-muted-foreground">No active Master match.</p>}
    </div>}
  </div>;
}
