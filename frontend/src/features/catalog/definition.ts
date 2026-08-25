import { lazy } from 'react'

import type { FeatureDefinition } from '../../app/manifest/types'

const HomePage = lazy(() => import('../../pages/Home'))
const MenuPage = lazy(() => import('../../pages/Menu'))
const ProductDetailPage = lazy(() => import('../../pages/ProductDetail').then((module) => ({
  default: module.ProductDetail,
})))

export const catalogFeature: FeatureDefinition = {
  key: 'catalog',
  public_routes: [
    { id: 'home', path: '/', component: HomePage },
    { id: 'menu', path: '/menu', component: MenuPage },
    { id: 'product', path: '/product/:id', component: ProductDetailPage },
  ],
  admin_route_ids: ['admin_catalog'],
  section_types: ['category_navigation', 'popular_products', 'chef_special'],
  navigation_route_ids: ['home', 'menu'],
}
