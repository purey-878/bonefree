import { describe, expect, it, vi } from 'vitest'

import {
  defineApplicationManifest,
  validateDeploymentTenant,
  validateExperienceAgainstManifest,
} from './defineApplicationManifest'
import { renderVirtualManifest } from '../../../build/scripts/application-manifest.mjs'

function manifest(buildMode: 'shared' | 'tenant_specific', expectedTenantSlug?: string) {
  return defineApplicationManifest({
    build_mode: buildMode,
    ...(expectedTenantSlug ? { expected_tenant_slug: expectedTenantSlug } : {}),
    build_id: 'test',
    experience_schema_version: 1,
    feature_registry: {},
    section_registry: {},
    theme_registry: {
      base: {
        key: 'base',
        supported_modes: ['default'],
        supported_decoration_presets: [],
        default_section_variants: {},
        default_component_variants: {},
        load_default_site_theme: vi.fn(),
      },
    },
    override_registry: {},
    configuration_resolver: { load: vi.fn() },
  })
}

describe('application manifest', () => {
  it('accepts every resolved tenant in shared mode', () => {
    expect(() => validateDeploymentTenant(manifest('shared'), 'second')).not.toThrow()
  })

  it('rejects a tenant-specific artifact on another resolved tenant', () => {
    expect(() => validateDeploymentTenant(manifest('tenant_specific', 'bonefree'), 'second'))
      .toThrowError('deployment_tenant_mismatch')
  })

  it('rejects a theme that is not compiled into the artifact', () => {
    expect(() => validateExperienceAgainstManifest(manifest('shared'), {
      schemaVersion: 1,
      themeKey: 'missing',
    }))
      .toThrowError('theme_not_in_build')
  })

  it('rejects an experience schema unsupported by the artifact', () => {
    expect(() => validateExperienceAgainstManifest(manifest('shared'), {
      schemaVersion: 2,
      themeKey: 'base',
    })).toThrowError('experience_schema_incompatible')
  })

  it('generates imports only for catalog entries selected by the build target', () => {
    const source = renderVirtualManifest({
      buildMode: 'tenant_specific',
      expectedTenantSlug: 'bonefree',
      features: ['catalog'],
      themes: ['bonefree'],
    }, 'test-build')

    expect(source).toContain('/src/features/catalog/definition.ts')
    expect(source).toContain('/src/themes/bonefree/definition.ts')
    expect(source).not.toContain('/src/features/events/definition.ts')
    expect(source).not.toContain('/src/themes/base/definition.ts')
  })
})
