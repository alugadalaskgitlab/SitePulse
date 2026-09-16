import {
  forwardRef,
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type InputHTMLAttributes,
  type KeyboardEvent,
  type Ref,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import {
  filterFreeTextSuggestions,
  type SuggestionMatch,
} from "@/hooks/use-site-material-suggestions";

export interface FreeTextSuggestionInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange"> {
  value: string;
  "data-testid"?: string;
  /** Controlled value callback. Suggestions never own or reset this value. */
  onChange: (value: string) => void;
  suggestions?: string[];
  match?: SuggestionMatch;
  /** A failed optional lookup leaves the input usable for manual entry. */
  suggestionsError?: unknown;
  onSuggestionSelected?: (value: string) => void;
}

function assignRef<T>(ref: Ref<T> | undefined, value: T | null) {
  if (typeof ref === "function") ref(value);
  else if (ref) (ref as { current: T | null }).current = value;
}

/**
 * A small, controlled, free-text combobox.  It intentionally does not use a
 * native datalist: iOS Safari renders datalists inconsistently and they
 * cannot be made dependable inside a scrollable dialog.
 *
 * The menu is portalled to the nearest Radix dialog content when the input is
 * in a dialog.  This keeps pointer events inside the modal's active subtree;
 * ordinary page inputs still use document.body so they are not clipped by a
 * local overflow container.
 */
export const FreeTextSuggestionInput = forwardRef<
  HTMLInputElement,
  FreeTextSuggestionInputProps
>(function FreeTextSuggestionInput(
  {
    value,
    onChange,
    suggestions = [],
    match = "supplier",
    suggestionsError,
    onSuggestionSelected,
    className,
    id,
    onFocus,
    onBlur,
    onKeyDown,
    "data-testid": dataTestId,
    ...inputProps
  },
  forwardedRef,
) {
  const localRef = useRef<HTMLInputElement | null>(null);
  const [focused, setFocused] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [menuPosition, setMenuPosition] = useState({
    top: 0,
    left: 0,
    width: 0,
  });
  const generatedId = useId().replace(/:/g, "");
  const inputId = id ?? `free-text-suggestion-${generatedId}`;
  const listId = `${inputId}-suggestions`;

  const filteredSuggestions = filterFreeTextSuggestions(
    suggestions,
    value,
    match,
  ).slice(0, 50);
  const menuOpen = focused && filteredSuggestions.length > 0;

  const setInputRef = (node: HTMLInputElement | null) => {
    localRef.current = node;
    assignRef(forwardedRef, node);
  };

  const updateMenuPosition = () => {
    const node = localRef.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    const dialogTarget = node.closest<HTMLElement>('[role="dialog"]');
    const targetRect = dialogTarget?.getBoundingClientRect();
    const inDialog = Boolean(dialogTarget && targetRect);
    const viewportWidth =
      document.documentElement.clientWidth || window.innerWidth || 320;
    const width = Math.min(
      Math.max(rect.width, 180),
      Math.max(120, viewportWidth - 8),
    );
    setMenuPosition({
      top: inDialog ? rect.bottom - targetRect!.top + dialogTarget!.scrollTop - dialogTarget!.clientTop + 4 : rect.bottom + 4,
      left: inDialog
        ? rect.left - targetRect!.left + dialogTarget!.scrollLeft - dialogTarget!.clientLeft
        : Math.min(
            Math.max(4, rect.left),
            Math.max(4, viewportWidth - width - 4),
          ),
      width,
    });
  };

  useEffect(() => {
    if (!menuOpen) return;
    updateMenuPosition();
    const handlePositionChange = () => updateMenuPosition();
    window.addEventListener("resize", handlePositionChange);
    // Capture catches scrolls from a DialogContent scroll container as well
    // as page scrolling.
    window.addEventListener("scroll", handlePositionChange, true);
    return () => {
      window.removeEventListener("resize", handlePositionChange);
      window.removeEventListener("scroll", handlePositionChange, true);
    };
  }, [menuOpen, filteredSuggestions.length]);

  useEffect(() => {
    setActiveIndex((current) =>
      current >= filteredSuggestions.length ? -1 : current,
    );
  }, [value, suggestions, match, filteredSuggestions.length]);

  const selectSuggestion = (suggestion: string) => {
    onChange(suggestion);
    onSuggestionSelected?.(suggestion);
    setActiveIndex(-1);
    setFocused(false);
  };

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    onChange(event.target.value);
    setFocused(true);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (menuOpen && event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((current) =>
        current < filteredSuggestions.length - 1 ? current + 1 : 0,
      );
    } else if (menuOpen && event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) =>
        current > 0 ? current - 1 : filteredSuggestions.length - 1,
      );
    } else if (menuOpen && event.key === "Enter" && activeIndex >= 0) {
      event.preventDefault();
      selectSuggestion(filteredSuggestions[activeIndex]);
    } else if (event.key === "Escape") {
      setFocused(false);
      setActiveIndex(-1);
    }
    onKeyDown?.(event);
  };

  const portalTarget =
    typeof document !== "undefined"
      ? (localRef.current?.closest<HTMLElement>('[role="dialog"]') ??
        document.body)
      : null;
  const menu =
    menuOpen && portalTarget
      ? createPortal(
          <div
            id={listId}
            role="listbox"
            aria-label={`${match} suggestions`}
            className={cn(
              "z-[100] max-h-56 overflow-y-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md pointer-events-auto",
              portalTarget !== document.body ? "absolute" : "fixed",
            )}
            style={{
              top: menuPosition.top,
              left: menuPosition.left,
              width: menuPosition.width,
              minWidth: 180,
              maxWidth: "calc(100vw - 8px)",
            }}
            data-testid={dataTestId ? `${dataTestId}-suggestions` : undefined}
          >
            {filteredSuggestions.map((suggestion, index) => (
              <div
                key={`${suggestion}-${index}`}
                id={`${listId}-option-${index}`}
                role="option"
                aria-selected={activeIndex === index}
                className={cn(
                  "cursor-pointer rounded-sm px-3 py-2 text-sm outline-none",
                  "min-h-10 touch-manipulation hover:bg-accent hover:text-accent-foreground",
                  activeIndex === index && "bg-accent text-accent-foreground",
                )}
                onPointerDown={(event) => event.preventDefault()}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => selectSuggestion(suggestion)}
              >
                {suggestion}
              </div>
            ))}
          </div>,
          portalTarget,
        )
      : null;

  return (
    <>
      <Input
        {...inputProps}
        ref={setInputRef}
        id={inputId}
        data-testid={dataTestId}
        value={value}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={menuOpen}
        aria-controls={menuOpen ? listId : undefined}
        aria-activedescendant={
          menuOpen && activeIndex >= 0
            ? `${listId}-option-${activeIndex}`
            : undefined
        }
        className={className}
        onChange={handleChange}
        onFocus={(event) => {
          setFocused(true);
          onFocus?.(event);
        }}
        onBlur={(event) => {
          // A menu option prevents mousedown so the input remains focused
          // through click/tap.  Other blurs should close immediately.
          onBlur?.(event);
          if (!event.relatedTarget || !event.currentTarget.contains(event.relatedTarget)) {
            setFocused(false);
            setActiveIndex(-1);
          }
        }}
        onKeyDown={handleKeyDown}
      />
      {Boolean(suggestionsError) && (
        <p
          className="mt-1 text-xs text-muted-foreground"
          role="status"
          aria-live="polite"
        >
          Suggestions unavailable — manual entry is still available.
        </p>
      )}
      {menu}
    </>
  );
});

FreeTextSuggestionInput.displayName = "FreeTextSuggestionInput";

export default FreeTextSuggestionInput;