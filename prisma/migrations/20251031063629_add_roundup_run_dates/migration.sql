-- AlterTable
ALTER TABLE "public"."RoundUpSetting" ADD COLUMN     "lastRunAt" TIMESTAMP(3),
ADD COLUMN     "nextRunAt" TIMESTAMP(3);
