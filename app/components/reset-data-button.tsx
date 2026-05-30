"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2, RotateCcw, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

type ResetResponsePayload = {
  message?: string;
};

export function ResetDataButton() {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  function closeDialog() {
    if (isSubmitting) {
      return;
    }

    setIsOpen(false);
    setErrorMessage("");
  }

  async function handleReset() {
    setIsSubmitting(true);
    setErrorMessage("");

    try {
      const response = await fetch("/api/reset-data", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });

      const payload = (await response.json()) as ResetResponsePayload;

      if (!response.ok) {
        throw new Error(payload.message || "Gagal melakukan reset data.");
      }

      setIsOpen(false);
      router.refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Gagal melakukan reset data.";
      setErrorMessage(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        onClick={() => setIsOpen(true)}
        className="gap-2 rounded-xl border-rose-300/60 bg-rose-50 text-rose-700 hover:bg-rose-100 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-200 dark:hover:bg-rose-500/20"
      >
        <RotateCcw className="h-4 w-4" />
        Reset
      </Button>

      <AnimatePresence>
        {isOpen ? (
          <motion.div
            key="reset-data-dialog"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
          >
            <div
              className="absolute inset-0 bg-black/60"
              onClick={closeDialog}
              aria-hidden="true"
            />

            <motion.div
              initial={{ opacity: 0, y: 16, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.98 }}
              transition={{ duration: 0.2 }}
              className="relative z-10 w-full max-w-lg rounded-2xl border border-border bg-card px-5 py-5 shadow-2xl"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-2">
                  <h3 className="text-lg font-semibold text-rose-600 dark:text-rose-300">
                    Reset Semua Data?
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Semua data dari seluruh model akan dihapus dan direset ulang. Data user tidak
                    akan dihapus. Tindakan ini tidak bisa dibatalkan.
                  </p>
                </div>
                <Button type="button" variant="ghost" size="icon" onClick={closeDialog} disabled={isSubmitting}>
                  <X className="h-4 w-4" />
                </Button>
              </div>

              {errorMessage ? (
                <p className="mt-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {errorMessage}
                </p>
              ) : null}

              <div className="mt-5 flex items-center justify-end gap-2">
                <Button type="button" variant="outline" onClick={closeDialog} disabled={isSubmitting}>
                  Batal
                </Button>
                <Button type="button" variant="destructive" onClick={handleReset} disabled={isSubmitting}>
                  {isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Mereset...
                    </>
                  ) : (
                    "Ya, Reset Semua"
                  )}
                </Button>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}
