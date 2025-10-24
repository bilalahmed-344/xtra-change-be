/*
  Warnings:

  - You are about to drop the column `idCardBackSide` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `idCardFrontSide` on the `User` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "public"."User" DROP COLUMN "idCardBackSide",
DROP COLUMN "idCardFrontSide",
ADD COLUMN     "kycVerified" BOOLEAN NOT NULL DEFAULT false;
