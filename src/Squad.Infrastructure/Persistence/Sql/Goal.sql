-- ===========================================================================
--  Goal schema — the athlete's single goal race, shown as the countdown card on
--  the Profile page. The event details (name / date / location) are extracted by
--  the AI from a supplied event URL, or entered manually. One row per athlete
--  (PK = AthleteId ⇒ upsert). Run AFTER RawActivity.sql. Idempotent, safe to re-run.
-- ===========================================================================
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;

IF OBJECT_ID('dbo.AthleteGoal', 'U') IS NULL
CREATE TABLE dbo.AthleteGoal (
    AthleteId  UNIQUEIDENTIFIER  NOT NULL,
    Name       NVARCHAR(160)     NOT NULL,
    -- RaceDate is an ISO 'yyyy-MM-dd' string (the client owns date formatting; the
    -- server derives "days to go" from it). Null when the AI couldn't find a date.
    RaceDate   NVARCHAR(10)      NULL,
    Location   NVARCHAR(200)     NULL,
    EventUrl   NVARCHAR(500)     NULL,
    CreatedUtc DATETIMEOFFSET(0) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
    UpdatedUtc DATETIMEOFFSET(0) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
    CONSTRAINT PK_AthleteGoal PRIMARY KEY (AthleteId),
    CONSTRAINT FK_AthleteGoal_Athlete FOREIGN KEY (AthleteId) REFERENCES dbo.Athlete (Id)
);
