/*
  Warnings:

  - You are about to drop the column `destination` on the `RoundUpSetting` table. All the data in the column will be lost.
  - You are about to drop the column `enabled` on the `RoundUpSetting` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "public"."RoundUpSetting" DROP COLUMN "destination",
DROP COLUMN "enabled";

-- DropEnum
DROP TYPE "public"."RoundUpDestination";
