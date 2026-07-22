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
