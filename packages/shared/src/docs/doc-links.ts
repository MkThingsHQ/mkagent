/** Documentation links and summaries for retained settings and features. */

const DOC_BASE_URL = 'https://mkagent.app/docs';

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
    path: '/skills',
    title: 'Skills',
    summary: 'Create and use reusable SKILL.md instruction sets.',
  },
  permissions: {
    path: '/permissions',
    title: 'Permissions',
    summary: 'Control Explore, Ask, and Execute behavior.',
  },
  workspaces: {
    path: '/workspaces',
    title: 'Workspaces',
    summary: 'Keep sessions, Skills, permissions, and settings isolated.',
  },
  themes: {
    path: '/themes',
    title: 'Themes',
    summary: 'Configure light, dark, system, and preset themes.',
  },
  'app-settings': {
    path: '/settings',
    title: 'App Settings',
    summary: 'Configure connections, models, proxy, language, and updates.',
  },
  preferences: {
    path: '/preferences',
    title: 'Preferences',
    summary: 'Personalize agent responses with workspace preferences.',
  },
  browser: {
    path: '/browser',
    title: 'Browser',
    summary: 'Use the built-in browser and browser_tool safely.',
  },
  documents: {
    path: '/document-tools',
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
