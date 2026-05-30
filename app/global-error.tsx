"use client";

import { useEffect } from "react";
import { ErrorStateCard } from "@/app/components/error-state-card";
import "./globals.css";

type GlobalErrorProps = {
  error: Error & { digest?: string };
  reset?: () => void;
  unstable_retry?: () => void;
};

export default function GlobalError({ error, reset, unstable_retry }: GlobalErrorProps) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  const retry = unstable_retry ?? reset ?? null;

  return (
    <html lang="id" suppressHydrationWarning>
      <body className="min-h-full bg-background text-foreground antialiased">
        <title>500 - Terjadi Kesalahan Sistem</title>
        <ErrorStateCard
          code="500"
          title="Kesalahan Sistem Global"
          description="Aplikasi mengalami gangguan pada level utama. Silakan coba lagi atau kembali ke halaman utama."
          detail={error.digest ?? null}
          onRetry={retry}
          retryLabel="Coba Ulang Sistem"
          showBackButton
        />
      </body>
    </html>
  );
}
