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

    public async Task<IReadOnlyList<Guid>> PublishAsync(Guid coachId, Guid planId, string planName, IReadOnlyList<Guid> athleteIds,
        DateTime spanStart, DateTime spanEnd, IReadOnlyList<PlannedWorkoutWrite> workouts, CancellationToken ct)
    {
        // Only publish to athletes who belong to a squad this coach OWNS — never trust the
        // caller-supplied id list on its own.
        var ids = athleteIds.Distinct().ToArray();
        if (ids.Length == 0) return Array.Empty<Guid>();

        await using var conn = new SqlConnection(connectionString);
        await conn.OpenAsync(ct);

        var allowed = (await conn.QueryAsync<Guid>(new CommandDefinition("""
            SELECT DISTINCT m.AthleteId
            FROM dbo.Membership m
            JOIN dbo.Squad s ON s.Id = m.SquadId
            WHERE s.OwnerId = @coachId AND m.AthleteId IN @ids;
            """, new { coachId, ids }, cancellationToken: ct))).ToList();
        if (allowed.Count == 0) return Array.Empty<Guid>();

        var start = spanStart.Date;
        var end = spanEnd.Date;
        var name = string.IsNullOrWhiteSpace(planName) ? "Training plan" : planName;

        await using var tx = (SqlTransaction)await conn.BeginTransactionAsync(ct);
        foreach (var athleteId in allowed)
        {
            // Replace the published span for this athlete (idempotent re-publish of the whole plan or a week).
            await conn.ExecuteAsync(new CommandDefinition("""
                DELETE FROM dbo.PlannedWorkout
                WHERE AthleteId = @athleteId AND WorkoutDate BETWEEN @start AND @end;
                """, new { athleteId, start, end }, tx, cancellationToken: ct));

            foreach (var w in workouts)
            {
                await conn.ExecuteAsync(new CommandDefinition("""
                    INSERT INTO dbo.PlannedWorkout (Id, AthleteId, WorkoutDate, Discipline, Title, Sub, DurationMin, Load, PlanId, PlanName)
                    VALUES (NEWID(), @athleteId, @Date, @Discipline, @Title, @Sub, @DurationMin, @Load, @planId, @name);
                    """,
                    new { athleteId, w.Date, w.Discipline, w.Title, w.Sub, w.DurationMin, w.Load, planId, name },
                    tx, cancellationToken: ct));
            }
        }
        await tx.CommitAsync(ct);
        return allowed;
    }

    public async Task<int> UnpublishAsync(Guid coachId, Guid planId, CancellationToken ct)
    {
        await using var conn = new SqlConnection(connectionString);
        // Only the coach who owns the plan can pull it from athletes' calendars.
        return await conn.ExecuteAsync(new CommandDefinition("""
            IF EXISTS (SELECT 1 FROM dbo.CoachPlan WHERE Id = @planId AND OwnerId = @coachId)
                DELETE FROM dbo.PlannedWorkout WHERE PlanId = @planId;
            """, new { coachId, planId }, cancellationToken: ct));
    }

    public async Task<IReadOnlyList<AthletePlanSummary>> ListAthletePlansAsync(Guid athleteId, CancellationToken ct)
    {
        await using var conn = new SqlConnection(connectionString);
        var rows = await conn.QueryAsync<AthletePlanSummary>(new CommandDefinition("""
            SELECT PlanId,
                   MAX(PlanName) AS PlanName,
                   MIN(WorkoutDate) AS FirstDate,
                   MAX(WorkoutDate) AS LastDate,
                   COUNT(*) AS Sessions
            FROM dbo.PlannedWorkout
            WHERE AthleteId = @athleteId AND PlanId IS NOT NULL
            GROUP BY PlanId
            ORDER BY MIN(WorkoutDate);
            """, new { athleteId }, cancellationToken: ct));
        return rows.ToList();
    }

    public async Task<int> RemoveAthletePlanAsync(Guid athleteId, Guid planId, CancellationToken ct)
    {
        await using var conn = new SqlConnection(connectionString);
        return await conn.ExecuteAsync(new CommandDefinition(
            "DELETE FROM dbo.PlannedWorkout WHERE AthleteId = @athleteId AND PlanId = @planId;",
            new { athleteId, planId }, cancellationToken: ct));
    }

    // ----- a coach's saved plans -----

    public async Task<IReadOnlyList<CoachPlanSummary>> ListPlansAsync(Guid ownerId, CancellationToken ct)
    {
        await using var conn = new SqlConnection(connectionString);
        // CAST UpdatedUtc to datetimeoffset so Dapper can always materialise the record's
        // DateTimeOffset param — some deployments created the column as datetime(2), which
        // otherwise comes back as System.DateTime and fails materialisation. No-op if it's
        // already datetimeoffset.
        var rows = await conn.QueryAsync<CoachPlanSummary>(new CommandDefinition("""
            SELECT Id, Name, CAST(UpdatedUtc AS datetimeoffset(0)) AS UpdatedUtc FROM dbo.CoachPlan
            WHERE OwnerId = @ownerId ORDER BY UpdatedUtc DESC;
            """, new { ownerId }, cancellationToken: ct));
        return rows.ToList();
    }

    public async Task<CoachPlanDoc?> GetPlanAsync(Guid ownerId, Guid planId, CancellationToken ct)
    {
        await using var conn = new SqlConnection(connectionString);
        return await conn.QuerySingleOrDefaultAsync<CoachPlanDoc>(new CommandDefinition("""
            SELECT Id, Name, Doc, CAST(UpdatedUtc AS datetimeoffset(0)) AS UpdatedUtc FROM dbo.CoachPlan
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
