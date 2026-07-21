-- ===========================================================================
--  Profile schema — extends dbo.Athlete with the editable profile fields the
--  Profile / Edit-profile screens and the sign-up wizard capture. Run AFTER
--  RawActivity.sql + Auth.sql. Idempotent (guarded), safe to re-run.
-- ===========================================================================
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;

IF COL_LENGTH('dbo.Athlete', 'Club')        IS NULL ALTER TABLE dbo.Athlete ADD Club        NVARCHAR(120) NULL;
IF COL_LENGTH('dbo.Athlete', 'AgeGroup')    IS NULL ALTER TABLE dbo.Athlete ADD AgeGroup    NVARCHAR(20)  NULL;
IF COL_LENGTH('dbo.Athlete', 'PrimarySport')IS NULL ALTER TABLE dbo.Athlete ADD PrimarySport NVARCHAR(40) NULL;
IF COL_LENGTH('dbo.Athlete', 'Level')       IS NULL ALTER TABLE dbo.Athlete ADD Level       NVARCHAR(40)  NULL;
IF COL_LENGTH('dbo.Athlete', 'Ftp')         IS NULL ALTER TABLE dbo.Athlete ADD Ftp         INT           NULL;
IF COL_LENGTH('dbo.Athlete', 'WeeklyHours') IS NULL ALTER TABLE dbo.Athlete ADD WeeklyHours NVARCHAR(20)  NULL;
IF COL_LENGTH('dbo.Athlete', 'Bio')         IS NULL ALTER TABLE dbo.Athlete ADD Bio         NVARCHAR(600) NULL;
-- BirthDate is stored as an ISO 'yyyy-MM-dd' string (the client owns the date; AgeGroup
-- above is derived from it client-side). WeightKg allows a half-kg (DECIMAL(5,1)).
IF COL_LENGTH('dbo.Athlete', 'BirthDate')   IS NULL ALTER TABLE dbo.Athlete ADD BirthDate   NVARCHAR(10)  NULL;
IF COL_LENGTH('dbo.Athlete', 'Gender')      IS NULL ALTER TABLE dbo.Athlete ADD Gender      NVARCHAR(20)  NULL;
IF COL_LENGTH('dbo.Athlete', 'WeightKg')    IS NULL ALTER TABLE dbo.Athlete ADD WeightKg    DECIMAL(5,1)  NULL;
