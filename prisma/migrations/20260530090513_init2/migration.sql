-- CreateTable
CREATE TABLE "result_criteria" (
    "result_criteria_id" BIGSERIAL NOT NULL,
    "criteria_id" BIGINT NOT NULL,
    "result_id" BIGINT NOT NULL,
    "hasil" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "result_criteria_pkey" PRIMARY KEY ("result_criteria_id")
);

-- AddForeignKey
ALTER TABLE "result_criteria" ADD CONSTRAINT "result_criteria_result_id_fkey" FOREIGN KEY ("result_id") REFERENCES "results"("result_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "result_criteria" ADD CONSTRAINT "result_criteria_criteria_id_fkey" FOREIGN KEY ("criteria_id") REFERENCES "criteria"("criteria_id") ON DELETE CASCADE ON UPDATE CASCADE;
