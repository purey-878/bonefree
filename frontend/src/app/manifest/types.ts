import type { ComponentType, LazyExoticComponent } from 'react'

import type { OrganizationExperience, ResolvedTenantContext } from '../../organization/model/types'
import type { SiteThemeResponse } from '../../types/siteSettings'

export type BuildMode = 'shared' | 'tenant_specific'

export interface FeatureRoute {
  id: string
  path: string
  component: LazyExoticComponent<ComponentType>
  customer_protected?: boolean
  presentation?: 'main' | 'overlay'
}

export interface FeatureDefinition {
  key: string
  public_routes: readonly FeatureRoute[]
  admin_route_ids: readonly string[]
  section_types: readonly string[]
  navigation_route_ids: readonly string[]
}

export type FeatureRegistry = Readonly<Record<string, FeatureDefinition>>

export interface SectionRegistration {
  type: string
  feature_key: string | null
}

export type SectionRegistry = Readonly<Record<string, SectionRegistration>>

export interface ThemeDefinition {
  key: string
  supported_modes: readonly string[]
  supported_decoration_presets: readonly string[]
  default_section_variants: Readonly<Record<string, string>>
  default_component_variants: Readonly<Record<string, string>>
  load_default_site_theme: (mode?: string | null) => Promise<SiteThemeResponse>
  load_remote_site_theme?: () => Promise<SiteThemeResponse>
  legacy_cache_keys?: readonly string[]
  refresh_interval_ms?: number
}

export type ThemeRegistry = Readonly<Record<string, ThemeDefinition>>
export type OrganizationOverrideRegistry = Readonly<Record<string, unknown>>

export interface ConfigurationResolver {
  load(context: ResolvedTenantContext): Promise<OrganizationExperience>
}

export interface ApplicationManifest {
  build_mode: BuildMode
  expected_tenant_slug?: string
  build_id: string
  experience_schema_version: number
  feature_registry: FeatureRegistry
  section_registry: SectionRegistry
  theme_registry: ThemeRegistry
  override_registry: OrganizationOverrideRegistry
  configuration_resolver: ConfigurationResolver
}
