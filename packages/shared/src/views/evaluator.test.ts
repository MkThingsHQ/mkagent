import { describe, expect, it } from 'bun:test';
import { buildViewContext, compileAllViews, evaluateViews } from './evaluator.ts';
import { getDefaultViews } from './defaults.ts';
import { AVAILABLE_FIELDS } from './validation.ts';

describe('retained built-in views', () => {
  it('matches unread, pending plan, running, and archived session state', () => {
    const context = buildViewContext({
      hasUnread: true,
      isProcessing: true,
      isArchived: true,
      lastMessageRole: 'plan',
    });
    const matches = evaluateViews(context, compileAllViews(getDefaultViews()));

    expect(matches.map(view => view.id)).toEqual([
      'view-new',
      'view-plan',
      'view-processing',
      'view-archived',
    ]);
  });

  it('does not expose removed label or user-status fields', () => {
    const names = AVAILABLE_FIELDS.map(field => field.name);
    expect(names).not.toContain('labels');
    expect(names).not.toContain('labelCount');
    expect(names).not.toContain('sessionStatus');
    expect(names).not.toContain('todoState');
  });
});
