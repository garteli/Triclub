-- ===========================================================================
--  RidePayment schema — group-ride payment tracking (ledger). Run AFTER Squads.sql.
--  The app does NOT move money: coaches collect out-of-band (e-transfer / cash /
--  their own link). A row records who owes/paid the coach for a ride and books the
--  club's cut (ClubCutMinor) so the club can reconcile with the coach later.
--  Amounts are integer minor units (agorot / cents). Idempotent.
-- ===========================================================================
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;

IF OBJECT_ID('dbo.RidePayment', 'U') IS NULL
CREATE TABLE dbo.RidePayment (
    Id            UNIQUEIDENTIFIER  NOT NULL DEFAULT NEWID(),
    SquadId       UNIQUEIDENTIFIER  NOT NULL,
    PayerId       UNIQUEIDENTIFIER  NOT NULL,                     -- the rider
    CoachId       UNIQUEIDENTIFIER  NOT NULL,                     -- squad owner (payee) at creation time
    Kind          NVARCHAR(12)      NOT NULL DEFAULT 'dropin',    -- member | dropin | coach
    AmountMinor   BIGINT            NOT NULL,                     -- gross, minor units (agorot/cents)
    Currency      CHAR(3)           NOT NULL DEFAULT 'ILS',       -- ISO-4217
    ClubFeeBps    INT               NOT NULL DEFAULT 0,           -- club's cut, basis points (1000 = 10%)
    ClubCutMinor  BIGINT            NOT NULL DEFAULT 0,           -- = AmountMinor * ClubFeeBps / 10000
    CoachNetMinor BIGINT            NOT NULL DEFAULT 0,           -- = AmountMinor - ClubCutMinor
    Status        NVARCHAR(10)      NOT NULL DEFAULT 'owed',      -- owed | paid | waived
    Method        NVARCHAR(12)      NULL,                         -- etransfer | cash | link | other
    Note          NVARCHAR(400)     NULL,
    CreatedUtc    DATETIMEOFFSET(0) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
    PaidUtc       DATETIMEOFFSET(0) NULL,
    CONSTRAINT PK_RidePayment PRIMARY KEY (Id),
    CONSTRAINT FK_RidePayment_Squad FOREIGN KEY (SquadId) REFERENCES dbo.Squad (Id),
    CONSTRAINT FK_RidePayment_Payer FOREIGN KEY (PayerId) REFERENCES dbo.Athlete (Id),
    CONSTRAINT FK_RidePayment_Coach FOREIGN KEY (CoachId) REFERENCES dbo.Athlete (Id)
);

-- Rider's own history: their payments newest-first.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_RidePayment_Payer' AND object_id = OBJECT_ID('dbo.RidePayment'))
CREATE INDEX IX_RidePayment_Payer ON dbo.RidePayment (PayerId, CreatedUtc DESC);

-- Coach's ledger + summary scans: by squad and status.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_RidePayment_Squad_Status' AND object_id = OBJECT_ID('dbo.RidePayment'))
CREATE INDEX IX_RidePayment_Squad_Status ON dbo.RidePayment (SquadId, Status);
