import { AlertTriangle, Compass, RotateCw, Shuffle } from "lucide-react";
import { Button } from "./ui.js";

/** A request that failed (network / server error) — recoverable, so offer retry. */
export function ErrorPanel({
  message,
  onRetry,
  retrying,
}: {
  message: string;
  onRetry: () => void;
  retrying: boolean;
}) {
  return (
    <section className="animate-rise-in rounded-xl border border-amber/30 bg-amber/[0.05] p-6 shadow-panel">
      <div className="flex items-start gap-3">
        <AlertTriangle size={20} className="mt-0.5 shrink-0 text-amber" />
        <div className="flex-1 space-y-3">
          <div>
            <div className="placard text-amber">Dispatch failed</div>
            <p className="mt-1 text-sm leading-relaxed text-chalk/90">{message}</p>
          </div>
          <Button
            variant="secondary"
            icon={<RotateCw size={15} className={retrying ? "animate-sweep" : ""} />}
            onClick={onRetry}
            disabled={retrying}
          >
            {retrying ? "Retrying…" : "Try again"}
          </Button>
        </div>
      </div>
    </section>
  );
}

/** A valid but empty outcome — the brief was too tight to fill. Guide, don't alarm. */
export function NoFlightPanel({
  reason,
  onSurprise,
}: {
  reason: string;
  onSurprise: () => void;
}) {
  return (
    <section className="animate-rise-in rounded-xl border border-line bg-panel/60 p-6 text-center shadow-panel">
      <Compass size={28} className="mx-auto text-mute" />
      <div className="placard mt-4">No flight matched</div>
      <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-chalk/85">
        {reason}
      </p>
      <p className="mt-3 text-xs text-mute">
        Loosen a dial — more time, a wider region, or surprise-me vibe — and dispatch again.
      </p>
      <div className="mt-4 flex justify-center">
        <Button variant="secondary" icon={<Shuffle size={15} />} onClick={onSurprise}>
          Surprise me
        </Button>
      </div>
    </section>
  );
}
