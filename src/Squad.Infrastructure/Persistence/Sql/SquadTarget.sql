-- Group/club target races a coach sets for a squad; members can adopt one as their own goal.
IF OBJECT_ID('dbo.SquadTarget', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.SquadTarget (
        Id         UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_SquadTarget PRIMARY KEY DEFAULT NEWID(),
        SquadId    UNIQUEIDENTIFIER NOT NULL,
        Name       NVARCHAR(120)    NOT NULL,
        RaceDate   NVARCHAR(10)     NULL,      -- ISO yyyy-MM-dd
        Location   NVARCHAR(120)    NULL,
        EventUrl   NVARCHAR(400)    NULL,
        CreatedUtc DATETIMEOFFSET(0) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
        CONSTRAINT FK_SquadTarget_Squad FOREIGN KEY (SquadId) REFERENCES dbo.Squad (Id)
    );
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_SquadTarget_Squad' AND object_id = OBJECT_ID('dbo.SquadTarget'))
    CREATE INDEX IX_SquadTarget_Squad ON dbo.SquadTarget (SquadId, CreatedUtc);
