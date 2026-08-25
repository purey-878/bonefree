import type { ReactNode } from 'react'

import type { OrganizationExperience, ResolvedOrganization } from '../model/types'
import { OrganizationContext } from './organization-context'

export function OrganizationProvider({
  organization,
  experience,
  children,
}: {
  organization: ResolvedOrganization
  experience: OrganizationExperience
  children: ReactNode
}) {
  return (
    <OrganizationContext.Provider
      value={{
        organization,
        experience,
        capabilities: new Set(experience.capabilities),
      }}
    >
      {children}
    </OrganizationContext.Provider>
  )
}
