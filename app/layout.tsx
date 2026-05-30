import type { Metadata } from "next";
import Link from "next/link";
import { PT_Serif } from "next/font/google";
import { getServerSession } from "next-auth";
import NextTopLoader from "nextjs-toploader";
import { PageMotion } from "@/app/components/page-motion";
import { ThemeToggle } from "@/app/components/theme-toggle";
import { authOptions } from "@/lib/auth-options";
import "./globals.css";

const ptSerif = PT_Serif({
  variable: "--font-pt-serif",
  weight: ["400", "700"],
  style: ["normal", "italic"],
  display: "swap",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "SLR Screening Platform",
  description: "Platform screening systematic literature review",
};

const themeInitScript = `
(() => {
  try {
    const key = "screening-theme";
    const stored = window.localStorage.getItem(key);
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const theme = stored === "dark" || stored === "light"
      ? stored
      : prefersDark
        ? "dark"
        : "light";

    const root = document.documentElement;
    root.classList.toggle("dark", theme === "dark");
    root.style.colorScheme = theme;
  } catch (_) {}
})();
`;

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await getServerSession(authOptions);
  const currentYear = new Date().getFullYear();
  const isAuthenticated = Boolean(session?.user?.id);

  return (
    <html
      lang="en"
      className={`${ptSerif.variable} ${ptSerif.className} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <NextTopLoader color="#0ea5e9" showSpinner={false} />
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        <ThemeToggle />
        <PageMotion className="flex-1">{children}</PageMotion>
        {isAuthenticated ? (
          <footer className="relative overflow-hidden border-t border-white/55 bg-gradient-to-b from-sky-200/45 via-sky-100/35 to-white/25 px-6 py-3 text-center text-sm text-slate-800/90 backdrop-blur-xl shadow-[inset_0_1px_0_rgba(255,255,255,0.8),0_-8px_24px_rgba(56,189,248,0.2)] dark:border-sky-300/20 dark:from-sky-900/35 dark:via-sky-900/20 dark:to-slate-900/10 dark:text-slate-200/90 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_-10px_30px_rgba(14,116,144,0.35)]">
            <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white/90 dark:bg-white/30" />
            <div className="pointer-events-none absolute left-1/2 top-0 h-10 w-2/3 -translate-x-1/2 rounded-full bg-cyan-100/45 blur-xl dark:bg-cyan-400/15" />
            <p className="relative z-10">
              Made with <span className="text-red-500">♥</span> by{" "}
              <Link
                href="https://www.linkedin.com/in/muhammad-akbar-596803201/"
                target="_blank"
                rel="noreferrer"
                className="font-semibold text-slate-900 underline-offset-4 hover:underline dark:text-slate-100"
              >
                Akbar
              </Link>
              . Copyright {currentYear}.
            </p>
          </footer>
        ) : null}
      </body>
    </html>
  );
}
