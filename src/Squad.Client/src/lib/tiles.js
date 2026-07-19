// Dependency-free slippy-map math. Turns lat/lon into Web-Mercator raster tiles
// (CARTO basemaps, no API key) plus a projector so callers can overlay routes and
// riders in the same pixel space. Everything is expressed against a fixed W×H
// "design box"; TileMap renders that box responsively (percentage-positioned tiles
// + a viewBox'd SVG), so the overlay and the basemap always line up at any width.

const TILE = 256;
const MAX_Z = 18; // CARTO serves higher, but 18 keeps tile counts sane for a phone view

const lonToWorldX = (lon, z) => ((lon + 180) / 360) * Math.pow(2, z);
const latToWorldY = (lat, z) => {
  const r = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * Math.pow(2, z);
};

// Pick the most zoomed-in level whose bounds still fit inside (W-2·pad)×(H-2·pad),
// then centre the content. Returns { z, originX, originY, project } where project
// maps (lat,lon) → pixel coords inside the W×H box.
export function fitView(points, W, H, pad = 22) {
  const pts = points && points.length ? points : [[32.72, 35.53]];
  const lats = pts.map((p) => p[0]);
  const lons = pts.map((p) => p[1]);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats);
  const minLon = Math.min(...lons), maxLon = Math.max(...lons);
  const cLat = (minLat + maxLat) / 2, cLon = (minLon + maxLon) / 2;

  let z = MAX_Z;
  for (; z > 1; z--) {
    const w = (lonToWorldX(maxLon, z) - lonToWorldX(minLon, z)) * TILE;
    const h = (latToWorldY(minLat, z) - latToWorldY(maxLat, z)) * TILE; // y grows south
    if (w <= W - 2 * pad && h <= H - 2 * pad) break;
  }

  const originX = lonToWorldX(cLon, z) * TILE - W / 2;
  const originY = latToWorldY(cLat, z) * TILE - H / 2;
  const project = (lat, lon) => ({
    x: lonToWorldX(lon, z) * TILE - originX,
    y: latToWorldY(lat, z) * TILE - originY,
  });
  return { z, originX, originY, project, W, H };
}

// Tiles covering the box, positioned as percentages of the design box so they scale
// with the container. left/top/size are % strings ready for inline styles.
export function tilesFor(view) {
  const { z, originX, originY, W, H } = view;
  const n = Math.pow(2, z);
  const x0 = Math.floor(originX / TILE), x1 = Math.floor((originX + W) / TILE);
  const y0 = Math.floor(originY / TILE), y1 = Math.floor((originY + H) / TILE);
  const out = [];
  for (let x = x0; x <= x1; x++) {
    for (let y = y0; y <= y1; y++) {
      if (y < 0 || y >= n) continue; // no wrap top/bottom
      const wx = ((x % n) + n) % n; // wrap east/west
      out.push({
        key: `${z}/${x}/${y}`,
        url: tileUrl(wx, y, z),
        left: ((x * TILE - originX) / W) * 100,
        top: ((y * TILE - originY) / H) * 100,
        wpct: (TILE / W) * 100,
        hpct: (TILE / H) * 100,
      });
    }
  }
  return out;
}

// CARTO dark basemap (retina), free for reasonable use. Subdomain rotation a–d.
export function tileUrl(x, y, z) {
  const sub = 'abcd'[(x + y) % 4];
  return `https://${sub}.basemaps.cartocdn.com/dark_all/${z}/${x}/${y}@2x.png`;
}

export const TILE_ATTRIBUTION = '© OpenStreetMap · © CARTO';

// Build an SVG path string from [lat,lon] points using a fitView projector.
export function toPathD(points, project) {
  if (!points || !points.length) return '';
  return 'M' + points.map(([la, lo]) => {
    const p = project(la, lo);
    return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
  }).join(' L');
}
