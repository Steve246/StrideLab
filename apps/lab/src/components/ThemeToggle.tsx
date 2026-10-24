"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const STORAGE_KEY = "stridelab-theme";

type ThemeMode = "light" | "dark" | "system";

function resolveDark(mode: ThemeMode) {
  if (mode === "dark") return true;
  if (mode === "light") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function applyTheme(mode: ThemeMode) {
  document.documentElement.classList.toggle("dark", resolveDark(mode));
  document.documentElement.dataset.theme = mode;
}

export function readStoredTheme(): ThemeMode {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === "light" || raw === "dark" || raw === "system") return raw;
  } catch {
    // ignore
  }
  return "system";
}

export function ThemeToggle() {
  const [mode, setMode] = useState<ThemeMode>("system");
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const stored = readStoredTheme();
    setMode(stored);
    setDark(resolveDark(stored));
    applyTheme(stored);

    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      const current = readStoredTheme();
      if (current === "system") {
        setDark(mq.matches);
        applyTheme("system");
      }
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  function cycle() {
    const order: ThemeMode[] = ["system", "light", "dark"];
    const next = order[(order.indexOf(mode) + 1) % order.length] ?? "system";
    setMode(next);
    setDark(resolveDark(next));
    applyTheme(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // ignore
    }
  }

  const ariaLabel =
    mode === "system" ? "Theme: system" : mode === "dark" ? "Theme: dark" : "Theme: light";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="lab-rail-icon-btn"
          onClick={cycle}
          aria-label={ariaLabel}
        >
          {dark ? (
            <Moon className="size-4" strokeWidth={1.75} />
          ) : (
            <Sun className="size-4" strokeWidth={1.75} />
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="right">Theme</TooltipContent>
    </Tooltip>
  );
}
