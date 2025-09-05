-- CreateEnum
CREATE TYPE "public"."CardStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- AlterTable
ALTER TABLE "public"."Card" ADD COLUMN     "status" "public"."CardStatus" NOT NULL DEFAULT 'ACTIVE';
