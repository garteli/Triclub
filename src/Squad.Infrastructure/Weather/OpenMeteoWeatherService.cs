using System;
using System.Globalization;
using System.Net.Http;
using System.Net.Http.Json;
using System.Text.Json.Serialization;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.Logging;
using Squad.Core;

namespace Squad.Infrastructure;

/// <summary>
/// <see cref="IWeatherService"/> backed by Open-Meteo (free, no API key). Fetches the day's
/// hourly series for the point and reads the sample nearest the activity's start time. Uses
/// the forecast API for recent/near dates (it also serves the last couple of weeks of past
/// data) and the historical archive API for older dates — both share the same response shape.
/// Best-effort: any failure returns null, so weather enrichment never blocks or fails an ingest.
/// </summary>
public sealed class OpenMeteoWeatherService(HttpClient http, ILogger<OpenMeteoWeatherService> log) : IWeatherService
{
    // The archive API lags real time by ~5 days; within that gap the forecast API serves the
    // recent past, and beyond it the archive has the complete reanalysis.
    private static readonly TimeSpan ArchiveLag = TimeSpan.FromDays(5);
    private const string Vars =
        "temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,wind_direction_10m";

    public async Task<ActivityWeather?> GetAsync(double lat, double lon, DateTimeOffset atUtc, CancellationToken ct)
    {
        if (double.IsNaN(lat) || double.IsNaN(lon) || lat is < -90 or > 90 || lon is < -180 or > 180)
            return null;

        var day = atUtc.UtcDateTime.Date;
        var recent = day >= DateTime.UtcNow.Date - ArchiveLag;
        var host = recent
            ? "https://api.open-meteo.com/v1/forecast"
            : "https://archive-api.open-meteo.com/v1/archive";
        var date = day.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
        var inv = CultureInfo.InvariantCulture;
        var url = $"{host}?latitude={lat.ToString(inv)}&longitude={lon.ToString(inv)}" +
                  $"&hourly={Vars}&start_date={date}&end_date={date}&timezone=UTC&wind_speed_unit=kmh";

        try
        {
            var resp = await http.GetFromJsonAsync<OpenMeteoResponse>(url, ct);
            var h = resp?.Hourly;
            if (h?.Time is null || h.Time.Length == 0) return null;

            int i = NearestHourIndex(h.Time, atUtc);
            if (i < 0) return null;

            double? temp = At(h.Temperature, i);
            if (temp is null) return null;   // no usable sample at that hour

            return new ActivityWeather(
                TempC: Math.Round(temp.Value, 1),
                ApparentC: Math.Round(At(h.Apparent, i) ?? temp.Value, 1),
                HumidityPct: (int)Math.Round(At(h.Humidity, i) ?? 0),
                WindKph: Math.Round(At(h.WindSpeed, i) ?? 0, 1),
                WindDirDeg: (int)Math.Round(At(h.WindDir, i) ?? 0),
                Code: (int)Math.Round(At(h.WeatherCode, i) ?? 0));
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            log.LogWarning(ex, "Open-Meteo weather lookup failed for {Lat},{Lon} @ {At:o}", lat, lon, atUtc);
            return null;
        }
    }

    // Times are "yyyy-MM-ddTHH:mm" in UTC (timezone=UTC). Pick the index closest to atUtc.
    private static int NearestHourIndex(string[] times, DateTimeOffset atUtc)
    {
        int best = -1;
        double bestDelta = double.MaxValue;
        for (int i = 0; i < times.Length; i++)
        {
            if (!DateTimeOffset.TryParse(times[i], CultureInfo.InvariantCulture,
                    DateTimeStyles.AssumeUniversal, out var t))
                continue;
            var delta = Math.Abs((t - atUtc).TotalMinutes);
            if (delta < bestDelta) { bestDelta = delta; best = i; }
        }
        return best;
    }

    private static double? At(double?[]? arr, int i) => arr is not null && i < arr.Length ? arr[i] : null;

    private sealed class OpenMeteoResponse
    {
        [JsonPropertyName("hourly")] public HourlyBlock? Hourly { get; set; }
    }

    private sealed class HourlyBlock
    {
        [JsonPropertyName("time")] public string[]? Time { get; set; }
        [JsonPropertyName("temperature_2m")] public double?[]? Temperature { get; set; }
        [JsonPropertyName("apparent_temperature")] public double?[]? Apparent { get; set; }
        [JsonPropertyName("relative_humidity_2m")] public double?[]? Humidity { get; set; }
        [JsonPropertyName("weather_code")] public double?[]? WeatherCode { get; set; }
        [JsonPropertyName("wind_speed_10m")] public double?[]? WindSpeed { get; set; }
        [JsonPropertyName("wind_direction_10m")] public double?[]? WindDir { get; set; }
    }
}
