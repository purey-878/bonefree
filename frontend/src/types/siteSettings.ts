export type SiteThemeId = "normal" | "presentation" | "christmas" | "halloween";
export type DecorationElement =
  | "snowflake"
  | "santa-hat"
  | "ghost"
  | "spider"
  | "spider-web"
  | "star"
  | "leaf"
  | "pumpkin"
  | "candy-cane"
  | "bauble"
  | "custom-svg";

export interface ThemeColors {
  primary: string;
  accent: string;
  secondary: string;
  background: string;
  surface: string;
  text: string;
  textMuted: string;
  border: string;
  priceHighlight: string;
}

export interface ThemeBackground {
  type: "solid" | "gradient" | "pattern";
  value: string;
  overlay?: string | null;
}

export interface ThemeDecoration {
  type: "floating" | "fixed" | "background-pattern";
  element: DecorationElement;
  customSvg?: string | null;
  count?: number | null;
  animation: "fall" | "float" | "sway" | "spin" | "fade-in-out" | "none";
  opacity: number;
  zIndex: "behind-content" | "above-content";
  size: "sm" | "md" | "lg" | "mixed";
  color?: string | null;
}

export interface ThemeConfig {
  id: SiteThemeId | string;
  name: string;
  colors: ThemeColors;
  background: ThemeBackground;
  decorations: ThemeDecoration[];
  fonts?: {
    heading?: string | null;
    body?: string | null;
  } | null;
  ui: {
    borderRadius: string;
    buttonStyle: "rounded" | "pill" | "sharp";
    cardShadow: string;
  };
}

export interface SiteThemeSettings {
  theme_id: SiteThemeId;
  colors: Partial<ThemeColors>;
  decoration_enabled: boolean;
  decoration_intensity: number;
  custom_decorations: unknown[];
  custom_name?: string | null;
}

export interface SiteThemeResponse extends SiteThemeSettings {
  config: ThemeConfig;
}

export interface ChefSpecialSettings {
  product_id?: number | null;
}

export interface LoyaltyCouponSettings {
  enabled: boolean;
  qualifying_order_count: number;
  qualifying_order_minimum: number | string;
  discount_type: "VALOR_FIXO" | "PERCENTAGEM";
  discount_value: number | string;
  coupon_minimum_order: number | string;
}

export interface CompanyDetailsSettings {
  brand_name: string;
  description: string;
  address: string;
  phone: string;
  email: string;
}

export type SocialPlatform = "facebook" | "instagram" | "whatsapp" | "youtube";

export interface SocialLinkSettings {
  platform: SocialPlatform;
  label: string;
  href: string;
  enabled: boolean;
}

export interface SocialMediaSettings {
  links: SocialLinkSettings[];
}

export interface EventItemSettings {
  id: string;
  title: string;
  kicker: string;
  description: string;
  date: string;
  start_time: string;
  end_time: string;
  image_url: string;
  enabled: boolean;
}

export interface EventsSettings {
  events: EventItemSettings[];
}
