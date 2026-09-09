import { WEATHER_BOOSTED_TYPES, type WeatherCondition } from "@pogo-analyzer/engine";

/**
 * Human-readable labels — the single copy now that the six former per-file
 * WEATHER_LABELS/WEATHER_OPTIONS blocks (AssumptionPanel.tsx,
 * TeamAssumptionPanel.tsx, SpeciesReportView.tsx,
 * IvBreakpointsAssumptionPanel.tsx, AttackDefenseBreakpointsView.tsx,
 * PowerUpOptimizerAssumptionPanel.tsx) have been replaced by this shared
 * control. WEATHER_BOOSTED_TYPES (from @pogo-analyzer/engine) stays the one
 * source of truth for which move types each condition boosts.
 */
const WEATHER_LABELS: Record<WeatherCondition, string> = {
  none: "None",
  sunny: "Sunny/Clear",
  rainy: "Rain",
  windy: "Windy",
  cloudy: "Cloudy",
  fog: "Fog",
  snow: "Snow",
  partly_cloudy: "Partly Cloudy",
};

// Fixed display order for the icon row — "none" first (it's the default/
// no-op choice players usually want), then roughly real-world frequency.
const WEATHER_ORDER: WeatherCondition[] = ["none", "sunny", "rainy", "windy", "cloudy", "fog", "snow", "partly_cloudy"];

function fullLabel(condition: WeatherCondition): string {
  const boosted = WEATHER_BOOSTED_TYPES[condition];
  return boosted.length === 0 ? WEATHER_LABELS[condition] : `${WEATHER_LABELS[condition]} (boosts ${boosted.join("/")})`;
}

/** A ray-burst circle — reused by the sunny icon and (behind a cloud) partly-cloudy, and (with a slash on top) "none". */
function SunGlyph({ cx, cy, r }: { cx: number; cy: number; r: number }) {
  const rays = [0, 45, 90, 135, 180, 225, 270, 315].map((deg) => {
    const rad = (deg * Math.PI) / 180;
    const r1 = r + 2;
    const r2 = r + 5;
    const x1 = cx + r1 * Math.cos(rad);
    const y1 = cy + r1 * Math.sin(rad);
    const x2 = cx + r2 * Math.cos(rad);
    const y2 = cy + r2 * Math.sin(rad);
    return <line key={deg} x1={x1} y1={y1} x2={x2} y2={y2} stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" />;
  });
  return (
    <>
      <circle cx={cx} cy={cy} r={r} fill="currentColor" />
      {rays}
    </>
  );
}

/**
 * A solid cloud silhouette built from three overlapping filled circles plus a
 * rounded base rect, all the same `fill="currentColor"` — overlapping
 * same-color fills blend into one seamless blob with no visible seams, which
 * is what lets this sit "in front of" a SunGlyph (see partly_cloudy below)
 * with no second color needed.
 */
function CloudGlyph({ cx, cy, scale }: { cx: number; cy: number; scale: number }) {
  return (
    <g fill="currentColor">
      <circle cx={cx - 4 * scale} cy={cy - 1 * scale} r={3.4 * scale} />
      <circle cx={cx} cy={cy - 3 * scale} r={4.2 * scale} />
      <circle cx={cx + 4.2 * scale} cy={cy - 0.8 * scale} r={3.2 * scale} />
      <rect x={cx - 7.5 * scale} y={cy - 1 * scale} width={15 * scale} height={6 * scale} rx={3 * scale} />
    </g>
  );
}

function WeatherIcon({ condition }: { condition: WeatherCondition }) {
  switch (condition) {
    case "sunny":
      return <SunGlyph cx={12} cy={12} r={5} />;
    case "none":
      return (
        <>
          <SunGlyph cx={12} cy={12} r={5} />
          {/* The user's explicit ask: an unmistakable diagonal strike-through, not a subtle one — a fixed
              high-contrast red (matching .species-picker-warning's #ff6b6b) rather than currentColor, so it
              reads as "off" against either the muted (unselected) or bright (selected) sun beneath it. */}
          <line x1={3} y1={3} x2={21} y2={21} stroke="#ff6b6b" strokeWidth={2.6} strokeLinecap="round" />
        </>
      );
    case "cloudy":
      return <CloudGlyph cx={12} cy={15} scale={1} />;
    case "partly_cloudy":
      return (
        <>
          <SunGlyph cx={8} cy={8} r={4} />
          <CloudGlyph cx={15} cy={15} scale={0.85} />
        </>
      );
    case "rainy":
      return (
        <>
          <CloudGlyph cx={12} cy={9} scale={0.62} />
          <g stroke="currentColor" strokeWidth={2} strokeLinecap="round">
            <line x1={9} y1={14} x2={7} y2={19} />
            <line x1={13} y1={14} x2={11} y2={19} />
            <line x1={17} y1={14} x2={15} y2={19} />
          </g>
        </>
      );
    case "windy":
      return (
        <>
          <CloudGlyph cx={8} cy={7} scale={0.55} />
          <g fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 12 H15 Q18 12 18 9" />
            <path d="M3 16 H20" />
            <path d="M3 20 H16 Q19 20 19 17" />
          </g>
        </>
      );
    case "fog":
      return (
        <>
          <CloudGlyph cx={12} cy={7} scale={0.55} />
          <g stroke="currentColor" strokeWidth={2} strokeLinecap="round">
            <line x1={4} y1={12} x2={20} y2={12} />
            <line x1={6} y1={16} x2={18} y2={16} />
            <line x1={4} y1={20} x2={20} y2={20} />
          </g>
        </>
      );
    case "snow":
      return (
        <>
          <CloudGlyph cx={12} cy={7} scale={0.55} />
          <g stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
            <line x1={12} y1={21.5} x2={12} y2={13.5} />
            <line x1={15.46} y1={19.5} x2={8.54} y2={15.5} />
            <line x1={8.54} y1={19.5} x2={15.46} y2={15.5} />
          </g>
        </>
      );
  }
}

interface Props {
  /** Unique prefix for this control's DOM ids — lets 6+ copies share one page without collisions. */
  idPrefix: string;
  value: WeatherCondition;
  onChange: (weather: WeatherCondition) => void;
}

/**
 * Shared weather picker, replacing the six copy-pasted `<select>` +
 * WEATHER_LABELS/WEATHER_OPTIONS blocks that used to live one-per-tab. A
 * compact row of icon buttons (role="radiogroup"/"radio", plain <button>s so
 * every option stays keyboard-focusable via Tab) rather than a <select>, per
 * the user's request to make weather visibly "a thing you probably don't
 * need to touch" — the icons signal that at a glance, and "none" is
 * deliberately the sunny icon with a diagonal line struck through it (the
 * user's explicit ask), not a separate glyph.
 *
 * The currently-selected condition's full label — including the
 * "(boosts x/y/z)" suffix WEATHER_OPTIONS used to carry as literal <option>
 * text — renders as a caption below the row, so no information is lost by
 * dropping the <select>.
 */
export function WeatherSelect({ idPrefix, value, onChange }: Props) {
  const labelId = `${idPrefix}-weather-label`;
  return (
    <div className="field weather-select">
      <label id={labelId}>Weather</label>
      <div className="weather-select-row" role="radiogroup" aria-labelledby={labelId}>
        {WEATHER_ORDER.map((condition) => (
          <button
            key={condition}
            type="button"
            id={`${idPrefix}-weather-${condition}`}
            role="radio"
            aria-checked={value === condition}
            className={`weather-select-btn${value === condition ? " selected" : ""}`}
            title={fullLabel(condition)}
            onClick={() => onChange(condition)}
          >
            <svg viewBox="0 0 24 24" width={20} height={20} aria-hidden="true">
              <WeatherIcon condition={condition} />
            </svg>
          </button>
        ))}
      </div>
      <p className="weather-select-caption">{fullLabel(value)}</p>
    </div>
  );
}
