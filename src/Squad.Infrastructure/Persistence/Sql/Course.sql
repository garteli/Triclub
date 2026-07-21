-- Saved routes/courses: an ordered polyline a rider follows on the live map (and a coach can
-- attach to a planned ride). Points is a JSON array of [lat,lon].
IF OBJECT_ID('dbo.Course', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Course (
        Id         UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_Course PRIMARY KEY DEFAULT NEWID(),
        OwnerId    UNIQUEIDENTIFIER NOT NULL,
        Name       NVARCHAR(120)    NOT NULL,
        Points     NVARCHAR(MAX)    NOT NULL,   -- JSON: [[lat,lon], ...]
        DistanceKm FLOAT            NULL,
        PointCount INT              NOT NULL DEFAULT 0,
        CreatedUtc DATETIMEOFFSET(0) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
        CONSTRAINT FK_Course_Owner FOREIGN KEY (OwnerId) REFERENCES dbo.Athlete (Id)
    );
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Course_Owner' AND object_id = OBJECT_ID('dbo.Course'))
    CREATE INDEX IX_Course_Owner ON dbo.Course (OwnerId, CreatedUtc DESC);
