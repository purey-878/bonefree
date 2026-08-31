import './i18n'
import { StrictMode, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { ThemeProvider } from 'styled-components'
import './index.css'
import { ToastProvider } from './components/ui/ToastProvider.tsx'
import { GlobalStyles } from './styles/GlobalStyles'
import { theme } from './styles/theme'
import { setOrganizationSlug } from './api/clients.ts'
import { OrganizationResolutionScreen } from './components/OrganizationResolutionScreen.tsx'
import { organizationService } from './services/organizationService.ts'
import type { OrganizationBootstrapError } from './components/OrganizationResolutionScreen.tsx'

import 'bootstrap/dist/css/bootstrap.min.css';
import 'bootstrap/dist/js/bootstrap.bundle.min.js';

const root = createRoot(document.getElementById('root')!)

function shell(content: ReactNode) {
  return (
    <StrictMode>
      <ThemeProvider theme={theme}>
        <GlobalStyles />
        {content}
      </ThemeProvider>
    </StrictMode>
  )
}

async function bootstrap() {
  root.render(shell(<OrganizationResolutionScreen loading />))
  let tenantResolved = false
  try {
    const organization = await organizationService.resolve(window.location.hostname)
    tenantResolved = true
    setOrganizationSlug(organization.slug)
    if (organization.state === 'frozen') {
      if (!organization.data_access_expires_at) throw new Error('data_access_deadline_missing')
      if (!window.location.pathname.startsWith('/admin')) {
        const { default: ClosedSite } = await import('./data-access/ClosedSite.tsx')
        root.render(shell(<ClosedSite organizationName={organization.name} />))
        return
      }
      const { default: FrozenApplication } = await import('./data-access/FrozenApplication.tsx')
      root.render(shell(
        <BrowserRouter>
          <ToastProvider>
            <FrozenApplication organization={{
              name: organization.name,
              dataAccessExpiresAt: organization.data_access_expires_at,
            }} />
          </ToastProvider>
        </BrowserRouter>,
      ))
      return
    }
    const [
      { default: App },
      { AuthProvider },
      { default: currentManifest },
      { validateDeploymentTenant, validateExperienceAgainstManifest },
      { OrganizationProvider },
    ] = await Promise.all([
      import('./App.tsx'),
      import('./context/AuthContext.tsx'),
      import('./app/manifest/currentManifest.ts'),
      import('./app/manifest/defineApplicationManifest.ts'),
      import('./organization/context/OrganizationContext.tsx'),
    ])
    validateDeploymentTenant(currentManifest, organization.slug)
    const experience = await currentManifest.configuration_resolver.load({ organization })
    validateExperienceAgainstManifest(currentManifest, {
      schemaVersion: experience.schema_version,
      themeKey: experience.experience.theme.key,
    })
    const unavailableCapabilities = experience.capabilities.filter(
      (featureKey) => !currentManifest.feature_registry[featureKey],
    )
    if (unavailableCapabilities.length) {
      console.warn('feature_not_in_build', { features: unavailableCapabilities })
    }
    root.render(shell(
      <BrowserRouter>
        <OrganizationProvider organization={organization} experience={experience}>
          <AuthProvider>
            <ToastProvider>
              <App />
            </ToastProvider>
          </AuthProvider>
        </OrganizationProvider>
      </BrowserRouter>,
    ))
  } catch (error) {
    console.error('Unable to bootstrap the organization experience:', error)
    let errorCode: OrganizationBootstrapError = tenantResolved
      ? 'configuration_unavailable'
      : 'domain_not_configured'
    if (error instanceof Error && error.message === 'deployment_tenant_mismatch') {
      errorCode = 'deployment_tenant_mismatch'
    } else if (error instanceof Error && error.message === 'theme_not_in_build') {
      errorCode = 'theme_not_in_build'
    } else if (error instanceof Error && error.message === 'experience_schema_incompatible') {
      errorCode = 'experience_schema_incompatible'
    }
    root.render(shell(<OrganizationResolutionScreen error={errorCode} />))
  }
}

void bootstrap()
