-- ===========================================================================
--  Follow schema — athlete-follows-athlete. Run AFTER RawActivity.sql. Idempotent.
--  Directed edge: Follower follows Followee. PK prevents duplicates.
-- ===========================================================================
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;

IF OBJECT_ID('dbo.Follow', 'U') IS NULL
CREATE TABLE dbo.Follow (
    FollowerId UNIQUEIDENTIFIER  NOT NULL,
    FolloweeId UNIQUEIDENTIFIER  NOT NULL,
    CreatedUtc DATETIMEOFFSET(0) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
    CONSTRAINT PK_Follow PRIMARY KEY (FollowerId, FolloweeId),
    CONSTRAINT FK_Follow_Follower FOREIGN KEY (FollowerId) REFERENCES dbo.Athlete (Id),
    CONSTRAINT FK_Follow_Followee FOREIGN KEY (FolloweeId) REFERENCES dbo.Athlete (Id)
);
