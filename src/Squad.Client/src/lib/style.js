// Converts a raw CSS declaration string (exactly as it appears in the design
// prototype) into a React style object. Porting the prototype's inline styles
// verbatim through this helper is what keeps the implementation pixel-perfect.
//
//   s('padding:6px 18px;background:var(--bg2)')
//     -> { padding: '6px 18px', background: 'var(--bg2)' }
//
// Custom properties (--foo) are preserved as-is; vendor prefixes (-webkit-*)
// are PascalCased the way React expects (WebkitFontSmoothing, etc).

function toCamel(prop) {
  const p = prop.trim();
  if (p.startsWith('--')) return p;               // CSS custom property: keep literal
  // vendor prefix: -webkit-foo -> WebkitFoo
  const cleaned = p.startsWith('-') ? p.slice(1) : p;
  const camel = cleaned.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
  return p.startsWith('-') ? camel.charAt(0).toUpperCase() + camel.slice(1) : camel;
}

export function s(css) {
  if (!css) return {};
  const out = {};
  for (const decl of css.split(';')) {
    if (!decl.trim()) continue;
    const idx = decl.indexOf(':');
    if (idx === -1) continue;
    const prop = decl.slice(0, idx);
    const value = decl.slice(idx + 1).trim();
    out[toCamel(prop)] = value;
  }
  return out;
}

// Merge several css strings / style objects into one style object.
export function sx(...parts) {
  return Object.assign({}, ...parts.map((p) => (typeof p === 'string' ? s(p) : p || {})));
}

// Render a raw SVG/HTML icon string (the prototype stores icons as markup).
export function html(markup) {
  return { __html: markup };
}
