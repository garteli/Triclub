// Web-upload intake. Never parse on the request thread: store raw bytes, enqueue, 202.
using System.Security.Claims;
using System.Security.Cryptography;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Squad.Core;

namespace Squad.Web;

public static class ActivityIntakeEndpoints
{
    private const long MaxUploadBytes = 25 * 1024 * 1024; // 25 MB

    public static IEndpointRouteBuilder MapActivityIntake(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/activities/upload", UploadFit)
           .DisableAntiforgery()
           .RequireAuthorization();
        app.MapNativeActivityIntake(); // POST /api/activities/native/{healthkit|healthconnect}
        return app;
    }

    private static async Task<IResult> UploadFit(
        IFormFile file, HttpContext http, IRawActivityStore store, IIngestQueue queue, CancellationToken ct)
    {
        if (file is null || file.Length == 0) return Results.BadRequest("Empty upload.");
        if (file.Length > MaxUploadBytes) return Results.BadRequest("File too large.");
        if (!file.FileName.EndsWith(".fit", StringComparison.OrdinalIgnoreCase))
            return Results.BadRequest("Only .fit files are accepted at this endpoint.");

        var athleteId = ResolveAthleteId(http.User);
        if (athleteId is null) return Results.Unauthorized();

        byte[] bytes;
        await using (var buffer = new MemoryStream())
        {
            await file.CopyToAsync(buffer, ct);
            bytes = buffer.ToArray();
        }
        string contentHash = Convert.ToHexString(SHA256.HashData(bytes)).ToLowerInvariant();

        var raw = new RawActivity
        {
            AthleteId = athleteId.Value,
            Source = ActivitySource.FitUpload,
            SourceExternalId = contentHash,   // re-uploaded identical file == same id
            PayloadKind = "fit",
            Payload = bytes,
        };

        bool isNew = await store.TrySaveAsync(raw, ct);
        if (isNew) await queue.EnqueueAsync(raw.Id, ct);

        return Results.Accepted($"/api/activities/raw/{raw.Id}",
            new { rawActivityId = raw.Id, status = isNew ? "queued" : "already-received" });
    }

    // Shared by the native endpoint too.
    internal static Guid? ResolveAthleteId(ClaimsPrincipal user)
    {
        var claim = user.FindFirstValue(ClaimTypes.NameIdentifier) ?? user.FindFirstValue("sub");
        return Guid.TryParse(claim, out var id) ? id : null;
    }
}
