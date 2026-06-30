export interface DialItem<V extends string> {
  value: V;
  label: string;
  /** When true the option is shown greyed and can't be selected. */
  disabled?: boolean;
  /** Why it's disabled — surfaced on hover/focus. */
  reason?: string;
}

interface SegmentedDialProps<V extends string> {
  /** Uppercase placard label for the dial. */
  placard: string;
  items: DialItem<V>[];
  value: V | undefined;
  onChange: (value: V) => void;
}

/**
 * One brief dial: a placard over a row of tappable segments. Disabled segments
 * stay focusable (via `aria-disabled`, not the native attribute) so they can
 * explain themselves on hover or keyboard focus.
 */
export function SegmentedDial<V extends string>({
  placard,
  items,
  value,
  onChange,
}: SegmentedDialProps<V>) {
  return (
    <fieldset role="group" aria-label={placard} className="min-w-0">
      <legend className="placard mb-2">{placard}</legend>
      <div className="flex flex-wrap gap-2">
        {items.map((item) => {
          const selected = item.value === value;
          const disabled = item.disabled ?? false;
          return (
            <div key={item.value} className="group relative">
              <button
                type="button"
                aria-pressed={selected}
                aria-disabled={disabled || undefined}
                onClick={() => {
                  if (!disabled) onChange(item.value);
                }}
                className={[
                  "inline-flex min-h-[44px] items-center gap-2 rounded-md border px-3.5 py-2 font-instrument text-sm transition",
                  disabled
                    ? "cursor-not-allowed border-line/60 text-mute/45"
                    : selected
                      ? "border-course bg-course/[0.08] text-chalk shadow-course"
                      : "border-line bg-panel text-mute hover:border-mute hover:text-chalk",
                ].join(" ")}
              >
                <span
                  aria-hidden
                  className={[
                    "h-1.5 w-1.5 rounded-full transition",
                    disabled
                      ? "bg-line"
                      : selected
                        ? "bg-course shadow-[0_0_8px_1px_rgba(236,95,164,0.8)]"
                        : "bg-line group-hover:bg-mute",
                  ].join(" ")}
                />
                {item.label}
              </button>
              {disabled && item.reason ? (
                <span
                  role="tooltip"
                  className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 w-52 -translate-x-1/2 rounded-md border border-line bg-panel-hi px-3 py-2 text-xs leading-snug text-chalk opacity-0 shadow-panel transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100"
                >
                  {item.reason}
                </span>
              ) : null}
            </div>
          );
        })}
      </div>
    </fieldset>
  );
}
