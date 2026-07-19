// Domestique Team app mark — the white "Echelon" paceline on the ember squircle.
// (Brand spec: rounded-square ember gradient with the diagonal 3-stroke paceline
//  + lead-rider dot.) Sizes proportionally; pass `glow` to add the drop shadow.
export default function Logo({ size = 74, radius, glow = true }) {
  const r = radius ?? Math.round(size * 0.28);
  const mark = Math.round(size * 0.6);
  return (
    <div
      aria-label="Domestique Team"
      style={{
        width: size,
        height: size,
        borderRadius: r,
        background: 'linear-gradient(155deg,#ff8a3d,#ef5f1f)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flex: 'none',
        boxShadow: glow ? `0 ${Math.round(size * 0.2)}px ${Math.round(size * 0.5)}px -${Math.round(size * 0.16)}px rgba(239,95,31,.55)` : 'none',
      }}
    >
      <svg width={mark} height={mark} viewBox="0 0 64 64" fill="none">
        <g stroke="#fff" strokeWidth="5.4" strokeLinecap="round">
          <path d="M13 44 L23 30" />
          <path d="M25 46 L35 32" opacity=".85" />
          <path d="M37 48 L47 34" opacity=".55" />
        </g>
        <circle cx="49.5" cy="20.5" r="4.4" fill="#fff" />
      </svg>
    </div>
  );
}
