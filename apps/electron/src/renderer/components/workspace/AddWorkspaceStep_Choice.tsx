import { FolderOpen, FolderPlus } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { AddWorkspaceContainer, AddWorkspaceStepHeader } from './primitives'

function ChoiceCard({ icon, title, description, onClick, primary }: { icon: React.ReactNode; title: string; description: string; onClick: () => void; primary?: boolean }) {
  return <button onClick={onClick} className={cn('flex w-full items-center gap-4 rounded-lg bg-background p-4 text-left shadow-minimal transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2', primary ? 'hover:bg-accent/5' : 'hover:bg-foreground/5')}>
    <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-lg', primary ? 'bg-accent/10 text-accent' : 'bg-foreground/5 text-foreground/70')}>{icon}</div>
    <div className="min-w-0"><div className="text-[15px] font-medium text-foreground">{title}</div><div className="-mt-px text-[12px] text-muted-foreground">{description}</div></div>
  </button>
}

export function AddWorkspaceStepChoice({ onCreateNew, onOpenFolder }: { onCreateNew: () => void; onOpenFolder: () => void }) {
  const { t } = useTranslation()
  return <AddWorkspaceContainer>
    <div className="mt-2" />
    <AddWorkspaceStepHeader title={t('workspace.addWorkspace')} description={t('workspace.addWorkspaceDesc')} />
    <div className="mt-8 w-full space-y-3">
      <ChoiceCard icon={<FolderPlus className="h-5 w-5" />} title={t('workspace.createNew')} description={t('workspace.createNewDesc')} onClick={onCreateNew} primary />
      <ChoiceCard icon={<FolderOpen className="h-5 w-5" />} title={t('workspace.openFolder')} description={t('workspace.openFolderDesc')} onClick={onOpenFolder} />
    </div>
  </AddWorkspaceContainer>
}
