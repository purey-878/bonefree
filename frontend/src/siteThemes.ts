import type { SiteThemeId, SiteThemeResponse, ThemeColors, ThemeConfig } from "./types/siteSettings";

export interface SiteThemePreset {
  id: SiteThemeId;
  name: string;
  description: string;
  swatches: string[];
  background: string;
  colors?: ThemeColors;
}

export const classicColors: ThemeColors = {
  primary: "#7BAF4B",
  accent: "#FDCD43",
  secondary: "#076050",
  background: "#f8faf6",
  surface: "#ffffff",
  text: "#17211d",
  textMuted: "#65746c",
  border: "#dfe8dc",
  priceHighlight: "#b42318",
};

export const presentationColors: ThemeColors = {
  primary: "#5f9636",
  accent: "#e0aa00",
  secondary: "#04483d",
  background: "#eef5ea",
  surface: "#ffffff",
  text: "#07110d",
  textMuted: "#334238",
  border: "#6f806f",
  priceHighlight: "#981b1b",
};

export const presentationThemeConfig: ThemeConfig = {
  id: "presentation",
  name: "Bonefree Apresentação",
  colors: presentationColors,
  background: {
    type: "gradient",
    value: "radial-gradient(circle at top left, rgba(224, 170, 0, 0.2), transparent 28rem), radial-gradient(circle at top right, rgba(95, 150, 54, 0.18), transparent 32rem), #eef5ea",
  },
  decorations: [],
  ui: {
    borderRadius: "8px",
    buttonStyle: "rounded",
    cardShadow: "0 18px 44px rgba(7, 17, 13, 0.18)",
  },
};

export const defaultThemeConfig: ThemeConfig = {
  id: "normal",
  name: "Bonefree Clássico",
  colors: classicColors,
  background: {
    type: "gradient",
    value: "radial-gradient(circle at top left, rgba(253, 205, 67, 0.12), transparent 30rem), radial-gradient(circle at top right, rgba(123, 175, 75, 0.1), transparent 34rem), #f8faf6",
  },
  decorations: [],
  ui: {
    borderRadius: "8px",
    buttonStyle: "rounded",
    cardShadow: "0 18px 48px rgba(23, 33, 29, 0.1)",
  },
};

export const defaultSiteThemeResponse: SiteThemeResponse = {
  themeId: "normal",
  colors: {},
  decorationEnabled: true,
  decorationIntensity: 2,
  customDecorations: [],
  customName: null,
  config: defaultThemeConfig,
};

export const siteThemePresets: SiteThemePreset[] = [
  {
    id: "normal",
    name: "Bonefree Clássico",
    description: "Verde e amarelo originais da BONEFREE, limpo e minimalista.",
    swatches: ["#f8faf6", "#7BAF4B", "#FDCD43"],
    background: "#f8faf6",
    colors: classicColors,
  },
  {
    id: "presentation",
    name: "Bonefree Apresentação",
    description: "Cores clássicas da BONEFREE com contraste mais forte para projetores 1080p.",
    swatches: ["#eef5ea", "#5f9636", "#e0aa00"],
    background: "#eef5ea",
    colors: presentationColors,
  },
  {
    id: "christmas",
    name: "Natal",
    description: "Realces festivos quentes com decoração sazonal suave.",
    swatches: ["#f8f4ea", "#a83232", "#2f6f4e"],
    background: "#f8f4ea",
  },
  {
    id: "halloween",
    name: "Halloween",
    description: "Ambiente suave de Halloween com superfícies quentes e legíveis.",
    swatches: ["#f7f0e8", "#b45309", "#7c3aed"],
    background: "#f7f0e8",
  },
];

export function themePresetById(id: SiteThemeId) {
  return siteThemePresets.find((preset) => preset.id === id) ?? siteThemePresets[0];
}
