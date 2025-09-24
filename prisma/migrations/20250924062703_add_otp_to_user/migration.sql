-- AlterTable
ALTER TABLE "public"."User" ADD COLUMN     "otpCode" TEXT,
ADD COLUMN     "otpExpiresAt" TIMESTAMP(3);
