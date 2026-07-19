-- ===========================================================================
--  Auth schema — extends dbo.Athlete with the columns the sign-up / sign-in flow
--  needs. Run AFTER RawActivity.sql (which creates dbo.Athlete). Idempotent:
--  guarded so it can be re-run safely.
--
--  A single Athlete row is the account. Identity can be a password (PBKDF2 hash)
--  and/or a federated subject (Google 'sub' / Apple 'sub'). Email is the human key.
-- ===========================================================================
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;

-- --- Athlete auth columns ---------------------------------------------------
IF COL_LENGTH('dbo.Athlete', 'Email') IS NULL
    ALTER TABLE dbo.Athlete ADD Email NVARCHAR(256) NULL;

IF COL_LENGTH('dbo.Athlete', 'PasswordHash') IS NULL
    ALTER TABLE dbo.Athlete ADD PasswordHash NVARCHAR(400) NULL;  -- PBKDF2 'iter.salt.hash' (base64), NULL for OAuth-only

IF COL_LENGTH('dbo.Athlete', 'GoogleSub') IS NULL
    ALTER TABLE dbo.Athlete ADD GoogleSub NVARCHAR(255) NULL;     -- Google id_token 'sub'

IF COL_LENGTH('dbo.Athlete', 'AppleSub') IS NULL
    ALTER TABLE dbo.Athlete ADD AppleSub NVARCHAR(255) NULL;      -- Apple id_token 'sub'

IF COL_LENGTH('dbo.Athlete', 'CreatedUtc') IS NULL
    ALTER TABLE dbo.Athlete ADD CreatedUtc DATETIMEOFFSET(0) NOT NULL DEFAULT SYSDATETIMEOFFSET();
GO

-- --- Uniqueness -------------------------------------------------------------
-- Email is the login key; filtered so many NULL emails (pure-OAuth rows without
-- a captured email) don't collide.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_Athlete_Email' AND object_id = OBJECT_ID('dbo.Athlete'))
    CREATE UNIQUE INDEX UX_Athlete_Email ON dbo.Athlete (Email) WHERE Email IS NOT NULL;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_Athlete_GoogleSub' AND object_id = OBJECT_ID('dbo.Athlete'))
    CREATE UNIQUE INDEX UX_Athlete_GoogleSub ON dbo.Athlete (GoogleSub) WHERE GoogleSub IS NOT NULL;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_Athlete_AppleSub' AND object_id = OBJECT_ID('dbo.Athlete'))
    CREATE UNIQUE INDEX UX_Athlete_AppleSub ON dbo.Athlete (AppleSub) WHERE AppleSub IS NOT NULL;
GO

-- --- Default squad ----------------------------------------------------------
-- There is no Squad table yet (SquadId is an unconstrained GUID on Athlete). For
-- the MVP, self-service sign-ups join one well-known "demo" squad so the feed and
-- leaderboard have peers. Replace with real squad creation/join when that lands.
--   Well-known SquadId: 11111111-1111-1111-1111-111111111111
-- (No row to insert — the id is just a grouping key the app agrees on.)
