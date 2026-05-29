import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  const session = await getServerSession(authOptions);

  if (session) {
    redirect("/");
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-zinc-100 px-4 py-12 dark:bg-zinc-950">
      <div className="pointer-events-none absolute -left-20 -top-24 h-72 w-72 rounded-full bg-cyan-300/35 blur-3xl dark:bg-cyan-500/20" />
      <div className="pointer-events-none absolute -right-24 bottom-0 h-72 w-72 rounded-full bg-amber-300/30 blur-3xl dark:bg-amber-500/15" />
      <LoginForm />
    </div>
  );
}
