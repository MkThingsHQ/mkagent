import { useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { AddWorkspaceContainer, AddWorkspacePrimaryButton, AddWorkspaceSecondaryButton, AddWorkspaceStepHeader } from './primitives'

export function AddWorkspaceStepOpenFolder({ onBack, onCreate, isCreating }: { onBack: () => void; onCreate: (folderPath: string, name: string) => Promise<void>; isCreating: boolean }) {
  const { t } = useTranslation()
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [name, setName] = useState('')
  const browse = async () => {
    const path = await window.electronAPI.openFolderDialog()
    if (!path) return
    setSelectedPath(path)
    setName(path.split(/[\\/]/).pop() || path)
  }
  return <AddWorkspaceContainer>
    <button onClick={onBack} disabled={isCreating} className={cn('mb-4 flex self-start items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground', isCreating && 'cursor-not-allowed opacity-50')}><ArrowLeft className="h-4 w-4" />{t('common.back')}</button>
    <AddWorkspaceStepHeader title={t('workspace.chooseExistingFolder')} description={t('workspace.chooseExistingFolderDesc')} />
    <div className="mt-6 w-full space-y-6">
      <div className="flex items-center justify-between gap-4 rounded-xl border border-border/50 bg-background p-4"><p className={cn('min-w-0 flex-1 truncate text-sm', selectedPath ? 'text-foreground' : 'text-muted-foreground')}>{selectedPath || t('workspace.noFolderSelected')}</p><AddWorkspaceSecondaryButton onClick={browse} disabled={isCreating}>{t('common.browse')}</AddWorkspaceSecondaryButton></div>
      {selectedPath && <div className="space-y-2"><label className="text-sm font-medium text-foreground">{t('workspace.nameLabel')}</label><Input value={name} onChange={event => setName(event.target.value)} placeholder={t('workspace.myWorkspace')} disabled={isCreating} /></div>}
      <AddWorkspacePrimaryButton onClick={() => selectedPath && onCreate(selectedPath, name.trim())} disabled={!selectedPath || !name.trim()} loading={isCreating} loadingText={t('workspace.opening')}>{t('common.open')}</AddWorkspacePrimaryButton>
    </div>
  </AddWorkspaceContainer>
}
