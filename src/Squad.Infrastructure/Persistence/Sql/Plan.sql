-- ===========================================================================
--  Plan schema — a per-athlete weekly training plan. Run AFTER RawActivity.sql.
--  One row per planned workout on a date. Rows are created when a plan is
--  actually assigned; an athlete with no plan simply has no rows. Idempotent.
-- ===========================================================================
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;

IF OBJECT_ID('dbo.PlannedWorkout', 'U') IS NULL
CREATE TABLE dbo.PlannedWorkout (
    Id          UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
    AthleteId   UNIQUEIDENTIFIER NOT NULL,
    WorkoutDate DATE             NOT NULL,
    Discipline  NVARCHAR(8)      NOT NULL,   -- bike | swim | run | gym | rest
    Title       NVARCHAR(80)     NOT NULL,
    Sub         NVARCHAR(120)    NULL,
    DurationMin INT              NOT NULL DEFAULT 0,
    Load        INT              NOT NULL DEFAULT 0,
    CONSTRAINT PK_PlannedWorkout PRIMARY KEY (Id),
    CONSTRAINT FK_PlannedWorkout_Athlete FOREIGN KEY (AthleteId) REFERENCES dbo.Athlete (Id)
);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_PlannedWorkout_Athlete_Date' AND object_id = OBJECT_ID('dbo.PlannedWorkout'))
CREATE INDEX IX_PlannedWorkout_Athlete_Date ON dbo.PlannedWorkout (AthleteId, WorkoutDate);
