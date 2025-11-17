/*
  Warnings:

  - A unique constraint covering the columns `[codigo]` on the table `courses` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `codigo` to the `courses` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updated_at` to the `courses` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "courses" ADD COLUMN     "codigo" TEXT NOT NULL,
ADD COLUMN     "creditos" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN     "descripcion" TEXT,
ADD COLUMN     "is_active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "semestre" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "exams" ADD COLUMN     "configuracion" JSONB,
ADD COLUMN     "descripcion" TEXT,
ADD COLUMN     "duracion_minutos" INTEGER,
ADD COLUMN     "fecha_apertura" TIMESTAMP(3),
ADD COLUMN     "fecha_cierre" TIMESTAMP(3),
ADD COLUMN     "intentos_permitidos" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "is_active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "puntuacion_maxima" DOUBLE PRECISION NOT NULL DEFAULT 100;

-- CreateTable
CREATE TABLE "course_enrollments" (
    "id" TEXT NOT NULL,
    "course_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "enrolled_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'active',
    "final_grade" DOUBLE PRECISION,

    CONSTRAINT "course_enrollments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "course_enrollments_course_id_student_id_key" ON "course_enrollments"("course_id", "student_id");

-- CreateIndex
CREATE UNIQUE INDEX "courses_codigo_key" ON "courses"("codigo");

-- AddForeignKey
ALTER TABLE "course_enrollments" ADD CONSTRAINT "course_enrollments_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_enrollments" ADD CONSTRAINT "course_enrollments_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
