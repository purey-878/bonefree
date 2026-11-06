import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { ThemeProvider } from 'styled-components'
import App from './App.tsx'
import { cleanupRetiredBrowserStorage } from './utils/retiredStorage'
import { ToastProvider } from './components/ui/ToastProvider.tsx'
import './i18n'
import './index.css'
import { GlobalStyles } from './styles/GlobalStyles'
import { theme } from './styles/theme'

import 'bootstrap/dist/css/bootstrap.min.css'
cleanupRetiredBrowserStorage()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider theme={theme}>
      <GlobalStyles />
      <BrowserRouter>
        <ToastProvider>
          <App />
        </ToastProvider>
      </BrowserRouter>
    </ThemeProvider>
  </StrictMode>,
)
