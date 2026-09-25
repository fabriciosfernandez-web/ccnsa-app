import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { GlobalErrorBoundary } from './components/GlobalErrorBoundary'
import { ThemeProvider } from './theme/ThemeProvider'
import './styles.css'
import './admin-ui.css'
import './theme.css'
import './dark-theme.css'
import './dark-theme-polish.css'
import './notifications-ui.css'
import './push-dev.css'
import './loading-screen.css'
import './app-error.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <GlobalErrorBoundary>
      <ThemeProvider>
        <App />
      </ThemeProvider>
    </GlobalErrorBoundary>
  </StrictMode>,
)
