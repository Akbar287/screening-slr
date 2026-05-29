"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { motion } from "framer-motion";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type RegisterResponse = {
  message?: string;
};

export function RegisterForm() {
  const router = useRouter();

  const [nama, setNama] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");

    if (password !== confirmPassword) {
      setErrorMessage("Konfirmasi password tidak cocok.");
      return;
    }

    setIsSubmitting(true);

    const response = await fetch("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nama, username, password }),
    });

    const payload = (await response.json()) as RegisterResponse;
    setIsSubmitting(false);

    if (!response.ok) {
      setErrorMessage(payload.message ?? "Registrasi gagal.");
      return;
    }

    router.push("/login?registered=1");
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="w-full max-w-md"
    >
      <Card className="border-border/70 bg-card/95 shadow-xl backdrop-blur">
        <CardHeader>
          <CardTitle>Buat Akun Baru</CardTitle>
          <CardDescription>Daftar untuk mulai proses seleksi artikel SLR.</CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {errorMessage ? (
            <Alert className="border-destructive/40 bg-destructive/10 text-destructive">
              <AlertDescription>{errorMessage}</AlertDescription>
            </Alert>
          ) : null}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="nama">Nama (opsional)</Label>
              <Input
                id="nama"
                name="nama"
                type="text"
                value={nama}
                onChange={(event) => setNama(event.target.value)}
                placeholder="Nama lengkap"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                name="username"
                type="text"
                minLength={3}
                required
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder="Minimal 3 karakter"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                name="password"
                type="password"
                minLength={6}
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Minimal 6 karakter"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Konfirmasi Password</Label>
              <Input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                minLength={6}
                required
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                placeholder="Ulangi password"
              />
            </div>

            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? "Menyimpan..." : "Register"}
            </Button>
          </form>

          <p className="text-sm text-muted-foreground">
            Sudah punya akun?{" "}
            <Link href="/login" className="font-semibold text-primary underline-offset-4 hover:underline">
              Login di sini
            </Link>
          </p>
        </CardContent>
      </Card>
    </motion.div>
  );
}
