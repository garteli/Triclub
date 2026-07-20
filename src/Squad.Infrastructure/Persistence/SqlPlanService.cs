// ===========================================================================
//  SqlPlanService.cs  —  IPlanService over SQL Server (Dapper).
//  A per-athlete weekly plan. Returns whatever workouts have actually been
//  assigned for the week; an athlete with no plan gets an empty week (the
//  client renders an empty state).
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

public sealed class SqlPlanService(string connectionString) : IPlanService
{
    public async Task<IReadOnlyList<PlannedWorkoutRow>> GetWeekAsync(Guid athleteId, DateTime weekStart, CancellationToken ct)
    {
        var monday = weekStart.Date;
        var sunday = monday.AddDays(6);

        await using var conn = new SqlConnection(connectionString);

        var rows = await conn.QueryAsync<PlannedWorkoutRow>(new CommandDefinition("""
            SELECT Id, WorkoutDate, Discipline, Title, Sub, DurationMin, Load
            FROM dbo.PlannedWorkout
            WHERE AthleteId=@athleteId AND WorkoutDate BETWEEN @monday AND @sunday
            ORDER BY WorkoutDate;
            """, new { athleteId, monday, sunday }, cancellationToken: ct));

        return rows.ToList();
    }

    public async Task<int> PublishAsync(Guid coachId, IReadOnlyList<Guid> athleteIds, DateTime spanStart, DateTime spanEnd,
        IReadOnlyList<PlannedWorkoutWrite> workouts, CancellationToken ct)
    {
        // Only publish to athletes who belong to a squad this coach OWNS — never trust the
        // caller-supplied id list on its own.
        var ids = athleteIds.Distinct().ToArray();
        if (ids.Length == 0) return 0;

        await using var conn = new SqlConnection(connectionString);
        await conn.OpenAsync(ct);

        var allowed = (await conn.QueryAsync<Guid>(new CommandDefinition("""
            SELECT DISTINCT m.AthleteId
            FROM dbo.Membership m
            JOIN dbo.Squad s ON s.Id = m.SquadId
            WHERE s.OwnerId = @coachId AND m.AthleteId IN @ids;
            """, new { coachId, ids }, cancellationToken: ct))).ToList();
        if (allowed.Count == 0) return 0;

        var start = spanStart.Date;
        var end = spanEnd.Date;

        await using var tx = (SqlTransaction)await conn.BeginTransactionAsync(ct);
        foreach (var athleteId in allowed)
        {
            // Replace the whole plan span for this athlete (idempotent re-publish).
            await conn.ExecuteAsync(new CommandDefinition("""
                DELETE FROM dbo.PlannedWorkout
                WHERE AthleteId = @athleteId AND WorkoutDate BETWEEN @start AND @end;
                """, new { athleteId, start, end }, tx, cancellationToken: ct));

            foreach (var w in workouts)
            {
                await conn.ExecuteAsync(new CommandDefinition("""
                    INSERT INTO dbo.PlannedWorkout (Id, AthleteId, WorkoutDate, Discipline, Title, Sub, DurationMin, Load)
                    VALUES (NEWID(), @athleteId, @Date, @Discipline, @Title, @Sub, @DurationMin, @Load);
                    """,
                    new { athleteId, w.Date, w.Discipline, w.Title, w.Sub, w.DurationMin, w.Load },
                    tx, cancellationToken: ct));
            }
        }
        await tx.CommitAsync(ct);
        return allowed.Count;
    }

    // ----- a coach's saved plans -----

    public async Task<IReadOnlyList<CoachPlanSummary>> ListPlansAsync(Guid ownerId, CancellationToken ct)
    {
        await using var conn = new SqlConnection(connectionString);
        var rows = await conn.QueryAsync<CoachPlanSummary>(new CommandDefinition("""
            SELECT Id, Name, UpdatedUtc FROM dbo.CoachPlan
            WHERE OwnerId = @ownerId ORDER BY UpdatedUtc DESC;
            """, new { ownerId }, cancellationToken: ct));
        return rows.ToList();
    }

    public async Task<CoachPlanDoc?> GetPlanAsync(Guid ownerId, Guid planId, CancellationToken ct)
    {
        await using var conn = new SqlConnection(connectionString);
        return await conn.QuerySingleOrDefaultAsync<CoachPlanDoc>(new CommandDefinition("""
            SELECT Id, Name, Doc, UpdatedUtc FROM dbo.CoachPlan
            WHERE Id = @planId AND OwnerId = @ownerId;
            """, new { planId, ownerId }, cancellationToken: ct));
    }

    public async Task<Guid?> SavePlanAsync(Guid ownerId, Guid? planId, string name, string doc, Guid? squadId, CancellationToken ct)
    {
        await using var conn = new SqlConnection(connectionString);

        if (planId is { } id)
        {
            var updated = await conn.ExecuteAsync(new CommandDefinition("""
                UPDATE dbo.CoachPlan SET Name = @name, Doc = @doc, SquadId = @squadId, UpdatedUtc = SYSDATETIMEOFFSET()
                WHERE Id = @id AND OwnerId = @ownerId;
                """, new { id, ownerId, name, doc, squadId }, cancellationToken: ct));
            return updated > 0 ? id : (Guid?)null; // 0 rows → not theirs / gone
        }

        var newId = Guid.NewGuid();
        await conn.ExecuteAsync(new CommandDefinition("""
            INSERT INTO dbo.CoachPlan (Id, OwnerId, SquadId, Name, Doc, UpdatedUtc)
            VALUES (@newId, @ownerId, @squadId, @name, @doc, SYSDATETIMEOFFSET());
            """, new { newId, ownerId, squadId, name, doc }, cancellationToken: ct));
        return newId;
    }

    public async Task<bool> DeletePlanAsync(Guid ownerId, Guid planId, CancellationToken ct)
    {
        await using var conn = new SqlConnection(connectionString);
        var removed = await conn.ExecuteAsync(new CommandDefinition(
            "DELETE FROM dbo.CoachPlan WHERE Id = @planId AND OwnerId = @ownerId;",
            new { planId, ownerId }, cancellationToken: ct));
        return removed > 0;
    }
}
