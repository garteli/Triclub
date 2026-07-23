namespace Squad.Core;

// ----- Route import (external URL → GPX → course geometry) -----

/// <summary>A route pulled from an external URL: a display name, the [lat,lon] points, and total km.
/// The client saves this as a <c>Course</c> exactly like an imported-GPX or drawn route.</summary>
public sealed record ImportedRoute(string Name, IReadOnlyList<double[]> Points, double DistanceKm);

/// <summary>Outcome of importing a route from a URL. On success <see cref="Route"/> is populated;
/// on failure <see cref="Error"/> is a user-facing reason (bad link, unreachable, no track points,
/// couldn't resolve an off-road.io page automatically…).</summary>
public sealed record RouteImportResult(bool Ok, ImportedRoute? Route, string? Error)
{
    public static RouteImportResult Success(ImportedRoute route) => new(true, route, null);
    public static RouteImportResult Fail(string error) => new(false, null, error);
}

/// <summary>Fetches a GPX from an external URL server-side (the browser can't — the hosts send no
/// CORS headers) and parses it into a route. Understands off-road.io links: a direct
/// <c>parse.off-road.io/v1/download/{key}</c> GPX is used as-is, and an <c>off-road.io/track/{id}</c>
/// map-page URL is resolved to its download best-effort. Any other direct <c>.gpx</c> URL works too.</summary>
public interface IRouteImportService
{
    Task<RouteImportResult> ImportAsync(string url, CancellationToken ct);
}
