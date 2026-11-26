import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "./LevelInput";
import { levelPersonName, type LevelSignature } from "@shared/levelSheets";

export function LevelSignaturePad({ title, value, onChange, disabled }: {
  title: string; value: LevelSignature | null; onChange: (value: LevelSignature | null) => void; disabled: boolean;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const hasStroke = useRef(false);
  const current = value ?? { name: "", designation: "", date: "", imageData: null };
  useEffect(() => {
    if (!current.imageData || !canvas.current) return;
    const image = new Image();
    image.onload = () => canvas.current?.getContext("2d")?.drawImage(image, 0, 0, 600, 160);
    image.src = current.imageData;
  }, [current.imageData]);
  const clear = () => {
    canvas.current?.getContext("2d")?.clearRect(0, 0, 600, 160);
    hasStroke.current = false;
    onChange({ ...current, imageData: null, signedAt: null, recordedByUserId: null, recordedByName: null });
  };
  return <section className="min-w-0 space-y-2 rounded border p-3">
    <h3 className="text-sm">{title}</h3>
    {(["name", "designation", "date"] as const).map(key => <label key={key} className={`block text-sm ${key === "name" ? "font-semibold" : ""}`}>
      {key === "name" ? "Name" : key === "date" ? "Date" : "Designation"}
      <Input aria-label={`${title} ${key}`} type={key === "date" ? "date" : "text"} value={current[key]} disabled={disabled}
        onChange={event => onChange({ ...current, [key]: event.target.value })} />
    </label>)}
    {current.imageData ? <img className="h-28 w-full object-contain" src={current.imageData} alt={`${title} signature`} />
      : disabled ? <div className="h-28 border-b border-black" aria-label={`${title} blank signature line`} />
      : <canvas ref={canvas} width={600} height={160} aria-label={`${title} sign here`} className="h-28 w-full border" style={{ touchAction: "none" }}
        onPointerDown={event => {
          const target = event.currentTarget, rect = target.getBoundingClientRect(), context = target.getContext("2d");
          if (!context || !rect.width || !rect.height) return;
          target.setPointerCapture?.(event.pointerId);
          context.beginPath(); context.lineWidth = 2; context.lineCap = "round"; context.strokeStyle = "#000";
          context.moveTo((event.clientX - rect.left) * 600 / rect.width, (event.clientY - rect.top) * 160 / rect.height);
          drawing.current = true; hasStroke.current = false;
        }}
        onPointerMove={event => {
          if (!drawing.current) return;
          const target = event.currentTarget, rect = target.getBoundingClientRect(), context = target.getContext("2d");
          if (!context) return;
          context.lineTo((event.clientX - rect.left) * 600 / rect.width, (event.clientY - rect.top) * 160 / rect.height);
          context.stroke(); hasStroke.current = true;
        }}
        onPointerUp={() => {
          drawing.current = false;
          if (hasStroke.current && canvas.current) onChange({ ...current, imageData: canvas.current.toDataURL("image/png") });
        }}
        onPointerCancel={() => { drawing.current = false; }} />}
    {!disabled && <div className="flex gap-2"><Button type="button" variant="outline" size="sm" onClick={clear}>Clear</Button><Button type="button" variant="outline" size="sm" onClick={clear}>Sign again</Button></div>}
    {current.name && <p className="text-lg font-semibold">{levelPersonName(current.name)}</p>}
    {current.signedAt && <p className="text-xs">Signed {new Date(current.signedAt).toLocaleString()} · Recorded by {levelPersonName(current.recordedByName ?? "")}</p>}
  </section>;
}
