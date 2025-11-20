-- Add column and backfill existing records with secure URL fallback
ALTER TABLE "course_files" ADD COLUMN "download_url" TEXT;

UPDATE "course_files"
SET "download_url" = COALESCE("download_url", "file_path");

ALTER TABLE "course_files" ALTER COLUMN "download_url" SET NOT NULL;
