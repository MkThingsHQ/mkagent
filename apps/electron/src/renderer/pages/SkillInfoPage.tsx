import { Check, Minus, Sparkles, X, Zap } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { LoadedSkill } from '@mkagent/shared/skills'
import type { SkillFile } from '@mkagent/shared/protocol'
import { Button } from '@/components/ui/button'
import { SkillMenu } from '@/components/app-shell/SkillMenu'
import { Info_Markdown, Info_Page, Info_Section, Info_Table } from '@/components/info'

export default function SkillInfoPage({ skill, files, workspaceId, onChanged, onAgentEdit }: { skill: LoadedSkill | null; files: SkillFile[]; workspaceId: string; onChanged: () => void; onAgentEdit: (skill: LoadedSkill) => void }) {
  const { t } = useTranslation()
  if (!skill) return <div className="flex h-full items-center justify-center text-muted-foreground"><p className="text-sm">{t('skillsList.noSkillsConfigured')}</p></div>
  const skillName = skill.metadata.name || skill.slug
  const canDelete = skill.source === 'workspace'
  const relativePath = skill.path.includes('/skills/') ? skill.path.slice(skill.path.indexOf('/skills/') + 1) : skill.path
  return <Info_Page>
    <Info_Page.Header
      title={skillName}
      titleMenu={<SkillMenu skillSlug={skill.slug} skillName={skillName} onOpenInNewWindow={() => void window.electronAPI.openUrl(`mkagent://skills/skill/${skill.slug}?window=focused`)} onShowInFinder={() => window.electronAPI.showInFolder(skill.path)} onDelete={canDelete ? () => void window.electronAPI.deleteSkill(workspaceId, skill.slug).then(onChanged) : undefined} canDelete={canDelete} deleteLabel={canDelete ? t('skillInfo.deleteSkill') : t('skillInfo.managedByProject')} />}
      actions={<Button size="sm" variant="ghost" className="gap-1.5" onClick={() => onAgentEdit(skill)}><Sparkles className="h-3.5 w-3.5" />{t('common.edit')}</Button>}
    />
    <Info_Page.Content>
      <Info_Page.Hero avatar={<div className="flex h-full w-full items-center justify-center bg-accent/10 text-accent"><Zap className="h-4 w-4" /></div>} title={skill.metadata.name} tagline={skill.metadata.description} />
      <Info_Section title={t('skillInfo.metadata')}>
        <Info_Table>
          <Info_Table.Row label={t('common.slug')} value={skill.slug} />
          <Info_Table.Row label={t('common.name')} value={skill.metadata.name} />
          <Info_Table.Row label={t('common.description')} value={skill.metadata.description} />
          <Info_Table.Row label={t('common.source')} value={skill.source === 'project' ? t('skillInfo.sourceProject') : skill.source === 'global' ? t('skillInfo.sourceGlobal') : t('skillInfo.sourceWorkspace')} />
          <Info_Table.Row label={t('common.location')}><button onClick={() => void window.electronAPI.showInFolder(skill.path)} className="cursor-pointer text-left hover:underline">{relativePath}</button></Info_Table.Row>
          {files.length > 0 && <Info_Table.Row label={t('common.files')} value={files.map(file => file.name).join(', ')} />}
        </Info_Table>
      </Info_Section>
      {skill.metadata.alwaysAllow && skill.metadata.alwaysAllow.length > 0 && <Info_Section title={t('skillInfo.permissionModes')}>
        <div className="space-y-2 px-4 py-3"><p className="mb-3 text-xs text-muted-foreground">{t('skillInfo.permissionModesDesc')}</p><div className="overflow-hidden rounded-[8px] border border-border/50"><table className="w-full text-sm"><tbody>
          <tr className="border-b border-border/30"><td className="w-[140px] px-3 py-2 font-medium text-muted-foreground">{t('skillInfo.explore')}</td><td className="flex items-center gap-2 px-3 py-2"><X className="h-3.5 w-3.5 shrink-0 text-destructive" /><span className="text-foreground/80">{t('skillInfo.exploreDesc')}</span></td></tr>
          <tr className="border-b border-border/30"><td className="px-3 py-2 font-medium text-muted-foreground">{t('skillInfo.askToEdit')}</td><td className="flex items-center gap-2 px-3 py-2"><Check className="h-3.5 w-3.5 shrink-0 text-success" /><span className="text-foreground/80">{t('skillInfo.askToEditDesc')}</span></td></tr>
          <tr><td className="px-3 py-2 font-medium text-muted-foreground">{t('skillInfo.auto')}</td><td className="flex items-center gap-2 px-3 py-2"><Minus className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /><span className="text-foreground/80">{t('skillInfo.autoDesc')}</span></td></tr>
        </tbody></table></div></div>
      </Info_Section>}
      <Info_Section title={t('skillInfo.instructions')}><Info_Markdown maxHeight={540} fullscreen>{skill.content || t('skillInfo.noInstructions')}</Info_Markdown></Info_Section>
    </Info_Page.Content>
  </Info_Page>
}
