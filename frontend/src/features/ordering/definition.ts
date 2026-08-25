import { lazy } from 'react'

import type { FeatureDefinition } from '../../app/manifest/types'

const CartPage = lazy(() => import('../../pages/Cart'))
const CartOverlayPage = lazy(() => import('./routes/CartOverlayPage'))
const CheckoutPage = lazy(() => import('../../pages/Checkout'))
const OrdersIndexRedirect = lazy(() => import('./routes/OrdersIndexRedirect'))
const OrderDetailsPage = lazy(() => import('../../pages/OrderDetails'))

export const orderingFeature: FeatureDefinition = {
  key: 'ordering',
  public_routes: [
    { id: 'cart', path: '/cart', component: CartPage },
    { id: 'cart_overlay', path: '/cart', component: CartOverlayPage, presentation: 'overlay' },
    { id: 'checkout', path: '/checkout', component: CheckoutPage },
    { id: 'orders', path: '/orders', component: OrdersIndexRedirect },
    { id: 'order_details', path: '/orders/:orderId', component: OrderDetailsPage },
  ],
  admin_route_ids: ['admin_orders', 'admin_kitchen'],
  section_types: [],
  navigation_route_ids: ['cart', 'orders'],
}
