ALTER TABLE "documents" ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "document_permissions" ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "legal_holds" ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 0;

-- Close duplicate active grants deterministically before enforcing the
-- database invariant. The oldest active grant remains authoritative.
WITH ranked_department_grants AS (
  SELECT "id",
         ROW_NUMBER() OVER (
           PARTITION BY "document_id", "department_id", "permission"
           ORDER BY "created_at", "id"
         ) AS position
  FROM "document_permissions"
  WHERE "status" = 'ACTIVE' AND "department_id" IS NOT NULL
)
UPDATE "document_permissions" AS permission
SET "status" = 'REVOKED',
    "revoked_at" = CURRENT_TIMESTAMP,
    "revoke_reason" = 'Superseded duplicate active grant during concurrency migration',
    "revision" = "revision" + 1
FROM ranked_department_grants
WHERE permission."id" = ranked_department_grants."id"
  AND ranked_department_grants.position > 1;

WITH ranked_user_grants AS (
  SELECT "id",
         ROW_NUMBER() OVER (
           PARTITION BY "document_id", "user_id", "permission"
           ORDER BY "created_at", "id"
         ) AS position
  FROM "document_permissions"
  WHERE "status" = 'ACTIVE' AND "user_id" IS NOT NULL
)
UPDATE "document_permissions" AS permission
SET "status" = 'REVOKED',
    "revoked_at" = CURRENT_TIMESTAMP,
    "revoke_reason" = 'Superseded duplicate active grant during concurrency migration',
    "revision" = "revision" + 1
FROM ranked_user_grants
WHERE permission."id" = ranked_user_grants."id"
  AND ranked_user_grants.position > 1;

-- The application already rejected duplicate active holds. Retain the oldest
-- if historical concurrency produced more than one before this constraint.
WITH ranked_holds AS (
  SELECT "id",
         ROW_NUMBER() OVER (
           PARTITION BY "document_id"
           ORDER BY "placed_at", "id"
         ) AS position
  FROM "legal_holds"
  WHERE "status" = 'ACTIVE'
)
UPDATE "legal_holds" AS hold
SET "status" = 'RELEASED',
    "released_at" = CURRENT_TIMESTAMP,
    "release_reason" = 'Superseded duplicate active hold during concurrency migration',
    "revision" = "revision" + 1
FROM ranked_holds
WHERE hold."id" = ranked_holds."id" AND ranked_holds.position > 1;

CREATE UNIQUE INDEX "document_permissions_active_department_capability_key"
  ON "document_permissions"("document_id", "department_id", "permission")
  WHERE "status" = 'ACTIVE' AND "department_id" IS NOT NULL;

CREATE UNIQUE INDEX "document_permissions_active_user_capability_key"
  ON "document_permissions"("document_id", "user_id", "permission")
  WHERE "status" = 'ACTIVE' AND "user_id" IS NOT NULL;

CREATE UNIQUE INDEX "legal_holds_one_active_per_document_key"
  ON "legal_holds"("document_id")
  WHERE "status" = 'ACTIVE';
