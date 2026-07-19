// ===========================================================================
//  SqlPlanService.cs  —  IPlanService over SQL Server (Dapper).
//  A per-athlete weekly plan. The first time an athlete opens a week with no
//  workouts, a deterministic template week (Mon..Sun) is seeded and persisted,
//  so every athlete gets a real, editable plan without manual setup.
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
    // Monday-anchored template: (dayOffset, discipline, title, sub, minutes, load).
    private static readonly (int Day, string Disc, string Title, string Sub, int Min, int Load)[] Template =
    {
        (0, "gym",  "Strength",   "Full-body + core",   55, 40),
        (1, "bike", "Threshold",  "3 × 12′ @ FTP",       75, 78),
        (2, "swim", "Technique",  "8 × 100 drills",      60, 45),
        (3, "run",  "Tempo",      "20′ @ threshold",     50, 62),
        (4, "rest", "Rest day",   "Recovery + mobility",  0,  0),
        (5, "bike", "Long ride",  "Endurance · Z2",     180, 150),
        (6, "run",  "Easy run",   "Aerobic base",        45, 38),
    };

    public async Task<IReadOnlyList<PlannedWorkoutRow>> GetWeekAsync(Guid athleteId, DateTime weekStart, CancellationToken ct)
    {
        var monday = weekStart.Date;
        var sunday = monday.AddDays(6);

        await using var conn = new SqlConnection(connectionString);

        var any = await conn.ExecuteScalarAsync<int>(new CommandDefinition(
            "SELECT COUNT(*) FROM dbo.PlannedWorkout WHERE AthleteId=@athleteId AND WorkoutDate BETWEEN @monday AND @sunday;",
            new { athleteId, monday, sunday }, cancellationToken: ct));

        if (any == 0)
        {
            foreach (var t in Template)
                await conn.ExecuteAsync(new CommandDefinition("""
                    INSERT INTO dbo.PlannedWorkout (Id, AthleteId, WorkoutDate, Discipline, Title, Sub, DurationMin, Load)
                    VALUES (NEWID(), @athleteId, @date, @disc, @title, @sub, @min, @load);
                    """, new { athleteId, date = monday.AddDays(t.Day), disc = t.Disc, title = t.Title, sub = t.Sub, min = t.Min, load = t.Load },
                    cancellationToken: ct));
        }

        var rows = await conn.QueryAsync<PlannedWorkoutRow>(new CommandDefinition("""
            SELECT Id, WorkoutDate, Discipline, Title, Sub, DurationMin, Load
            FROM dbo.PlannedWorkout
            WHERE AthleteId=@athleteId AND WorkoutDate BETWEEN @monday AND @sunday
            ORDER BY WorkoutDate;
            """, new { athleteId, monday, sunday }, cancellationToken: ct));

        return rows.ToList();
    }
}
