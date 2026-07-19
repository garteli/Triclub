-- ===========================================================================
--  JoinRequests schema — gated-squad join approvals. Run AFTER Squads.sql.
--  Free squads join immediately; member/coach squads create a pending request
--  the owner approves or declines. Idempotent.
-- ===========================================================================
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;

IF OBJECT_ID('dbo.JoinRequest', 'U') IS NULL
CREATE TABLE dbo.JoinRequest (
    Id         UNIQUEIDENTIFIER  NOT NULL DEFAULT NEWID(),
    SquadId    UNIQUEIDENTIFIER  NOT NULL,
    AthleteId  UNIQUEIDENTIFIER  NOT NULL,
    Status     NVARCHAR(12)      NOT NULL DEFAULT 'pending',  -- pending | approved | declined
    CreatedUtc DATETIMEOFFSET(0) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
    DecidedUtc DATETIMEOFFSET(0) NULL,
    CONSTRAINT PK_JoinRequest PRIMARY KEY (Id),
    CONSTRAINT FK_JoinRequest_Squad   FOREIGN KEY (SquadId)   REFERENCES dbo.Squad (Id),
    CONSTRAINT FK_JoinRequest_Athlete FOREIGN KEY (AthleteId) REFERENCES dbo.Athlete (Id)
);

-- One open (pending) request per athlete per squad. Filtered so decided rows don't collide.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_JoinRequest_Pending' AND object_id = OBJECT_ID('dbo.JoinRequest'))
CREATE UNIQUE INDEX UX_JoinRequest_Pending ON dbo.JoinRequest (SquadId, AthleteId) WHERE Status = 'pending';

-- Owner's inbox scan: pending requests by squad.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_JoinRequest_Squad_Status' AND object_id = OBJECT_ID('dbo.JoinRequest'))
CREATE INDEX IX_JoinRequest_Squad_Status ON dbo.JoinRequest (SquadId, Status);
