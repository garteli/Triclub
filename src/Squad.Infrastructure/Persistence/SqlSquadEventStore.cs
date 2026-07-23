// ===========================================================================
//  SqlSquadEventStore.cs — ISquadEventStore over SQL Server (Dapper).
//  Ad-hoc group sessions a coach schedules; per-member RSVP + check-in.
//  Create/delete guarded to the squad owner. Check-in is gated to the event day.
// ===========================================================================
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Dapper;
using Microsoft.Data.SqlClient;
using Squad.Core;

namespace Squad.Infrastructure;

public sealed class SqlSquadEventStore(string connectionString) : ISquadEventStore
{
    // The member-facing view columns, in the SquadEventView constructor order. `me` is the caller's
    // RSVP row (LEFT JOINed), giving Joined + CheckedInUtc without a second round-trip.
    private const string ViewSelect = """
        SELECT
            e.Id, e.SquadId, e.Title, e.Sport,
            CAST(e.StartUtc AS datetimeoffset(0)) AS StartUtc,
            e.CourseId, e.CourseName, e.CourseKm, e.Notes,
            -- Counts + the caller's Joined flag reflect confirmed ('going') RSVPs only; a pending
            -- (not-yet-approved) request is surfaced separately via RequestPending below.
            (SELECT COUNT(1) FROM dbo.SquadEventRsvp r WHERE r.EventId = e.Id AND r.Status = 'going') AS JoinCount,
            (SELECT COUNT(1) FROM dbo.SquadEventRsvp r WHERE r.EventId = e.Id AND r.CheckedInUtc IS NOT NULL) AS CheckedInCount,
            CAST(CASE WHEN me.Status = 'going' THEN 1 ELSE 0 END AS bit) AS Joined,
            CAST(me.CheckedInUtc AS datetimeoffset(0)) AS CheckedInUtc,
            e.Published,
            (SELECT TOP 1 a.Id FROM dbo.Activity a
             WHERE a.EventId = e.Id AND a.AthleteId = @meId ORDER BY a.StartUtc DESC) AS MyActivityId,
            CASE WHEN e.LogoBlob   IS NOT NULL THEN '/api/images/squads/' + LOWER(CONVERT(varchar(36), e.SquadId)) + '/events/' + LOWER(CONVERT(varchar(36), e.Id)) + '/logo'   END AS LogoUrl,
            CASE WHEN e.BannerBlob IS NOT NULL THEN '/api/images/squads/' + LOWER(CONVERT(varchar(36), e.SquadId)) + '/events/' + LOWER(CONVERT(varchar(36), e.Id)) + '/banner' END AS BannerUrl,
            CAST(CASE WHEN me.Status = 'pending' THEN 1 ELSE 0 END AS bit) AS RequestPending,
            CAST(CASE WHEN EXISTS (SELECT 1 FROM dbo.Membership mm WHERE mm.SquadId = e.SquadId AND mm.AthleteId = @meId)
                      THEN 1 ELSE 0 END AS bit) AS Member,
            e.StartPlace
        FROM dbo.SquadEvent e
        LEFT JOIN dbo.SquadEventRsvp me ON me.EventId = e.Id AND me.AthleteId = @meId
        """;

    public async Task<IReadOnlyList<SquadEventView>> ListForSquadAsync(Guid squadId, Guid meId, CancellationToken ct)
    {
        await using var conn = new SqlConnection(connectionString);
        // Members see published events only; the owner also sees their own unpublished drafts.
        var rows = await conn.QueryAsync<SquadEventView>(new CommandDefinition($"""
            {ViewSelect}
            JOIN dbo.Squad s ON s.Id = e.SquadId
            WHERE e.SquadId = @squadId AND e.StartUtc >= DATEADD(day, -1, SYSDATETIMEOFFSET())
              AND (e.Published = 1 OR s.OwnerId = @meId)
            ORDER BY e.StartUtc ASC;
            """, new { squadId, meId }, cancellationToken: ct));
        return rows.ToList();
    }

    public async Task<IReadOnlyList<SquadEventView>> ListForMemberAsync(Guid meId, CancellationToken ct)
    {
        await using var conn = new SqlConnection(connectionString);
        // Only published events the caller has actually joined ('going' — not a pending request), soonest first.
        var rows = await conn.QueryAsync<SquadEventView>(new CommandDefinition($"""
            {ViewSelect}
            WHERE me.Status = 'going' AND e.Published = 1 AND e.StartUtc >= DATEADD(day, -1, SYSDATETIMEOFFSET())
            ORDER BY e.StartUtc ASC;
            """, new { meId }, cancellationToken: ct));
        return rows.ToList();
    }

    public async Task<bool> IsOwnerAsync(Guid squadId, Guid ownerId, CancellationToken ct)
    {
        await using var conn = new SqlConnection(connectionString);
        return await conn.ExecuteScalarAsync<int>(new CommandDefinition(
            "SELECT COUNT(1) FROM dbo.Squad WHERE Id = @squadId AND OwnerId = @ownerId;",
            new { squadId, ownerId }, cancellationToken: ct)) > 0;
    }

    public async Task<SquadEvent?> CreateAsync(
        Guid squadId, Guid ownerId, string title, byte sport, DateTimeOffset startUtc,
        Guid? courseId, string? courseName, double? courseKm, string? coursePoints, string? notes,
        bool published, CancellationToken ct)
    {
        if (!await IsOwnerAsync(squadId, ownerId, ct)) return null;

        var id = Guid.NewGuid();
        var now = DateTimeOffset.UtcNow;
        await using var conn = new SqlConnection(connectionString);
        await conn.ExecuteAsync(new CommandDefinition("""
            INSERT INTO dbo.SquadEvent
                (Id, SquadId, CreatedBy, Title, Sport, StartUtc, CourseId, CourseName, CourseKm, CoursePoints, Notes, Published, CreatedUtc)
            VALUES
                (@id, @squadId, @ownerId, @title, @sport, @startUtc, @courseId, @courseName, @courseKm, @coursePoints, @notes, @published, SYSDATETIMEOFFSET());
            """, new { id, squadId, ownerId, title, sport, startUtc, courseId, courseName, courseKm, coursePoints, notes, published },
            cancellationToken: ct));
        return new SquadEvent(id, squadId, ownerId, title, sport, startUtc, courseId, courseName, courseKm, coursePoints, notes, published, now);
    }

    public async Task<bool> UpdateAsync(
        Guid squadId, Guid ownerId, Guid eventId, string title, byte sport, DateTimeOffset startUtc,
        Guid? courseId, string? courseName, double? courseKm, string? coursePoints, string? notes, CancellationToken ct)
    {
        await using var conn = new SqlConnection(connectionString);
        // Edit only if the caller owns the squad the event belongs to. Publish state + RSVPs untouched.
        var updated = await conn.ExecuteAsync(new CommandDefinition("""
            UPDATE e SET
                e.Title = @title, e.Sport = @sport, e.StartUtc = @startUtc,
                e.CourseId = @courseId, e.CourseName = @courseName, e.CourseKm = @courseKm,
                e.CoursePoints = @coursePoints, e.Notes = @notes
            FROM dbo.SquadEvent e
            JOIN dbo.Squad s ON s.Id = e.SquadId
            WHERE e.Id = @eventId AND e.SquadId = @squadId AND s.OwnerId = @ownerId;
            """, new { eventId, squadId, ownerId, title, sport, startUtc, courseId, courseName, courseKm, coursePoints, notes },
            cancellationToken: ct));
        return updated > 0;
    }

    public async Task<SetPublishedResult> SetPublishedAsync(Guid squadId, Guid ownerId, Guid eventId, bool published, CancellationToken ct)
    {
        await using var conn = new SqlConnection(connectionString);
        // Read the current owner-guarded state first, so we can report a genuine publish transition.
        var current = await conn.QuerySingleOrDefaultAsync<bool?>(new CommandDefinition("""
            SELECT e.Published FROM dbo.SquadEvent e
            JOIN dbo.Squad s ON s.Id = e.SquadId
            WHERE e.Id = @eventId AND e.SquadId = @squadId AND s.OwnerId = @ownerId;
            """, new { eventId, squadId, ownerId }, cancellationToken: ct));
        if (current is null) return SetPublishedResult.NotAllowed;
        if (current.Value == published)
            return SetPublishedResult.NoChange;

        await conn.ExecuteAsync(new CommandDefinition(
            "UPDATE dbo.SquadEvent SET Published = @published WHERE Id = @eventId;",
            new { eventId, published }, cancellationToken: ct));
        return published ? SetPublishedResult.PublishedNow : SetPublishedResult.Unpublished;
    }

    public async Task<IReadOnlyList<SquadEventAttendee>?> ListAttendeesAsync(Guid squadId, Guid ownerId, Guid eventId, CancellationToken ct)
    {
        await using var conn = new SqlConnection(connectionString);
        if (!await IsOwnerAsync(squadId, ownerId, ct)) return null;
        // Confirm the event belongs to this squad, then list its confirmed ('going') RSVPs
        // (checked-in first, then by join time). Pending requests are listed separately.
        var rows = await conn.QueryAsync<SquadEventAttendee>(new CommandDefinition("""
            SELECT a.Id AS AthleteId, a.DisplayName AS Name, a.Initials, a.AvatarColor,
                   CAST(r.JoinedUtc AS datetimeoffset(0)) AS JoinedUtc,
                   CAST(r.CheckedInUtc AS datetimeoffset(0)) AS CheckedInUtc,
                   CASE WHEN a.AvatarBlob IS NOT NULL
                        THEN '/api/images/avatars/' + LOWER(CONVERT(varchar(36), a.Id)) END AS AvatarUrl
            FROM dbo.SquadEventRsvp r
            JOIN dbo.SquadEvent e ON e.Id = r.EventId AND e.SquadId = @squadId
            JOIN dbo.Athlete a ON a.Id = r.AthleteId
            WHERE r.EventId = @eventId AND r.Status = 'going'
            ORDER BY CASE WHEN r.CheckedInUtc IS NULL THEN 1 ELSE 0 END, r.JoinedUtc;
            """, new { squadId, eventId }, cancellationToken: ct));
        return rows.ToList();
    }

    public async Task<IReadOnlyList<SquadEventAttendee>?> ListPendingForEventAsync(Guid squadId, Guid ownerId, Guid eventId, CancellationToken ct)
    {
        await using var conn = new SqlConnection(connectionString);
        if (!await IsOwnerAsync(squadId, ownerId, ct)) return null;
        // The non-members awaiting the coach's decision on this event, oldest request first.
        var rows = await conn.QueryAsync<SquadEventAttendee>(new CommandDefinition("""
            SELECT a.Id AS AthleteId, a.DisplayName AS Name, a.Initials, a.AvatarColor,
                   CAST(r.JoinedUtc AS datetimeoffset(0)) AS JoinedUtc,
                   CAST(r.CheckedInUtc AS datetimeoffset(0)) AS CheckedInUtc,
                   CASE WHEN a.AvatarBlob IS NOT NULL
                        THEN '/api/images/avatars/' + LOWER(CONVERT(varchar(36), a.Id)) END AS AvatarUrl
            FROM dbo.SquadEventRsvp r
            JOIN dbo.SquadEvent e ON e.Id = r.EventId AND e.SquadId = @squadId
            JOIN dbo.Athlete a ON a.Id = r.AthleteId
            WHERE r.EventId = @eventId AND r.Status = 'pending'
            ORDER BY r.JoinedUtc;
            """, new { squadId, eventId }, cancellationToken: ct));
        return rows.ToList();
    }

    public async Task<IReadOnlyList<EventJoinRequestItem>> ListPendingEventRequestsForOwnerAsync(Guid ownerId, CancellationToken ct)
    {
        await using var conn = new SqlConnection(connectionString);
        // Every pending event-join request across the squads this athlete owns — the coach's unified inbox.
        var rows = await conn.QueryAsync<EventJoinRequestItem>(new CommandDefinition("""
            SELECT e.SquadId, e.Id AS EventId, e.Title AS EventTitle,
                   CAST(e.StartUtc AS datetimeoffset(0)) AS StartUtc,
                   a.Id AS AthleteId, a.DisplayName AS AthleteName, a.Initials, a.AvatarColor,
                   CASE WHEN a.AvatarBlob IS NOT NULL
                        THEN '/api/images/avatars/' + LOWER(CONVERT(varchar(36), a.Id)) END AS AvatarUrl,
                   CAST(r.JoinedUtc AS datetimeoffset(0)) AS RequestedUtc
            FROM dbo.SquadEventRsvp r
            JOIN dbo.SquadEvent e ON e.Id = r.EventId
            JOIN dbo.Squad s ON s.Id = e.SquadId
            JOIN dbo.Athlete a ON a.Id = r.AthleteId
            WHERE r.Status = 'pending' AND s.OwnerId = @ownerId
            ORDER BY r.JoinedUtc;
            """, new { ownerId }, cancellationToken: ct));
        return rows.ToList();
    }

    public async Task<string?> ApproveEventRequestAsync(Guid squadId, Guid ownerId, Guid eventId, Guid athleteId, CancellationToken ct)
    {
        await using var conn = new SqlConnection(connectionString);
        // Read the event title for a matching pending+owned request first (non-null only when one
        // exists), then flip that request to 'going'.
        return await conn.ExecuteScalarAsync<string?>(new CommandDefinition("""
            DECLARE @title NVARCHAR(160) = (
                SELECT e.Title FROM dbo.SquadEventRsvp r
                JOIN dbo.SquadEvent e ON e.Id = r.EventId AND e.SquadId = @squadId
                JOIN dbo.Squad s ON s.Id = e.SquadId
                WHERE r.EventId = @eventId AND r.AthleteId = @athleteId AND r.Status = 'pending' AND s.OwnerId = @ownerId);
            UPDATE r SET r.Status = 'going', r.JoinedUtc = SYSDATETIMEOFFSET()
            FROM dbo.SquadEventRsvp r
            JOIN dbo.SquadEvent e ON e.Id = r.EventId AND e.SquadId = @squadId
            JOIN dbo.Squad s ON s.Id = e.SquadId
            WHERE r.EventId = @eventId AND r.AthleteId = @athleteId AND r.Status = 'pending' AND s.OwnerId = @ownerId;
            SELECT @title;
            """, new { squadId, ownerId, eventId, athleteId }, cancellationToken: ct));
    }

    public async Task<string?> DeclineEventRequestAsync(Guid squadId, Guid ownerId, Guid eventId, Guid athleteId, CancellationToken ct)
    {
        await using var conn = new SqlConnection(connectionString);
        // Read the event title for a matching pending+owned request first (non-null only when one
        // exists), then remove the request so the athlete may ask again.
        return await conn.ExecuteScalarAsync<string?>(new CommandDefinition("""
            DECLARE @title NVARCHAR(160) = (
                SELECT e.Title FROM dbo.SquadEventRsvp r
                JOIN dbo.SquadEvent e ON e.Id = r.EventId AND e.SquadId = @squadId
                JOIN dbo.Squad s ON s.Id = e.SquadId
                WHERE r.EventId = @eventId AND r.AthleteId = @athleteId AND r.Status = 'pending' AND s.OwnerId = @ownerId);
            DELETE r
            FROM dbo.SquadEventRsvp r
            JOIN dbo.SquadEvent e ON e.Id = r.EventId AND e.SquadId = @squadId
            JOIN dbo.Squad s ON s.Id = e.SquadId
            WHERE r.EventId = @eventId AND r.AthleteId = @athleteId AND r.Status = 'pending' AND s.OwnerId = @ownerId;
            SELECT @title;
            """, new { squadId, ownerId, eventId, athleteId }, cancellationToken: ct));
    }

    public async Task<IReadOnlyList<SquadEventAttendee>?> ListParticipantsAsync(Guid squadId, Guid meId, Guid eventId, CancellationToken ct)
    {
        await using var conn = new SqlConnection(connectionString);
        // Any signed-in athlete may see a PUBLISHED event's roster (the event page); the owner also
        // sees their unpublished drafts. Null (→404) if the event isn't visible to the caller.
        var visible = await conn.ExecuteScalarAsync<int>(new CommandDefinition("""
            SELECT COUNT(1) FROM dbo.SquadEvent e JOIN dbo.Squad s ON s.Id = e.SquadId
            WHERE e.Id = @eventId AND e.SquadId = @squadId AND (e.Published = 1 OR s.OwnerId = @meId);
            """, new { squadId, eventId, meId }, cancellationToken: ct));
        if (visible == 0) return null;

        var rows = await conn.QueryAsync<SquadEventAttendee>(new CommandDefinition("""
            SELECT a.Id AS AthleteId, a.DisplayName AS Name, a.Initials, a.AvatarColor,
                   CAST(r.JoinedUtc AS datetimeoffset(0)) AS JoinedUtc,
                   CAST(r.CheckedInUtc AS datetimeoffset(0)) AS CheckedInUtc,
                   CASE WHEN a.AvatarBlob IS NOT NULL
                        THEN '/api/images/avatars/' + LOWER(CONVERT(varchar(36), a.Id)) END AS AvatarUrl
            FROM dbo.SquadEventRsvp r
            JOIN dbo.SquadEvent e ON e.Id = r.EventId AND e.SquadId = @squadId
            JOIN dbo.Athlete a ON a.Id = r.AthleteId
            WHERE r.EventId = @eventId
            ORDER BY CASE WHEN r.CheckedInUtc IS NULL THEN 1 ELSE 0 END, r.JoinedUtc;
            """, new { squadId, eventId }, cancellationToken: ct));
        return rows.ToList();
    }

    public async Task<string?> GetRouteAsync(Guid squadId, Guid meId, Guid eventId, CancellationToken ct)
    {
        await using var conn = new SqlConnection(connectionString);
        // Same visibility gate as the participant roster: any signed-in athlete may read a PUBLISHED
        // event's route; the owner also reads their drafts. Returns the denormalized points JSON so a
        // member needn't own the source course (which is owner-scoped). NULL → 404 / no route.
        return await conn.ExecuteScalarAsync<string?>(new CommandDefinition("""
            SELECT e.CoursePoints FROM dbo.SquadEvent e JOIN dbo.Squad s ON s.Id = e.SquadId
            WHERE e.Id = @eventId AND e.SquadId = @squadId AND (e.Published = 1 OR s.OwnerId = @meId);
            """, new { squadId, eventId, meId }, cancellationToken: ct));
    }

    public async Task<bool> SetStartPlaceAsync(Guid squadId, Guid meId, Guid eventId, string place, CancellationToken ct)
    {
        await using var conn = new SqlConnection(connectionString);
        // First-writer-wins: only fill when empty, and only for an event the caller can see (published,
        // or they own it). Derived public data, so any viewer may populate it — no owner guard.
        var n = await conn.ExecuteAsync(new CommandDefinition("""
            UPDATE e SET e.StartPlace = @place
            FROM dbo.SquadEvent e JOIN dbo.Squad s ON s.Id = e.SquadId
            WHERE e.Id = @eventId AND e.SquadId = @squadId AND e.StartPlace IS NULL
              AND (e.Published = 1 OR s.OwnerId = @meId);
            """, new { squadId, eventId, meId, place }, cancellationToken: ct));
        return n > 0;
    }

    public async Task<EventCalendarInfo?> GetCalendarInfoAsync(Guid squadId, Guid eventId, CancellationToken ct)
    {
        await using var conn = new SqlConnection(connectionString);
        // Published events only (drafts stay private). Place = the cached start-point name, else the
        // course name — but never an auto-generated route filename ("offroad-6309…", a run of 5+ digits),
        // which isn't a real place. Mirrors the client's displayPlace() filter.
        return await conn.QuerySingleOrDefaultAsync<EventCalendarInfo>(new CommandDefinition("""
            SELECT e.Title, CAST(e.StartUtc AS datetimeoffset(0)) AS StartUtc, e.Notes,
                   COALESCE(e.StartPlace,
                            CASE WHEN e.CourseName LIKE '%[0-9][0-9][0-9][0-9][0-9]%' THEN NULL ELSE e.CourseName END) AS Place
            FROM dbo.SquadEvent e
            WHERE e.Id = @eventId AND e.SquadId = @squadId AND e.Published = 1;
            """, new { squadId, eventId }, cancellationToken: ct));
    }

    // Per-event branding blob name. `kind` is whitelisted to a fixed column — never user text in SQL.
    private static string ImageCol(string kind) => string.Equals(kind, "banner", StringComparison.OrdinalIgnoreCase) ? "BannerBlob" : "LogoBlob";

    public async Task<string?> GetImageBlobAsync(Guid squadId, Guid eventId, string kind, CancellationToken ct)
    {
        await using var conn = new SqlConnection(connectionString);
        return await conn.ExecuteScalarAsync<string?>(new CommandDefinition(
            $"SELECT {ImageCol(kind)} FROM dbo.SquadEvent WHERE Id = @eventId AND SquadId = @squadId;",
            new { eventId, squadId }, cancellationToken: ct));
    }

    public async Task<bool> SetImageBlobAsync(Guid squadId, Guid eventId, string kind, string? blobName, Guid ownerId, CancellationToken ct)
    {
        await using var conn = new SqlConnection(connectionString);
        var rows = await conn.ExecuteAsync(new CommandDefinition($"""
            UPDATE e SET e.{ImageCol(kind)} = @blobName
            FROM dbo.SquadEvent e JOIN dbo.Squad s ON s.Id = e.SquadId
            WHERE e.Id = @eventId AND e.SquadId = @squadId AND s.OwnerId = @ownerId;
            """, new { eventId, squadId, blobName, ownerId }, cancellationToken: ct));
        return rows > 0;
    }

    public async Task<bool> DeleteAsync(Guid squadId, Guid ownerId, Guid eventId, CancellationToken ct)
    {
        await using var conn = new SqlConnection(connectionString);
        // Delete only if the caller owns the squad the event belongs to. RSVPs cascade.
        var removed = await conn.ExecuteAsync(new CommandDefinition("""
            DELETE e FROM dbo.SquadEvent e
            JOIN dbo.Squad s ON s.Id = e.SquadId
            WHERE e.Id = @eventId AND e.SquadId = @squadId AND s.OwnerId = @ownerId;
            """, new { eventId, squadId, ownerId }, cancellationToken: ct));
        return removed > 0;
    }

    public async Task<EventJoinResult> JoinAsync(Guid eventId, Guid meId, CancellationToken ct)
    {
        await using var conn = new SqlConnection(connectionString);

        // Resolve the event's squad/owner/title and whether the caller is already an RSVP + a squad member.
        // A member (or the owner) joins instantly ('going'); a non-member's join is a pending request.
        var ctx = await conn.QuerySingleOrDefaultAsync<JoinContext>(new CommandDefinition("""
            SELECT e.SquadId, s.OwnerId, e.Title,
                   (SELECT r.Status FROM dbo.SquadEventRsvp r WHERE r.EventId = e.Id AND r.AthleteId = @meId) AS ExistingStatus,
                   CAST(CASE WHEN s.OwnerId = @meId
                              OR EXISTS (SELECT 1 FROM dbo.Membership mm WHERE mm.SquadId = e.SquadId AND mm.AthleteId = @meId)
                             THEN 1 ELSE 0 END AS bit) AS IsMember
            FROM dbo.SquadEvent e
            JOIN dbo.Squad s ON s.Id = e.SquadId
            WHERE e.Id = @eventId;
            """, new { eventId, meId }, cancellationToken: ct));

        if (ctx is null) return new EventJoinResult(EventJoinOutcome.NotFound, Guid.Empty, Guid.Empty, "");

        // Already have an RSVP — idempotent (report joined-vs-requested from the existing row).
        if (ctx.ExistingStatus is not null)
        {
            var outcome = ctx.ExistingStatus == "pending" ? EventJoinOutcome.AlreadyRequested : EventJoinOutcome.AlreadyJoined;
            return new EventJoinResult(outcome, ctx.SquadId, ctx.OwnerId, ctx.Title);
        }

        var status = ctx.IsMember ? "going" : "pending";
        await conn.ExecuteAsync(new CommandDefinition("""
            INSERT INTO dbo.SquadEventRsvp (EventId, AthleteId, JoinedUtc, Status)
            SELECT @eventId, @meId, SYSDATETIMEOFFSET(), @status
            WHERE NOT EXISTS (SELECT 1 FROM dbo.SquadEventRsvp WHERE EventId = @eventId AND AthleteId = @meId);
            """, new { eventId, meId, status }, cancellationToken: ct));

        return new EventJoinResult(
            ctx.IsMember ? EventJoinOutcome.Joined : EventJoinOutcome.Requested,
            ctx.SquadId, ctx.OwnerId, ctx.Title);
    }

    private sealed record JoinContext(Guid SquadId, Guid OwnerId, string Title, string? ExistingStatus, bool IsMember);

    public async Task<bool> LeaveAsync(Guid eventId, Guid meId, CancellationToken ct)
    {
        await using var conn = new SqlConnection(connectionString);
        var removed = await conn.ExecuteAsync(new CommandDefinition(
            "DELETE FROM dbo.SquadEventRsvp WHERE EventId = @eventId AND AthleteId = @meId;",
            new { eventId, meId }, cancellationToken: ct));
        return removed > 0;
    }

    public async Task<CheckInOutcome> CheckInAsync(Guid eventId, Guid meId, CancellationToken ct)
    {
        await using var conn = new SqlConnection(connectionString);

        // One probe row: does the event exist, has the caller joined, and is today the event day
        // (compared in the event's own UTC offset so timezones don't shift the calendar date)?
        var probe = await conn.QuerySingleOrDefaultAsync<CheckInProbe>(new CommandDefinition("""
            SELECT
                CAST(CASE WHEN e.Id IS NULL THEN 0 ELSE 1 END AS bit) AS EventExists,
                CAST(CASE WHEN r.Status = 'going' THEN 1 ELSE 0 END AS bit) AS Joined,
                CAST(CASE WHEN r.CheckedInUtc IS NULL THEN 0 ELSE 1 END AS bit) AS AlreadyCheckedIn,
                CAST(CASE WHEN CAST(SWITCHOFFSET(SYSDATETIMEOFFSET(), DATEPART(TZOFFSET, e.StartUtc)) AS date)
                             = CAST(e.StartUtc AS date) THEN 1 ELSE 0 END AS bit) AS IsToday
            FROM dbo.SquadEvent e
            LEFT JOIN dbo.SquadEventRsvp r ON r.EventId = e.Id AND r.AthleteId = @meId
            WHERE e.Id = @eventId;
            """, new { eventId, meId }, cancellationToken: ct));

        if (probe is null || !probe.EventExists) return CheckInOutcome.NotFound;
        if (!probe.Joined) return CheckInOutcome.NotJoined;
        if (probe.AlreadyCheckedIn) return CheckInOutcome.Ok;   // idempotent
        if (!probe.IsToday) return CheckInOutcome.NotToday;

        await conn.ExecuteAsync(new CommandDefinition("""
            UPDATE dbo.SquadEventRsvp SET CheckedInUtc = SYSDATETIMEOFFSET()
            WHERE EventId = @eventId AND AthleteId = @meId AND CheckedInUtc IS NULL;
            """, new { eventId, meId }, cancellationToken: ct));
        return CheckInOutcome.Ok;
    }

    public async Task<bool> UndoCheckInAsync(Guid eventId, Guid meId, CancellationToken ct)
    {
        await using var conn = new SqlConnection(connectionString);
        // Clear the recorded attendance but keep the RSVP row, so the member stays joined and can
        // check in again. Succeeds as long as the caller has an RSVP for the event (idempotent).
        await conn.ExecuteAsync(new CommandDefinition("""
            UPDATE dbo.SquadEventRsvp SET CheckedInUtc = NULL
            WHERE EventId = @eventId AND AthleteId = @meId;
            """, new { eventId, meId }, cancellationToken: ct));
        return await conn.ExecuteScalarAsync<int>(new CommandDefinition(
            "SELECT COUNT(1) FROM dbo.SquadEventRsvp WHERE EventId = @eventId AND AthleteId = @meId;",
            new { eventId, meId }, cancellationToken: ct)) > 0;
    }

    private sealed record CheckInProbe(bool EventExists, bool Joined, bool AlreadyCheckedIn, bool IsToday);
}
