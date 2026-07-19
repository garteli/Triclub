-- ===========================================================================
--  Messages schema — squad group chat. Run AFTER Squads.sql. Idempotent.
--  One row per message, scoped to a squad; delivered live to that squad's
--  members over the chat hub and read back as history via the API.
-- ===========================================================================
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;

IF OBJECT_ID('dbo.Message', 'U') IS NULL
CREATE TABLE dbo.Message (
    Id         UNIQUEIDENTIFIER  NOT NULL DEFAULT NEWSEQUENTIALID(),
    SquadId    UNIQUEIDENTIFIER  NOT NULL,
    AthleteId  UNIQUEIDENTIFIER  NOT NULL,
    Body       NVARCHAR(1000)    NOT NULL,
    CreatedUtc DATETIMEOFFSET(0) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
    CONSTRAINT PK_Message PRIMARY KEY (Id),
    CONSTRAINT FK_Message_Athlete FOREIGN KEY (AthleteId) REFERENCES dbo.Athlete (Id)
);

-- History scan: newest-first within a squad.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Message_Squad_Created' AND object_id = OBJECT_ID('dbo.Message'))
CREATE INDEX IX_Message_Squad_Created ON dbo.Message (SquadId, CreatedUtc);
