-- Ad-hoc group sessions a coach (squad owner) schedules for the squad: pick a saved route,
-- a sport and a date+time, then publish it to members. Members join (an RSVP row) and, on the
-- day of the event, check in to mark attendance.

-- One row per scheduled session, keyed by the squad. Course is denormalized (name/km/points
-- copied at create-time) so the session still renders if the source Course is later deleted.
IF OBJECT_ID('dbo.SquadEvent', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.SquadEvent (
        Id           UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_SquadEvent PRIMARY KEY DEFAULT NEWID(),
        SquadId      UNIQUEIDENTIFIER NOT NULL,
        CreatedBy    UNIQUEIDENTIFIER NOT NULL,       -- the owner/coach who scheduled it
        Title        NVARCHAR(160)    NOT NULL,
        Sport        TINYINT          NOT NULL,        -- ActivitySport: 0 Other, 1 Swim, 2 Bike, 3 Run
        StartUtc     DATETIMEOFFSET(0) NOT NULL,       -- carries the scheduling offset (for the day-of check-in gate)
        CourseId     UNIQUEIDENTIFIER NULL,            -- source route (may be deleted later; fields below survive)
        CourseName   NVARCHAR(120)    NULL,
        CourseKm     FLOAT            NULL,
        CoursePoints NVARCHAR(MAX)    NULL,            -- [[lat,lon],…] JSON for drawing the route
        Notes        NVARCHAR(500)    NULL,
        CreatedUtc   DATETIMEOFFSET(0) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
        CONSTRAINT FK_SquadEvent_Squad   FOREIGN KEY (SquadId)   REFERENCES dbo.Squad (Id),
        CONSTRAINT FK_SquadEvent_Athlete FOREIGN KEY (CreatedBy) REFERENCES dbo.Athlete (Id)
    );
END;

-- Draft / published state. A coach can schedule an event as a draft (members don't see it,
-- no notifications) and publish it later; unpublishing hides it again. Additive + idempotent;
-- existing rows default to published (they were already live under the create-and-fan-out model).
IF COL_LENGTH('dbo.SquadEvent', 'Published') IS NULL
    ALTER TABLE dbo.SquadEvent ADD Published BIT NOT NULL CONSTRAINT DF_SquadEvent_Published DEFAULT 1;

-- Optional per-event branding — logo + banner blob names (bytes live in the private image
-- container, same as squad branding). Additive + idempotent.
IF COL_LENGTH('dbo.SquadEvent', 'LogoBlob')   IS NULL ALTER TABLE dbo.SquadEvent ADD LogoBlob   NVARCHAR(200) NULL;
IF COL_LENGTH('dbo.SquadEvent', 'BannerBlob') IS NULL ALTER TABLE dbo.SquadEvent ADD BannerBlob NVARCHAR(200) NULL;

-- Reverse-geocoded name of the route's start point (nearest town/locality), cached so the client
-- resolves it once and every later load reuses it instead of calling the geocoder again. Additive
-- + idempotent; null until the first viewer with the route resolves and persists it.
IF COL_LENGTH('dbo.SquadEvent', 'StartPlace') IS NULL ALTER TABLE dbo.SquadEvent ADD StartPlace NVARCHAR(120) NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_SquadEvent_Squad' AND object_id = OBJECT_ID('dbo.SquadEvent'))
    CREATE INDEX IX_SquadEvent_Squad ON dbo.SquadEvent (SquadId, StartUtc);

-- One row per member who joined an event; CheckedInUtc is non-null once they've checked in.
IF OBJECT_ID('dbo.SquadEventRsvp', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.SquadEventRsvp (
        EventId      UNIQUEIDENTIFIER NOT NULL,
        AthleteId    UNIQUEIDENTIFIER NOT NULL,
        JoinedUtc    DATETIMEOFFSET(0) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
        CheckedInUtc DATETIMEOFFSET(0) NULL,
        CONSTRAINT PK_SquadEventRsvp PRIMARY KEY (EventId, AthleteId),
        CONSTRAINT FK_SquadEventRsvp_Event   FOREIGN KEY (EventId)   REFERENCES dbo.SquadEvent (Id) ON DELETE CASCADE,
        CONSTRAINT FK_SquadEventRsvp_Athlete FOREIGN KEY (AthleteId) REFERENCES dbo.Athlete (Id)
    );
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_SquadEventRsvp_Athlete' AND object_id = OBJECT_ID('dbo.SquadEventRsvp'))
    CREATE INDEX IX_SquadEventRsvp_Athlete ON dbo.SquadEventRsvp (AthleteId);
GO

-- Join gating for non-members. A group member (or the owner) joins an event instantly ('going');
-- a NON-member's join is a request the coach approves ('pending' → 'going') or declines (row deleted).
-- Additive + idempotent; existing rows default to 'going' (they were all members joining directly).
IF COL_LENGTH('dbo.SquadEventRsvp', 'Status') IS NULL
    ALTER TABLE dbo.SquadEventRsvp ADD Status NVARCHAR(12) NOT NULL CONSTRAINT DF_SquadEventRsvp_Status DEFAULT 'going';  -- going | pending
GO

-- Coach's inbox scan: pending requests by event.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_SquadEventRsvp_Event_Status' AND object_id = OBJECT_ID('dbo.SquadEventRsvp'))
    CREATE INDEX IX_SquadEventRsvp_Event_Status ON dbo.SquadEventRsvp (EventId, Status);
