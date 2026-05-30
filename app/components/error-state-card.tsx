"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { AlertTriangle, ArrowLeft, Home, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type ErrorStateCardProps = {
  code: string;
  title: string;
  description: string;
  detail?: string | null;
  retryLabel?: string;
  onRetry?: (() => void) | null;
  homeHref?: string;
  showBackButton?: boolean;
};

export function ErrorStateCard({
  code,
  title,
  description,
  detail,
  retryLabel = "Coba Lagi",
  onRetry = null,
  homeHref = "/",
  showBackButton = true,
}: ErrorStateCardProps) {
  const router = useRouter();

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-zinc-100 px-4 py-12 dark:bg-zinc-950">
      <div className="pointer-events-none absolute -left-16 -top-16 h-72 w-72 rounded-full bg-cyan-300/35 blur-3xl dark:bg-cyan-500/20" />
      <div className="pointer-events-none absolute -right-16 bottom-0 h-72 w-72 rounded-full bg-amber-300/30 blur-3xl dark:bg-amber-500/20" />
      <div className="pointer-events-none absolute bottom-14 left-1/2 h-64 w-64 -translate-x-1/2 rounded-full bg-emerald-300/25 blur-3xl dark:bg-emerald-500/15" />

      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
        className="w-full max-w-2xl"
      >
        <Card className="border-border/70 bg-card/95 shadow-2xl backdrop-blur">
          <CardHeader className="space-y-3">
            <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
              <AlertTriangle className="h-5 w-5" />
              <span className="text-sm font-semibold uppercase tracking-[0.16em]">Terjadi Kesalahan</span>
            </div>
            <CardTitle className="text-3xl font-black leading-tight sm:text-4xl">
              {code} • {title}
            </CardTitle>
            <CardDescription className="text-base leading-relaxed">{description}</CardDescription>
          </CardHeader>

          <CardContent className="space-y-5">
            {detail ? (
              <div className="rounded-lg border border-zinc-300/70 bg-zinc-50/90 px-4 py-3 text-sm text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900/70 dark:text-zinc-300">
                <p className="font-semibold">Kode error</p>
                <p className="mt-1 break-all font-mono text-xs">{detail}</p>
              </div>
            ) : null}

            <div className="flex flex-wrap gap-2">
              {onRetry ? (
                <Button type="button" onClick={onRetry}>
                  <RotateCcw className="h-4 w-4" />
                  {retryLabel}
                </Button>
              ) : null}

              {showBackButton ? (
                <Button type="button" variant="outline" onClick={() => router.back()}>
                  <ArrowLeft className="h-4 w-4" />
                  Kembali
                </Button>
              ) : null}

              <Button asChild variant="secondary">
                <Link href={homeHref}>
                  <Home className="h-4 w-4" />
                  Ke Halaman Utama
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </main>
  );
}
