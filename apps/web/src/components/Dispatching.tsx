import { useEffect, useState } from "react";

const STAGES = ["Scanning airfields", "Plotting the leg", "Briefing the flight"];

const prefersReducedMotion =
  typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/**
 * The Opus dispatch wait — a slow compass sweep with the work it's doing called
 * out beneath. Under reduced motion the needle holds and the caption is static.
 */
export function Dispatching() {
  const [stage, setStage] = useState(0);

  useEffect(() => {
    if (prefersReducedMotion) return;
    const id = window.setInterval(
      () => setStage((s) => (s + 1) % STAGES.length),
      1600,
    );
    return () => window.clearInterval(id);
  }, []);

  return (
    <section className="animate-rise-in flex flex-col items-center gap-6 rounded-xl border border-line bg-panel/60 px-6 py-14 text-center shadow-panel">
      <svg viewBox="0 0 120 120" className="h-28 w-28" role="img" aria-label="Dispatching">
        <circle cx="60" cy="60" r="52" fill="none" stroke="#2A3742" strokeWidth="1.5" />
        <circle cx="60" cy="60" r="40" fill="none" stroke="#2A3742" strokeWidth="1" strokeOpacity="0.6" />
        {Array.from({ length: 12 }).map((_, i) => {
          const a = (i * 30 * Math.PI) / 180;
          const r1 = 52;
          const r2 = i % 3 === 0 ? 44 : 48;
          return (
            <line
              key={i}
              x1={60 + r1 * Math.sin(a)}
              y1={60 - r1 * Math.cos(a)}
              x2={60 + r2 * Math.sin(a)}
              y2={60 - r2 * Math.cos(a)}
              stroke="#2A3742"
              strokeWidth="1.5"
            />
          );
        })}
        <g className="animate-sweep" style={{ transformOrigin: "60px 60px" }}>
          <line x1="60" y1="60" x2="60" y2="14" stroke="#EC5FA4" strokeWidth="2" strokeLinecap="round" />
          <circle cx="60" cy="14" r="2.5" fill="#EC5FA4" />
        </g>
        <circle cx="60" cy="60" r="3.5" fill="#EC5FA4" />
      </svg>

      <div className="space-y-1.5">
        <div className="placard text-course">Dispatching</div>
        <p className="font-instrument text-base text-chalk" aria-live="polite">
          {prefersReducedMotion ? "Briefing the flight" : STAGES[stage]}…
        </p>
        <p className="text-xs text-mute">Opus is picking the leg and writing the brief.</p>
      </div>
    </section>
  );
}
