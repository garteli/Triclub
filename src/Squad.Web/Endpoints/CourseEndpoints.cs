using System.Security.Claims;
using System.Text.Json;

using Squad.Core;

namespace Squad.Web;

/// <summary>Saved routes/courses. A rider saves a route (from a recorded ride, a GPX, or drawn on a
/// map), lists/loads them to follow on the live map, and deletes them. Owner-scoped.</summary>
public static class CourseEndpoints
{
    private const int MaxPoints = 20_000;

    public static IEndpointRouteBuilder MapCourses(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/courses", ListCourses).RequireAuthorization();
        app.MapGet("/api/courses/{id:guid}", GetCourse).RequireAuthorization();
        app.MapPost("/api/courses", CreateCourse).RequireAuthorization();
        app.MapPost("/api/courses/import", ImportCourse).RequireAuthorization();
        app.MapDelete("/api/courses/{id:guid}", DeleteCourse).RequireAuthorization();
        return app;
    }

    private static async Task<IResult> ListCourses(HttpContext http, ICourseStore courses, CancellationToken ct)
    {
        if (Me(http) is not { } me) return Results.Unauthorized();
        var list = await courses.ListAsync(me, ct);
        return Results.Ok(list.Select(c => new { id = c.Id, name = c.Name, distanceKm = c.DistanceKm, pointCount = c.PointCount, createdUtc = c.CreatedUtc }));
    }

    private static async Task<IResult> GetCourse(HttpContext http, Guid id, ICourseStore courses, CancellationToken ct)
    {
        if (Me(http) is not { } me) return Results.Unauthorized();
        var c = await courses.GetAsync(me, id, ct);
        if (c is null) return Results.NotFound(new { error = "Course not found." });
        // Points is stored JSON — pass it through as the parsed array so the client gets [[lat,lon],…].
        using var doc = JsonDocument.Parse(c.Points);
        return Results.Ok(new { id = c.Id, name = c.Name, distanceKm = c.DistanceKm, pointCount = c.PointCount, points = doc.RootElement.Clone() });
    }

    private static async Task<IResult> CreateCourse(HttpContext http, CourseCreateRequest req, ICourseStore courses, CancellationToken ct)
    {
        if (Me(http) is not { } me) return Results.Unauthorized();

        var name = (req.Name ?? "").Trim();
        if (name.Length == 0) name = "Course";
        if (name.Length > 120) name = name[..120];

        var pts = req.Points ?? System.Array.Empty<double[]>();
        // Keep only valid [lat,lon] pairs in range.
        var clean = pts.Where(p => p is { Length: >= 2 }
                && p[0] is >= -90 and <= 90 && p[1] is >= -180 and <= 180)
            .Select(p => new[] { p[0], p[1] })
            .Take(MaxPoints)
            .ToArray();
        if (clean.Length < 2) return Results.BadRequest(new { error = "A course needs at least two points." });

        var json = JsonSerializer.Serialize(clean);
        var id = await courses.CreateAsync(me, name, json, req.DistanceKm, clean.Length, ct);
        return Results.Ok(new { id, name, distanceKm = req.DistanceKm, pointCount = clean.Length });
    }

    /// <summary>Import a route from an external URL and save it as a course. The server fetches the
    /// GPX (the browser can't — the hosts send no CORS headers), resolving off-road.io track-page
    /// links to their download best-effort. Returns the created course, same shape as CreateCourse.</summary>
    private static async Task<IResult> ImportCourse(
        HttpContext http, CourseImportRequest req, IRouteImportService importer, ICourseStore courses, CancellationToken ct)
    {
        if (Me(http) is not { } me) return Results.Unauthorized();

        var url = (req.Url ?? "").Trim();
        if (url.Length == 0) return Results.BadRequest(new { error = "Paste a route link to import." });

        var result = await importer.ImportAsync(url, ct);
        if (!result.Ok || result.Route is null)
            return Results.BadRequest(new { error = result.Error ?? "Couldn't import that route." });

        var route = result.Route;
        // The importer already validated/capped points; serialize as [[lat,lon],…].
        var clean = route.Points.Select(p => new[] { p[0], p[1] }).ToArray();
        if (clean.Length < 2) return Results.BadRequest(new { error = "That route had no usable track points." });

        var name = string.IsNullOrWhiteSpace(route.Name) ? "Imported route" : route.Name.Trim();
        if (name.Length > 120) name = name[..120];
        var km = route.DistanceKm > 0 ? Math.Round(route.DistanceKm, 3) : (double?)null;

        var json = JsonSerializer.Serialize(clean);
        var id = await courses.CreateAsync(me, name, json, km, clean.Length, ct);
        return Results.Ok(new { id, name, distanceKm = km, pointCount = clean.Length });
    }

    private static async Task<IResult> DeleteCourse(HttpContext http, Guid id, ICourseStore courses, CancellationToken ct)
    {
        if (Me(http) is not { } me) return Results.Unauthorized();
        var ok = await courses.DeleteAsync(me, id, ct);
        return ok ? Results.Ok(new { deleted = true }) : Results.NotFound(new { error = "Course not found." });
    }

    private static Guid? Me(HttpContext http)
    {
        var claim = http.User.FindFirstValue(ClaimTypes.NameIdentifier) ?? http.User.FindFirstValue("sub");
        return System.Guid.TryParse(claim, out var id) ? id : null;
    }

    /// <summary>Body for saving a course: a name, the [lat,lon] points, and an optional distance.</summary>
    public sealed record CourseCreateRequest(string? Name, double[][]? Points, double? DistanceKm);

    /// <summary>Body for importing a course from a link (GPX URL or an off-road.io track page).</summary>
    public sealed record CourseImportRequest(string? Url);
}
