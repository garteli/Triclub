// Intake for the iOS/Android companion apps. Canonical-mirror JSON; idempotency key
// is the platform's own activity id.
using System.Text.Json;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Squad.Core;
using Squad.Infrastructure;

namespace Squad.Web;

public static class NativeActivityEndpoints
{
    public static IEndpointRouteBuilder MapNativeActivityIntake(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/activities/native/{source}", PostNative).RequireAuthorization();
        return app;
    }

    private static async Task<IResult> PostNative(
        string source, NativeActivityDto dto, HttpContext http,
        IRawActivityStore store, IIngestQueue queue, CancellationToken ct)
    {
        if (!TryParseSource(source, out var src))
            return Results.BadRequest("Unknown source. Use 'healthkit' or 'healthconnect'.");
        if (string.IsNullOrWhiteSpace(dto.ExternalId))
            return Results.BadRequest("externalId is required (platform activity id).");

        var athleteId = ActivityIntakeEndpoints.ResolveAthleteId(http.User);
        if (athleteId is null) return Results.Unauthorized();

        var raw = new RawActivity
        {
            AthleteId = athleteId.Value,
            Source = src,
            SourceExternalId = dto.ExternalId,
            PayloadKind = "json",
            Payload = JsonSerializer.SerializeToUtf8Bytes(dto, NativeJson.Options),
        };

        bool isNew = await store.TrySaveAsync(raw, ct);
        if (isNew) await queue.EnqueueAsync(raw.Id, ct);

        return Results.Accepted($"/api/activities/raw/{raw.Id}",
            new { rawActivityId = raw.Id, status = isNew ? "queued" : "already-received" });
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
}
