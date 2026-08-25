import type { FeatureDefinition } from '../../app/manifest/types'

export const reviewsFeature: FeatureDefinition = {
  key: 'reviews',
  public_routes: [],
  admin_route_ids: ['admin_reviews'],
  section_types: ['reviews'],
  navigation_route_ids: [],
}
