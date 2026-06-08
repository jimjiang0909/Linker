-- AlterTable: Add updatedAt to verification_codes
ALTER TABLE "verification_codes" ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
