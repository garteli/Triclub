using System.Security.Claims;

using Squad.Core;

namespace Squad.Web;

/// <summary>
/// Sysadmin console API (/api/admin) — list + moderate every user and club. Every route
/// requires a validated JWT AND that the caller's email is on the sysadmin allowlist
/// (<see cref="AdminRegistry"/>); a group-wide endpoint filter 403s everyone else, so the
/// individual handlers can assume they're talking to an admin.
/// </summary>
public static class AdminEndpoints
{
    public static IEndpointRouteBuilder MapAdmin(this IEndpointRouteBuilder app)
    {
        var g = app.MapGroup("/api/admin").RequireAuthorization();

        // Gate the whole group on sysadmin status (checked against the token's email claim).
        g.AddEndpointFilter(async (ctx, next) =>
        {
            var admins = ctx.HttpContext.RequestServices.GetRequiredService<AdminRegistry>();
            var email = ctx.HttpContext.User.FindFirstValue(ClaimTypes.Email)
                        ?? ctx.HttpContext.User.FindFirstValue("email");
            return admins.IsAdmin(email) ? await next(ctx) : Results.Forbid();
        });

        g.MapGet("/overview", async (ISysAdminService admin, CancellationToken ct)
            => Results.Ok(await admin.GetOverviewAsync(ct)));

        g.MapGet("/users", async (ISysAdminService admin, CancellationToken ct, string? search = null)
            => Results.Ok(await admin.ListUsersAsync(search, ct)));

        g.MapGet("/squads", async (ISysAdminService admin, CancellationToken ct)
            => Results.Ok(await admin.ListSquadsAsync(ct)));

        g.MapGet("/squads/{id:guid}/members", async (Guid id, ISysAdminService admin, CancellationToken ct)
            => await admin.GetMembersAsync(id, ct) is { } members ? Results.Ok(members) : Results.NotFound());

        g.MapDelete("/squads/{id:guid}", async (Guid id, ISysAdminService admin, CancellationToken ct)
            => ToResult(await admin.DeleteSquadAsync(id, ct)));

        g.MapDelete("/squads/{id:guid}/members/{athleteId:guid}",
            async (Guid id, Guid athleteId, ISysAdminService admin, CancellationToken ct)
                => ToResult(await admin.RemoveMemberAsync(id, athleteId, ct)));

        // deleteOwnedClubs=true also deletes the club(s) this user owns (the client gates that
        // behind a type-the-group-name confirmation).
        g.MapDelete("/users/{id:guid}", async (Guid id, ISysAdminService admin, CancellationToken ct, bool deleteOwnedClubs = false)
            => ToResult(await admin.DeleteUserAsync(id, deleteOwnedClubs, ct)));

        return app;
    }

    // Map a service outcome to an HTTP result. Protected/OwnsClub are caller-actionable
    // conflicts (409) carrying an explanatory message the UI shows verbatim.
    private static IResult ToResult(AdminActionResult r) => r.Outcome switch
    {
        AdminOutcome.Ok => Results.Ok(new { ok = true }),
        AdminOutcome.NotFound => Results.NotFound(),
        _ => Results.Json(new { error = r.Message ?? "Action not allowed." }, statusCode: StatusCodes.Status409Conflict),
    };
}
