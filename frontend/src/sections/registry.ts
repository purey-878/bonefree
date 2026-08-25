import type {
  FeatureRegistry,
  SectionRegistration,
  SectionRegistry,
} from '../app/manifest/types'

const CORE_SECTION_TYPES = ['hero'] as const

export function createSectionRegistry(features: FeatureRegistry): SectionRegistry {
  const registrations: Record<string, SectionRegistration> = Object.fromEntries(
    CORE_SECTION_TYPES.map((type) => [type, { type, feature_key: null }]),
  )

  for (const feature of Object.values(features)) {
    for (const type of feature.section_types) {
      const existing = registrations[type]
      if (existing && existing.feature_key !== feature.key) {
        throw new Error(`duplicate_section_registration:${type}`)
      }
      registrations[type] = { type, feature_key: feature.key }
    }
  }

  return Object.freeze(registrations)
}
