export interface ApplicationBuildConfiguration {
  buildMode: 'shared' | 'tenant_specific'
  expectedTenantSlug?: string
  features: string[]
  themes: string[]
}

export interface ApplicationBuildMetadata {
  build_mode: 'shared' | 'tenant_specific'
  expected_tenant_slug?: string
  features: string[]
  themes: string[]
  experience_schema_version: number
  build_id: string
}

export function loadApplicationBuild(
  rootDir: string,
  tenantSlug?: string,
): Promise<ApplicationBuildConfiguration>

export function renderVirtualManifest(
  configuration: ApplicationBuildConfiguration,
  buildId: string,
): string

export function buildMetadata(
  configuration: ApplicationBuildConfiguration,
  buildId: string,
): ApplicationBuildMetadata
