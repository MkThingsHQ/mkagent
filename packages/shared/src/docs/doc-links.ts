/** Documentation links and summaries for retained settings and features. */

const DOC_BASE_URL = 'https://mkagent.app/docs';

export type DocFeature =
  | 'sources'
  | 'sources-api'
  | 'sources-mcp'
  | 'sources-local'
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
  sources: {
    path: '/sources/overview',
    title: 'Sources',
    summary:
      'Connect external data like MCP servers, REST APIs, and local filesystems. Sources give your agent tools to access services like GitHub, Linear, or your Obsidian vault.',
  },
  'sources-api': {
    path: '/sources/apis/overview',
    title: 'APIs',
    summary:
      'Connect to any REST API with flexible authentication. Make HTTP requests to external services directly from your conversations.',
  },
  'sources-mcp': {
    path: '/sources/mcp-servers/overview',
    title: 'MCP Servers',
    summary:
      'Connect to Model Context Protocol servers for rich tool integrations. MCP servers provide structured access to services like GitHub, Linear, and Notion.',
  },
  'sources-local': {
    path: '/sources/local-filesystems',
    title: 'Local Folders',
    summary:
      'Give your agent access to local directories like Obsidian vaults, code repositories, or data folders on your machine.',
  },
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
