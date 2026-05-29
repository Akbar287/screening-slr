"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { FormEvent, useState } from "react";
import { motion } from "framer-motion";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isRegistered = searchParams.get("registered") === "1";

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");
    setIsSubmitting(true);

    const result = await signIn("credentials", {
      username,
      password,
      redirect: false,
      callbackUrl: "/",
    });

    setIsSubmitting(false);

    if (!result || result.error) {
      setErrorMessage("Username atau password tidak valid.");
      return;
    }

    router.push("/");
    router.refresh();
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
          <CardTitle>Masuk ke Akun</CardTitle>
          <CardDescription>Lanjutkan proses screening literature review kamu.</CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {isRegistered ? (
            <Alert className="border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
              <AlertDescription>Registrasi berhasil. Silakan login.</AlertDescription>
            </Alert>
          ) : null}

          {errorMessage ? (
            <Alert className="border-destructive/40 bg-destructive/10 text-destructive">
              <AlertDescription>{errorMessage}</AlertDescription>
            </Alert>
          ) : null}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                name="username"
                type="text"
                required
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder="Masukkan username"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                name="password"
                type="password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="••••••••"
              />
            </div>

            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? "Memproses..." : "Login"}
            </Button>
          </form>

          <p className="text-sm text-muted-foreground">
            Belum punya akun?{" "}
            <Link href="/register" className="font-semibold text-primary underline-offset-4 hover:underline">
              Daftar di sini
            </Link>
          </p>
        </CardContent>
      </Card>
    </motion.div>
  );
}
