-- ===========================================================================
--  Squad schema — run against the database named in ConnectionStrings:Sql.
--  Idempotent: guarded with IF NOT EXISTS so it can be re-run safely.
--  Three tables:
--    Athlete       roster + display fields (assumed pre-populated by signup/auth)
--    RawActivity   original uploaded bytes, replayable through the ingest worker
--    Activity      normalized, deduped summaries the feed + leaderboard read
--  Enum columns are TINYINT — see Squad.Core/Activities/Enums.cs. Do NOT renumber.
-- ===========================================================================

-- Required for filtered indexes (Azure SQL rejects them otherwise) and correct
-- string handling. Some clients (sqlcmd) default QUOTED_IDENTIFIER OFF.
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;

-- ---------------------------------------------------------------------------
--  Athlete — SqlAthleteDirectory + SqlLeaderboardService read these columns.
--  Populated by the signup / auth flow; the JWT 'sub' (NameIdentifier) claim is
--  this Id. Kept minimal for the MVP.
-- ---------------------------------------------------------------------------
IF OBJECT_ID('dbo.Athlete', 'U') IS NULL
CREATE TABLE dbo.Athlete (
    Id           UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
    DisplayName  NVARCHAR(100)    NOT NULL,
    Initials     NVARCHAR(4)      NOT NULL,
    AvatarColor  NVARCHAR(9)      NOT NULL,   -- '#RRGGBB' or '#RRGGBBAA'
    SquadId      UNIQUEIDENTIFIER NOT NULL,
    CONSTRAINT PK_Athlete PRIMARY KEY (Id)
);

-- Roster lookups (leaderboard, squad feed) filter by squad.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Athlete_Squad' AND object_id = OBJECT_ID('dbo.Athlete'))
CREATE INDEX IX_Athlete_Squad ON dbo.Athlete (SquadId);

-- ---------------------------------------------------------------------------
--  RawActivity — raw-payload store the intake endpoints write to. Keeping the
--  original bytes makes a parser bug replayable: re-queue the Id after a fix and
--  the worker re-normalizes.
-- ---------------------------------------------------------------------------
IF OBJECT_ID('dbo.RawActivity', 'U') IS NULL
CREATE TABLE dbo.RawActivity (
    Id                UNIQUEIDENTIFIER  NOT NULL DEFAULT NEWSEQUENTIALID(),
    AthleteId         UNIQUEIDENTIFIER  NOT NULL,
    Source            TINYINT           NOT NULL,   -- ActivitySource enum (FitUpload=0..Garmin=3)
    SourceExternalId  NVARCHAR(128)     NULL,       -- SHA-256 (uploads) / provider id (webhooks)
    PayloadKind       NVARCHAR(8)       NOT NULL,   -- 'fit' | 'gpx' | 'tcx' | 'json'
    Payload           VARBINARY(MAX)    NOT NULL,
    ReceivedUtc       DATETIMEOFFSET(0) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
    CONSTRAINT PK_RawActivity PRIMARY KEY (Id),
    CONSTRAINT FK_RawActivity_Athlete FOREIGN KEY (AthleteId) REFERENCES dbo.Athlete (Id)
);

-- Idempotency: same (Source, SourceExternalId) can't be stored twice. Filtered so many
-- NULL external ids don't collide.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_RawActivity_Source_ExternalId' AND object_id = OBJECT_ID('dbo.RawActivity'))
CREATE UNIQUE INDEX UX_RawActivity_Source_ExternalId
    ON dbo.RawActivity (Source, SourceExternalId)
    WHERE SourceExternalId IS NOT NULL;

-- ---------------------------------------------------------------------------
--  Activity — normalized summaries written by SqlActivityRepository. Dedup keys
--  on UNIQUE (AthleteId, Fingerprint); on collision the worker replaces only if
--  the newcomer outranks the stored Source (SourceRank). The GPS track is gzipped
--  JSON in TrackBlob. Column set mirrors the INSERT in SqlActivityRepository.
-- ---------------------------------------------------------------------------
IF OBJECT_ID('dbo.Activity', 'U') IS NULL
CREATE TABLE dbo.Activity (
    Id                UNIQUEIDENTIFIER  NOT NULL,
    AthleteId         UNIQUEIDENTIFIER  NOT NULL,
    Sport             TINYINT           NOT NULL,   -- ActivitySport enum (Other=0..Run=3)
    StartUtc          DATETIMEOFFSET(0) NOT NULL,
    MovingTimeSec     INT               NOT NULL,
    ElapsedTimeSec    INT               NOT NULL,
    DistanceMeters    FLOAT             NULL,
    ElevationGainM    FLOAT             NULL,
    AvgHeartRate      FLOAT             NULL,
    MaxHeartRate      FLOAT             NULL,
    AvgPowerWatts     FLOAT             NULL,
    AvgCadence        FLOAT             NULL,
    Calories          FLOAT             NULL,
    TrainingLoad      FLOAT             NULL,       -- TSS if the source supplied it
    Source            TINYINT           NOT NULL,   -- ActivitySource enum
    SourceExternalId  NVARCHAR(128)     NULL,
    Fingerprint       CHAR(32)          NOT NULL,   -- MD5 hex of sport|start-60s|distance-100m
    TrackBlob         VARBINARY(MAX)    NULL,       -- gzipped JSON TrackPoint[]
    CONSTRAINT PK_Activity PRIMARY KEY (Id),
    CONSTRAINT FK_Activity_Athlete FOREIGN KEY (AthleteId) REFERENCES dbo.Athlete (Id)
);

-- Dedup key: the repository's insert relies on this unique constraint (catches
-- SQL errors 2601/2627 to resolve concurrent-insert races into a discard).
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_Activity_Athlete_Fingerprint' AND object_id = OBJECT_ID('dbo.Activity'))
CREATE UNIQUE INDEX UX_Activity_Athlete_Fingerprint
    ON dbo.Activity (AthleteId, Fingerprint);

-- Weekly-leaderboard scan: seek by (athlete, week window), covering the summed
-- columns so the aggregate stays index-only.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Activity_Athlete_Start' AND object_id = OBJECT_ID('dbo.Activity'))
CREATE INDEX IX_Activity_Athlete_Start
    ON dbo.Activity (AthleteId, StartUtc)
    INCLUDE (Sport, TrainingLoad, MovingTimeSec);
