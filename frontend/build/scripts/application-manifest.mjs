import { readFile } from 'node:fs/promises'
import path from 'node:path'

import { featureCatalog } from '../catalog/features.mjs'
import { themeCatalog } from '../catalog/themes.mjs'

const TENANT_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

function assertCatalogEntries(kind, keys, catalog) {
  const duplicates = keys.filter((key, index) => keys.indexOf(key) !== index)
  if (duplicates.length) {
    throw new Error(`Duplicate ${kind} entries: ${[...new Set(duplicates)].join(', ')}`)
  }
  const unknown = keys.filter((key) => !catalog[key])
  if (unknown.length) throw new Error(`Unknown ${kind} entries: ${unknown.join(', ')}`)
}

export async function loadApplicationBuild(rootDir, tenantSlug) {
  if (!tenantSlug) {
    return {
      buildMode: 'shared',
      expectedTenantSlug: undefined,
      features: Object.keys(featureCatalog),
      themes: Object.keys(themeCatalog),
    }
  }
  if (!TENANT_SLUG_PATTERN.test(tenantSlug)) {
    throw new Error('Tenant build slug must contain only lowercase letters, numbers, and hyphens.')
  }

  const targetPath = path.join(rootDir, 'build', 'targets', `${tenantSlug}.json`)
  let target
  try {
    target = JSON.parse(await readFile(targetPath, 'utf8'))
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') {
      throw new Error(`Build target '${tenantSlug}' was not found.`)
    }
    throw error
  }

  if (
    target.tenant !== tenantSlug
    || !Array.isArray(target.features)
    || !Array.isArray(target.themes)
    || target.configuration_source !== 'remote'
  ) {
    throw new Error(`Build target '${tenantSlug}' is invalid.`)
  }
  assertCatalogEntries('feature', target.features, featureCatalog)
  assertCatalogEntries('theme', target.themes, themeCatalog)
  if (!target.features.length || !target.themes.length) {
    throw new Error(`Build target '${tenantSlug}' must include at least one feature and theme.`)
  }

  return {
    buildMode: 'tenant_specific',
    expectedTenantSlug: tenantSlug,
    features: target.features,
    themes: target.themes,
  }
}

export function renderVirtualManifest(configuration, buildId) {
  const imports = [
    "import { defineApplicationManifest } from '/src/app/manifest/defineApplicationManifest.ts'",
    "import { createSectionRegistry } from '/src/sections/registry.ts'",
    "import { remoteConfigurationResolver } from '/src/organization/experience/remoteConfigurationResolver.ts'",
  ]
  for (const key of configuration.features) {
    const definition = featureCatalog[key]
    imports.push(`import { ${definition.exportName} } from '${definition.specifier}'`)
  }
  for (const key of configuration.themes) {
    const definition = themeCatalog[key]
    imports.push(`import { ${definition.exportName} } from '${definition.specifier}'`)
  }

  const featureEntries = configuration.features
    .map((key) => `${JSON.stringify(key)}: ${featureCatalog[key].exportName}`)
    .join(',\n    ')
  const themeEntries = configuration.themes
    .map((key) => `${JSON.stringify(key)}: ${themeCatalog[key].exportName}`)
    .join(',\n    ')
  const expectedTenant = configuration.expectedTenantSlug
    ? `\n  expected_tenant_slug: ${JSON.stringify(configuration.expectedTenantSlug)},`
    : ''

  return `${imports.join('\n')}

const featureRegistry = {
  ${featureEntries}
}

export default defineApplicationManifest({
  build_mode: ${JSON.stringify(configuration.buildMode)},${expectedTenant}
  build_id: ${JSON.stringify(buildId)},
  experience_schema_version: 1,
  feature_registry: featureRegistry,
  section_registry: createSectionRegistry(featureRegistry),
  theme_registry: {
    ${themeEntries}
  },
  override_registry: {},
  configuration_resolver: remoteConfigurationResolver,
})
`
}

export function buildMetadata(configuration, buildId) {
  return {
    build_mode: configuration.buildMode,
    ...(configuration.expectedTenantSlug
      ? { expected_tenant_slug: configuration.expectedTenantSlug }
      : {}),
    features: configuration.features,
    themes: configuration.themes,
    ...(configuration.capabilities
      ? { capabilities: configuration.capabilities }
      : {}),
    experience_schema_version: 1,
    build_id: buildId,
  }
}
