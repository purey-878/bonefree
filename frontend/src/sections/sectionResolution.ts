import type { SectionRegistry } from '../app/manifest/types'
import type { PageConfiguration, SectionDescriptor } from '../organization/model/types'

export type SectionResolutionIssue =
  | 'section_not_in_build'
  | 'section_feature_mismatch'
  | 'section_without_entitlement'
  | 'section_slot_missing'

export interface ResolvedPageSections {
  sections: SectionDescriptor[]
  issues: Array<{ section_id: string; reason: SectionResolutionIssue }>
}

export function resolvePageSections({
  page,
  sectionRegistry,
  capabilities,
  availableSlots,
}: {
  page: PageConfiguration | undefined
  sectionRegistry: SectionRegistry
  capabilities: ReadonlySet<string>
  availableSlots: ReadonlySet<string>
}): ResolvedPageSections {
  const resolved: SectionDescriptor[] = []
  const issues: ResolvedPageSections['issues'] = []

  for (const section of page?.sections ?? []) {
    if (!section.enabled) continue

    const registration = sectionRegistry[section.type]
    if (!registration) {
      issues.push({ section_id: section.id, reason: 'section_not_in_build' })
      continue
    }
    if (
      section.feature_key
      && registration.feature_key
      && section.feature_key !== registration.feature_key
    ) {
      issues.push({ section_id: section.id, reason: 'section_feature_mismatch' })
      continue
    }

    const requiredFeature = registration.feature_key ?? section.feature_key
    if (requiredFeature && !capabilities.has(requiredFeature)) {
      issues.push({ section_id: section.id, reason: 'section_without_entitlement' })
      continue
    }
    if (!availableSlots.has(section.id) && !availableSlots.has(section.type)) {
      issues.push({ section_id: section.id, reason: 'section_slot_missing' })
      continue
    }

    resolved.push(section)
  }

  return { sections: resolved, issues }
}
