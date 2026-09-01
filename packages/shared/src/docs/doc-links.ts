/** Documentation links and summaries for retained settings and features. */

const DOC_BASE_URL = 'https://github.com/MkThingsHQ/mkagent';

export type DocFeature =
  | 'skills'
  | 'permissions'
  | 'workspaces'
  | 'themes'
  | 'app-settings'
  | 'preferences'
  | 'browser'
  | 'documents';

export interface DocInfo {
  path: string;
  title: string;
  summary: string;
}

export const DOCS: Record<DocFeature, DocInfo> = {
  skills: {
    path: '/blob/main/docs/skills.md',
    title: 'Skills',
    summary: 'Create and use reusable SKILL.md instruction sets.',
  },
  permissions: {
    path: '/blob/main/docs/permissions.md',
    title: 'Permissions',
    summary: 'Control Explore, Ask, and Execute behavior.',
  },
  workspaces: {
    path: '/blob/main/docs/workspaces.md',
    title: 'Workspaces',
    summary: 'Keep sessions, Skills, permissions, and settings isolated.',
  },
  themes: {
    path: '/blob/main/apps/electron/resources/docs/themes.md',
    title: 'Themes',
    summary: 'Configure light, dark, system, and preset themes.',
  },
  'app-settings': {
    path: '/blob/main/docs/connections.md',
    title: 'App Settings',
    summary: 'Configure connections, models, proxy, language, and updates.',
  },
  preferences: {
    path: '/blob/main/docs/data-directory.md',
    title: 'Preferences',
    summary: 'Personalize agent responses with workspace preferences.',
  },
  browser: {
    path: '/blob/main/docs/browser.md',
    title: 'Browser',
    summary: 'Use the built-in browser and browser_tool safely.',
  },
  documents: {
    path: '/blob/main/docs/document-tools.md',
    title: 'Document Tools',
    summary: 'Read, convert, compare, and render supported document formats.',
  },
};

export function getDocUrl(feature: DocFeature): string {
  return `${DOC_BASE_URL}${DOCS[feature].path}`;
}

export function getDocInfo(feature: DocFeature): DocInfo {
  return DOCS[feature];
}
