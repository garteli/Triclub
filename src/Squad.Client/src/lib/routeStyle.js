// Per-user route line style (colour + width), persisted in localStorage so it follows the athlete
// across sessions on this device. Applied to the route track on the full map (and the live-ride
// breadcrumb). Purely client-side — no server round-trip.

const KEY = 'squad.routeStyle';

// Palette + width presets offered in the picker.
export const ROUTE_COLORS = ['#ff6a2c', '#2b6cff', '#ff3b30', '#12b886', '#a855f7', '#111827', '#00b4d8', '#ffd21e'];
export const ROUTE_WIDTHS = [{ label: 'S', w: 3 }, { label: 'M', w: 5 }, { label: 'L', w: 8 }];

const DEFAULT = { color: '#ff6a2c', width: 5 };

export function getRouteStyle() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (!v || typeof v !== 'object') return { ...DEFAULT };
    return {
      color: typeof v.color === 'string' ? v.color : DEFAULT.color,
      width: Number.isFinite(v.width) ? v.width : DEFAULT.width,
    };
  } catch { return { ...DEFAULT }; }
}

export function setRouteStyle(style) {
  try { localStorage.setItem(KEY, JSON.stringify({ color: style.color, width: style.width })); } catch { /* ignore */ }
}
