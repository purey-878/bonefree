import { apiData, publicApiClient } from '../api/clients'
import { organizationsResolve } from '../api/generated'


export const organizationService = {
  resolve(hostname: string) {
    return apiData(organizationsResolve({
      query: { hostname },
      client: publicApiClient,
      throwOnError: true,
    }))
  },
}
