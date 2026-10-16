import { describe, it, expect } from 'bun:test'
import { whiteContrastOn, workspaceAvatarBackground, workspaceAvatarLightness } from '../workspace-avatar-color'

describe('workspace avatar color', () => {
  it('keeps the white initial at WCAG AA (4.5:1) for every hue', () => {
    for (let hue = 0; hue < 360; hue++) {
      expect(whiteContrastOn(hue, workspaceAvatarLightness(hue))).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('never gets lighter than the previous fixed tile and keeps the hue', () => {
    for (let hue = 0; hue < 360; hue += 15) {
      expect(workspaceAvatarLightness(hue)).toBeLessThanOrEqual(52)
      expect(workspaceAvatarBackground(hue)).toStartWith(`hsl(${hue}, 45%, `)
    }
  })

  it('was below AA for some hues at the old 52% lightness', () => {
    expect(whiteContrastOn(30, 52)).toBeLessThan(4.5)
  })
})
