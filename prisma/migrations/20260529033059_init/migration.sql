-- CreateEnum
CREATE TYPE "ResultStatus" AS ENUM ('Included', 'Excluded');

-- CreateTable
CREATE TABLE "users" (
    "user_id" BIGSERIAL NOT NULL,
    "nama" TEXT,
    "username" VARCHAR(128) NOT NULL,
    "password" VARCHAR(255) NOT NULL,
    "avatar" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "type_criteria" (
    "type_criteria_id" BIGSERIAL NOT NULL,
    "nama" TEXT NOT NULL,
    "deskripsi" TEXT,
    "logo" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "type_criteria_pkey" PRIMARY KEY ("type_criteria_id")
);

-- CreateTable
CREATE TABLE "criteria" (
    "criteria_id" BIGSERIAL NOT NULL,
    "nama" TEXT NOT NULL,
    "urutan" INTEGER,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "type_criteria_id" BIGINT NOT NULL,
    "user_id" BIGINT NOT NULL,

    CONSTRAINT "criteria_pkey" PRIMARY KEY ("criteria_id")
);

-- CreateTable
CREATE TABLE "bib_references" (
    "reference_id" BIGSERIAL NOT NULL,
    "user_id" BIGINT NOT NULL,
    "citation_key" TEXT NOT NULL,
    "entry_type" VARCHAR(50) NOT NULL,
    "title" TEXT,
    "year" SMALLINT,
    "month" VARCHAR(20),
    "journal" TEXT,
    "booktitle" TEXT,
    "publisher" TEXT,
    "institution" TEXT,
    "organization" TEXT,
    "school" TEXT,
    "volume" VARCHAR(50),
    "number" VARCHAR(50),
    "series" TEXT,
    "edition" VARCHAR(100),
    "chapter" VARCHAR(100),
    "pages" VARCHAR(100),
    "address" TEXT,
    "doi" TEXT,
    "isbn" VARCHAR(50),
    "issn" VARCHAR(50),
    "url" TEXT,
    "urldate" DATE,
    "note" TEXT,
    "abstract" TEXT,
    "keywords" TEXT,
    "language" VARCHAR(50),
    "type" VARCHAR(100),
    "howpublished" TEXT,
    "crossref" TEXT,
    "eprint" TEXT,
    "archive_prefix" VARCHAR(100),
    "primary_class" VARCHAR(100),
    "pmid" VARCHAR(50),
    "pmcid" VARCHAR(50),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "bib_references_pkey" PRIMARY KEY ("reference_id")
);

-- CreateTable
CREATE TABLE "results" (
    "result_id" BIGSERIAL NOT NULL,
    "hasil" "ResultStatus" NOT NULL,
    "justifikasi" TEXT NOT NULL,
    "ai" TEXT NOT NULL,
    "references_id" BIGINT NOT NULL,

    CONSTRAINT "results_pkey" PRIMARY KEY ("result_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE INDEX "criteria_user_id_idx" ON "criteria"("user_id");

-- CreateIndex
CREATE INDEX "criteria_type_criteria_id_idx" ON "criteria"("type_criteria_id");

-- CreateIndex
CREATE INDEX "bib_references_user_id_idx" ON "bib_references"("user_id");

-- CreateIndex
CREATE INDEX "bib_references_entry_type_idx" ON "bib_references"("entry_type");

-- CreateIndex
CREATE INDEX "bib_references_year_idx" ON "bib_references"("year");

-- CreateIndex
CREATE UNIQUE INDEX "bib_references_user_id_citation_key_key" ON "bib_references"("user_id", "citation_key");

-- CreateIndex
CREATE UNIQUE INDEX "results_references_id_key" ON "results"("references_id");

-- AddForeignKey
ALTER TABLE "criteria" ADD CONSTRAINT "criteria_type_criteria_id_fkey" FOREIGN KEY ("type_criteria_id") REFERENCES "type_criteria"("type_criteria_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "criteria" ADD CONSTRAINT "criteria_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bib_references" ADD CONSTRAINT "bib_references_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "results" ADD CONSTRAINT "results_references_id_fkey" FOREIGN KEY ("references_id") REFERENCES "bib_references"("reference_id") ON DELETE CASCADE ON UPDATE CASCADE;
