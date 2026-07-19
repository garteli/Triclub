using System.Security.Claims;

using Squad.Core;

namespace Squad.Web;

/// <summary>
/// The signed-in athlete's own profile: read + partial update. Identity fields
/// (name/initials/color/squad) plus training fields (club, sport, level, ftp, …).
/// Changing the name recomputes initials so the avatar stays consistent.
/// </summary>
public static class ProfileEndpoints
{
    public static IEndpointRouteBuilder MapProfile(this IEndpointRouteBuilder app)
    {
        var g = app.MapGroup("/api/profile").RequireAuthorization();
        g.MapGet("", GetProfile);
        g.MapPut("", UpdateProfile);
        return app;
    }

    private static async Task<IResult> GetProfile(HttpContext http, IProfileService profiles, CancellationToken ct)
    {
        if (!TryMe(http, out var id)) return Results.Unauthorized();
        var p = await profiles.GetAsync(id, ct);
        return p is null ? Results.Unauthorized() : Results.Ok(p);
    }

    private static async Task<IResult> UpdateProfile(
        ProfileUpdate update, HttpContext http, IProfileService profiles, CancellationToken ct)
    {
        if (!TryMe(http, out var id)) return Results.Unauthorized();

        var name = string.IsNullOrWhiteSpace(update.Name) ? null : update.Name.Trim();
        var initials = name is null ? null : Initials(name);

        await profiles.UpdateAsync(id, name, initials, update, ct);
        var updated = await profiles.GetAsync(id, ct);
        return updated is null ? Results.Unauthorized() : Results.Ok(updated);
    }

    private static bool TryMe(HttpContext http, out Guid id)
    {
        var claim = http.User.FindFirstValue(ClaimTypes.NameIdentifier) ?? http.User.FindFirstValue("sub");
        return Guid.TryParse(claim, out id);
    }

    private static string Initials(string name)
    {
        var parts = name.Split(' ', StringSplitOptions.RemoveEmptyEntries);
        if (parts.Length == 0) return "?";
        var first = char.ToUpperInvariant(parts[0][0]);
        return parts.Length == 1 ? first.ToString() : $"{first}{char.ToUpperInvariant(parts[^1][0])}";
    }
}
