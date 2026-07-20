// Formats an ActivityWeather ({ tempC, apparentC, humidityPct, windKph, windDirDeg, code })
// from the backend into the one-line display string, mapping the WMO weather code to a
// condition word and the wind bearing to a compass point.

// WMO weather-interpretation codes → short condition text (Open-Meteo `weather_code`).
const WMO = {
  0: 'Clear',
  1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast',
  45: 'Fog', 48: 'Rime fog',
  51: 'Light drizzle', 53: 'Drizzle', 55: 'Heavy drizzle',
  56: 'Freezing drizzle', 57: 'Freezing drizzle',
  61: 'Light rain', 63: 'Rain', 65: 'Heavy rain',
  66: 'Freezing rain', 67: 'Freezing rain',
  71: 'Light snow', 73: 'Snow', 75: 'Heavy snow', 77: 'Snow grains',
  80: 'Light showers', 81: 'Showers', 82: 'Violent showers',
  85: 'Snow showers', 86: 'Snow showers',
  95: 'Thunderstorm', 96: 'Thunderstorm', 99: 'Thunderstorm',
};

const COMPASS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
                 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];

export const weatherText = (code) => WMO[code] ?? 'Clear';

// Bearing (degrees, the direction the wind blows FROM) → 16-point compass abbreviation.
export const windCompass = (deg) => COMPASS[Math.round(((deg % 360) + 360) % 360 / 22.5) % 16];

// "Clear, 23°C. Feels like 23°C. Humidity 71%. Wind 4.0 km/h from SSE."
export function describeWeather(w) {
  if (!w) return null;
  const temp = Math.round(w.tempC);
  const feels = Math.round(w.apparentC);
  const wind = (w.windKph ?? 0).toFixed(1);
  return `${weatherText(w.code)}, ${temp}°C. Feels like ${feels}°C. `
       + `Humidity ${w.humidityPct}%. Wind ${wind} km/h from ${windCompass(w.windDirDeg)}.`;
}
