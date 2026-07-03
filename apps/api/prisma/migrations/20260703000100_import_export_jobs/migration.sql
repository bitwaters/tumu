ALTER TYPE "ExportType" ADD VALUE IF NOT EXISTS 'audit';

CREATE TYPE "ImportKind" AS ENUM ('organizations', 'sections', 'areas', 'disciplines', 'users');
CREATE TYPE "ImportStatus" AS ENUM ('queued', 'running', 'succeeded', 'failed');

ALTER TABLE "ExportJob"
  ALTER COLUMN "status" SET DEFAULT 'queued',
  ADD COLUMN "params" JSONB,
  ADD COLUMN "artifactKey" TEXT,
  ADD COLUMN "artifactFileName" TEXT,
  ADD COLUMN "artifactMimeType" TEXT,
  ADD COLUMN "errorMessage" TEXT,
  ADD COLUMN "startedAt" TIMESTAMP,
  ADD COLUMN "completedAt" TIMESTAMP;

CREATE TABLE "ImportJob" (
  "id" TEXT PRIMARY KEY,
  "kind" "ImportKind" NOT NULL,
  "status" "ImportStatus" NOT NULL DEFAULT 'queued',
  "requestedBy" TEXT NOT NULL REFERENCES "User"("id"),
  "sourceFileName" TEXT,
  "acceptedRows" INTEGER NOT NULL DEFAULT 0,
  "rejectedRows" INTEGER NOT NULL DEFAULT 0,
  "errors" JSONB,
  "errorMessage" TEXT,
  "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
  "startedAt" TIMESTAMP,
  "completedAt" TIMESTAMP
);
