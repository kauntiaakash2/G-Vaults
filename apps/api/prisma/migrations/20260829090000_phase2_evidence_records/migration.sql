-- CreateEnum
CREATE TYPE "DocumentClassification" AS ENUM ('INTERNAL', 'RESTRICTED', 'CONFIDENTIAL', 'HIGHLY_RESTRICTED');

-- CreateEnum
CREATE TYPE "RecordStatus" AS ENUM ('DRAFT', 'FINAL', 'DECLARED_RECORD', 'ARCHIVED', 'DISPOSITION_DUE', 'DISPOSED');

-- CreateEnum
CREATE TYPE "VersionKind" AS ENUM ('ORIGINAL', 'REVISION', 'DERIVED', 'REDACTED');

-- CreateEnum
CREATE TYPE "CustodyEventCategory" AS ENUM ('SECURITY', 'ACCESS', 'CUSTODY', 'PROCESSING', 'RECORD_LIFECYCLE', 'SYSTEM');

-- CreateEnum
CREATE TYPE "CustodyEventType" AS ENUM ('ACQUIRED', 'UPLOADED', 'ACCESSED', 'DOWNLOADED', 'ACCESS_GRANTED', 'ACCESS_REVOKED', 'DERIVED', 'VERIFIED', 'HOLD_PLACED', 'HOLD_RELEASED', 'RECORD_STATUS_CHANGED', 'DISPOSITION_BLOCKED');

-- CreateEnum
CREATE TYPE "LegalHoldStatus" AS ENUM ('ACTIVE', 'RELEASED');

-- ExtendEnum
ALTER TYPE "PermissionStatus" ADD VALUE 'EXPIRED';

-- AlterTable
ALTER TABLE "documents"
ADD COLUMN "classification" "DocumentClassification" NOT NULL DEFAULT 'RESTRICTED',
ADD COLUMN "record_status" "RecordStatus" NOT NULL DEFAULT 'DRAFT';

-- AlterTable
ALTER TABLE "document_versions"
ADD COLUMN "version_kind" "VersionKind" NOT NULL DEFAULT 'REVISION',
ADD COLUMN "parent_version_id" TEXT,
ADD COLUMN "source_version_id" TEXT,
ADD COLUMN "is_authoritative" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "transformation_type" TEXT;

UPDATE "document_versions"
SET "version_kind" = 'ORIGINAL'
WHERE "version_number" = 1;

-- AlterTable
ALTER TABLE "document_permissions"
ADD COLUMN "valid_from" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN "valid_until" TIMESTAMP(3),
ADD COLUMN "reason" TEXT,
ADD COLUMN "revoked_by" TEXT,
ADD COLUMN "revoke_reason" TEXT;

-- CreateTable
CREATE TABLE "custody_events" (
  "id" TEXT NOT NULL,
  "category" "CustodyEventCategory" NOT NULL,
  "type" "CustodyEventType" NOT NULL,
  "case_id" TEXT NOT NULL,
  "document_id" TEXT,
  "version_id" TEXT,
  "actor_id" TEXT,
  "details" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "custody_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "legal_holds" (
  "id" TEXT NOT NULL,
  "case_id" TEXT NOT NULL,
  "document_id" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "reference" TEXT,
  "status" "LegalHoldStatus" NOT NULL DEFAULT 'ACTIVE',
  "placed_by" TEXT NOT NULL,
  "placed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "released_by" TEXT,
  "released_at" TIMESTAMP(3),
  "release_reason" TEXT,
  CONSTRAINT "legal_holds_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "documents_classification_idx" ON "documents"("classification");
CREATE INDEX "documents_record_status_idx" ON "documents"("record_status");
CREATE INDEX "document_versions_parent_version_id_idx" ON "document_versions"("parent_version_id");
CREATE INDEX "document_versions_source_version_id_idx" ON "document_versions"("source_version_id");
CREATE INDEX "document_permissions_valid_until_idx" ON "document_permissions"("valid_until");
CREATE INDEX "custody_events_case_id_created_at_idx" ON "custody_events"("case_id", "created_at");
CREATE INDEX "custody_events_document_id_created_at_idx" ON "custody_events"("document_id", "created_at");
CREATE INDEX "custody_events_version_id_idx" ON "custody_events"("version_id");
CREATE INDEX "legal_holds_case_id_status_idx" ON "legal_holds"("case_id", "status");
CREATE INDEX "legal_holds_document_id_status_idx" ON "legal_holds"("document_id", "status");

-- AddForeignKey
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_parent_version_id_fkey" FOREIGN KEY ("parent_version_id") REFERENCES "document_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_source_version_id_fkey" FOREIGN KEY ("source_version_id") REFERENCES "document_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "document_permissions" ADD CONSTRAINT "document_permissions_revoked_by_fkey" FOREIGN KEY ("revoked_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "custody_events" ADD CONSTRAINT "custody_events_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "custody_events" ADD CONSTRAINT "custody_events_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "custody_events" ADD CONSTRAINT "custody_events_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "document_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "custody_events" ADD CONSTRAINT "custody_events_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "legal_holds" ADD CONSTRAINT "legal_holds_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "legal_holds" ADD CONSTRAINT "legal_holds_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "legal_holds" ADD CONSTRAINT "legal_holds_placed_by_fkey" FOREIGN KEY ("placed_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "legal_holds" ADD CONSTRAINT "legal_holds_released_by_fkey" FOREIGN KEY ("released_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
