-- ===========================================================================
--  Squad management extras — logo + banner images for the Group page. Run AFTER
--  Squads.sql. Additive + idempotent, safe to re-run. Blobs live in the private
--  image container (IImageStore); these columns hold the opaque blob names, read
--  back through the authenticated proxy (GET /api/images/squads/{id}/logo|banner).
-- ===========================================================================
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;

IF COL_LENGTH('dbo.Squad', 'LogoBlob') IS NULL
    ALTER TABLE dbo.Squad ADD LogoBlob NVARCHAR(200) NULL;

IF COL_LENGTH('dbo.Squad', 'BannerBlob') IS NULL
    ALTER TABLE dbo.Squad ADD BannerBlob NVARCHAR(200) NULL;
