import Link from "next/link";
import { PT_Serif } from "next/font/google";
import { getServerSession } from "next-auth";
import Script from "next/script";
import NextTopLoader from "nextjs-toploader";
import { FloatingAiChatbot } from "@/app/components/floating-ai-chatbot";
import { PageMotion } from "@/app/components/page-motion";
import { ThemeToggle } from "@/app/components/theme-toggle";
import { authOptions } from "@/lib/auth-options";
import { createRootMetadata } from "@/lib/seo";
import "./globals.css";

const ptSerif = PT_Serif({
  variable: "--font-pt-serif",
  weight: ["400", "700"],
  style: ["normal", "italic"],
  display: "swap",
  subsets: ["latin"],
});

export const metadata = createRootMetadata();

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
      lang="id"
      className={`${ptSerif.variable} ${ptSerif.className} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <NextTopLoader color="#0ea5e9" showSpinner={false} />
        <Script id="theme-init" strategy="beforeInteractive">
          {themeInitScript}
        </Script>
        <ThemeToggle />
        {isAuthenticated ? <FloatingAiChatbot /> : null}
        <PageMotion className="flex-1">{children}</PageMotion>
        {isAuthenticated ? (
          <footer className="border-t border-slate-200/75 bg-white/70 px-6 py-3 text-center text-sm text-slate-800 backdrop-blur-md supports-[backdrop-filter]:bg-white/65 dark:border-white/10 dark:bg-slate-900/70 dark:text-slate-200">
            <p>
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
