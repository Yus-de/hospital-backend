-- CreateEnum
CREATE TYPE "public"."LabStatus" AS ENUM ('REQUESTED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "public"."PriceType" AS ENUM ('APPOINTMENT', 'LAB');

-- CreateTable
CREATE TABLE "public"."AppointmentNote" (
    "id" SERIAL NOT NULL,
    "appointmentId" INTEGER NOT NULL,
    "doctorId" INTEGER NOT NULL,
    "note" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppointmentNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."LabRequest" (
    "id" SERIAL NOT NULL,
    "appointmentId" INTEGER NOT NULL,
    "requestedByDoctorId" INTEGER NOT NULL,
    "testName" TEXT NOT NULL,
    "isPaid" BOOLEAN NOT NULL DEFAULT false,
    "status" "public"."LabStatus" NOT NULL DEFAULT 'REQUESTED',
    "result" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LabRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Price" (
    "id" SERIAL NOT NULL,
    "type" "public"."PriceType" NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Price_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Price_type_code_key" ON "public"."Price"("type", "code");

-- AddForeignKey
ALTER TABLE "public"."AppointmentNote" ADD CONSTRAINT "AppointmentNote_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "public"."Appointment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AppointmentNote" ADD CONSTRAINT "AppointmentNote_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "public"."Doctor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."LabRequest" ADD CONSTRAINT "LabRequest_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "public"."Appointment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."LabRequest" ADD CONSTRAINT "LabRequest_requestedByDoctorId_fkey" FOREIGN KEY ("requestedByDoctorId") REFERENCES "public"."Doctor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
