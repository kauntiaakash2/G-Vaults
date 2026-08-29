ALTER TABLE "document_permissions"
ADD CONSTRAINT "document_permissions_exactly_one_principal"
CHECK (
  (("user_id" IS NOT NULL)::integer + ("department_id" IS NOT NULL)::integer) = 1
);

CREATE UNIQUE INDEX "document_permissions_active_user_key"
ON "document_permissions" ("document_id", "user_id", "permission")
WHERE "status" = 'ACTIVE' AND "user_id" IS NOT NULL;

CREATE UNIQUE INDEX "document_permissions_active_department_key"
ON "document_permissions" ("document_id", "department_id", "permission")
WHERE "status" = 'ACTIVE' AND "department_id" IS NOT NULL;
