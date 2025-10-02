/*
  Warnings:

  - You are about to drop the column `createdAt` on the `Withdrawal` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "public"."Withdrawal" DROP COLUMN "createdAt",
ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "failureReason" TEXT,
ADD COLUMN     "processedAt" TIMESTAMP(3),
ADD COLUMN     "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "stripeAccountId" TEXT;
