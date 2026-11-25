import { forwardRef, useState, type ComponentProps } from "react";
import { Input as BaseInput } from "@/components/ui/input";

/** Keep the editing buffer separate from the numeric calculation model. */
export const Input = forwardRef<HTMLInputElement, ComponentProps<typeof BaseInput>>(function LevelInput(props, ref) {
  const [focused, setFocused] = useState(false);
  const [text, setText] = useState("");
  const numeric = props.type === "number" || props.inputMode === "decimal";
  const chainage = /chainage/i.test(String(props["aria-label"] ?? ""));
  if (!numeric) return <BaseInput {...props} ref={ref} />;
  const converted = (raw: string, blur = false) => {
    if (chainage) return raw;
    const clean = raw.trim().replace(",", ".");
    if (!clean || !Number.isFinite(Number(clean))) return "";
    return blur ? String(Number(clean)) : clean;
  };
  return <BaseInput {...props} ref={ref} type="text" inputMode="decimal"
    value={focused ? text : props.value ?? ""}
    onFocus={event => { setText(String(props.value ?? "")); setFocused(true); props.onFocus?.(event); }}
    onChange={event => {
      const raw = event.target.value;
      setText(raw);
      props.onChange?.({ ...event, target: { ...event.target, value: converted(raw) }, currentTarget: { ...event.currentTarget, value: converted(raw) } });
    }}
    onBlur={event => {
      const value = converted(event.target.value, true);
      setFocused(false);
      props.onChange?.({ ...event, target: { ...event.target, value }, currentTarget: { ...event.currentTarget, value } });
      props.onBlur?.(event);
    }} />;
});
