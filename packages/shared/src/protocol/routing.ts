/** Channel ownership for the Electron-local adapter and workspace server. */

import { getAllChannelValues, RPC_CHANNELS } from './channels.ts';

const LOCAL_NAMESPACES = [
  RPC_CHANNELS.workspaces,
  RPC_CHANNELS.window,
  RPC_CHANNELS.theme,
  RPC_CHANNELS.system,
  RPC_CHANNELS.update,
  RPC_CHANNELS.shell,
  RPC_CHANNELS.menu,
  RPC_CHANNELS.deeplink,
  RPC_CHANNELS.auth,
  RPC_CHANNELS.dialog,
  RPC_CHANNELS.notification,
  RPC_CHANNELS.input,
  RPC_CHANNELS.power,
  RPC_CHANNELS.appearance,
  RPC_CHANNELS.caching,
  RPC_CHANNELS.rtk,
  RPC_CHANNELS.badge,
  RPC_CHANNELS.releaseNotes,
  RPC_CHANNELS.git,
  RPC_CHANNELS.gitbash,
  RPC_CHANNELS.browserPane,
] as const;

const localValues: string[] = LOCAL_NAMESPACES.flatMap(namespace => Object.values(namespace));

// Native file/folder pickers and local filesystem paths never cross the server boundary.
localValues.push(
  RPC_CHANNELS.file.OPEN_DIALOG,
  RPC_CHANNELS.file.READ_USER_ATTACHMENT,
  RPC_CHANNELS.skills.OPEN_EDITOR,
  RPC_CHANNELS.skills.OPEN_FINDER,
  RPC_CHANNELS.debug.LOG,
  RPC_CHANNELS.settings.GET_NETWORK_PROXY,
  RPC_CHANNELS.settings.SET_NETWORK_PROXY,
  RPC_CHANNELS.settings.GET_SERVER_CONFIG,
  RPC_CHANNELS.settings.SET_SERVER_CONFIG,
  RPC_CHANNELS.settings.GET_SERVER_STATUS,
);

export const LOCAL_ONLY_CHANNELS = new Set<string>(localValues);

export const REMOTE_ELIGIBLE_CHANNELS = new Set<string>(
  getAllChannelValues().filter(channel => !LOCAL_ONLY_CHANNELS.has(channel)),
);

export type ChannelRoute = 'local' | 'remote';

export function getChannelRoute(channel: string): ChannelRoute | undefined {
  if (LOCAL_ONLY_CHANNELS.has(channel)) return 'local';
  if (REMOTE_ELIGIBLE_CHANNELS.has(channel)) return 'remote';
  return undefined;
}
