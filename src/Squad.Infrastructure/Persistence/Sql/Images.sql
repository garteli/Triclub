-- ===========================================================================
--  Images schema — avatar blob key on dbo.Athlete + the dbo.ActivityPhoto table.
--  The image bytes live in blob storage (IImageStore); these columns/rows only
--  hold the opaque blob name (avatars/…, activity/…) the app hands back to the
--  read proxy. Run AFTER RawActivity.sql. Idempotent (guarded), safe to re-run.
-- ===========================================================================
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;

-- Avatar: the athlete's current profile-photo blob (NULL = no photo → initials).
IF COL_LENGTH('dbo.Athlete', 'AvatarBlob') IS NULL
    ALTER TABLE dbo.Athlete ADD AvatarBlob NVARCHAR(200) NULL;

-- Activity photos. ActivityId is NULL for an in-ride capture (the .fit becomes an
-- Activity asynchronously by fingerprint, so its id is unknown at capture time);
-- such photos are resolved to an activity later by owner + CapturedUtc window.
IF OBJECT_ID('dbo.ActivityPhoto', 'U') IS NULL
CREATE TABLE dbo.ActivityPhoto (
    Id          UNIQUEIDENTIFIER  NOT NULL DEFAULT NEWID(),
    AthleteId   UNIQUEIDENTIFIER  NOT NULL,
    ActivityId  UNIQUEIDENTIFIER  NULL,
    BlobName    NVARCHAR(200)     NOT NULL,
    CapturedUtc DATETIMEOFFSET(0) NOT NULL,
    CreatedUtc  DATETIMEOFFSET(0) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
    CONSTRAINT PK_ActivityPhoto PRIMARY KEY (Id),
    CONSTRAINT FK_ActivityPhoto_Athlete FOREIGN KEY (AthleteId) REFERENCES dbo.Athlete (Id)
);

-- Attached-photo lookup by activity.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_ActivityPhoto_Activity' AND object_id = OBJECT_ID('dbo.ActivityPhoto'))
CREATE INDEX IX_ActivityPhoto_Activity ON dbo.ActivityPhoto (ActivityId) WHERE ActivityId IS NOT NULL;

-- In-ride (unattached) resolution: owner + captured-time window.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_ActivityPhoto_Athlete_Captured' AND object_id = OBJECT_ID('dbo.ActivityPhoto'))
CREATE INDEX IX_ActivityPhoto_Athlete_Captured ON dbo.ActivityPhoto (AthleteId, CapturedUtc);
