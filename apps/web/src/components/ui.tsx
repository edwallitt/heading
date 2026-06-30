import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost";

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-course text-ink font-semibold border border-course hover:brightness-110 shadow-course disabled:bg-course-dim disabled:border-course-dim disabled:text-ink/60 disabled:shadow-none",
  secondary:
    "bg-panel text-chalk border border-line hover:border-mute hover:bg-panel-hi",
  ghost:
    "bg-transparent text-mute border border-transparent hover:text-chalk hover:border-line",
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  icon?: ReactNode;
}

/** Instrument-styled action button. */
export function Button({
  variant = "secondary",
  icon,
  children,
  className = "",
  ...rest
}: ButtonProps) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-md px-4 py-2.5 font-instrument text-sm tracking-wide transition disabled:cursor-not-allowed ${VARIANTS[variant]} ${className}`}
      {...rest}
    >
      {icon}
      {children}
    </button>
  );
}

/** A single instrument readout: an uppercase placard over a value. */
export function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 px-4 py-3">
      <span className="placard">{label}</span>
      <span className="font-instrument text-lg font-medium tabular-nums text-chalk">
        {children}
      </span>
    </div>
  );
}
