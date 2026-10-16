import * as React from 'react'
import { cancelFlip, playFlip, snapshotRects, type FlipAxis, type FlipSnapshot, type FlipTarget, type RectLike } from './flip'
import { SPRING, type SpringPreset } from './presets'

export interface FlipOnChangeProps {
  /** A FLIP runs on every commit where this value changes (compared with Object.is). */
  value: unknown
  /** Read in the new render: false makes the change instant (keyboard toggles, drags, compact layouts). */
  enabled: boolean
  /** The elements to animate. Called before the DOM changes (old elements) and after (current elements). */
  getTargets: () => FlipTarget[]
  spring?: SpringPreset
  axis?: FlipAxis
  /** Receives the started animations (empty when nothing moved or motion is reduced). */
  onPlay?: (animations: Animation[], change: { from: unknown; to: unknown }) => void
  /**
   * Match old and new rects by key instead of element identity — needed when React re-creates an
   * element while it moves (a list row that changes group lands under a different parent).
   */
  keyOf?: (el: HTMLElement) => string | null
  children?: React.ReactNode
}

/**
 * Runs a FLIP around a React commit: rects are measured in `getSnapshotBeforeUpdate` — after render, before
 * any DOM mutation, the only point React offers where the old layout is still readable — and the
 * animations start in `componentDidUpdate`, before the browser paints the new layout. Renders its
 * children unchanged (no wrapper element).
 */
export class FlipOnChange extends React.Component<FlipOnChangeProps> {
  override getSnapshotBeforeUpdate(prev: FlipOnChangeProps): FlipSnapshot | Map<string, RectLike> | null {
    if (!this.props.enabled || Object.is(prev.value, this.props.value)) return null
    const rects = snapshotRects(this.props.getTargets().map((t) => t.el))
    const { keyOf } = this.props
    if (!keyOf) return rects
    const byKey = new Map<string, RectLike>()
    for (const [el, rect] of rects) {
      const key = keyOf(el)
      if (key != null) byKey.set(key, rect)
    }
    return byKey
  }

  override componentDidUpdate(prev: FlipOnChangeProps, _state: unknown, snapshot: FlipSnapshot | Map<string, RectLike> | null): void {
    if (!snapshot) return
    const targets = this.props.getTargets()
    // An interrupted FLIP keeps its visual position: the snapshot already includes its in-flight
    // transform, so cancel it before the new layout is measured.
    cancelFlip(targets.map((t) => t.el))
    const { keyOf } = this.props
    let before = snapshot as FlipSnapshot
    if (keyOf) {
      const byKey = snapshot as Map<string, RectLike>
      before = new Map()
      for (const { el } of targets) {
        const key = keyOf(el)
        const rect = key != null ? byKey.get(key) : undefined
        if (rect) before.set(el, rect)
      }
    }
    const animations = playFlip(before, targets, { spring: this.props.spring ?? SPRING.panel, axis: this.props.axis })
    this.props.onPlay?.(animations, { from: prev.value, to: this.props.value })
  }

  override render(): React.ReactNode {
    return this.props.children
  }
}
