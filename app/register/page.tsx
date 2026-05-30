import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { createPageMetadata } from "@/lib/seo";
import { RegisterForm } from "./register-form";

export const metadata = createPageMetadata({
  title: "Register",
  description: "Buat akun baru untuk memulai proses screening systematic literature review.",
  path: "/register",
  keywords: ["register slr", "daftar screening references"],
  noIndex: true,
});

export default async function RegisterPage() {
  const session = await getServerSession(authOptions);

  if (session) {
    redirect("/");
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-zinc-100 px-4 py-12 dark:bg-zinc-950">
      <div className="pointer-events-none absolute -left-16 bottom-10 h-72 w-72 rounded-full bg-emerald-300/35 blur-3xl dark:bg-emerald-500/20" />
      <div className="pointer-events-none absolute -right-24 -top-16 h-72 w-72 rounded-full bg-cyan-300/30 blur-3xl dark:bg-cyan-500/20" />
      <RegisterForm />
    </div>
  );
}
