import { useEffect, useState } from "react";

export default function SplashScreen() {
  const [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState<"enter" | "loading" | "done">("enter");

  useEffect(() => {
    const timer = setTimeout(() => setPhase("loading"), 300);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (phase !== "loading") return;
    const interval = setInterval(() => {
      setProgress((p) => {
        if (p >= 100) {
          clearInterval(interval);
          setPhase("done");
          return 100;
        }
        const step = p < 60 ? 4 : p < 85 ? 2 : 0.8;
        return Math.min(p + step, 100);
      });
    }, 40);
    return () => clearInterval(interval);
  }, [phase]);

  const visible = phase !== "enter";

  return (
    <div
      className="fixed inset-0 flex flex-col items-center justify-center"
      style={{ background: "linear-gradient(145deg, #0a3d4a 0%, #0f5b6e 55%, #0d6b82 100%)" }}
    >
      {/* Subtle grid overlay */}
      <div
        className="absolute inset-0 opacity-5"
        style={{
          backgroundImage:
            "repeating-linear-gradient(0deg, transparent, transparent 39px, rgba(255,255,255,0.5) 39px, rgba(255,255,255,0.5) 40px), repeating-linear-gradient(90deg, transparent, transparent 39px, rgba(255,255,255,0.5) 39px, rgba(255,255,255,0.5) 40px)",
        }}
      />

      {/* Main content */}
      <div
        className="relative flex flex-col items-center gap-8 transition-all duration-700"
        style={{
          opacity: visible ? 1 : 0,
          transform: visible ? "translateY(0)" : "translateY(20px)",
        }}
      >
        {/* Icon — bridge + road + pulse */}
        <svg
          width="160"
          height="100"
          viewBox="0 0 160 100"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Road base */}
          <rect x="0" y="72" width="160" height="6" rx="2" fill="rgba(255,255,255,0.15)" />
          {/* Road centre line dashes */}
          <rect x="10" y="74" width="18" height="2" rx="1" fill="rgba(255,255,255,0.25)" />
          <rect x="40" y="74" width="18" height="2" rx="1" fill="rgba(255,255,255,0.25)" />
          <rect x="70" y="74" width="18" height="2" rx="1" fill="rgba(255,255,255,0.25)" />
          <rect x="100" y="74" width="18" height="2" rx="1" fill="rgba(255,255,255,0.25)" />
          <rect x="130" y="74" width="18" height="2" rx="1" fill="rgba(255,255,255,0.25)" />

          {/* Bridge arch */}
          <path
            d="M40 72 Q80 20 120 72"
            stroke="rgba(255,255,255,0.85)"
            strokeWidth="3.5"
            fill="none"
            strokeLinecap="round"
          />
          {/* Bridge pillars */}
          <rect x="40" y="50" width="3" height="22" rx="1.5" fill="rgba(255,255,255,0.6)" />
          <rect x="117" y="50" width="3" height="22" rx="1.5" fill="rgba(255,255,255,0.6)" />
          {/* Bridge suspender lines */}
          <line x1="60" y1="72" x2="59" y2="44" stroke="rgba(255,255,255,0.35)" strokeWidth="1.2" />
          <line x1="80" y1="72" x2="80" y2="22" stroke="rgba(255,255,255,0.35)" strokeWidth="1.2" />
          <line x1="100" y1="72" x2="101" y2="44" stroke="rgba(255,255,255,0.35)" strokeWidth="1.2" />

          {/* Pulse / ECG line */}
          <polyline
            points="0,58 25,58 32,58 38,42 44,72 50,52 56,64 80,64 86,64 92,38 98,72 104,55 110,68 135,68 160,68"
            stroke="#f97316"
            strokeWidth="2.8"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {/* Pulse peak glow dot */}
          <circle cx="92" cy="38" r="4" fill="#f97316" opacity="0.9" />
          <circle cx="92" cy="38" r="8" fill="#f97316" opacity="0.2" />
        </svg>

        {/* Wordmark */}
        <div className="flex flex-col items-center gap-1">
          <div className="flex items-baseline gap-0">
            <span
              className="font-black tracking-tight"
              style={{ fontSize: 52, color: "#ffffff", fontFamily: "system-ui, sans-serif", letterSpacing: "-1px" }}
            >
              Site
            </span>
            <span
              className="font-black tracking-tight"
              style={{ fontSize: 52, color: "#f97316", fontFamily: "system-ui, sans-serif", letterSpacing: "-1px" }}
            >
              Pulse
            </span>
          </div>

          {/* Tagline */}
          <div
            className="tracking-widest font-medium"
            style={{
              fontSize: 11,
              color: "rgba(255,255,255,0.55)",
              letterSpacing: "0.25em",
              fontFamily: "system-ui, sans-serif",
            }}
          >
            LIVE OPS — BEYOND THE LOGBOOK
          </div>
        </div>

        {/* Loading bar */}
        <div className="flex flex-col items-center gap-2 mt-4" style={{ width: 240 }}>
          <div
            className="rounded-full overflow-hidden"
            style={{ width: 240, height: 3, background: "rgba(255,255,255,0.12)" }}
          >
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${progress}%`,
                background: "linear-gradient(90deg, #f97316, #fb923c)",
                transition: "width 0.1s linear",
                boxShadow: "0 0 8px rgba(249,115,22,0.6)",
              }}
            />
          </div>
          <span
            style={{
              fontSize: 11,
              color: "rgba(255,255,255,0.3)",
              fontFamily: "system-ui, sans-serif",
              letterSpacing: "0.05em",
            }}
          >
            {phase === "done" ? "Ready" : "Loading…"}
          </span>
        </div>
      </div>

      {/* Bottom brand mark */}
      <div
        className="absolute bottom-8 transition-all duration-1000"
        style={{
          opacity: visible ? 0.3 : 0,
          fontSize: 11,
          color: "rgba(255,255,255,0.5)",
          fontFamily: "system-ui, sans-serif",
          letterSpacing: "0.1em",
        }}
      >
        HIGH LANE CONSTRUCTIONS PVT LTD
      </div>
    </div>
  );
}
