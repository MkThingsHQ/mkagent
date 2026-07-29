/** Shared metadata for retained details pages. */
export type NavigatorType = 'sessions' | 'skills' | 'settings'

export interface DetailsPageMeta {
  navigator: NavigatorType
  slug: string
}
