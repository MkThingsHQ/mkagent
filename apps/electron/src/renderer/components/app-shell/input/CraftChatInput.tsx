import { Check, ChevronDown, Folder, Paperclip, Square, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { LlmConnectionWithStatus } from '@mkagent/shared/config'
import type { FileAttachment, Session } from '../../../../shared/types'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuSub,
  DropdownMenuTrigger,
  StyledDropdownMenuContent,
  StyledDropdownMenuItem,
  StyledDropdownMenuSeparator,
  StyledDropdownMenuSubContent,
  StyledDropdownMenuSubTrigger,
} from '@/components/ui/styled-dropdown'
import { cn } from '@/lib/utils'

interface CraftChatInputProps {
  session: Session
  workspaceId: string
  draft: string
  attachments: FileAttachment[]
  connections: LlmConnectionWithStatus[]
  onDraftChange: (value: string) => void
  onAttachmentsChange: (value: FileAttachment[]) => void
  onAttach: () => void
  onSend: () => void
  onChanged: () => void
}

const thinkingLevels = ['off', 'low', 'medium', 'high', 'xhigh', 'max'] as const

export function CraftChatInput({ session, workspaceId, draft, attachments, connections, onDraftChange, onAttachmentsChange, onAttach, onSend, onChanged }: CraftChatInputProps) {
  const { t } = useTranslation()
  const selectedConnection = connections.find(connection => connection.slug === session.llmConnection) ?? connections.find(connection => connection.isDefault) ?? connections[0]
  const currentModel = session.model || selectedConnection?.defaultModel || ''
  const models = selectedConnection?.models ?? []
  const currentModelName = (models.find(model => (typeof model === 'string' ? model : model.id) === currentModel) as { name?: string } | string | undefined)
  const modelLabel = typeof currentModelName === 'string' ? currentModelName : currentModelName?.name || currentModel || t('common.model')

  return <div className="mx-auto mt-1 w-full max-w-[900px] px-4 pb-4">
    <form onSubmit={event => { event.preventDefault(); onSend() }}>
      <div className="overflow-hidden rounded-[16px] bg-background shadow-middle">
        {attachments.length > 0 && <div className="flex flex-wrap gap-1 px-3 pt-3.5">{attachments.map((attachment, index) => <span key={`${attachment.path}:${index}`} className="inline-flex max-w-[220px] items-center gap-1 rounded-[6px] bg-foreground/3 py-1 pl-2 pr-1 text-[12px]"><span className="truncate">{attachment.name}</span><button type="button" className="rounded p-0.5 hover:bg-foreground/10" onClick={() => onAttachmentsChange(attachments.filter((_, itemIndex) => itemIndex !== index))}><X className="h-3 w-3" /></button></span>)}</div>}
        <textarea
          className="min-h-[88px] w-full resize-none overflow-y-auto bg-transparent pb-3 pl-5 pr-4 pt-4 text-[14px] outline-none placeholder:text-muted-foreground/70"
          value={draft}
          onChange={event => onDraftChange(event.target.value)}
          onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.metaKey && !event.ctrlKey && !event.nativeEvent.isComposing) { event.preventDefault(); onSend() } }}
          placeholder={t('chatInput.placeholder.newLine')}
          spellCheck
        />
        <div className="flex items-center gap-1 border-t border-border/50 px-2 py-2">
          <div className="flex min-w-32 shrink items-center gap-1 overflow-hidden">
            <button type="button" onClick={onAttach} className={cn('input-toolbar-btn inline-flex h-7 shrink min-w-0 items-center gap-1.5 rounded-[6px] px-1.5 text-[13px] transition-colors hover:bg-foreground/5', attachments.length > 0 && 'text-accent')} title={t('chat.attachFilesTooltip')}><Paperclip className="h-4 w-4 shrink-0" /><span className="truncate">{attachments.length ? t('chat.filesCount', { count: attachments.length }) : t('chat.attachFiles')}</span></button>
            <button type="button" onClick={() => void window.electronAPI.openFolderDialog().then(path => { if (path) return window.electronAPI.sessionCommand(session.id, { type: 'updateWorkingDirectory', dir: path }).then(onChanged) })} className={cn('input-toolbar-btn inline-flex h-7 shrink min-w-0 items-center gap-1.5 rounded-[6px] px-1.5 text-[13px] transition-colors hover:bg-foreground/5', session.workingDirectory && 'text-accent')} title={t('chat.chooseWorkingDirectory')}><Folder className="h-4 w-4 shrink-0" /><span className="max-w-[140px] truncate">{session.workingDirectory?.split(/[\\/]/).pop() || t('chat.workInFolder')}</span></button>
          </div>
          <div className="flex-1" />
          <div className="flex shrink-0 items-center">
            <DropdownMenu>
              <DropdownMenuTrigger asChild><button type="button" className="input-toolbar-btn inline-flex h-7 items-center gap-0.5 rounded-[6px] px-1.5 text-[13px] transition-colors hover:bg-foreground/5"><span className="max-w-[180px] truncate">{modelLabel}</span><ChevronDown className="h-3 w-3 shrink-0 opacity-50" /></button></DropdownMenuTrigger>
              <StyledDropdownMenuContent side="top" align="end" sideOffset={8} className="min-w-[260px]">
                {connections.map((connection, index) => <div key={connection.slug}>{index > 0 && <StyledDropdownMenuSeparator />}{connections.length > 1 ? <DropdownMenuSub><StyledDropdownMenuSubTrigger className="flex items-center justify-between px-2 py-2"><span>{connection.name}</span>{connection.slug === selectedConnection?.slug && <Check className="h-3 w-3" />}</StyledDropdownMenuSubTrigger><StyledDropdownMenuSubContent>{(connection.models ?? []).map(model => { const id = typeof model === 'string' ? model : model.id; const name = typeof model === 'string' ? model : model.name || model.id; return <StyledDropdownMenuItem key={id} onClick={() => { void window.electronAPI.sessionCommand(session.id, { type: 'setConnection', connectionSlug: connection.slug }).then(() => window.electronAPI.setSessionModel(session.id, workspaceId, id, connection.slug)).then(onChanged) }}><span className="flex-1">{name}</span>{connection.slug === selectedConnection?.slug && id === currentModel && <Check className="h-3 w-3" />}</StyledDropdownMenuItem> })}</StyledDropdownMenuSubContent></DropdownMenuSub> : (connection.models ?? []).map(model => { const id = typeof model === 'string' ? model : model.id; const name = typeof model === 'string' ? model : model.name || model.id; return <StyledDropdownMenuItem key={id} onClick={() => void window.electronAPI.setSessionModel(session.id, workspaceId, id, connection.slug).then(onChanged)}><span className="flex-1">{name}</span>{id === currentModel && <Check className="h-3 w-3" />}</StyledDropdownMenuItem> })}</div>)}
                {connections.length === 0 && <div className="px-3 py-2 text-sm text-muted-foreground">{t('settings.ai.noConnections')}</div>}
              </StyledDropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu>
              <DropdownMenuTrigger asChild><button type="button" className="input-toolbar-btn inline-flex h-7 items-center gap-0.5 rounded-[6px] px-1.5 text-[13px] transition-colors hover:bg-foreground/5">{t(`thinking.${session.thinkingLevel || 'medium'}`)}<ChevronDown className="h-3 w-3 opacity-50" /></button></DropdownMenuTrigger>
              <StyledDropdownMenuContent side="top" align="end">{thinkingLevels.map(level => <StyledDropdownMenuItem key={level} onClick={() => void window.electronAPI.sessionCommand(session.id, { type: 'setThinkingLevel', level }).then(onChanged)}><span className="flex-1">{t(`thinking.${level}`)}</span>{(session.thinkingLevel || 'medium') === level && <Check className="h-3 w-3" />}</StyledDropdownMenuItem>)}</StyledDropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu>
              <DropdownMenuTrigger asChild><button type="button" className="input-toolbar-btn inline-flex h-7 items-center gap-0.5 rounded-[6px] px-1.5 text-[13px] transition-colors hover:bg-foreground/5">{t(`mode.${session.permissionMode || 'ask'}`)}<ChevronDown className="h-3 w-3 opacity-50" /></button></DropdownMenuTrigger>
              <StyledDropdownMenuContent side="top" align="end">{(['safe', 'ask', 'allow-all'] as const).map(mode => <StyledDropdownMenuItem key={mode} onClick={() => void window.electronAPI.sessionCommand(session.id, { type: 'setPermissionMode', mode }).then(onChanged)}><span className="flex-1">{t(`mode.${mode}`)}</span>{(session.permissionMode || 'ask') === mode && <Check className="h-3 w-3" />}</StyledDropdownMenuItem>)}</StyledDropdownMenuContent>
            </DropdownMenu>
            {session.isProcessing ? <Button className="ml-1 h-8 w-8 rounded-full p-0" type="button" variant="secondary" onClick={() => void window.electronAPI.cancelProcessing(session.id).then(onChanged)} aria-label="Stop"><Square className="h-3 w-3 fill-current" /></Button> : <Button className="ml-1 h-8 w-8 rounded-full p-0" type="submit" disabled={!draft.trim() && attachments.length === 0} aria-label="Send">↑</Button>}
          </div>
        </div>
      </div>
    </form>
  </div>
}
