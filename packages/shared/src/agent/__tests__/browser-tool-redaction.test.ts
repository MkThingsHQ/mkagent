import { describe, it, expect } from 'bun:test';
import {
  keepPasswordEntryLines,
  passwordFillRefs,
  redactBrowserPasswordFills,
  redactBrowserToolInput,
} from '../browser-tool-redaction.ts';
import { executeBrowserToolCommand } from '../browser-tool-runtime.ts';
import type { BrowserPaneFns } from '../browser-tools.ts';

/** How Claude stores an MCP tool result: its content blocks as pretty-printed JSON. */
function claudeStoredResult(text: string): string {
  return JSON.stringify([{ type: 'text', text }], null, 2);
}

/** Pane functions for fill/click where only `passwordRef` is a password field. */
function loginPage(passwordRef: string): BrowserPaneFns {
  let focused = '';
  return {
    fill: async (ref: string) => { focused = ref; },
    // type/paste go into whatever has focus; `focus @eN` is how these tests move it
    type: async () => {},
    setClipboard: async () => {},
    sendKey: async () => {},
    click: async (ref: string) => { if (ref === '@e404') throw new Error('Element @e404 not found'); focused = ref },
    detectChallenge: async () => ({ detected: false, provider: 'none', signals: [] }),
    // Page metrics after the fill: the filled field has focus.
    evaluate: async () => ({ url: 'https://example.com/login', title: 'Sign in', activeElementTag: 'input', activeElementIsPassword: focused === passwordRef }),
  } as unknown as BrowserPaneFns;
}

describe('passwordFillRefs', () => {
  it('reads the refs from plain runtime output', () => {
    const output = 'Filled password field @e19 (12 characters)\nActive element before: body\nActive element after: input';
    expect(passwordFillRefs(output)).toEqual(['@e19']);
  });

  it('reads the refs from a result stored as JSON content blocks', () => {
    const output = [
      'Filled element @e1 with "user@example.com"',
      'Value length: 16 characters',
      'Filled password field @e2 (7 characters)',
      'Clicked element @e3',
    ].join('\n');
    expect(passwordFillRefs(claudeStoredResult(output))).toEqual(['@e2']);
  });

  it('lists each ref once and finds nothing in other output', () => {
    expect(passwordFillRefs('Filled password field @e2 (3 characters)\nFilled password field @e2 (5 characters)')).toEqual(['@e2']);
    expect(passwordFillRefs('Filled element @e2 with "hello"\nValue length: 5 characters')).toEqual([]);
  });
});

describe('redactBrowserToolInput', () => {
  it('replaces the value of a single fill', () => {
    expect(redactBrowserToolInput({ command: 'fill @e19 hunter2-secret' }, ['@e19']))
      .toEqual({ command: 'fill @e19 [password: 14 characters]' });
  });

  it('redacts only the password fill of a batch and keeps the rest as written', () => {
    const input = { command: 'fill @e1 user@example.com; fill @e2 hunter2; click @e3' };
    expect(redactBrowserToolInput(input, ['@e2']))
      .toEqual({ command: 'fill @e1 user@example.com; fill @e2 [password: 7 characters]; click @e3' });
  });

  it('keeps spacing, separators and the verb as written', () => {
    const input = { command: '  fill @e1 a ;  FILL  @e2   p w  ;; click @e3  ' };
    expect(redactBrowserToolInput(input, ['@e2']))
      .toEqual({ command: '  fill @e1 a ;  FILL  @e2   [password: 3 characters]  ;; click @e3  ' });
  });

  it('handles quoted values with spaces, semicolons and escapes, and a quoted ref', () => {
    expect(redactBrowserToolInput({ command: 'fill @e2 "pa ss;wo\\"rd"; click @e3' }, ['@e2']))
      .toEqual({ command: 'fill @e2 [password: 11 characters]; click @e3' });
    expect(redactBrowserToolInput({ command: "fill '@e2' it's\\;secret; click @e3" }, ['@e2']))
      .toEqual({ command: "fill '@e2' [password: 11 characters]; click @e3" });
    expect(redactBrowserToolInput({ command: 'fill @e2 a\\;b' }, ['@e2']))
      .toEqual({ command: 'fill @e2 [password: 3 characters]' });
  });

  it('redacts array mode', () => {
    expect(redactBrowserToolInput({ command: ['fill', '@e2', 'hunter2'] }, ['@e2']))
      .toEqual({ command: ['fill', '@e2', '[password: 7 characters]'] });
    expect(redactBrowserToolInput({ command: ['fill', '@e2', 'two', 'words'] }, ['@e2']))
      .toEqual({ command: ['fill', '@e2', '[password: 9 characters]'] });
  });

  it('keeps other input fields', () => {
    expect(redactBrowserToolInput({ command: 'fill @e2 hunter2', _intent: 'Sign in' }, ['@e2']))
      .toEqual({ command: 'fill @e2 [password: 7 characters]', _intent: 'Sign in' });
  });

  it('returns the input itself when there is nothing to redact', () => {
    const cases: Array<[Record<string, unknown>, string[]]> = [
      [{ command: 'fill @e2 hunter2' }, []],
      [{ command: 'fill @e1 user@example.com; click @e3' }, ['@e2']],
      [{ command: 'type hunter2; click @e2' }, ['@e2']],
      [{ command: ['fill', '@e1', 'user'] }, ['@e2']],
      [{ command: ['evaluate', 'fill @e2 x'] }, ['@e2']],
      [{ command: 'fill @e2 "unclosed' }, ['@e2']],
      [{ command: 42 }, ['@e2']],
      [{}, ['@e2']],
    ];
    for (const [input, refs] of cases) expect(redactBrowserToolInput(input, refs)).toBe(input);
  });

  it('leaves an already redacted input alone', () => {
    const once = redactBrowserToolInput({ command: 'fill @e2 hunter2; click @e3' }, ['@e2']);
    expect(redactBrowserToolInput(once, ['@e2'])).toBe(once);
    const array = redactBrowserToolInput({ command: ['fill', '@e2', 'hunter2'] }, ['@e2']);
    expect(redactBrowserToolInput(array, ['@e2'])).toBe(array);
  });
});

describe('redactBrowserPasswordFills', () => {
  const input = { command: 'fill @e2 hunter2' };
  const result = 'Filled password field @e2 (7 characters)';

  it('redacts browser_tool inputs whose result reports a password fill', () => {
    expect(redactBrowserPasswordFills('mcp__session__browser_tool', input, result)).toEqual({ command: 'fill @e2 [password: 7 characters]' });
    expect(redactBrowserPasswordFills('browser_tool', input, result)).toEqual({ command: 'fill @e2 [password: 7 characters]' });
  });

  it('returns undefined when there is nothing to redact', () => {
    expect(redactBrowserPasswordFills('Bash', input, result)).toBeUndefined();
    expect(redactBrowserPasswordFills('mcp__session__browser_tool', input, 'Filled element @e2 with "hunter2"')).toBeUndefined();
    expect(redactBrowserPasswordFills('mcp__session__browser_tool', undefined, result)).toBeUndefined();
    expect(redactBrowserPasswordFills('mcp__session__browser_tool', input, undefined)).toBeUndefined();
  });
});

describe('redaction of real runtime output', () => {
  const command = 'fill @e1 user@example.com; fill @e2 hunter2-secret; click @e3';
  const redacted = { command: 'fill @e1 user@example.com; fill @e2 [password: 14 characters]; click @e3' };

  it('finds the password fill in a batch result, plain (Pi) or as JSON content blocks (Claude)', async () => {
    const { output } = await executeBrowserToolCommand({ command, fns: loginPage('@e2'), sessionId: 'test-session' });
    expect(output).not.toContain('hunter2-secret');
    expect(passwordFillRefs(output)).toEqual(['@e2']);
    expect(redactBrowserPasswordFills('mcp__session__browser_tool', { command }, output)).toEqual(redacted);
    expect(redactBrowserPasswordFills('mcp__session__browser_tool', { command }, claudeStoredResult(output))).toEqual(redacted);
  });

  it('finds the password fill of an array-mode call', async () => {
    const arrayCommand = ['fill', '@e2', 'hunter2 secret'];
    const { output } = await executeBrowserToolCommand({ command: arrayCommand, fns: loginPage('@e2'), sessionId: 'test-session' });
    expect(redactBrowserPasswordFills('browser_tool', { command: arrayCommand }, output))
      .toEqual({ command: ['fill', '@e2', '[password: 14 characters]'] });
  });

  it('leaves fills of other fields alone', async () => {
    const { output } = await executeBrowserToolCommand({ command, fns: loginPage('@e9'), sessionId: 'test-session' });
    expect(redactBrowserPasswordFills('mcp__session__browser_tool', { command }, output)).toBeUndefined();
  });
});

// Gaps found when this landed: a batch failing after the fill lost the output line, `type`/`paste`
// into a password field were not marked, and Claude's media summary of a screenshot batch dropped
// the line.
describe('redaction beyond a plain fill', () => {
  it('keeps a fill\'s line when a later command of the batch fails', async () => {
    const command = 'fill @e2 hunter2-secret; click @e404'
    const error = await executeBrowserToolCommand({ command, fns: loginPage('@e2'), sessionId: 'test-session' }).then(() => undefined, (e: unknown) => e) as Error
    expect(error).toBeInstanceOf(Error)
    expect(error.message).toContain('Filled password field @e2')
    expect(error.message).toContain('Command 2 of 2 failed: ')
    expect(error.message).not.toContain('hunter2-secret')
    expect(redactBrowserPasswordFills('browser_tool', { command }, error.message))
      .toEqual({ command: 'fill @e2 [password: 14 characters]; click @e404' })
  })

  it('marks and redacts type and paste into a password field', async () => {
    const fns = loginPage('@e2')
    await executeBrowserToolCommand({ command: 'click @e2', fns, sessionId: 'test-session' }) // focus the field
    const command = 'type hunter2 secret; paste more secret'
    const { output } = await executeBrowserToolCommand({ command, fns, sessionId: 'test-session' })
    expect(output).toContain('Entered text into a password field (14 characters)')
    expect(output).not.toContain('Typed 14 characters')
    expect(redactBrowserPasswordFills('browser_tool', { command }, output))
      .toEqual({ command: 'type [password: 14 characters]; paste [password: 11 characters]' })
    expect(redactBrowserToolInput({ command: ['type', 'hunter2'] }, [], { typedText: true }))
      .toEqual({ command: ['type', '[password: 7 characters]'] })
  })

  it('leaves type into an ordinary field alone', async () => {
    const fns = loginPage('@e2')
    await executeBrowserToolCommand({ command: 'click @e1', fns, sessionId: 'test-session' })
    const command = 'type hello world'
    const { output } = await executeBrowserToolCommand({ command, fns, sessionId: 'test-session' })
    expect(redactBrowserPasswordFills('browser_tool', { command }, output)).toBeUndefined()
  })

  it('keeps password-entry lines when a result is replaced by a summary', () => {
    const original = 'Filled password field @e2 (7 characters)\nEntered text into a password field (3 characters)\nScreenshot captured'
    const kept = keepPasswordEntryLines(original, '[Structured media assets extracted and saved]')
    expect(redactBrowserPasswordFills('browser_tool', { command: 'fill @e2 hunter2; type abc; screenshot' }, kept))
      .toEqual({ command: 'fill @e2 [password: 7 characters]; type [password: 3 characters]; screenshot' })
    expect(keepPasswordEntryLines('Screenshot captured', 'summary')).toBe('summary')
  })
})
