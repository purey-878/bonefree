import { lazy } from 'react'

import type { FeatureDefinition } from '../../app/manifest/types'

const LoginPage = lazy(() => import('../../pages/Login'))
const RegisterPage = lazy(() => import('../../pages/Register'))
const ForgotPasswordPage = lazy(() => import('../../pages/ForgotPassword'))
const ProfilePage = lazy(() => import('../../pages/Profile'))

export const customerAccountsFeature: FeatureDefinition = {
  key: 'customer_accounts',
  public_routes: [
    { id: 'login', path: '/login', component: LoginPage },
    { id: 'register', path: '/register', component: RegisterPage },
    { id: 'forgot_password', path: '/forgot-password', component: ForgotPasswordPage },
    { id: 'profile', path: '/profile', component: ProfilePage, customer_protected: true },
  ],
  admin_route_ids: ['admin_customers'],
  section_types: [],
  navigation_route_ids: ['profile'],
}
