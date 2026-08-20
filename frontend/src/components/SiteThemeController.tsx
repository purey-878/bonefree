import { useEffect, useState } from "react";

import { getPublicSiteTheme } from "../services/siteSettingsService";
import { defaultSiteThemeResponse } from "../siteThemes";
import type { SiteThemeResponse, ThemeConfig } from "../types/siteSettings";
import ThemeDecorations from "./ThemeDecorations";

const THEME_STORAGE_KEY = "bonefree_site_theme";

function applySiteTheme(theme: SiteThemeResponse) {
  const { config } = theme;
  const { colors, ui } = config;
  const root = document.documentElement;

  root.style.setProperty("--brand-main", colors.primary);
  root.style.setProperty("--brand-accent", colors.accent);
  root.style.setProperty("--brand-secondary", colors.secondary);
  root.style.setProperty("--brand-deep", colors.background);
  root.style.setProperty("--brand-ink", colors.text);
  root.style.setProperty("--brand-muted", colors.textMuted);
  root.style.setProperty("--glass-border", colors.border);
  root.style.setProperty("--light-bg", colors.background);
  root.style.setProperty("--radius-sm", ui.borderRadius);
  root.style.setProperty("--shadow-glass", ui.cardShadow);
  root.style.setProperty("--theme-surface", colors.surface);
  root.style.setProperty("--theme-price-highlight", colors.priceHighlight);
  root.style.setProperty("--theme-background", config.background.value);
  root.style.setProperty("--theme-background-overlay", config.background.overlay || "transparent");
  root.style.setProperty("--brand-gradient", colors.primary);
  root.style.setProperty("--background-body", config.background.value);
  root.style.setProperty("--glass-bg", colors.surface);
  root.style.setProperty("--glass-bg-strong", colors.surface);

  document.body.dataset.siteTheme = theme.themeId;
  document.body.dataset.seasonalEffect = String(theme.decorationEnabled);
  document.body.dataset.themeButtonStyle = ui.buttonStyle;

  const headingFont = config.fonts?.heading;
  if (headingFont && !document.querySelector(`link[data-theme-font="${headingFont}"]`)) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.dataset.themeFont = headingFont;
    link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(headingFont).replace(/%20/g, "+")}:wght@400;700&display=swap`;
    document.head.appendChild(link);
  }
}

function readCachedTheme(): SiteThemeResponse | null {
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<SiteThemeResponse>) : null;
    return parsed?.config ? (parsed as SiteThemeResponse) : null;
  } catch {
    return null;
  }
}

export default function SiteThemeController() {
  const [theme, setTheme] = useState<SiteThemeResponse>(() => readCachedTheme() ?? defaultSiteThemeResponse);
  const [previousConfig, setPreviousConfig] = useState<ThemeConfig | null>(null);

  useEffect(() => {
    applySiteTheme(theme);
  }, [theme]);

  useEffect(() => {
    const applyFetchedTheme = (nextTheme: SiteThemeResponse) => {
      setTheme((current) => {
        if (JSON.stringify(current.config) !== JSON.stringify(nextTheme.config)) {
          setPreviousConfig(current.config);
          window.setTimeout(() => setPreviousConfig(null), 500);
        }
        return nextTheme;
      });
      localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(nextTheme));
      applySiteTheme(nextTheme);
    };

    const refreshTheme = () => {
      getPublicSiteTheme()
        .then(applyFetchedTheme)
        .catch(() => applyFetchedTheme(defaultSiteThemeResponse));
    };

    refreshTheme();
    const interval = window.setInterval(refreshTheme, 60000);
    window.addEventListener("siteThemeUpdated", refreshTheme);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("siteThemeUpdated", refreshTheme);
    };
  }, []);

  return (
    <>
      {previousConfig && <ThemeDecorations config={previousConfig} exiting />}
      <ThemeDecorations config={theme.config} />
    </>
  );
}
