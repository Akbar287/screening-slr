"use client";

import { useEffect } from "react";
import { ErrorStateCard } from "@/app/components/error-state-card";

type AppErrorProps = {
  error: Error & { digest?: string };
  reset?: () => void;
  unstable_retry?: () => void;
};

export default function AppError({ error, reset, unstable_retry }: AppErrorProps) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  const retry = unstable_retry ?? reset ?? null;

  return (
    <ErrorStateCard
      code="500"
      title="Terjadi Gangguan di Server"
      description="Proses tidak bisa diselesaikan saat ini. Coba lagi beberapa saat atau kembali ke halaman utama."
      detail={error.digest ?? null}
      onRetry={retry}
      retryLabel="Muat Ulang"
      showBackButton
    />
  );
}
