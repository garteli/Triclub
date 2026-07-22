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
            (SELECT COUNT(1) FROM dbo.SquadEventRsvp r WHERE r.EventId = e.Id) AS JoinCount,
            (SELECT COUNT(1) FROM dbo.SquadEventRsvp r WHERE r.EventId = e.Id AND r.CheckedInUtc IS NOT NULL) AS CheckedInCount,
            CAST(CASE WHEN me.EventId IS NULL THEN 0 ELSE 1 END AS bit) AS Joined,
            CAST(me.CheckedInUtc AS datetimeoffset(0)) AS CheckedInUtc
        FROM dbo.SquadEvent e
        LEFT JOIN dbo.SquadEventRsvp me ON me.EventId = e.Id AND me.AthleteId = @meId
        """;

    public async Task<IReadOnlyList<SquadEventView>> ListForSquadAsync(Guid squadId, Guid meId, CancellationToken ct)
    {
        await using var conn = new SqlConnection(connectionString);
        var rows = await conn.QueryAsync<SquadEventView>(new CommandDefinition($"""
            {ViewSelect}
            WHERE e.SquadId = @squadId AND e.StartUtc >= DATEADD(day, -1, SYSDATETIMEOFFSET())
            ORDER BY e.StartUtc ASC;
            """, new { squadId, meId }, cancellationToken: ct));
        return rows.ToList();
    }

    public async Task<IReadOnlyList<SquadEventView>> ListForMemberAsync(Guid meId, CancellationToken ct)
    {
        await using var conn = new SqlConnection(connectionString);
        // Only events the caller has joined (INNER via a WHERE on the RSVP row), soonest first.
        var rows = await conn.QueryAsync<SquadEventView>(new CommandDefinition($"""
            {ViewSelect}
            WHERE me.EventId IS NOT NULL AND e.StartUtc >= DATEADD(day, -1, SYSDATETIMEOFFSET())
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
        Guid? courseId, string? courseName, double? courseKm, string? coursePoints, string? notes, CancellationToken ct)
    {
        if (!await IsOwnerAsync(squadId, ownerId, ct)) return null;

        var id = Guid.NewGuid();
        var now = DateTimeOffset.UtcNow;
        await using var conn = new SqlConnection(connectionString);
        await conn.ExecuteAsync(new CommandDefinition("""
            INSERT INTO dbo.SquadEvent
                (Id, SquadId, CreatedBy, Title, Sport, StartUtc, CourseId, CourseName, CourseKm, CoursePoints, Notes, CreatedUtc)
            VALUES
                (@id, @squadId, @ownerId, @title, @sport, @startUtc, @courseId, @courseName, @courseKm, @coursePoints, @notes, SYSDATETIMEOFFSET());
            """, new { id, squadId, ownerId, title, sport, startUtc, courseId, courseName, courseKm, coursePoints, notes },
            cancellationToken: ct));
        return new SquadEvent(id, squadId, ownerId, title, sport, startUtc, courseId, courseName, courseKm, coursePoints, notes, now);
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

    public async Task<bool> JoinAsync(Guid eventId, Guid meId, CancellationToken ct)
    {
        await using var conn = new SqlConnection(connectionString);
        // Idempotent join: insert an RSVP only when the event exists and the member hasn't joined yet.
        var added = await conn.ExecuteAsync(new CommandDefinition("""
            INSERT INTO dbo.SquadEventRsvp (EventId, AthleteId, JoinedUtc)
            SELECT @eventId, @meId, SYSDATETIMEOFFSET()
            WHERE EXISTS (SELECT 1 FROM dbo.SquadEvent WHERE Id = @eventId)
              AND NOT EXISTS (SELECT 1 FROM dbo.SquadEventRsvp WHERE EventId = @eventId AND AthleteId = @meId);
            """, new { eventId, meId }, cancellationToken: ct));
        // Already-joined counts as success (idempotent) as long as the event exists.
        if (added > 0) return true;
        return await conn.ExecuteScalarAsync<int>(new CommandDefinition(
            "SELECT COUNT(1) FROM dbo.SquadEventRsvp WHERE EventId = @eventId AND AthleteId = @meId;",
            new { eventId, meId }, cancellationToken: ct)) > 0;
    }

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
                CAST(CASE WHEN r.EventId IS NULL THEN 0 ELSE 1 END AS bit) AS Joined,
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

    private sealed record CheckInProbe(bool EventExists, bool Joined, bool AlreadyCheckedIn, bool IsToday);
}
