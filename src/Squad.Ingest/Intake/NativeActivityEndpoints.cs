// ===========================================================================
//  NativeActivityEndpoints.cs
//  Intake for the iOS/Android companion apps. Same contract as the .FIT upload —
//  store raw, enqueue, 202 — but the payload is canonical-mirror JSON and the
//  idempotency key is the platform's own activity id (HK uuid / HC record id).
// ===========================================================================
using System;
using System.Security.Claims;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Squad.Ingest.Native;

namespace Squad.Ingest.Intake;

public static class NativeActivityEndpoints
{
    public static IEndpointRouteBuilder MapNativeActivityIntake(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/activities/native/{source}", PostNative)
           .RequireAuthorization();
        return app;
    }

    private static async Task<IResult> PostNative(
        string source,
        NativeActivityDto dto,
        HttpContext http,
        IRawActivityStore store,
        IIngestQueue queue,
        CancellationToken ct)
    {
        if (!TryParseSource(source, out var src))
            return Results.BadRequest("Unknown source. Use 'healthkit' or 'healthconnect'.");
        if (string.IsNullOrWhiteSpace(dto.ExternalId))
            return Results.BadRequest("externalId is required (platform activity id).");

        var athleteId = ResolveAthleteId(http.User);
        if (athleteId is null) return Results.Unauthorized();

        var raw = new RawActivity
        {
            Id = Guid.NewGuid(),
            AthleteId = athleteId.Value,
            Source = src,
            SourceExternalId = dto.ExternalId,   // stable per platform → idempotent + dedup key
            Payload = JsonSerializer.SerializeToUtf8Bytes(dto, NativeJson.Options),
            ContentType = "application/json",
            FileName = null,
            ReceivedUtc = DateTimeOffset.UtcNow,
        };

        bool isNew = await store.TrySaveAsync(raw, ct);
        if (isNew) await queue.EnqueueAsync(raw.Id, ct);

        return Results.Accepted($"/api/activities/raw/{raw.Id}", new
        {
            rawActivityId = raw.Id,
            status = isNew ? "queued" : "already-received",
        });
    }

    private static bool TryParseSource(string s, out ActivitySource source)
    {
        switch (s.Trim().ToLowerInvariant())
        {
            case "healthkit": source = ActivitySource.HealthKit; return true;
            case "healthconnect": source = ActivitySource.HealthConnect; return true;
            default: source = default; return false;
        }
    }

    private static Guid? ResolveAthleteId(ClaimsPrincipal user)
    {
        var claim = user.FindFirstValue(ClaimTypes.NameIdentifier) ?? user.FindFirstValue("sub");
        return Guid.TryParse(claim, out var id) ? id : null;
    }
}
