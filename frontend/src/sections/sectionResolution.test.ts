import { describe, expect, it } from 'vitest'

import { createSectionRegistry } from './registry'
import { resolvePageSections } from './sectionResolution'
import type { FeatureRegistry } from '../app/manifest/types'

const features = {
  catalog: {
    key: 'catalog',
    public_routes: [],
    admin_route_ids: [],
    section_types: ['popular_products'],
    navigation_route_ids: [],
  },
  reviews: {
    key: 'reviews',
    public_routes: [],
    admin_route_ids: [],
    section_types: ['reviews'],
    navigation_route_ids: [],
  },
} satisfies FeatureRegistry

describe('page section resolution', () => {
  it('intersects build availability, entitlement, configuration, and slots', () => {
    const result = resolvePageSections({
      page: {
        sections: [
          { id: 'hero', type: 'hero', enabled: true, feature_key: null, variant: null, override_key: null, props: {} },
          { id: 'popular', type: 'popular_products', enabled: true, feature_key: 'catalog', variant: null, override_key: null, props: {} },
          { id: 'reviews', type: 'reviews', enabled: true, feature_key: 'reviews', variant: null, override_key: null, props: {} },
          { id: 'events', type: 'events', enabled: true, feature_key: 'events', variant: null, override_key: null, props: {} },
        ],
      },
      sectionRegistry: createSectionRegistry(features),
      capabilities: new Set(['catalog']),
      availableSlots: new Set(['hero', 'popular_products', 'reviews', 'events']),
    })

    expect(result.sections.map((section) => section.id)).toEqual(['hero', 'popular'])
    expect(result.issues).toEqual([
      { section_id: 'reviews', reason: 'section_without_entitlement' },
      { section_id: 'events', reason: 'section_not_in_build' },
    ])
  })
})
