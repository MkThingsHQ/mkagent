import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { AddWorkspaceContainer, AddWorkspacePrimaryButton, AddWorkspaceStepHeader } from './primitives'

const slugify = (value: string) => value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

export function AddWorkspaceStepCreateNew({ onBack, onCreate, isCreating }: { onBack: () => void; onCreate: (folderPath: string, name: string) => Promise<void>; isCreating: boolean }) {
  const { t } = useTranslation()
  const [name, setName] = useState('')
  const [workspacePath, setWorkspacePath] = useState('')
  const [exists, setExists] = useState(false)
  const slug = useMemo(() => slugify(name), [name])

  useEffect(() => {
    if (!slug) { setWorkspacePath(''); setExists(false); return }
    const timer = setTimeout(() => void window.electronAPI.checkWorkspaceSlug(slug).then(result => { setWorkspacePath(result.path); setExists(result.exists) }), 200)
    return () => clearTimeout(timer)
  }, [slug])

  return <AddWorkspaceContainer>
    <button onClick={onBack} disabled={isCreating} className={cn('mb-4 flex self-start items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground', isCreating && 'cursor-not-allowed opacity-50')}><ArrowLeft className="h-4 w-4" />{t('common.back')}</button>
    <AddWorkspaceStepHeader title={t('workspace.createWorkspace')} description={t('workspace.createWorkspaceDesc')} />
    <div className="mt-6 w-full space-y-6">
      <div className="space-y-2"><label className="mb-2.5 block text-sm font-medium text-foreground">{t('workspace.nameLabel')}</label><div className="rounded-lg bg-background shadow-minimal"><Input value={name} onChange={event => setName(event.target.value)} placeholder={t('workspace.myWorkspace')} disabled={isCreating} autoFocus className="border-0 bg-transparent shadow-none" /></div>{workspacePath && <p className="truncate text-xs text-muted-foreground">{workspacePath}</p>}{exists && <p className="text-xs text-destructive">A workspace with this name already exists.</p>}</div>
      <AddWorkspacePrimaryButton onClick={() => onCreate(workspacePath, name.trim())} disabled={!name.trim() || !workspacePath || exists} loading={isCreating} loadingText={t('workspace.creating')}>{t('workspace.createWorkspace')}</AddWorkspacePrimaryButton>
    </div>
  </AddWorkspaceContainer>
}
