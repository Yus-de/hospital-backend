-- DropForeignKey
ALTER TABLE "public"."LabRequest" DROP CONSTRAINT "LabRequest_priceId_fkey";

-- AddForeignKey
ALTER TABLE "public"."LabRequest" ADD CONSTRAINT "LabRequest_priceId_fkey" FOREIGN KEY ("priceId") REFERENCES "public"."Price"("id") ON DELETE CASCADE ON UPDATE CASCADE;
