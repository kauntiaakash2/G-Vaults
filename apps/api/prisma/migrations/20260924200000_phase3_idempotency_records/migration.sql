CREATE TYPE "IdempotencyStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED');

CREATE TABLE "idempotency_records" (
  "id" UUID NOT NULL,
  "user_id" TEXT NOT NULL,
  "scope" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "request_hash" TEXT NOT NULL,
  "status" "IdempotencyStatus" NOT NULL DEFAULT 'IN_PROGRESS',
  "response" JSONB,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "idempotency_records_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "idempotency_records_user_id_scope_key_key"
  ON "idempotency_records"("user_id", "scope", "key");
CREATE INDEX "idempotency_records_expires_at_idx"
  ON "idempotency_records"("expires_at");
