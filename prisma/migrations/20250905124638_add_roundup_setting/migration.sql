/*
  Warnings:

  - A unique constraint covering the columns `[stripeCardId]` on the table `Card` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "public"."PaymentFrequency" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY');

-- CreateEnum
CREATE TYPE "public"."RoundUpDestination" AS ENUM ('SAVINGS', 'INVESTMENT', 'CHARITY');

-- AlterTable
ALTER TABLE "public"."Card" ADD COLUMN     "isDefault" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "public"."RoundUpSetting" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "paymentFrequency" "public"."PaymentFrequency" NOT NULL DEFAULT 'DAILY',
    "roundUpLimit" DOUBLE PRECISION,
    "destination" "public"."RoundUpDestination" NOT NULL DEFAULT 'SAVINGS',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RoundUpSetting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RoundUpSetting_userId_key" ON "public"."RoundUpSetting"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Card_stripeCardId_key" ON "public"."Card"("stripeCardId");

-- AddForeignKey
ALTER TABLE "public"."RoundUpSetting" ADD CONSTRAINT "RoundUpSetting_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
