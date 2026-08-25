import { apiData, publicApiClient } from '../api/clients'
import { organizationsGetPublicExperience, organizationsResolve } from '../api/generated'
import { toOrganizationExperience } from '../organization/api/experienceAdapter'


export const organizationService = {
  resolve(hostname: string) {
    return apiData(organizationsResolve({
      query: { hostname },
      client: publicApiClient,
      throwOnError: true,
    }))
  },
  async loadExperience() {
    const dto = await apiData(organizationsGetPublicExperience({
      client: publicApiClient,
      throwOnError: true,
    }))
    return toOrganizationExperience(dto)
  },
}
