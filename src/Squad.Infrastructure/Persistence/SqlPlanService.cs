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
}
