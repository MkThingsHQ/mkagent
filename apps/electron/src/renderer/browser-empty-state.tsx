import React, { useState } from 'react'
import ReactDOM from 'react-dom/client'
import './index.css'

function BrowserEmptyState() {
  const [prompt, setPrompt] = useState('')
  const launch = async () => {
    const input = prompt.trim()
    if (!input) return
    const route = `/sessions/new?input=${encodeURIComponent(input)}&send=true`
    await window.electronAPI.browserPane.emptyStateLaunch({ route, token: String(Date.now()) })
  }
  return <div className="mk-empty"><strong>Browser ready</strong><span>Ask MkAgent to research or interact with a page.</span><div className="mk-row"><input value={prompt} onChange={event => setPrompt(event.target.value)} placeholder="What should MkAgent do?" /><button className="mk-button primary" onClick={launch}>Start</button></div></div>
}

ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><BrowserEmptyState /></React.StrictMode>)
