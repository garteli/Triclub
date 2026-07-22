// Direction-of-travel arrows for a MapLibre route line. A dark-haloed chevron in the user's route
// colour is repeated ALONG the line (symbol-placement:line), so each one auto-rotates to the line
// tangent (start→end). Shared by the full route map and the live-ride map.

// Chevron drawn to a canvas (coloured fill + dark halo) → ImageData for map.addImage/updateImage.
export function makeArrowImage(color = '#ff6a2c') {
  const S = 30, cv = document.createElement('canvas');
  cv.width = S; cv.height = S;
  const x = cv.getContext('2d');
  x.lineCap = 'round'; x.lineJoin = 'round';
  const chevron = () => { x.beginPath(); x.moveTo(S * 0.36, S * 0.24); x.lineTo(S * 0.64, S * 0.5); x.lineTo(S * 0.36, S * 0.76); x.stroke(); };
  x.strokeStyle = 'rgba(0,0,0,.55)'; x.lineWidth = S * 0.24; chevron();  // dark halo — reads on any basemap
  x.strokeStyle = color; x.lineWidth = S * 0.14; chevron();              // coloured chevron
  return x.getImageData(0, 0, S, S);
}

// Arrow icon-size scaled to the route width (S/M/L), so bolder routes get bolder arrows.
export const arrowSize = (width) => 0.42 + (width || 5) * 0.045;

// Register the shared arrow image (once per map) and add a symbol layer drawing direction chevrons
// along `sourceId`. Safe to call repeatedly. opts: { color, width, beforeId }.
export function addRouteArrows(map, sourceId, layerId, { color = '#ff6a2c', width = 5, beforeId } = {}) {
  try { if (!map.hasImage('route-arrow')) map.addImage('route-arrow', makeArrowImage(color), { pixelRatio: 2 }); } catch { return; }
  if (map.getLayer(layerId)) return;
  map.addLayer({
    id: layerId, type: 'symbol', source: sourceId,
    layout: {
      'symbol-placement': 'line', 'symbol-spacing': 85, 'icon-image': 'route-arrow', 'icon-size': arrowSize(width),
      'icon-rotation-alignment': 'map', 'icon-allow-overlap': true, 'icon-ignore-placement': true,
    },
  }, beforeId && map.getLayer(beforeId) ? beforeId : undefined);
}

// Recolour (regenerate the shared arrow image) + resize the given arrow layers when the user changes
// their route style. All layers share the one 'route-arrow' image, so one update recolours them all.
export function styleArrows(map, layerIds, { color, width } = {}) {
  try {
    if (color && map.hasImage('route-arrow')) {
      const img = makeArrowImage(color);
      if (map.updateImage) map.updateImage('route-arrow', img);
      else { map.removeImage('route-arrow'); map.addImage('route-arrow', img, { pixelRatio: 2 }); }
    }
  } catch { /* image not ready yet */ }
  if (width) for (const id of layerIds) if (map.getLayer(id)) map.setLayoutProperty(id, 'icon-size', arrowSize(width));
}
