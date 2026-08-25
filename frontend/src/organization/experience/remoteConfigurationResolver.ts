import type { ConfigurationResolver } from '../../app/manifest/types'
import { organizationService } from '../../services/organizationService'

export const remoteConfigurationResolver: ConfigurationResolver = {
  async load(context) {
    const experience = await organizationService.loadExperience()
    if (experience.organization.slug !== context.organization.slug) {
      throw new Error('organization_experience_tenant_mismatch')
    }
    return experience
  },
}
