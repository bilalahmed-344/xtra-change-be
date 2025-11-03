/*
  Warnings:

  - You are about to drop the column `plaidTransactionId` on the `ChargedTransaction` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "public"."ChargedTransaction" DROP CONSTRAINT "ChargedTransaction_plaidTransactionId_fkey";

-- DropIndex
DROP INDEX "public"."ChargedTransaction_plaidTransactionId_key";

-- AlterTable
ALTER TABLE "public"."ChargedTransaction" DROP COLUMN "plaidTransactionId",
ADD COLUMN     "failureReason" TEXT;
