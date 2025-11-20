-- AlterTable
ALTER TABLE "answers" ADD COLUMN     "manual_feedback" TEXT,
ADD COLUMN     "manual_score" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "submissions" ADD COLUMN     "bonus_awarded" DOUBLE PRECISION,
ADD COLUMN     "general_feedback" TEXT;
