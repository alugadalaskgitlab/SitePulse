import { useEffect, useState } from "react";

interface SplashScreenProps {
  onDone: () => void;
}

export function SplashScreen({ onDone }: SplashScreenProps) {
  const [visible, setVisible] = useState(false);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    const show = setTimeout(() => setVisible(true), 60);
    const fade = setTimeout(() => setFading(true), 2200);
    const done = setTimeout(() => onDone(), 2800);
    return () => { clearTimeout(show); clearTimeout(fade); clearTimeout(done); };
  }, [onDone]);

  return (
    <div
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-center"
      style={{
        background: "linear-gradient(145deg, #0a3d4a 0%, #0f5b6e 55%, #0d6b82 100%)",
        opacity: fading ? 0 : 1,
        transition: "opacity 0.6s ease",
        pointerEvents: fading ? "none" : "all",
      }}
    >
      <div
        className="absolute inset-0 opacity-5"
        style={{
          backgroundImage:
            "repeating-linear-gradient(0deg,transparent,transparent 39px,rgba(255,255,255,0.5) 39px,rgba(255,255,255,0.5) 40px),repeating-linear-gradient(90deg,transparent,transparent 39px,rgba(255,255,255,0.5) 39px,rgba(255,255,255,0.5) 40px)",
        }}
      />

      <div
        className="relative flex flex-col items-center gap-8"
        style={{
          opacity: visible ? 1 : 0,
          transform: visible ? "translateY(0)" : "translateY(20px)",
          transition: "opacity 0.7s ease, transform 0.7s ease",
        }}
      >
        <svg width="140" height="88" viewBox="0 0 160 100" fill="none">
          <rect x="0" y="72" width="160" height="6" rx="2" fill="rgba(255,255,255,0.15)" />
          <rect x="10" y="74" width="18" height="2" rx="1" fill="rgba(255,255,255,0.25)" />
          <rect x="40" y="74" width="18" height="2" rx="1" fill="rgba(255,255,255,0.25)" />
          <rect x="70" y="74" width="18" height="2" rx="1" fill="rgba(255,255,255,0.25)" />
          <rect x="100" y="74" width="18" height="2" rx="1" fill="rgba(255,255,255,0.25)" />
          <rect x="130" y="74" width="18" height="2" rx="1" fill="rgba(255,255,255,0.25)" />
          <path d="M40 72 Q80 20 120 72" stroke="rgba(255,255,255,0.85)" strokeWidth="3.5" fill="none" strokeLinecap="round" />
          <rect x="40" y="50" width="3" height="22" rx="1.5" fill="rgba(255,255,255,0.6)" />
          <rect x="117" y="50" width="3" height="22" rx="1.5" fill="rgba(255,255,255,0.6)" />
          <line x1="60" y1="72" x2="59" y2="44" stroke="rgba(255,255,255,0.35)" strokeWidth="1.2" />
          <line x1="80" y1="72" x2="80" y2="22" stroke="rgba(255,255,255,0.35)" strokeWidth="1.2" />
          <line x1="100" y1="72" x2="101" y2="44" stroke="rgba(255,255,255,0.35)" strokeWidth="1.2" />
          <polyline
            points="0,58 25,58 32,58 38,42 44,72 50,52 56,64 80,64 86,64 92,38 98,72 104,55 110,68 135,68 160,68"
            stroke="#f97316" strokeWidth="2.8" fill="none" strokeLinecap="round" strokeLinejoin="round"
          />
          <circle cx="92" cy="38" r="4" fill="#f97316" opacity="0.9" />
          <circle cx="92" cy="38" r="8" fill="#f97316" opacity="0.2" />
        </svg>

        <div className="flex flex-col items-center gap-1.5">
          <div className="flex items-baseline">
            <span style={{ fontSize: 48, fontWeight: 900, color: "#ffffff", letterSpacing: "-1px", fontFamily: "system-ui,sans-serif" }}>Site</span>
            <span style={{ fontSize: 48, fontWeight: 900, color: "#f97316", letterSpacing: "-1px", fontFamily: "system-ui,sans-serif" }}>Pulse</span>
          </div>
          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", letterSpacing: "0.2em", fontFamily: "system-ui,sans-serif", fontWeight: 500 }}>
            LIVE OPS. NOT JUST LOGS.
          </span>
        </div>
      </div>
    </div>
  );
}
