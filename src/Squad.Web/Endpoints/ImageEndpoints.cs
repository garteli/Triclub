// Image intake + read proxy. Blobs live in a PRIVATE container (IImageStore), so
// every read goes through an authenticated endpoint here — there is no public blob
// URL. Uploads are downscaled JPEGs from the client; we still validate type/size.
using System.Security.Claims;
using Microsoft.Net.Http.Headers;
using Squad.Core;

namespace Squad.Web;

public static class ImageEndpoints
{
    private const long MaxImageBytes = 8 * 1024 * 1024; // 8 MB
    private static readonly HashSet<string> AllowedTypes = new(StringComparer.OrdinalIgnoreCase)
    {
        "image/jpeg", "image/png", "image/webp",
    };

    public static IEndpointRouteBuilder MapImages(this IEndpointRouteBuilder app)
    {
        // Avatars
        app.MapPost("/api/profile/photo", UploadAvatar).DisableAntiforgery().RequireAuthorization();
        app.MapDelete("/api/profile/photo", DeleteAvatar).RequireAuthorization();
        app.MapGet("/api/images/avatars/{athleteId:guid}", GetAvatar).RequireAuthorization();

        // Activity photos
        app.MapPost("/api/activities/photos", UploadActivityPhoto).DisableAntiforgery().RequireAuthorization();
        app.MapGet("/api/activities/{activityId:guid}/photos", ListActivityPhotos).RequireAuthorization();
        app.MapGet("/api/images/activity/{photoId:guid}", GetActivityPhoto).RequireAuthorization();

        // Squad logo + banner (owner-managed branding on the Group page)
        foreach (var kind in new[] { "logo", "banner" })
        {
            var k = kind; // capture per-iteration
            app.MapPost($"/api/squads/{{squadId:guid}}/{k}",
                (Guid squadId, IFormFile file, HttpContext http, IImageStore images, ISquadService squads, CancellationToken ct)
                    => UploadSquadImage(squadId, k, file, http, images, squads, ct))
                .DisableAntiforgery().RequireAuthorization();
            app.MapDelete($"/api/squads/{{squadId:guid}}/{k}",
                (Guid squadId, HttpContext http, IImageStore images, ISquadService squads, CancellationToken ct)
                    => DeleteSquadImage(squadId, k, http, images, squads, ct))
                .RequireAuthorization();
            app.MapGet($"/api/images/squads/{{squadId:guid}}/{k}",
                (Guid squadId, HttpContext http, IImageStore images, ISquadService squads, CancellationToken ct)
                    => GetSquadImage(squadId, k, http, images, squads, ct))
                .RequireAuthorization();
        }
        return app;
    }

    // ---- squad logo / banner -------------------------------------------------

    private static async Task<IResult> UploadSquadImage(
        Guid squadId, string kind, IFormFile file, HttpContext http, IImageStore images, ISquadService squads, CancellationToken ct)
    {
        var me = ActivityIntakeEndpoints.ResolveAthleteId(http.User);
        if (me is null) return Results.Unauthorized();
        if (!TryValidate(file, out var err)) return Results.BadRequest(err);

        var previous = await squads.GetImageBlobAsync(squadId, kind, ct);
        string blobName;
        await using (var stream = file.OpenReadStream())
            blobName = await images.SaveAsync($"squad-{kind}", stream, file.ContentType, ct);

        // Owner check happens on write: if it fails, delete the just-saved orphan blob.
        if (!await squads.SetImageBlobAsync(squadId, kind, blobName, me.Value, ct))
        {
            await images.DeleteAsync(blobName, ct);
            return Results.NotFound(new { error = "Squad not found, or you don't manage it." });
        }
        if (!string.IsNullOrEmpty(previous)) await images.DeleteAsync(previous, ct); // best-effort cleanup
        return Results.Ok(new { url = $"/api/images/squads/{squadId:D}/{kind}".ToLowerInvariant() });
    }

    private static async Task<IResult> DeleteSquadImage(
        Guid squadId, string kind, HttpContext http, IImageStore images, ISquadService squads, CancellationToken ct)
    {
        var me = ActivityIntakeEndpoints.ResolveAthleteId(http.User);
        if (me is null) return Results.Unauthorized();

        var previous = await squads.GetImageBlobAsync(squadId, kind, ct);
        if (!await squads.SetImageBlobAsync(squadId, kind, null, me.Value, ct))
            return Results.NotFound(new { error = "Squad not found, or you don't manage it." });
        if (!string.IsNullOrEmpty(previous)) await images.DeleteAsync(previous, ct);
        return Results.NoContent();
    }

    private static async Task<IResult> GetSquadImage(
        Guid squadId, string kind, HttpContext http, IImageStore images, ISquadService squads, CancellationToken ct)
    {
        if (ActivityIntakeEndpoints.ResolveAthleteId(http.User) is null) return Results.Unauthorized();
        var blobName = await squads.GetImageBlobAsync(squadId, kind, ct);
        if (string.IsNullOrEmpty(blobName)) return Results.NotFound();
        return await StreamBlob(images, blobName, ct);
    }

    // ---- avatars -------------------------------------------------------------

    private static async Task<IResult> UploadAvatar(
        IFormFile file, HttpContext http, IImageStore images, IProfileService profiles, CancellationToken ct)
    {
        var me = ActivityIntakeEndpoints.ResolveAthleteId(http.User);
        if (me is null) return Results.Unauthorized();
        if (!TryValidate(file, out var err)) return Results.BadRequest(err);

        var previous = await profiles.GetAvatarBlobAsync(me.Value, ct);
        string blobName;
        await using (var stream = file.OpenReadStream())
            blobName = await images.SaveAsync("avatars", stream, file.ContentType, ct);

        await profiles.SetAvatarBlobAsync(me.Value, blobName, ct);
        if (!string.IsNullOrEmpty(previous)) await images.DeleteAsync(previous, ct); // best-effort cleanup

        return Results.Ok(new { avatarUrl = $"/api/images/avatars/{me.Value:D}".ToLowerInvariant() });
    }

    private static async Task<IResult> DeleteAvatar(
        HttpContext http, IImageStore images, IProfileService profiles, CancellationToken ct)
    {
        var me = ActivityIntakeEndpoints.ResolveAthleteId(http.User);
        if (me is null) return Results.Unauthorized();

        var previous = await profiles.GetAvatarBlobAsync(me.Value, ct);
        await profiles.SetAvatarBlobAsync(me.Value, null, ct);
        if (!string.IsNullOrEmpty(previous)) await images.DeleteAsync(previous, ct);
        return Results.NoContent();
    }

    private static async Task<IResult> GetAvatar(
        Guid athleteId, HttpContext http, IImageStore images, IProfileService profiles, CancellationToken ct)
    {
        if (ActivityIntakeEndpoints.ResolveAthleteId(http.User) is null) return Results.Unauthorized();
        var blobName = await profiles.GetAvatarBlobAsync(athleteId, ct);
        if (string.IsNullOrEmpty(blobName)) return Results.NotFound();
        return await StreamBlob(images, blobName, ct);
    }

    // ---- activity photos -----------------------------------------------------

    private static async Task<IResult> UploadActivityPhoto(
        IFormFile file, HttpContext http, IImageStore images, IActivityPhotoService photos, CancellationToken ct)
    {
        var me = ActivityIntakeEndpoints.ResolveAthleteId(http.User);
        if (me is null) return Results.Unauthorized();
        if (!TryValidate(file, out var err)) return Results.BadRequest(err);

        var form = http.Request.Form;
        Guid? activityId = Guid.TryParse(form["activityId"], out var aid) ? aid : null;
        // capturedUtc is epoch milliseconds from the client; default to now for the
        // attach-later flow where the time doesn't matter (ActivityId is explicit).
        var capturedUtc = long.TryParse(form["capturedUtc"], out var ms)
            ? DateTimeOffset.FromUnixTimeMilliseconds(ms)
            : DateTimeOffset.UtcNow;

        string blobName;
        await using (var stream = file.OpenReadStream())
            blobName = await images.SaveAsync("activity", stream, file.ContentType, ct);

        var id = await photos.AddAsync(me.Value, activityId, blobName, capturedUtc, ct);
        return Results.Ok(new { id, url = $"/api/images/activity/{id:D}".ToLowerInvariant() });
    }

    private static async Task<IResult> ListActivityPhotos(
        Guid activityId, HttpContext http, IActivityPhotoService photos, CancellationToken ct)
    {
        if (ActivityIntakeEndpoints.ResolveAthleteId(http.User) is null) return Results.Unauthorized();
        var rows = await photos.ListForActivityAsync(activityId, ct);
        var result = rows.Select(p => new
        {
            p.Id,
            url = $"/api/images/activity/{p.Id:D}".ToLowerInvariant(),
            capturedUtc = p.CapturedUtc,
        });
        return Results.Ok(result);
    }

    private static async Task<IResult> GetActivityPhoto(
        Guid photoId, HttpContext http, IImageStore images, IActivityPhotoService photos, CancellationToken ct)
    {
        if (ActivityIntakeEndpoints.ResolveAthleteId(http.User) is null) return Results.Unauthorized();
        var blobName = await photos.GetBlobNameAsync(photoId, ct);
        if (string.IsNullOrEmpty(blobName)) return Results.NotFound();
        return await StreamBlob(images, blobName, ct);
    }

    // ---- helpers -------------------------------------------------------------

    private static async Task<IResult> StreamBlob(IImageStore images, string blobName, CancellationToken ct)
    {
        var blob = await images.OpenReadAsync(blobName, ct);
        if (blob is null) return Results.NotFound();
        // The blob name is a stable, unique key → a perfect strong ETag. Passing it lets
        // FileResult answer conditional (If-None-Match) requests with 304 automatically.
        var etag = new EntityTagHeaderValue('"' + blobName + '"');
        return Results.File(blob.Content, blob.ContentType, entityTag: etag, enableRangeProcessing: false);
    }

    private static bool TryValidate(IFormFile? file, out string error)
    {
        error = "";
        if (file is null || file.Length == 0) { error = "Empty upload."; return false; }
        if (file.Length > MaxImageBytes) { error = "Image too large (max 8 MB)."; return false; }
        if (!AllowedTypes.Contains(file.ContentType)) { error = "Only JPEG, PNG or WebP images are accepted."; return false; }
        return true;
    }
}
