-- AlterTable
ALTER TABLE "users" ADD COLUMN "password" VARCHAR(100);

-- AlterTable
ALTER TABLE "profiles" ALTER COLUMN "city" TYPE VARCHAR(100);
