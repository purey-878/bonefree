import type { FeatureRegistry } from '../../app/manifest/types'
import type { NavigationItem } from '../model/types'

export interface ResolvedNavigationItem extends NavigationItem {
  path: string
}

const coreRoutePaths: Readonly<Record<string, string>> = {
  about: '/about',
  contact: '/contact',
}

export function resolveNavigation(
  navigation: readonly NavigationItem[],
  featureRegistry: FeatureRegistry,
  capabilities: ReadonlySet<string>,
): ResolvedNavigationItem[] {
  const routePaths: Record<string, string> = { ...coreRoutePaths }
  for (const feature of Object.values(featureRegistry)) {
    if (!capabilities.has(feature.key)) continue
    for (const route of feature.public_routes) {
      if (route.presentation !== 'overlay' && !route.path.includes(':')) {
        routePaths[route.id] = route.path
      }
    }
  }
  return navigation.flatMap((item) => {
    const path = routePaths[item.route_id]
    return item.enabled && path ? [{ ...item, path }] : []
  })
}
