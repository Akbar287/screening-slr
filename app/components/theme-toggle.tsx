"use client";

import { Moon, SunMedium } from "lucide-react";
import { motion } from "framer-motion";
import { useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";

type ThemeMode = "light" | "dark";

const THEME_STORAGE_KEY = "screening-theme";
const EMPTY_SUBSCRIBE = () => () => {};
const CLIENT_HYDRATED_SNAPSHOT = () => true;
const SERVER_HYDRATED_SNAPSHOT = () => false;

function setDocumentTheme(theme: ThemeMode) {
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  root.style.colorScheme = theme;
}

export function ThemeToggle() {
  const isHydrated = useSyncExternalStore(
    EMPTY_SUBSCRIBE,
    CLIENT_HYDRATED_SNAPSHOT,
    SERVER_HYDRATED_SNAPSHOT,
  );
  const [isDark, setIsDark] = useState(false);
  const effectiveIsDark = isHydrated
    ? document.documentElement.classList.contains("dark")
    : isDark;

  function toggleTheme() {
    const currentTheme: ThemeMode = document.documentElement.classList.contains("dark")
      ? "dark"
      : "light";

    const nextTheme: ThemeMode = currentTheme === "dark" ? "light" : "dark";
    setDocumentTheme(nextTheme);
    window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
    setIsDark(nextTheme === "dark");
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className="fixed right-4 top-4 z-50 sm:right-6 sm:top-6"
    >
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={toggleTheme}
        className="gap-2 rounded-xl bg-card/90 backdrop-blur"
        aria-label="Ubah tema"
      >
        {effectiveIsDark ? <SunMedium className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        Theme
      </Button>
    </motion.div>
  );
}
