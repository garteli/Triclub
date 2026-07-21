-- Library of pre-generated, adoptable training plans (distance × goal-time level).
-- Doc is the CoachPlan editor JSON; adopting copies it into a user's CoachPlan.
IF OBJECT_ID('dbo.PlanTemplate', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.PlanTemplate (
        Id         UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_PlanTemplate PRIMARY KEY DEFAULT NEWID(),
        Distance   NVARCHAR(32)  NOT NULL,
        Level      NVARCHAR(32)  NOT NULL,
        GoalLabel  NVARCHAR(64)  NOT NULL,
        Name       NVARCHAR(120) NOT NULL,
        Weeks      INT           NOT NULL,
        SortOrder  INT           NOT NULL,
        Doc        NVARCHAR(MAX) NOT NULL,
        UpdatedUtc DATETIMEOFFSET(0) NOT NULL DEFAULT SYSDATETIMEOFFSET()
    );
END;

-- One template per (distance, level) so the seeder is idempotent.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_PlanTemplate_Distance_Level' AND object_id = OBJECT_ID('dbo.PlanTemplate'))
    CREATE UNIQUE INDEX UX_PlanTemplate_Distance_Level ON dbo.PlanTemplate (Distance, Level);
