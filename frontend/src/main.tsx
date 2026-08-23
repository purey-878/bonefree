import { StrictMode, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { ThemeProvider } from 'styled-components'
import './index.css'
import App from './App.tsx'
import { AuthProvider } from './context/AuthContext.tsx'
import { ToastProvider } from './components/ui/ToastProvider.tsx'
import { GlobalStyles } from './styles/GlobalStyles'
import { theme } from './styles/theme'
import { setOrganizationSlug } from './api/clients.ts'
import { OrganizationResolutionScreen } from './components/OrganizationResolutionScreen.tsx'
import { organizationService } from './services/organizationService.ts'

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
  try {
    const organization = await organizationService.resolve(window.location.hostname)
    setOrganizationSlug(organization.slug)
    root.render(shell(
      <BrowserRouter>
        <AuthProvider>
          <ToastProvider>
            <App />
          </ToastProvider>
        </AuthProvider>
      </BrowserRouter>,
    ))
  } catch (error) {
    console.error('Unable to resolve organization for this hostname:', error)
    root.render(shell(<OrganizationResolutionScreen />))
  }
}

void bootstrap()
