-- CreateEnum
CREATE TYPE "public"."RoundUpStatus" AS ENUM ('PENDING', 'INVESTED', 'FAILED');

-- CreateTable
CREATE TABLE "public"."RoundUpTransaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "plaidTransactionId" TEXT NOT NULL,
    "roundUpAmount" DOUBLE PRECISION NOT NULL,
    "status" "public"."RoundUpStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RoundUpTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RoundUpTransaction_plaidTransactionId_key" ON "public"."RoundUpTransaction"("plaidTransactionId");

-- AddForeignKey
ALTER TABLE "public"."RoundUpTransaction" ADD CONSTRAINT "RoundUpTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RoundUpTransaction" ADD CONSTRAINT "RoundUpTransaction_plaidTransactionId_fkey" FOREIGN KEY ("plaidTransactionId") REFERENCES "public"."PlaidTransaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;
