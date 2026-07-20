-- ===========================================================================
--  Activity interactions — kudos + comments. Run AFTER RawActivity.sql (needs
--  dbo.Activity + dbo.Athlete). Idempotent. Both cascade-delete with their
--  activity, so deleting a training also clears its kudos and comments.
-- ===========================================================================
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;

-- One row per (activity, athlete) — a kudos is a toggle, so the pair is the PK.
IF OBJECT_ID('dbo.ActivityKudos', 'U') IS NULL
CREATE TABLE dbo.ActivityKudos (
    ActivityId UNIQUEIDENTIFIER  NOT NULL,
    AthleteId  UNIQUEIDENTIFIER  NOT NULL,
    CreatedUtc DATETIMEOFFSET(0) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
    CONSTRAINT PK_ActivityKudos PRIMARY KEY (ActivityId, AthleteId),
    CONSTRAINT FK_ActivityKudos_Activity FOREIGN KEY (ActivityId) REFERENCES dbo.Activity (Id) ON DELETE CASCADE,
    CONSTRAINT FK_ActivityKudos_Athlete  FOREIGN KEY (AthleteId)  REFERENCES dbo.Athlete  (Id)
);

-- Comment thread per activity, chronological within an activity.
IF OBJECT_ID('dbo.ActivityComment', 'U') IS NULL
CREATE TABLE dbo.ActivityComment (
    Id         UNIQUEIDENTIFIER  NOT NULL DEFAULT NEWSEQUENTIALID(),
    ActivityId UNIQUEIDENTIFIER  NOT NULL,
    AthleteId  UNIQUEIDENTIFIER  NOT NULL,
    Body       NVARCHAR(1000)    NOT NULL,
    CreatedUtc DATETIMEOFFSET(0) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
    CONSTRAINT PK_ActivityComment PRIMARY KEY (Id),
    CONSTRAINT FK_ActivityComment_Activity FOREIGN KEY (ActivityId) REFERENCES dbo.Activity (Id) ON DELETE CASCADE,
    CONSTRAINT FK_ActivityComment_Athlete  FOREIGN KEY (AthleteId)  REFERENCES dbo.Athlete  (Id)
);

-- Thread scan: chronological within an activity.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_ActivityComment_Activity_Created' AND object_id = OBJECT_ID('dbo.ActivityComment'))
CREATE INDEX IX_ActivityComment_Activity_Created ON dbo.ActivityComment (ActivityId, CreatedUtc);
