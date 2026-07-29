import { useCallback, useMemo, useState } from 'react'
import { X } from 'lucide-react'
import { motion } from 'motion/react'
import { Dithering } from '@paper-design/shaders-react'
import { FullscreenOverlayBase } from '@mkagent/ui'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import type { Workspace } from '../../../shared/types'
import { AddWorkspaceStepChoice } from './AddWorkspaceStep_Choice'
import { AddWorkspaceStepCreateNew } from './AddWorkspaceStep_CreateNew'
import { AddWorkspaceStepOpenFolder } from './AddWorkspaceStep_OpenFolder'

type Step = 'choice' | 'create' | 'open'

export function WorkspaceCreationScreen({ onWorkspaceCreated, onClose }: { onWorkspaceCreated: (workspace: Workspace) => void; onClose: () => void }) {
  const { t } = useTranslation()
  const [step, setStep] = useState<Step>('choice')
  const [isCreating, setIsCreating] = useState(false)
  const colors = useMemo(() => document.documentElement.classList.contains('dark') ? { back: '#00000000', front: '#9b7bb8' } : { back: '#00000000', front: '#684e85' }, [])
  const create = useCallback(async (path: string, name: string) => {
    setIsCreating(true)
    try { onWorkspaceCreated(await window.electronAPI.createWorkspace(path, name)) } finally { setIsCreating(false) }
  }, [onWorkspaceCreated])
  return <FullscreenOverlayBase isOpen onClose={() => { if (!isCreating) onClose() }} className="z-splash flex flex-col bg-background">
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-1 flex-col">
      <div className="pointer-events-none absolute inset-0 opacity-30"><Dithering colorBack={colors.back} colorFront={colors.front} shape="swirl" type="8x8" size={2} speed={1} scale={1} width={window.innerWidth} height={window.innerHeight} /></div>
      <header className="titlebar-drag-region relative flex h-[50px] shrink-0 items-center justify-end px-6"><button onClick={onClose} disabled={isCreating} className={cn('titlebar-no-drag -mr-2 mt-2 flex items-center justify-center rounded-[6px] bg-background p-2 text-muted-foreground shadow-minimal transition-colors hover:bg-foreground/5 hover:text-foreground', isCreating && 'opacity-50')} aria-label={t('common.close')}><X className="h-4 w-4" /></button></header>
      <main className="relative flex flex-1 items-center justify-center p-8">{step === 'choice' ? <AddWorkspaceStepChoice onCreateNew={() => setStep('create')} onOpenFolder={() => setStep('open')} /> : step === 'create' ? <AddWorkspaceStepCreateNew onBack={() => setStep('choice')} onCreate={create} isCreating={isCreating} /> : <AddWorkspaceStepOpenFolder onBack={() => setStep('choice')} onCreate={create} isCreating={isCreating} />}</main>
    </motion.div>
  </FullscreenOverlayBase>
}
