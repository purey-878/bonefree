import type { ApplicationManifest } from './types'

const TENANT_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export function defineApplicationManifest(manifest: ApplicationManifest): ApplicationManifest {
  if (!Number.isInteger(manifest.experience_schema_version) || manifest.experience_schema_version < 1) {
    throw new Error('invalid_experience_schema_version')
  }
  if (
    manifest.build_mode === 'tenant_specific'
    && (!manifest.expected_tenant_slug || !TENANT_SLUG_PATTERN.test(manifest.expected_tenant_slug))
  ) {
    throw new Error('invalid_expected_tenant_slug')
  }
  if (manifest.build_mode === 'shared' && manifest.expected_tenant_slug) {
    throw new Error('shared_build_cannot_expect_tenant')
  }
  return Object.freeze(manifest)
}

export function validateDeploymentTenant(
  manifest: ApplicationManifest,
  resolvedTenantSlug: string,
): void {
  if (
    manifest.build_mode === 'tenant_specific'
    && manifest.expected_tenant_slug !== resolvedTenantSlug
  ) {
    throw new Error('deployment_tenant_mismatch')
  }
}

export function validateExperienceAgainstManifest(
  manifest: ApplicationManifest,
  experience: OrganizationExperienceShape,
): void {
  if (experience.schemaVersion !== manifest.experience_schema_version) {
    throw new Error('experience_schema_incompatible')
  }
  if (!manifest.theme_registry[experience.themeKey]) {
    throw new Error('theme_not_in_build')
  }
}

interface OrganizationExperienceShape {
  schemaVersion: number
  themeKey: string
}
