using System.Security.Claims;

using Squad.Core;

namespace Squad.Web;

/// <summary>The signed-in athlete's notification inbox: list + mark-all-read.</summary>
public static class NotificationEndpoints
{
    public static IEndpointRouteBuilder MapNotifications(this IEndpointRouteBuilder app)
    {
        var g = app.MapGroup("/api/notifications").RequireAuthorization();
        g.MapGet("", List);
        g.MapPost("/read", MarkRead);
        return app;
    }

    private static async Task<IResult> List(HttpContext http, INotificationService notes, CancellationToken ct)
    {
        if (!TryMe(http, out var me)) return Results.Unauthorized();
        return Results.Ok(await notes.GetRecentAsync(me, 40, ct));
    }

    private static async Task<IResult> MarkRead(HttpContext http, INotificationService notes, CancellationToken ct)
    {
        if (!TryMe(http, out var me)) return Results.Unauthorized();
        await notes.MarkAllReadAsync(me, ct);
        return Results.Ok(new { ok = true });
    }

    private static bool TryMe(HttpContext http, out Guid id)
    {
        var claim = http.User.FindFirstValue(ClaimTypes.NameIdentifier) ?? http.User.FindFirstValue("sub");
        return Guid.TryParse(claim, out id);
    }
}
