import { describe, expect, it } from 'bun:test';
import { getReleaseNotesList, isReleaseNoteFilename } from './index.ts';

describe('release notes loader', () => {
  it('treats only X.Y.Z.md files as release notes', () => {
    expect(isReleaseNoteFilename('0.1.1.md')).toBe(true);
    expect(isReleaseNoteFilename('10.0.12.md')).toBe(true);
    expect(isReleaseNoteFilename('next.md')).toBe(false);
    expect(isReleaseNoteFilename('README.md')).toBe(false);
    expect(isReleaseNoteFilename('0.1.md')).toBe(false);
    expect(isReleaseNoteFilename('0.1.1.md.bak')).toBe(false);
    expect(isReleaseNoteFilename('v0.1.1.md')).toBe(false);
  });

  it("never surfaces a non-semver version in the What's New list", () => {
    for (const note of getReleaseNotesList()) {
      expect(note.version).toMatch(/^\d+\.\d+\.\d+$/);
    }
  });
});
