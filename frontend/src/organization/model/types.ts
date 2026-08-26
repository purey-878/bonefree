export interface ResolvedOrganization {
  slug: string
  name: string
}

export type FeatureKey =
  | 'catalog'
  | 'customer_accounts'
  | 'ordering'
  | 'reviews'
  | 'loyalty'
  | 'events'

export type NavigationRouteId =
  | 'home'
  | 'menu'
  | 'about'
  | 'contact'
  | 'profile'
  | 'cart'
  | 'orders'
  | 'events'

export type SectionType =
  | 'hero'
  | 'category_navigation'
  | 'loyalty'
  | 'popular_products'
  | 'chef_special'
  | 'reviews'
  | 'events'

export interface OpeningHoursPeriod {
  opens_at: string
  closes_at: string
}

export interface OpeningHours {
  monday?: OpeningHoursPeriod[]
  tuesday?: OpeningHoursPeriod[]
  wednesday?: OpeningHoursPeriod[]
  thursday?: OpeningHoursPeriod[]
  friday?: OpeningHoursPeriod[]
  saturday?: OpeningHoursPeriod[]
  sunday?: OpeningHoursPeriod[]
}

export type SocialPlatform = 'facebook' | 'instagram' | 'whatsapp' | 'youtube'

export interface OrganizationSocialLink {
  platform: SocialPlatform
  label: string
  href: string
  enabled: boolean
}

export interface OrganizationSocialLinks {
  links: OrganizationSocialLink[]
}

export interface OrganizationProfile {
  display_name: string | null
  description: string | null
  about_text: string | null
  email: string | null
  phone: string | null
  address_line_1: string | null
  address_line_2: string | null
  city: string | null
  postal_code: string | null
  country: string
  logo_url: string | null
  currency_code: string
  opening_hours: OpeningHours
  social_links: OrganizationSocialLinks
}

export interface ThemeTokenOverrides {
  primary?: string
  accent?: string
  secondary?: string
  background?: string
  surface?: string
  text?: string
  text_muted?: string
  border?: string
  price_highlight?: string
}

export interface OrganizationThemeConfiguration {
  key: string
  mode: string | null
  decoration_preset: string | null
  token_overrides: ThemeTokenOverrides
}

export interface NavigationItem {
  id: string
  route_id: NavigationRouteId
  label: string
  enabled: boolean
}

export interface SectionDescriptor {
  id: string
  type: SectionType
  enabled: boolean
  feature_key: FeatureKey | null
  variant: string | null
  override_key: string | null
  props: Record<string, SectionPropertyValue>
}

export type SectionPropertyScalar = string | number | boolean | null
export type SectionPropertyValue = SectionPropertyScalar | SectionPropertyScalar[]

export interface PageConfiguration {
  sections: SectionDescriptor[]
}

export interface ExperienceAssets {
  logo?: string
}

export interface ExperiencePages {
  home?: PageConfiguration
}

export interface VariantOverrides {
  hero?: string
  category_navigation?: string
  loyalty?: string
  popular_products?: string
  chef_special?: string
  reviews?: string
  events?: string
}

export interface OrganizationExperience {
  schema_version: number
  organization: ResolvedOrganization
  profile: OrganizationProfile
  capabilities: FeatureKey[]
  experience: {
    theme: OrganizationThemeConfiguration
    assets: ExperienceAssets
    navigation: NavigationItem[]
    pages: ExperiencePages
    variant_overrides: VariantOverrides
  }
}

export interface ResolvedTenantContext {
  organization: ResolvedOrganization
}
