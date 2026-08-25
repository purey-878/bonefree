import { useEffect, useState } from "react";

import type { SiteThemeResponse, ThemeConfig } from "../types/siteSettings";
import ThemeDecorations from "./ThemeDecorations";
import { organizationStorage } from '../core/storage/organizationStorage'
import currentManifest from '../app/manifest/currentManifest'
import { useOrganization } from '../organization/context/organization-context'

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

function readCachedTheme(cacheKey: string): SiteThemeResponse | null {
  try {
    const raw = organizationStorage.getItem(cacheKey);
    const parsed = raw ? (JSON.parse(raw) as Partial<SiteThemeResponse>) : null;
    return parsed?.config ? (parsed as SiteThemeResponse) : null;
  } catch {
    return null;
  }
}

export default function SiteThemeController() {
  const { experience } = useOrganization()
  const themeConfiguration = experience.experience.theme
  const themeDefinition = currentManifest.theme_registry[themeConfiguration.key]
  const cacheKey = [
    'experience_theme',
    currentManifest.build_id,
    experience.schema_version,
    themeConfiguration.key,
  ].join(':')
  const [theme, setTheme] = useState<SiteThemeResponse | null>(() => (
    readCachedTheme(cacheKey)
    ?? themeDefinition.legacy_cache_keys
      ?.map(readCachedTheme)
      .find((cachedTheme): cachedTheme is SiteThemeResponse => cachedTheme !== null)
    ?? null
  ));
  const [previousConfig, setPreviousConfig] = useState<ThemeConfig | null>(null);

  useEffect(() => {
    if (theme) applySiteTheme(theme);
  }, [theme]);

  useEffect(() => {
    let active = true
    const applyFetchedTheme = (nextTheme: SiteThemeResponse) => {
      if (!active) return
      setTheme((current) => {
        if (current && JSON.stringify(current.config) !== JSON.stringify(nextTheme.config)) {
          setPreviousConfig(current.config);
          window.setTimeout(() => setPreviousConfig(null), 500);
        }
        return nextTheme;
      });
      organizationStorage.setItem(cacheKey, JSON.stringify(nextTheme));
      applySiteTheme(nextTheme);
    };

    const refreshTheme = async () => {
      const fallback = await themeDefinition.load_default_site_theme(themeConfiguration.mode)
      if (!themeDefinition.load_remote_site_theme) {
        applyFetchedTheme(fallback)
        return
      }
      try {
        applyFetchedTheme(await themeDefinition.load_remote_site_theme())
      } catch {
        applyFetchedTheme(fallback)
      }
    };

    void refreshTheme();
    const interval = themeDefinition.refresh_interval_ms
      ? window.setInterval(refreshTheme, themeDefinition.refresh_interval_ms)
      : undefined
    window.addEventListener("siteThemeUpdated", refreshTheme);
    return () => {
      active = false
      if (interval) window.clearInterval(interval);
      window.removeEventListener("siteThemeUpdated", refreshTheme);
    };
  }, [cacheKey, themeConfiguration.key, themeConfiguration.mode, themeDefinition]);

  return (
    <>
      {previousConfig && <ThemeDecorations config={previousConfig} exiting />}
      {theme && <ThemeDecorations config={theme.config} />}
    </>
  );
}
