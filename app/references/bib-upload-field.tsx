"use client";

import { ChangeEvent, DragEvent, FormEvent, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { FileText, Trash2, UploadCloud } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type BibUploadFieldProps = {
  action?: (formData: FormData) => Promise<void>;
};

function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  const kb = bytes / 1024;
  if (kb < 1024) {
    return `${kb.toFixed(1)} KB`;
  }

  const mb = kb / 1024;
  return `${mb.toFixed(2)} MB`;
}

function fileSignature(file: File): string {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

function isBibFile(file: File): boolean {
  return file.name.toLowerCase().endsWith(".bib");
}

export function BibUploadField(_props: BibUploadFieldProps) {
  void _props.action;
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [invalidInfo, setInvalidInfo] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  const fileKeys = useMemo(() => new Set(files.map(fileSignature)), [files]);

  function addFiles(nextFiles: File[]) {
    if (nextFiles.length === 0) {
      return;
    }

    const acceptedFiles = nextFiles.filter(isBibFile);
    const rejectedCount = nextFiles.length - acceptedFiles.length;

    if (rejectedCount > 0) {
      setInvalidInfo(`${rejectedCount} file diabaikan karena bukan .bib`);
    } else {
      setInvalidInfo("");
    }

    if (acceptedFiles.length === 0) {
      return;
    }

    setFiles((prevFiles) => {
      const existing = new Set(prevFiles.map(fileSignature));
      const merged = [...prevFiles];

      for (const file of acceptedFiles) {
        const key = fileSignature(file);
        if (!existing.has(key)) {
          merged.push(file);
          existing.add(key);
        }
      }

      return merged;
    });
  }

  function handleFilePickerChange(event: ChangeEvent<HTMLInputElement>) {
    const pickedFiles = Array.from(event.target.files ?? []);
    addFiles(pickedFiles);
    event.target.value = "";
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragging(false);
    addFiles(Array.from(event.dataTransfer.files));
  }

  function removeFile(signature: string) {
    setFiles((prevFiles) => prevFiles.filter((file) => fileSignature(file) !== signature));
  }

  function clearFiles() {
    setFiles([]);
    setInvalidInfo("");
    setSubmitError("");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (files.length === 0 || fileKeys.size === 0) {
      return;
    }

    setSubmitError("");
    setIsSubmitting(true);

    try {
      const formData = new FormData();

      for (const file of files) {
        formData.append("bibFiles", file, file.name);
      }

      const response = await fetch("/api/references/import-bib", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        let message = "Upload BibTeX gagal diproses.";

        try {
          const payload = (await response.json()) as { message?: unknown };
          if (typeof payload.message === "string" && payload.message.trim()) {
            message = payload.message.trim();
          }
        } catch {
          // noop
        }

        setSubmitError(message);
        return;
      }

      clearFiles();
      router.push("/references");
      router.refresh();
    } catch {
      setSubmitError("Terjadi gangguan jaringan saat upload BibTeX.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <input
        ref={inputRef}
        type="file"
        name="bibFiles"
        accept=".bib,text/x-bibtex,text/plain"
        multiple
        className="hidden"
        onChange={handleFilePickerChange}
      />

      <div
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={cn(
          "cursor-pointer rounded-xl border border-dashed p-8 text-center transition",
          isDragging ? "border-primary bg-primary/10" : "border-border bg-muted/30 hover:bg-muted/50",
        )}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.2 }}
          className="mx-auto flex max-w-md flex-col items-center gap-3"
        >
          <UploadCloud className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Drag and drop file <span className="font-semibold text-foreground">.bib</span> atau
            <span className="font-semibold text-primary"> browse</span>
          </p>
        </motion.div>
      </div>

      {invalidInfo ? (
        <p className="text-xs text-amber-700 dark:text-amber-300">{invalidInfo}</p>
      ) : null}
      {submitError ? (
        <p className="text-xs text-rose-700 dark:text-rose-300">{submitError}</p>
      ) : null}

      <div className="space-y-2">
        <AnimatePresence initial={false}>
          {files.map((file) => {
            const key = fileSignature(file);

            return (
              <motion.div
                key={key}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <FileText className="h-5 w-5 shrink-0 text-primary" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{file.name}</p>
                    <p className="text-xs text-muted-foreground">{formatFileSize(file.size)}</p>
                  </div>
                </div>

                <Button type="button" variant="ghost" size="icon" onClick={() => removeFile(key)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      <div className="flex items-center justify-end gap-2">
        <Button type="button" variant="ghost" onClick={clearFiles} disabled={files.length === 0 || isSubmitting}>
          Cancel
        </Button>
        <Button type="submit" disabled={files.length === 0 || fileKeys.size === 0 || isSubmitting}>
          {isSubmitting ? "Mengimpor..." : "Add files"}
        </Button>
      </div>
    </form>
  );
}
