export interface ResolvedOrganization {
  slug: string
  name: string
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
  opening_hours: Record<string, unknown>
  social_links: Record<string, unknown>
}

export interface OrganizationThemeConfiguration {
  key: string
  mode: string | null
  decoration_preset: string | null
  token_overrides: Record<string, string>
}

export interface NavigationItem {
  id: string
  route_id: string
  label: string
  enabled: boolean
}

export interface SectionDescriptor {
  id: string
  type: string
  enabled: boolean
  feature_key: string | null
  variant: string | null
  override_key: string | null
  props: Record<string, unknown>
}

export interface PageConfiguration {
  sections: SectionDescriptor[]
}

export interface OrganizationExperience {
  schema_version: number
  organization: ResolvedOrganization
  profile: OrganizationProfile
  capabilities: string[]
  experience: {
    theme: OrganizationThemeConfiguration
    assets: Record<string, string>
    navigation: NavigationItem[]
    pages: Record<string, PageConfiguration>
    variant_overrides: Record<string, string>
  }
}

export interface ResolvedTenantContext {
  organization: ResolvedOrganization
}
