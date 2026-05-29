-- DropIndex
DROP INDEX "bib_references_user_id_citation_key_key";

-- CreateIndex
CREATE INDEX "bib_references_citation_key_idx" ON "bib_references"("citation_key");
