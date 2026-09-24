-- PostgreSQL requires newly added enum values to be committed before they are
-- used. The following migration performs the data/schema conversion.
ALTER TYPE "ProcessingJobStatus" ADD VALUE IF NOT EXISTS 'QUEUED';
ALTER TYPE "ProcessingJobStatus" ADD VALUE IF NOT EXISTS 'RUNNING';
ALTER TYPE "ProcessingJobStatus" ADD VALUE IF NOT EXISTS 'SUCCEEDED';
ALTER TYPE "ProcessingJobStatus" ADD VALUE IF NOT EXISTS 'RETRY_PENDING';
ALTER TYPE "ProcessingJobStatus" ADD VALUE IF NOT EXISTS 'DEAD';
