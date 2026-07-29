/** The only deliberate UI differences from the reused Craft renderer. */
export const MKAGENT_UI_PROFILE = {
  sidebarItems: new Set([
    'nav:allSessions',
    'separator:chats-sources',
    'nav:skills',
    'separator:skills-settings',
    'nav:settings',
  ]),
  sources: false,
  kanban: false,
  settings: new Set([
    'app',
    'ai',
    'appearance',
    'input',
    'workspace',
    'permissions',
    'shortcuts',
    'preferences',
  ]),
} as const
