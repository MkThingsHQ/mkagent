import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  createNodeFileSystem,
  type SessionToolContext,
} from '@mkagent/session-tools-core';
import { updatePreferences } from '../config/preferences.ts';
import { getSessionDataPath, getSessionPath, getSessionPlansPath } from '../sessions/storage.ts';

export function createPiContext(options: {
  sessionId: string;
  workspacePath: string;
  workingDirectory?: string;
  onPlanSubmitted(planPath: string): void;
}): SessionToolContext {
  const sessionPath = getSessionPath(options.workspacePath, options.sessionId);
  const dataPath = getSessionDataPath(options.workspacePath, options.sessionId);
  mkdirSync(dataPath, { recursive: true });

  return {
    sessionId: options.sessionId,
    workspacePath: options.workspacePath,
    skillsPath: join(options.workspacePath, 'skills'),
    plansFolderPath: getSessionPlansPath(options.workspacePath, options.sessionId),
    workingDirectory: options.workingDirectory,
    callbacks: { onPlanSubmitted: options.onPlanSubmitted },
    fs: createNodeFileSystem(),
    updatePreferences: updates => updatePreferences(updates),
    submitFeedback: feedback => {
      const feedbackPath = join(options.workspacePath, 'feedback');
      mkdirSync(feedbackPath, { recursive: true });
      writeFileSync(join(feedbackPath, `${feedback.id}.json`), JSON.stringify(feedback, null, 2));
    },
    sessionPath,
    dataPath,
  };
}
