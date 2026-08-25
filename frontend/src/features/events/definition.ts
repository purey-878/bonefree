import { lazy } from 'react'

import type { FeatureDefinition } from '../../app/manifest/types'

const EventsPage = lazy(() => import('../../pages/Events'))

export const eventsFeature: FeatureDefinition = {
  key: 'events',
  public_routes: [
    { id: 'events', path: '/events', component: EventsPage },
  ],
  admin_route_ids: ['admin_events'],
  section_types: ['events'],
  navigation_route_ids: ['events'],
}
