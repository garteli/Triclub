import { s } from '../lib/style.js';

// The athlete's avatar: renders the uploaded photo when present, otherwise the
// initials on the profile's accent colour (the app's existing fallback). Sizing is
// parameterised so it drops into every existing avatar slot (38–80 px).
export default function Avatar({ photo, initials, color, size = 44, radius = 14, fontSize, style = '' }) {
  const fs = fontSize ?? Math.round(size * 0.36);
  const box = `width:${size}px;height:${size}px;border-radius:${radius}px;flex:none`;

  if (photo) {
    // NB: the photo is a data: URL (data:image/jpeg;base64,…) — its embedded
    // semicolons would be split apart by s(), mangling the url() and leaving a
    // blank box. Set the image props directly and only run `style` through s().
    return (
      <div
        style={{
          ...s(box),
          backgroundImage: `url("${photo}")`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
          ...(style ? s(style) : {}),
        }}
      />
    );
  }

  const bg = color || 'linear-gradient(135deg,#ff6f61,#ffb84d)';
  const ink = color ? '#0c0e11' : '#fff';
  return (
    <div style={s(`${box};background:${bg};display:flex;align-items:center;justify-content:center;font-weight:700;font-size:${fs}px;color:${ink}${style ? ';' + style : ''}`)}>
      {initials || '·'}
    </div>
  );
}
