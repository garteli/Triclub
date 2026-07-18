import { html } from '../lib/style.js';

// Renders a raw SVG/HTML string (the prototype stores several icons as markup).
export default function Icon({ markup, style, className }) {
  return <div className={className} style={style} dangerouslySetInnerHTML={html(markup)} />;
}
