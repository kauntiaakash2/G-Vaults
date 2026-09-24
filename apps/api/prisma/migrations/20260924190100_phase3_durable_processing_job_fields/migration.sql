-- Legacy enum values remain in the PostgreSQL type for rollback compatibility,
-- but every existing row is migrated to the durable lifecycle.
ALTER TABLE "processing_jobs"
  ADD COLUMN "max_attempts" INTEGER NOT NULL DEFAULT 3,
  ADD COLUMN "next_attempt_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "locked_at" TIMESTAMP(3),
  ADD COLUMN "locked_by" TEXT;

ALTER TABLE "processing_jobs" ALTER COLUMN "status" DROP DEFAULT;

UPDATE "processing_jobs" SET "status" = 'QUEUED' WHERE "status" = 'PENDING';
UPDATE "processing_jobs"
SET "status" = 'RETRY_PENDING',
    "next_attempt_at" = CURRENT_TIMESTAMP,
    "locked_at" = NULL,
    "locked_by" = NULL
WHERE "status" = 'PROCESSING';
UPDATE "processing_jobs" SET "status" = 'SUCCEEDED' WHERE "status" = 'COMPLETED';

ALTER TABLE "processing_jobs" ALTER COLUMN "status" SET DEFAULT 'QUEUED';

-- Only one runnable OCR job may exist for a version. Preserve the oldest job
-- and close any historical duplicate before creating the partial index.
WITH ranked AS (
  SELECT "id",
         ROW_NUMBER() OVER (
           PARTITION BY "document_version_id", "type"
           ORDER BY "created_at", "id"
         ) AS position
  FROM "processing_jobs"
  WHERE "status" IN ('QUEUED', 'RUNNING', 'RETRY_PENDING')
)
UPDATE "processing_jobs" AS job
SET "status" = 'DEAD',
    "completed_at" = CURRENT_TIMESTAMP,
    "error" = 'Superseded duplicate runnable job during durable-job migration',
    "locked_at" = NULL,
    "locked_by" = NULL
FROM ranked
WHERE job."id" = ranked."id" AND ranked.position > 1;

DROP INDEX IF EXISTS "processing_jobs_status_created_at_idx";
CREATE INDEX "processing_jobs_status_next_attempt_at_idx"
  ON "processing_jobs"("status", "next_attempt_at");
CREATE INDEX "processing_jobs_status_locked_at_idx"
  ON "processing_jobs"("status", "locked_at");
CREATE UNIQUE INDEX "processing_jobs_one_runnable_per_version_type"
  ON "processing_jobs"("document_version_id", "type")
  WHERE "status" IN ('QUEUED', 'RUNNING', 'RETRY_PENDING');
