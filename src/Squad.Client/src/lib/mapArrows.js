// Direction-of-travel arrows for a MapLibre route line. A white, dark-haloed chevron is repeated
// ALONG the line (symbol-placement:line), so each one auto-rotates to the line tangent (start→end).
// Shared by the full route map and the live-ride map.

// Chevron drawn to a canvas → ImageData for map.addImage.
export function makeArrowImage() {
  const S = 30, cv = document.createElement('canvas');
  cv.width = S; cv.height = S;
  const x = cv.getContext('2d');
  x.lineCap = 'round'; x.lineJoin = 'round';
  const chevron = () => { x.beginPath(); x.moveTo(S * 0.36, S * 0.24); x.lineTo(S * 0.64, S * 0.5); x.lineTo(S * 0.36, S * 0.76); x.stroke(); };
  x.strokeStyle = 'rgba(0,0,0,.5)'; x.lineWidth = S * 0.2; chevron();  // halo for contrast on any basemap
  x.strokeStyle = '#fff'; x.lineWidth = S * 0.12; chevron();          // white chevron
  return x.getImageData(0, 0, S, S);
}

// Register the shared arrow image (once per map) and add a symbol layer drawing direction chevrons
// along `sourceId`. Safe to call repeatedly. `beforeId` optionally inserts the layer beneath another.
export function addRouteArrows(map, sourceId, layerId, beforeId) {
  try { if (!map.hasImage('route-arrow')) map.addImage('route-arrow', makeArrowImage(), { pixelRatio: 2 }); } catch { return; }
  if (map.getLayer(layerId)) return;
  map.addLayer({
    id: layerId, type: 'symbol', source: sourceId,
    layout: {
      'symbol-placement': 'line', 'symbol-spacing': 85, 'icon-image': 'route-arrow', 'icon-size': 0.6,
      'icon-rotation-alignment': 'map', 'icon-allow-overlap': true, 'icon-ignore-placement': true,
    },
  }, beforeId && map.getLayer(beforeId) ? beforeId : undefined);
}
