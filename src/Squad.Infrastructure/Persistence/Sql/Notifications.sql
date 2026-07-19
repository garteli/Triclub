-- ===========================================================================
--  Notifications schema. Run AFTER RawActivity.sql. Idempotent.
--  One row per notification delivered to a recipient athlete. Written when
--  something happens to/around them (a follow, someone joining their squad, …).
-- ===========================================================================
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;

IF OBJECT_ID('dbo.Notification', 'U') IS NULL
CREATE TABLE dbo.Notification (
    Id          UNIQUEIDENTIFIER  NOT NULL DEFAULT NEWSEQUENTIALID(),
    RecipientId UNIQUEIDENTIFIER  NOT NULL,
    Kind        NVARCHAR(24)      NOT NULL,   -- follow | join | activity | message
    ActorId     UNIQUEIDENTIFIER  NULL,       -- who triggered it (nav target)
    ActorName   NVARCHAR(100)     NOT NULL,
    Text        NVARCHAR(300)     NOT NULL,
    IsRead      BIT               NOT NULL DEFAULT 0,
    CreatedUtc  DATETIMEOFFSET(0) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
    CONSTRAINT PK_Notification PRIMARY KEY (Id),
    CONSTRAINT FK_Notification_Recipient FOREIGN KEY (RecipientId) REFERENCES dbo.Athlete (Id)
);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Notification_Recipient_Created' AND object_id = OBJECT_ID('dbo.Notification'))
CREATE INDEX IX_Notification_Recipient_Created ON dbo.Notification (RecipientId, CreatedUtc);
