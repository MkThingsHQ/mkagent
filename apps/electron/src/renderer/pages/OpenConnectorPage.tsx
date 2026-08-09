import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { OpenConnectorConsoleInfo, OpenConnectorSection } from '../../shared/types'
import { Button } from '@/components/ui/button'

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; info: OpenConnectorConsoleInfo }
  | { status: 'error'; message: string }

interface OpenConnectorPageProps {
  section?: OpenConnectorSection
}

function buildConsoleUrl(baseUrl: string, section: OpenConnectorSection): string {
  const url = new URL(baseUrl)
  url.pathname = `/${section}`
  return url.toString()
}

export default function OpenConnectorPage({ section = 'providers' }: OpenConnectorPageProps) {
  const { t } = useTranslation()
  const [state, setState] = useState<LoadState>({ status: 'loading' })
  const consoleUrl = useMemo(
    () => state.status === 'ready' ? buildConsoleUrl(state.info.url, section) : null,
    [state, section],
  )

  const load = useCallback(async () => {
    setState({ status: 'loading' })
    try {
      const info = await window.electronAPI.getOpenConnectorConsole()
      if (info.status === 'failed') {
        setState({ status: 'error', message: info.error || t('openConnector.failed') })
        return
      }
      setState({ status: 'ready', info })
    } catch (error) {
      setState({
        status: 'error',
        message: error instanceof Error ? error.message : t('openConnector.failed'),
      })
    }
  }, [t])

  useEffect(() => { void load() }, [load])

  if (state.status === 'loading') {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        {t('openConnector.loading')}
      </div>
    )
  }

  if (state.status === 'error') {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex max-w-md flex-col items-center gap-3 text-center">
          <p className="text-sm text-muted-foreground">{state.message}</p>
          <Button variant="outline" size="sm" onClick={() => void load()}>
            {t('openConnector.retry')}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <iframe
      title="OpenConnector"
      src={consoleUrl ?? state.info.url}
      className="h-full w-full border-0 bg-background"
      sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-downloads"
      allow="clipboard-read; clipboard-write"
    />
  )
}
