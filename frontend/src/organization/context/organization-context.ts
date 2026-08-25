import { createContext, useContext } from 'react'

import type { OrganizationExperience, ResolvedOrganization } from '../model/types'

export interface OrganizationContextValue {
  organization: ResolvedOrganization
  experience: OrganizationExperience
  capabilities: ReadonlySet<string>
}

export const OrganizationContext = createContext<OrganizationContextValue | null>(null)

export function useOrganization(): OrganizationContextValue {
  const value = useContext(OrganizationContext)
  if (!value) throw new Error('useOrganization must be used within OrganizationProvider')
  return value
}
