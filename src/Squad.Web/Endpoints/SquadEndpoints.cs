using System.Security.Claims;

using Squad.Core;

namespace Squad.Web;

/// <summary>
/// Squads / groups: discover, view, create, join. Joining (or creating) makes the
/// squad the athlete's active squad, so the feed / leaderboard / activities follow.
/// (Approval + payment gating is a deferred follow-up — join is immediate for now.)
/// </summary>
public static class SquadEndpoints
{
    public static IEndpointRouteBuilder MapSquads(this IEndpointRouteBuilder app)
    {
        var g = app.MapGroup("/api/squads").RequireAuthorization();
        g.MapGet("", List);
        g.MapGet("/{id:guid}", Get);
        g.MapPost("", Create);
        g.MapPost("/{id:guid}/join", Join);
        g.MapPost("/{id:guid}/activate", Activate);
        g.MapPost("/{id:guid}/requests/{athleteId:guid}/approve", Approve);
        g.MapPost("/{id:guid}/requests/{athleteId:guid}/decline", Decline);
        // Owner management: edit details/pricing + roster (add/remove members).
        g.MapPatch("/{id:guid}", Update);
        g.MapGet("/{id:guid}/members", Members);
        g.MapPost("/{id:guid}/members", AddMember);
        g.MapDelete("/{id:guid}/members/{athleteId:guid}", RemoveMember);
        // Owner sets a member's role (coach/member) and transfers ownership to a coach.
        g.MapPost("/{id:guid}/members/{athleteId:guid}/role", SetRole);
        g.MapPost("/{id:guid}/transfer/{athleteId:guid}", TransferOwnership);
        // Invite links: owner mints a shareable link; the invitee looks it up (anonymous, before
        // sign-up) and accepts it (authorized) to auto-join.
        g.MapPost("/{id:guid}/invite", CreateInvite);
        app.MapGet("/api/invites/{token}", InviteLookup);
        app.MapGet("/api/invites/{token}/logo", InviteLogo);
        app.MapPost("/api/invites/{token}/accept", AcceptInvite).RequireAuthorization();
        // The owner's cross-squad pending-request inbox.
        app.MapGet("/api/requests", Requests).RequireAuthorization();
        return app;
    }

    private static async Task<IResult> List(
        HttpContext http, ISquadService squads, AdminRegistry admins, IConfiguration config, CancellationToken ct)
    {
        var list = await squads.ListAsync(Me(http), ct);
        // The seeded "landing" demo club is hidden from normal users (so a new/no-group user never
        // lands in it). Only admins or a configured review account (Squads:ReviewEmails) still see it
        // in Discover — e.g. the app-store review account, which needs a populated club to browse.
        if (!CanSeeHiddenClubs(http, admins, config))
            list = list.Where(s => s.Id != Squads.Landing).ToList();
        return Results.Ok(list);
    }

    // True when the caller may see clubs that are hidden from the general population (the seeded
    // landing club). Admins always may; a review account is whitelisted via the Squads:ReviewEmails
    // config (comma/semicolon-separated) so it can browse the demo club without sysadmin powers.
    private static bool CanSeeHiddenClubs(HttpContext http, AdminRegistry admins, IConfiguration config)
    {
        var email = http.User.FindFirstValue(ClaimTypes.Email);
        if (string.IsNullOrWhiteSpace(email)) return false;
        if (admins.IsAdmin(email)) return true;
        var reviewers = (config["Squads:ReviewEmails"] ?? string.Empty)
            .Split(new[] { ',', ';' }, StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        return reviewers.Any(r => string.Equals(r, email.Trim(), StringComparison.OrdinalIgnoreCase));
    }

    private static async Task<IResult> Get(Guid id, HttpContext http, ISquadService squads, CancellationToken ct)
    {
        var s = await squads.GetAsync(id, Me(http), ct);
        return s is null ? Results.NotFound() : Results.Ok(s);
    }

    private static async Task<IResult> Create(SquadCreate body, HttpContext http, ISquadService squads, CancellationToken ct)
    {
        if (Me(http) is not { } me) return Results.Unauthorized();
        if (string.IsNullOrWhiteSpace(body.Name) || string.IsNullOrWhiteSpace(body.Discipline))
            return Results.BadRequest(new { error = "Name and discipline are required." });

        var id = await squads.CreateAsync(body, me, ct);
        var created = await squads.GetAsync(id, me, ct);
        return Results.Created($"/api/squads/{id}", created);
    }

    private static async Task<IResult> Join(
        Guid id, HttpContext http, ISquadService squads,
        IAthleteDirectory directory, INotificationService notes, CancellationToken ct)
    {
        if (Me(http) is not { } me) return Results.Unauthorized();
        var squad = await squads.GetAsync(id, me, ct);
        if (squad is null) return Results.NotFound();

        var outcome = await squads.JoinOrRequestAsync(id, squad.Kind, me, ct);

        // Notify the owner: a genuinely-new free-squad member, or a new pending request.
        if (squad.OwnerId is { } owner && owner != me &&
            outcome is JoinOutcome.Joined or JoinOutcome.Requested)
        {
            var actor = await directory.GetAsync(me, ct);
            if (actor is not null)
                await notes.AddAsync(owner, outcome == JoinOutcome.Joined ? "join" : "request", me, actor.Name,
                    outcome == JoinOutcome.Joined ? $"joined {squad.Name}" : $"asked to join {squad.Name}", id, ct);
        }

        return Results.Ok(new { outcome = outcome.ToString().ToLowerInvariant(), squad = await squads.GetAsync(id, me, ct) });
    }

    private static async Task<IResult> Activate(Guid id, HttpContext http, ISquadService squads, CancellationToken ct)
    {
        if (Me(http) is not { } me) return Results.Unauthorized();
        return await squads.SetActiveSquadAsync(id, me, ct)
            ? Results.Ok(new { status = "active" })
            : Results.NotFound(new { error = "You're not a member of that club." });
    }

    private static async Task<IResult> Requests(HttpContext http, ISquadService squads, CancellationToken ct)
    {
        if (Me(http) is not { } me) return Results.Unauthorized();
        return Results.Ok(await squads.GetPendingRequestsForOwnerAsync(me, ct));
    }

    private static async Task<IResult> Approve(
        Guid id, Guid athleteId, HttpContext http, ISquadService squads,
        INotificationService notes, CancellationToken ct)
    {
        if (Me(http) is not { } me) return Results.Unauthorized();
        var name = await squads.ApproveRequestAsync(id, athleteId, me, ct);
        if (name is null) return Results.NotFound(new { error = "No pending request, or you don't own this squad." });

        var squad = await squads.GetAsync(id, me, ct);
        await notes.AddAsync(athleteId, "approved", me, squad?.Name ?? "A squad", $"approved you to join {squad?.Name}", id, ct);
        return Results.Ok(new { status = "approved" });
    }

    private static async Task<IResult> Decline(
        Guid id, Guid athleteId, HttpContext http, ISquadService squads,
        INotificationService notes, CancellationToken ct)
    {
        if (Me(http) is not { } me) return Results.Unauthorized();
        var name = await squads.DeclineRequestAsync(id, athleteId, me, ct);
        if (name is null) return Results.NotFound(new { error = "No pending request, or you don't own this squad." });

        var squad = await squads.GetAsync(id, me, ct);
        await notes.AddAsync(athleteId, "declined", me, squad?.Name ?? "A squad", $"declined your request to join {squad?.Name}", id, ct);
        return Results.Ok(new { status = "declined" });
    }

    // ----- owner management ---------------------------------------------------

    private static async Task<IResult> Update(Guid id, SquadUpdate body, HttpContext http, ISquadService squads, CancellationToken ct)
    {
        if (Me(http) is not { } me) return Results.Unauthorized();
        if (!await squads.UpdateAsync(id, me, body, ct))
            return Results.NotFound(new { error = "Squad not found, or you don't manage it." });
        return Results.Ok(await squads.GetAsync(id, me, ct));
    }

    private static async Task<IResult> Members(Guid id, HttpContext http, ISquadService squads, CancellationToken ct)
    {
        if (Me(http) is not { } me) return Results.Unauthorized();
        var rows = await squads.GetMembersAsync(id, me, ct);
        return rows is null
            ? Results.NotFound(new { error = "Squad not found, or you don't manage it." })
            : Results.Ok(rows);
    }

    private static async Task<IResult> AddMember(Guid id, AddMemberRequest body, HttpContext http, ISquadService squads, CancellationToken ct)
    {
        if (Me(http) is not { } me) return Results.Unauthorized();
        var email = body?.Email?.Trim() ?? "";
        if (email.Length == 0) return Results.BadRequest(new { error = "An email is required." });

        return await squads.AddMemberByEmailAsync(id, email, me, ct) switch
        {
            AddMemberOutcome.Added => Results.Ok(new { status = "added" }),
            AddMemberOutcome.AlreadyMember => Results.Ok(new { status = "alreadymember" }),
            AddMemberOutcome.AthleteNotFound => Results.NotFound(new { error = "No athlete with that email has signed up." }),
            _ => Results.NotFound(new { error = "Squad not found, or you don't manage it." }),
        };
    }

    private static async Task<IResult> RemoveMember(Guid id, Guid athleteId, HttpContext http, ISquadService squads, CancellationToken ct)
    {
        if (Me(http) is not { } me) return Results.Unauthorized();
        return await squads.RemoveMemberAsync(id, athleteId, me, ct)
            ? Results.Ok(new { status = "removed" })
            : Results.NotFound(new { error = "Couldn't remove that member (not a member, the owner, or you don't manage this squad)." });
    }

    private static async Task<IResult> SetRole(Guid id, Guid athleteId, SetRoleRequest body, HttpContext http, ISquadService squads, CancellationToken ct)
    {
        if (Me(http) is not { } me) return Results.Unauthorized();
        return await squads.SetMemberRoleAsync(id, athleteId, body?.Role ?? "", me, ct) switch
        {
            SetRoleOutcome.Ok => Results.Ok(new { status = "ok" }),
            SetRoleOutcome.InvalidRole => Results.BadRequest(new { error = "Role must be coach or member." }),
            SetRoleOutcome.CannotChangeOwner => Results.Json(new { error = "The owner's role can't be changed. Transfer ownership instead." }, statusCode: 409),
            SetRoleOutcome.NotAMember => Results.NotFound(new { error = "That athlete isn't a member of this group." }),
            _ => Results.NotFound(new { error = "Squad not found, or you don't manage it." }),
        };
    }

    private static async Task<IResult> TransferOwnership(Guid id, Guid athleteId, HttpContext http, ISquadService squads, CancellationToken ct)
    {
        if (Me(http) is not { } me) return Results.Unauthorized();
        return await squads.TransferOwnershipAsync(id, athleteId, me, ct) switch
        {
            TransferOwnershipOutcome.Ok => Results.Ok(new { status = "transferred" }),
            TransferOwnershipOutcome.SameAsOwner => Results.BadRequest(new { error = "You already own this group." }),
            TransferOwnershipOutcome.TargetNotMember => Results.NotFound(new { error = "That athlete isn't a member of this group." }),
            TransferOwnershipOutcome.TargetNotCoach => Results.Json(new { error = "You can only transfer ownership to a coach. Make them a coach first." }, statusCode: 409),
            _ => Results.NotFound(new { error = "Squad not found, or you don't manage it." }),
        };
    }

    // ----- invite links -------------------------------------------------------

    private static async Task<IResult> CreateInvite(
        Guid id, InviteCreateRequest? body, HttpContext http, ISquadService squads, CancellationToken ct)
    {
        if (Me(http) is not { } me) return Results.Unauthorized();
        var token = await squads.CreateInviteAsync(id, me, body?.Reset ?? false, ct);
        return token is null
            ? Results.NotFound(new { error = "Squad not found, or you don't manage it." })
            : Results.Ok(new { token });
    }

    private static async Task<IResult> InviteLookup(string token, ISquadService squads, CancellationToken ct)
    {
        var info = await squads.GetInviteAsync(token, ct);
        return info is null
            ? Results.NotFound(new { error = "This invite link is invalid or no longer active." })
            : Results.Ok(info);
    }

    // Public (anonymous) squad logo for a valid invite — lets the logged-out invitee see the
    // club's logo on the Welcome / Register banner before they've signed in.
    private static async Task<IResult> InviteLogo(
        string token, ISquadService squads, IImageStore images, CancellationToken ct)
    {
        var info = await squads.GetInviteAsync(token, ct);
        if (info is null) return Results.NotFound();
        var blob = await squads.GetImageBlobAsync(info.SquadId, "logo", ct);
        if (string.IsNullOrEmpty(blob)) return Results.NotFound();
        return await ImageEndpoints.StreamBlob(images, blob, ct);
    }

    private static async Task<IResult> AcceptInvite(
        string token, HttpContext http, ISquadService squads,
        IAthleteDirectory directory, INotificationService notes, CancellationToken ct)
    {
        if (Me(http) is not { } me) return Results.Unauthorized();
        var result = await squads.AcceptInviteAsync(token, me, ct);
        if (result is null) return Results.NotFound(new { error = "This invite link is invalid or no longer active." });

        // Notify the owner of a genuinely-new member who came in via their invite.
        if (result.Outcome == AcceptInviteOutcome.Joined && result.OwnerId is { } owner && owner != me)
        {
            var actor = await directory.GetAsync(me, ct);
            if (actor is not null)
                await notes.AddAsync(owner, "join", me, actor.Name, $"joined {result.SquadName} via your invite", result.SquadId, ct);
        }

        return Results.Ok(new
        {
            outcome = result.Outcome.ToString().ToLowerInvariant(),
            squadId = result.SquadId,
            squadName = result.SquadName,
        });
    }

    private static Guid? Me(HttpContext http)
    {
        var claim = http.User.FindFirstValue(ClaimTypes.NameIdentifier) ?? http.User.FindFirstValue("sub");
        return Guid.TryParse(claim, out var id) ? id : null;
    }
}
