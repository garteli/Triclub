-- ===========================================================================
--  Squads schema — real clubs + memberships. Run AFTER RawActivity.sql (which
--  creates dbo.Athlete, whose SquadId is the athlete's *active* squad — the one
--  whose feed/leaderboard they see). Idempotent, safe to re-run.
--
--  dbo.Squad        one row per club (Discover list + Group profile)
--  dbo.Membership   which athletes belong to which squads (PK squad+athlete)
--  The well-known demo squad (11111111-…-111111111111) gets a real row here so
--  it appears in Discover alongside user-created squads.
-- ===========================================================================
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;

IF OBJECT_ID('dbo.Squad', 'U') IS NULL
CREATE TABLE dbo.Squad (
    Id           UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
    Name         NVARCHAR(120)    NOT NULL,
    Discipline   NVARCHAR(40)     NOT NULL,
    Location     NVARCHAR(120)    NULL,
    Level        NVARCHAR(40)     NULL,
    Kind         NVARCHAR(16)     NOT NULL DEFAULT 'member',  -- free | member | coach
    Price        NVARCHAR(20)     NULL,                        -- display string, e.g. '₪90' or 'Free'
    PerLabel     NVARCHAR(10)     NULL,                        -- '/mo' etc.
    Color        NVARCHAR(9)      NOT NULL DEFAULT '#ff6a2c',
    Rating       NVARCHAR(8)      NULL,
    Description  NVARCHAR(800)    NULL,
    OwnerId      UNIQUEIDENTIFIER NULL,
    CreatedUtc   DATETIMEOFFSET(0) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
    CONSTRAINT PK_Squad PRIMARY KEY (Id)
);

IF OBJECT_ID('dbo.Membership', 'U') IS NULL
CREATE TABLE dbo.Membership (
    SquadId    UNIQUEIDENTIFIER NOT NULL,
    AthleteId  UNIQUEIDENTIFIER NOT NULL,
    Role       NVARCHAR(16)     NOT NULL DEFAULT 'member',  -- owner | coach | member
    JoinedUtc  DATETIMEOFFSET(0) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
    CONSTRAINT PK_Membership PRIMARY KEY (SquadId, AthleteId),
    CONSTRAINT FK_Membership_Squad   FOREIGN KEY (SquadId)   REFERENCES dbo.Squad (Id),
    CONSTRAINT FK_Membership_Athlete FOREIGN KEY (AthleteId) REFERENCES dbo.Athlete (Id)
);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Membership_Athlete' AND object_id = OBJECT_ID('dbo.Membership'))
CREATE INDEX IX_Membership_Athlete ON dbo.Membership (AthleteId);
GO

-- Give the well-known demo squad a real row so it shows in Discover.
IF NOT EXISTS (SELECT 1 FROM dbo.Squad WHERE Id = '11111111-1111-1111-1111-111111111111')
INSERT INTO dbo.Squad (Id, Name, Discipline, Location, Level, Kind, Price, PerLabel, Color, Rating, Description)
VALUES ('11111111-1111-1111-1111-111111111111', 'Kaza Tri Club', 'Triathlon', 'Tiberias',
        'All levels', 'free', 'Free', '', '#ff6a2c', '4.9',
        'The starter squad — weekly rides and a friendly crew chasing 70.3 and Olympic-distance goals.');

-- Backfill memberships for anyone already carrying a SquadId (seed peers + early signups).
INSERT INTO dbo.Membership (SquadId, AthleteId, Role)
SELECT a.SquadId, a.Id, 'member'
FROM dbo.Athlete a
WHERE a.SquadId IS NOT NULL
  AND EXISTS (SELECT 1 FROM dbo.Squad s WHERE s.Id = a.SquadId)
  AND NOT EXISTS (SELECT 1 FROM dbo.Membership m WHERE m.SquadId = a.SquadId AND m.AthleteId = a.Id);
