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

-- ---------------------------------------------------------------------------
--  CoachPlan — a coach's saved, editable plan (name + JSON doc of the whole
--  multi-week block + assignment). A coach can have many. Publishing a plan
--  writes PlannedWorkout rows (above); this is the coach's own working copy.
-- ---------------------------------------------------------------------------
IF OBJECT_ID('dbo.CoachPlan', 'U') IS NULL
CREATE TABLE dbo.CoachPlan (
    Id         UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
    OwnerId    UNIQUEIDENTIFIER NOT NULL,          -- the coach who owns it
    SquadId    UNIQUEIDENTIFIER NULL,              -- optional: the squad it's for
    Name       NVARCHAR(120)    NOT NULL,
    Doc        NVARCHAR(MAX)    NOT NULL,           -- JSON: weeks/sessions/targets/assignment
    UpdatedUtc DATETIMEOFFSET(0) NOT NULL DEFAULT SYSDATETIMEOFFSET(),  -- matches DateTimeOffset mapping
    CONSTRAINT PK_CoachPlan PRIMARY KEY (Id),
    CONSTRAINT FK_CoachPlan_Owner FOREIGN KEY (OwnerId) REFERENCES dbo.Athlete (Id)
);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_CoachPlan_Owner' AND object_id = OBJECT_ID('dbo.CoachPlan'))
CREATE INDEX IX_CoachPlan_Owner ON dbo.CoachPlan (OwnerId, UpdatedUtc DESC);
