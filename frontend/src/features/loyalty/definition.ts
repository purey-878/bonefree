import type { FeatureDefinition } from '../../app/manifest/types'

export const loyaltyFeature: FeatureDefinition = {
  key: 'loyalty',
  public_routes: [],
  admin_route_ids: ['admin_loyalty'],
  section_types: ['loyalty'],
  navigation_route_ids: [],
}
