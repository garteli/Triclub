-- Raw-payload store the intake endpoints write to. Keeping the original bytes makes a
-- parser bug replayable — re-queue the Id after a fix and the worker re-normalizes.

CREATE TABLE dbo.RawActivity (
    Id                UNIQUEIDENTIFIER  NOT NULL DEFAULT NEWSEQUENTIALID(),
    AthleteId         UNIQUEIDENTIFIER  NOT NULL,
    Source            TINYINT           NOT NULL,   -- ActivitySource enum (FitUpload=0..Garmin=3)
    SourceExternalId  NVARCHAR(128)     NULL,       -- SHA-256 (uploads) / provider id (webhooks)
    PayloadKind       NVARCHAR(8)       NOT NULL,   -- 'fit' | 'gpx' | 'tcx' | 'json'
    Payload           VARBINARY(MAX)    NOT NULL,
    ReceivedUtc       DATETIMEOFFSET(0) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
    CONSTRAINT PK_RawActivity PRIMARY KEY (Id)
);

-- Idempotency: same (Source, SourceExternalId) can't be stored twice. Filtered so many
-- NULL external ids don't collide.
CREATE UNIQUE INDEX UX_RawActivity_Source_ExternalId
    ON dbo.RawActivity (Source, SourceExternalId)
    WHERE SourceExternalId IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Athlete — assumed to exist; SqlAthleteDirectory / SqlLeaderboardService read these:
-- CREATE TABLE dbo.Athlete (
--     Id UNIQUEIDENTIFIER PRIMARY KEY, DisplayName NVARCHAR(100) NOT NULL,
--     Initials NVARCHAR(4) NOT NULL, AvatarColor NVARCHAR(9) NOT NULL,
--     SquadId UNIQUEIDENTIFIER NOT NULL );
