// Line-art sport glyphs in the app's icon convention: 24×24, stroke-based,
// rounded caps/joins, tint via `color` (defaults to currentColor). One clean
// monochrome set for swim / bike / run / gym (+ goggles for triathlon), so the
// discipline marks read as one family instead of mixed emoji.

const GLYPHS = {
  // three stacked waves
  swim: (
    <>
      <path d="M2 8q2.5-2.6 5 0t5 0 5 0 5 0" />
      <path d="M2 12.5q2.5-2.6 5 0t5 0 5 0 5 0" />
      <path d="M2 17q2.5-2.6 5 0t5 0 5 0 5 0" />
    </>
  ),
  // two wheels + frame (matches the existing Dashboard/Notifications bike)
  bike: (
    <>
      <circle cx="5.5" cy="17.5" r="3.5" />
      <circle cx="18.5" cy="17.5" r="3.5" />
      <path d="M15 17.5l-3-6.5H8.5m6.5 0l-2.5 6.5M9.5 6.5h3l2 4.5" />
    </>
  ),
  // running shoe, side profile (toe to the right)
  run: (
    <>
      <path d="M2.5 15.5h11.4l4.7-1.1c1.7-.4 2.9-.7 2.9-2 0-1-.8-1.5-2-1.7l-3.9-.6-3.4-3.1-1.6 1.7 1.6 1.6-2.4 1-2.1-2.3" />
      <path d="M2.5 15.5v2.2c0 .6.4 1 1 1h17.5" />
    </>
  ),
  // dumbbell
  gym: (
    <>
      <path d="M6 8v8M18 8v8M3.5 10.5v3M20.5 10.5v3" />
      <path d="M6 12h12M3.5 12h2.5M18 12h2.5" />
    </>
  ),
  // swim goggles
  goggles: (
    <>
      <circle cx="8" cy="12.5" r="3.6" />
      <circle cx="16" cy="12.5" r="3.6" />
      <path d="M11.5 12.5h1M4.4 12.5H2.4M19.6 12.5h2M5.2 9.6 3.8 8.3M18.8 9.6l1.4-1.3" />
    </>
  ),
  // motorcycle — two wheels + tank/handlebar, the motorsport family mark
  moto: (
    <>
      <circle cx="5" cy="16" r="3.2" />
      <circle cx="19" cy="16" r="3.2" />
      <path d="M8.2 16h4.3l-2.5-4H6.3M12.5 16l3-4h3.2M15.5 12l-1.2-2h-2.6M16.5 8.8h2.6" />
    </>
  ),
};

export default function SportIcon({ name, size = 24, color = 'currentColor', strokeWidth = 2, style }) {
  const glyph = GLYPHS[name] ?? GLYPHS.bike;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
      aria-hidden="true"
    >
      {glyph}
    </svg>
  );
}
