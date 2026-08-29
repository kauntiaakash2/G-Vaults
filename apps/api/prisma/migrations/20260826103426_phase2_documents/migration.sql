/*
  Warnings:

  - You are about to drop the column `actor_id` on the `audit_events` table. All the data in the column will be lost.
  - You are about to drop the column `created_at` on the `audit_events` table. All the data in the column will be lost.
  - The primary key for the `document_permissions` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `level` on the `document_permissions` table. All the data in the column will be lost.
  - You are about to drop the column `updated_at` on the `document_permissions` table. All the data in the column will be lost.
  - You are about to drop the column `checksum` on the `document_versions` table. All the data in the column will be lost.
  - You are about to drop the column `object_key` on the `document_versions` table. All the data in the column will be lost.
  - You are about to drop the column `size_bytes` on the `document_versions` table. All the data in the column will be lost.
  - You are about to drop the column `uploaded_by` on the `document_versions` table. All the data in the column will be lost.
  - You are about to drop the column `version` on the `document_versions` table. All the data in the column will be lost.
  - You are about to drop the column `current_version` on the `documents` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[event_hash]` on the table `audit_events` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[storage_key]` on the table `document_versions` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[document_id,version_number]` on the table `document_versions` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[current_version_id]` on the table `documents` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `event_hash` to the `audit_events` table without a default value. This is not possible if the table is not empty.
  - Added the required column `granted_by` to the `document_permissions` table without a default value. This is not possible if the table is not empty.
  - The required column `id` was added to the `document_permissions` table with a prisma-level default value. This is not possible if the table is not empty. Please add this column as optional, then populate it before making it required.
  - Added the required column `permission` to the `document_permissions` table without a default value. This is not possible if the table is not empty.
  - Added the required column `created_by` to the `document_versions` table without a default value. This is not possible if the table is not empty.
  - Added the required column `file_size` to the `document_versions` table without a default value. This is not possible if the table is not empty.
  - Added the required column `original_filename` to the `document_versions` table without a default value. This is not possible if the table is not empty.
  - Added the required column `sha256_hash` to the `document_versions` table without a default value. This is not possible if the table is not empty.
  - Added the required column `storage_key` to the `document_versions` table without a default value. This is not possible if the table is not empty.
  - Added the required column `version_number` to the `document_versions` table without a default value. This is not possible if the table is not empty.
  - Added the required column `created_by` to the `documents` table without a default value. This is not possible if the table is not empty.
  - Added the required column `document_type` to the `documents` table without a default value. This is not possible if the table is not empty.
  - Added the required column `owner_department_id` to the `documents` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "DocumentPermission" AS ENUM ('VIEW', 'DOWNLOAD', 'EDIT', 'SHARE', 'APPROVE');

-- CreateEnum
CREATE TYPE "PermissionStatus" AS ENUM ('ACTIVE', 'REVOKED');

-- CreateEnum
CREATE TYPE "AuditResult" AS ENUM ('SUCCESS', 'DENIED', 'FAILURE');

-- CreateEnum
CREATE TYPE "ProcessingJobStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- DropForeignKey
ALTER TABLE "audit_events" DROP CONSTRAINT "audit_events_actor_id_fkey";

-- DropForeignKey
ALTER TABLE "document_versions" DROP CONSTRAINT "document_versions_uploaded_by_fkey";

-- DropIndex
DROP INDEX "audit_events_actor_id_idx";

-- DropIndex
DROP INDEX "document_versions_document_id_version_key";

-- DropIndex
DROP INDEX "document_versions_uploaded_by_idx";

-- AlterTable
ALTER TABLE "audit_events" DROP COLUMN "actor_id",
DROP COLUMN "created_at",
ADD COLUMN     "event_hash" TEXT NOT NULL,
ADD COLUMN     "previous_hash" TEXT,
ADD COLUMN     "result" "AuditResult" NOT NULL DEFAULT 'SUCCESS',
ADD COLUMN     "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "user_id" TEXT,
ADD COLUMN     "version_id" TEXT;

-- AlterTable
ALTER TABLE "document_permissions" DROP CONSTRAINT "document_permissions_pkey",
DROP COLUMN "level",
DROP COLUMN "updated_at",
ADD COLUMN     "department_id" TEXT,
ADD COLUMN     "granted_by" TEXT NOT NULL,
ADD COLUMN     "id" TEXT NOT NULL,
ADD COLUMN     "permission" "DocumentPermission" NOT NULL,
ADD COLUMN     "revoked_at" TIMESTAMP(3),
ADD COLUMN     "status" "PermissionStatus" NOT NULL DEFAULT 'ACTIVE',
ALTER COLUMN "user_id" DROP NOT NULL,
ADD CONSTRAINT "document_permissions_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "document_versions" DROP COLUMN "checksum",
DROP COLUMN "object_key",
DROP COLUMN "size_bytes",
DROP COLUMN "uploaded_by",
DROP COLUMN "version",
ADD COLUMN     "change_description" TEXT,
ADD COLUMN     "created_by" TEXT NOT NULL,
ADD COLUMN     "file_size" BIGINT NOT NULL,
ADD COLUMN     "original_filename" TEXT NOT NULL,
ADD COLUMN     "sha256_hash" TEXT NOT NULL,
ADD COLUMN     "storage_key" TEXT NOT NULL,
ADD COLUMN     "version_number" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "documents" DROP COLUMN "current_version",
ADD COLUMN     "created_by" TEXT NOT NULL,
ADD COLUMN     "current_version_id" TEXT,
ADD COLUMN     "document_type" TEXT NOT NULL,
ADD COLUMN     "owner_department_id" TEXT NOT NULL;

-- DropEnum
DROP TYPE "DocumentPermissionLevel";

-- CreateTable
CREATE TABLE "processing_jobs" (
    "id" TEXT NOT NULL,
    "document_version_id" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'OCR',
    "status" "ProcessingJobStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "processing_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "processing_jobs_status_created_at_idx" ON "processing_jobs"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "audit_events_event_hash_key" ON "audit_events"("event_hash");

-- CreateIndex
CREATE INDEX "audit_events_user_id_idx" ON "audit_events"("user_id");

-- CreateIndex
CREATE INDEX "audit_events_version_id_idx" ON "audit_events"("version_id");

-- CreateIndex
CREATE INDEX "document_permissions_document_id_status_idx" ON "document_permissions"("document_id", "status");

-- CreateIndex
CREATE INDEX "document_permissions_department_id_idx" ON "document_permissions"("department_id");

-- CreateIndex
CREATE UNIQUE INDEX "document_versions_storage_key_key" ON "document_versions"("storage_key");

-- CreateIndex
CREATE INDEX "document_versions_created_by_idx" ON "document_versions"("created_by");

-- CreateIndex
CREATE UNIQUE INDEX "document_versions_document_id_version_number_key" ON "document_versions"("document_id", "version_number");

-- CreateIndex
CREATE UNIQUE INDEX "documents_current_version_id_key" ON "documents"("current_version_id");

-- CreateIndex
CREATE INDEX "documents_owner_department_id_idx" ON "documents"("owner_department_id");

-- CreateIndex
CREATE INDEX "documents_created_by_idx" ON "documents"("created_by");

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_owner_department_id_fkey" FOREIGN KEY ("owner_department_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_current_version_id_fkey" FOREIGN KEY ("current_version_id") REFERENCES "document_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_permissions" ADD CONSTRAINT "document_permissions_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_permissions" ADD CONSTRAINT "document_permissions_granted_by_fkey" FOREIGN KEY ("granted_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "document_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "processing_jobs" ADD CONSTRAINT "processing_jobs_document_version_id_fkey" FOREIGN KEY ("document_version_id") REFERENCES "document_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
