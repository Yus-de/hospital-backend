/*
  Warnings:

  - You are about to drop the column `testName` on the `LabRequest` table. All the data in the column will be lost.
  - Added the required column `priceId` to the `LabRequest` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "public"."LabRequest" DROP COLUMN "testName",
ADD COLUMN     "priceId" INTEGER NOT NULL;

-- AddForeignKey
ALTER TABLE "public"."LabRequest" ADD CONSTRAINT "LabRequest_priceId_fkey" FOREIGN KEY ("priceId") REFERENCES "public"."Price"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
