import React from 'react'
import ReactDOM from 'react-dom/client'
import { init as initSentry } from '@sentry/electron/renderer'
import * as Sentry from '@sentry/react'
import { setupI18n } from '@mkagent/shared/i18n'
import LanguageDetector from 'i18next-browser-languagedetector'
import { initReactI18next } from 'react-i18next'
import App from './App'
import './index.css'

setupI18n([LanguageDetector, initReactI18next])
initSentry({
  beforeSend(event) {
    for (const breadcrumb of event.breadcrumbs ?? []) {
      for (const key of Object.keys(breadcrumb.data ?? {})) {
        if (/token|key|secret|password|credential|auth/i.test(key)) breadcrumb.data![key] = '[REDACTED]'
      }
    }
    return event
  },
}, Sentry.init)

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Sentry.ErrorBoundary fallback={<div className="mk-empty"><strong>MkAgent stopped unexpectedly.</strong><button className="mk-button" onClick={() => location.reload()}>Reload</button></div>}>
      <App />
    </Sentry.ErrorBoundary>
  </React.StrictMode>,
)
