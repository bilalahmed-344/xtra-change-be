/*
  Warnings:

  - You are about to drop the column `code` on the `User` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "public"."User" DROP COLUMN "code",
ADD COLUMN     "phoneVerified" BOOLEAN NOT NULL DEFAULT false;
