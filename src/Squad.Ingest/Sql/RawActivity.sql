-- ===========================================================================
--  RawActivity.sql
--  The raw-payload store the intake endpoint writes to. Keeping the original
--  bytes means a parser bug is replayable — re-queue the Id after a fix and the
--  worker re-normalizes without the athlete re-uploading anything.
-- ===========================================================================

CREATE TABLE dbo.RawActivity (
    Id                UNIQUEIDENTIFIER  NOT NULL DEFAULT NEWSEQUENTIALID(),
    AthleteId         UNIQUEIDENTIFIER  NOT NULL,
    Source            TINYINT           NOT NULL,   -- ActivitySource enum
    SourceExternalId  NVARCHAR(128)     NULL,       -- SHA-256 (uploads) / provider id (webhooks)
    Payload           VARBINARY(MAX)    NOT NULL,   -- the untouched .FIT bytes
    ContentType       NVARCHAR(100)     NOT NULL,
    FileName          NVARCHAR(260)     NULL,
    ReceivedUtc       DATETIMEOFFSET(0) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
    CONSTRAINT PK_RawActivity PRIMARY KEY (Id)
);

-- Idempotency: the same physical payload can't be stored twice. Filtered so many
-- NULL external ids (e.g. formats without a natural id) don't collide with each other.
CREATE UNIQUE INDEX UX_RawActivity_Source_ExternalId
    ON dbo.RawActivity (Source, SourceExternalId)
    WHERE SourceExternalId IS NOT NULL;


-- ---------------------------------------------------------------------------
--  Athlete — assumed to already exist in your schema. SqlAthleteDirectory reads
--  these columns; adjust the SELECT there if yours differ. Shown for reference:
-- ---------------------------------------------------------------------------
-- CREATE TABLE dbo.Athlete (
--     Id          UNIQUEIDENTIFIER NOT NULL PRIMARY KEY,
--     DisplayName NVARCHAR(100)    NOT NULL,
--     Initials    NVARCHAR(4)      NOT NULL,   -- e.g. 'DL'
--     AvatarColor NVARCHAR(9)      NOT NULL,   -- e.g. '#d6ff3f'
--     SquadId     UNIQUEIDENTIFIER NOT NULL
-- );
