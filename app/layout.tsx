import type { Metadata } from "next";
import { PT_Serif } from "next/font/google";
import NextTopLoader from "nextjs-toploader";
import { PageMotion } from "@/app/components/page-motion";
import { ThemeToggle } from "@/app/components/theme-toggle";
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
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
      </body>
    </html>
  );
}
