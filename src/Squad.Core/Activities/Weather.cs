namespace Squad.Core;

/// <summary>
/// Weather at an activity's start point and start time, looked up after parsing.
/// Small, immutable, and stored inline with the activity (one JSON column). The
/// client formats the display string ("Clear, 23°C. Feels like 23°C. …") from these
/// raw values, including the WMO <see cref="Code"/> → condition text and the wind
/// bearing → compass point.
/// </summary>
public sealed record ActivityWeather(
    double TempC,            // air temperature, °C
    double ApparentC,        // "feels like", °C
    int HumidityPct,         // relative humidity, %
    double WindKph,          // wind speed, km/h
    int WindDirDeg,          // wind bearing, degrees (0 = from N, 90 = from E)
    int Code);               // WMO weather-interpretation code (0 = clear sky)

/// <summary>
/// Looks up the weather for a point in space and time. Best-effort: implementations
/// return null on any failure (network, no data) so enrichment never blocks or fails
/// an ingest. Backed by Open-Meteo (no API key) in production.
/// </summary>
public interface IWeatherService
{
    Task<ActivityWeather?> GetAsync(double lat, double lon, DateTimeOffset atUtc, CancellationToken ct);
}
