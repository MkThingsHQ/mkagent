import { cn } from "@/lib/utils"

interface ProviderMarkProps {
  /** URL of the provider's SVG (Vite asset import) */
  src: string
  /**
   * Monochrome marks are drawn as a mask filled with `currentColor`, so they follow the text color
   * in light and dark mode (a black <img> logo vanishes on dark surfaces — audit P1). Colored brand
   * marks keep their own colors.
   */
  mono?: boolean
  className?: string
}

/** A provider's brand mark (spec §7.15: marks in currentColor, never a monochrome <img>). */
export function ProviderMark({ src, mono = false, className }: ProviderMarkProps) {
  if (!mono) {
    return <img src={src} alt="" aria-hidden="true" className={cn("size-6 shrink-0 object-contain", className)} />
  }
  return (
    <span
      aria-hidden="true"
      className={cn("size-6 shrink-0 bg-current", className)}
      style={{
        maskImage: `url("${src}")`,
        WebkitMaskImage: `url("${src}")`,
        maskSize: "contain",
        WebkitMaskSize: "contain",
        maskRepeat: "no-repeat",
        WebkitMaskRepeat: "no-repeat",
        maskPosition: "center",
        WebkitMaskPosition: "center",
      }}
    />
  )
}
