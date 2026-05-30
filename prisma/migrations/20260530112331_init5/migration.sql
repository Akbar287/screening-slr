/*
  Warnings:

  - Added the required column `file_pdf` to the `full_text` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "full_text" ADD COLUMN     "file_pdf" BYTEA NOT NULL;
