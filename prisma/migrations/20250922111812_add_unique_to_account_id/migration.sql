/*
  Warnings:

  - A unique constraint covering the columns `[accountId]` on the table `PlaidAccount` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "PlaidAccount_accountId_key" ON "public"."PlaidAccount"("accountId");
