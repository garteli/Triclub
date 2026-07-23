-- ===========================================================================
--  DirectMessages schema — 1:1 direct messages between two athletes. Run AFTER
--  Auth.sql (needs dbo.Athlete). Idempotent. One row per message; a message is
--  delivered live to both participants' personal hub groups and read back as
--  thread history via the API. ConvKey collapses both directions of a pair into
--  one conversation so the thread scan is a single indexed range.
-- ===========================================================================
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;

IF OBJECT_ID('dbo.DirectMessage', 'U') IS NULL
CREATE TABLE dbo.DirectMessage (
    Id          UNIQUEIDENTIFIER  NOT NULL DEFAULT NEWSEQUENTIALID(),
    SenderId    UNIQUEIDENTIFIER  NOT NULL,
    RecipientId UNIQUEIDENTIFIER  NOT NULL,
    -- Deterministic ordered-pair key: min(id)|max(id). Both directions share it.
    ConvKey     AS (CONVERT(CHAR(36), IIF(SenderId < RecipientId, SenderId, RecipientId)) + '|'
                  + CONVERT(CHAR(36), IIF(SenderId < RecipientId, RecipientId, SenderId))) PERSISTED,
    Body        NVARCHAR(1000)    NOT NULL,
    CreatedUtc  DATETIMEOFFSET(0) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
    CONSTRAINT PK_DirectMessage PRIMARY KEY (Id),
    CONSTRAINT FK_DirectMessage_Sender    FOREIGN KEY (SenderId)    REFERENCES dbo.Athlete (Id),
    CONSTRAINT FK_DirectMessage_Recipient FOREIGN KEY (RecipientId) REFERENCES dbo.Athlete (Id)
);

-- Thread history scan: newest-first within a conversation.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_DirectMessage_Conv_Created' AND object_id = OBJECT_ID('dbo.DirectMessage'))
CREATE INDEX IX_DirectMessage_Conv_Created ON dbo.DirectMessage (ConvKey, CreatedUtc);
