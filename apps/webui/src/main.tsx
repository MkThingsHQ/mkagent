import React from 'react'
import ReactDOM from 'react-dom/client'
import { setupI18n } from '@mkagent/shared/i18n'
import LanguageDetector from 'i18next-browser-languagedetector'
import { initReactI18next } from 'react-i18next'
import App from './App'
import './index.css'

setupI18n([LanguageDetector, initReactI18next])

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><App /></React.StrictMode>,
)
