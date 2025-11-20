/*
  Warnings:

  - A unique constraint covering the columns `[stripeConnectId]` on the table `User` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "User_stripeConnectId_key" ON "public"."User"("stripeConnectId");
