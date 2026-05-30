-- CreateTable
CREATE TABLE "full_text" (
    "full_text_id" BIGSERIAL NOT NULL,
    "result_id" BIGINT NOT NULL,
    "nama_file" TEXT NOT NULL,
    "file_md" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "full_text_pkey" PRIMARY KEY ("full_text_id")
);

-- CreateTable
CREATE TABLE "result_full_text" (
    "result_full_text_id" BIGSERIAL NOT NULL,
    "full_text_id" BIGINT NOT NULL,
    "justifikasi" TEXT NOT NULL DEFAULT '',
    "ai" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "result_full_text_pkey" PRIMARY KEY ("result_full_text_id")
);

-- CreateTable
CREATE TABLE "result_full_text_criteria" (
    "result_full_text_criteria_id" BIGSERIAL NOT NULL,
    "result_full_text_id" BIGINT NOT NULL,
    "criteria_id" BIGINT NOT NULL,
    "result" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "result_full_text_criteria_pkey" PRIMARY KEY ("result_full_text_criteria_id")
);

-- CreateIndex
CREATE INDEX "full_text_result_id_idx" ON "full_text"("result_id");

-- CreateIndex
CREATE INDEX "result_full_text_full_text_id_idx" ON "result_full_text"("full_text_id");

-- CreateIndex
CREATE INDEX "result_full_text_criteria_result_full_text_id_idx" ON "result_full_text_criteria"("result_full_text_id");

-- CreateIndex
CREATE INDEX "result_full_text_criteria_criteria_id_idx" ON "result_full_text_criteria"("criteria_id");

-- AddForeignKey
ALTER TABLE "full_text" ADD CONSTRAINT "full_text_result_id_fkey" FOREIGN KEY ("result_id") REFERENCES "results"("result_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "result_full_text" ADD CONSTRAINT "result_full_text_full_text_id_fkey" FOREIGN KEY ("full_text_id") REFERENCES "full_text"("full_text_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "result_full_text_criteria" ADD CONSTRAINT "result_full_text_criteria_result_full_text_id_fkey" FOREIGN KEY ("result_full_text_id") REFERENCES "result_full_text"("result_full_text_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "result_full_text_criteria" ADD CONSTRAINT "result_full_text_criteria_criteria_id_fkey" FOREIGN KEY ("criteria_id") REFERENCES "criteria"("criteria_id") ON DELETE CASCADE ON UPDATE CASCADE;
