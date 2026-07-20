import { s } from '../lib/style.js';
import { useAuthedImage } from '../lib/authedImage.js';

// Renders a private image (fetched with the bearer token → object URL). Shows a
// neutral placeholder box until it resolves / on 404. `style` is an s()-string; the
// resolved image fills it as a cover background so callers control the exact box.
export default function AuthedImage({ url, token, style = '', onClick }) {
  const src = useAuthedImage(url || null, token || null);
  const base = style ? s(style) : {};
  if (!src) return <div onClick={onClick} style={{ ...s('background:var(--bg3)'), ...base }} />;
  return (
    <div
      onClick={onClick}
      style={{
        ...base,
        backgroundImage: `url("${src}")`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
      }}
    />
  );
}
