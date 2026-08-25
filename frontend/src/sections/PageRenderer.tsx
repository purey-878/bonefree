import type { ReactNode } from 'react'

import manifest from '../app/manifest/currentManifest'
import { useOrganization } from '../organization/context/organization-context'
import type { SectionDescriptor } from '../organization/model/types'
import { SectionBoundary } from './SectionBoundary'
import { resolvePageSections } from './sectionResolution'

export type SectionSlot = ReactNode | ((section: SectionDescriptor) => ReactNode)

export function PageRenderer({
  pageKey,
  slots,
}: {
  pageKey: string
  slots: Readonly<Record<string, SectionSlot>>
}) {
  const { experience, capabilities } = useOrganization()
  const resolution = resolvePageSections({
    page: experience.experience.pages[pageKey],
    sectionRegistry: manifest.section_registry,
    capabilities,
    availableSlots: new Set(Object.keys(slots)),
  })

  for (const issue of resolution.issues) {
    console.warn(issue.reason, { page_key: pageKey, section_id: issue.section_id })
  }

  return resolution.sections.map((section) => {
    const slot = slots[section.id] ?? slots[section.type]
    const content = typeof slot === 'function' ? slot(section) : slot
    return (
      <SectionBoundary key={section.id} sectionId={section.id}>
        {content}
      </SectionBoundary>
    )
  })
}
