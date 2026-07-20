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
}
