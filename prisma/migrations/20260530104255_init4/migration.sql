/*
  Warnings:

  - Changed the type of `file_md` on the `full_text` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- AlterTable
ALTER TABLE "full_text" DROP COLUMN "file_md",
ADD COLUMN     "file_md" BYTEA NOT NULL;
