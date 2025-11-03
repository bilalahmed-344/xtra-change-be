-- CreateEnum
CREATE TYPE "public"."ChargedStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILED', 'INSUFFICIENT_FUNDS', 'CARD_DECLINED', 'RETRY_PENDING');

-- CreateTable
CREATE TABLE "public"."ChargedTransaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "plaidTransactionId" TEXT NOT NULL,
    "chargedAmount" DOUBLE PRECISION NOT NULL,
    "stripePaymentIntentId" TEXT,
    "cardId" TEXT,
    "status" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChargedTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ChargedTransaction_plaidTransactionId_key" ON "public"."ChargedTransaction"("plaidTransactionId");

-- AddForeignKey
ALTER TABLE "public"."ChargedTransaction" ADD CONSTRAINT "ChargedTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ChargedTransaction" ADD CONSTRAINT "ChargedTransaction_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "public"."Card"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ChargedTransaction" ADD CONSTRAINT "ChargedTransaction_plaidTransactionId_fkey" FOREIGN KEY ("plaidTransactionId") REFERENCES "public"."PlaidTransaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;
