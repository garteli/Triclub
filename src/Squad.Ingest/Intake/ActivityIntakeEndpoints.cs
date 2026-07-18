// ===========================================================================
//  ActivityIntakeEndpoints.cs
//  The intake surface for web uploads. Golden rule: NEVER parse on the request
//  thread. We store the raw bytes, enqueue an id, and return 202 immediately —
//  the worker does the FIT decode + dedup out of band.
// ===========================================================================
using System;
using System.IO;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace Squad.Ingest.Intake;

public static class ActivityIntakeEndpoints
{
    // .FIT is the only format this adapter handles. .gpx/.tcx get their own adapters later.
    private const long MaxUploadBytes = 25 * 1024 * 1024; // 25 MB — a huge ride is a few MB

    public static IEndpointRouteBuilder MapActivityIntake(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/activities/upload", UploadFit)
           .DisableAntiforgery()          // multipart upload from the SPA
           .RequireAuthorization();       // AthleteId comes from the caller's identity

        app.MapNativeActivityIntake();     // POST /api/activities/native/{healthkit|healthconnect}

        return app;
    }

    private static async Task<IResult> UploadFit(
        IFormFile file,
        HttpContext http,
        IRawActivityStore store,
        IIngestQueue queue,
        CancellationToken ct)
    {
        if (file is null || file.Length == 0)
            return Results.BadRequest("Empty upload.");
        if (file.Length > MaxUploadBytes)
            return Results.BadRequest("File too large.");
        if (!file.FileName.EndsWith(".fit", StringComparison.OrdinalIgnoreCase))
            return Results.BadRequest("Only .fit files are accepted at this endpoint.");

        var athleteId = ResolveAthleteId(http.User);
        if (athleteId is null)
            return Results.Unauthorized();

        // Read once into memory (files are small); hash for raw-layer idempotency.
        byte[] bytes;
        await using (var buffer = new MemoryStream())
        {
            await file.CopyToAsync(buffer, ct);
            bytes = buffer.ToArray();
        }
        string contentHash = Convert.ToHexString(SHA256.HashData(bytes)).ToLowerInvariant();

        var raw = new RawActivity
        {
            Id = Guid.NewGuid(),
            AthleteId = athleteId.Value,
            Source = ActivitySource.FitUpload,
            SourceExternalId = contentHash,   // same file re-uploaded == same external id
            Payload = bytes,
            ContentType = "application/vnd.ant.fit",
            FileName = file.FileName,
            ReceivedUtc = DateTimeOffset.UtcNow,
        };

        // Idempotent: if this exact file already landed, don't re-queue it.
        bool isNew = await store.TrySaveAsync(raw, ct);
        if (isNew)
            await queue.EnqueueAsync(raw.Id, ct);

        // 202: accepted for processing. The feed/leaderboard update arrives via SignalR.
        return Results.Accepted($"/api/activities/raw/{raw.Id}", new
        {
            rawActivityId = raw.Id,
            status = isNew ? "queued" : "already-received",
        });
    }

    private static Guid? ResolveAthleteId(ClaimsPrincipal user)
    {
        var claim = user.FindFirstValue(ClaimTypes.NameIdentifier) ?? user.FindFirstValue("sub");
        return Guid.TryParse(claim, out var id) ? id : null;
    }
}
