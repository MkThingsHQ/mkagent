import { cn } from "@/lib/utils"

/**
 * Placeholder for content that is loading. A quiet sweep between two fill strengths that stops
 * under reduced motion. Gate it with `useDelayedLoading` so fast loads never flash a skeleton.
 * Loading *actions* keep using Spinner / LoadingIndicator.
 */
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden
      className={cn("skeleton", className)}
      {...props}
    />
  )
}

export { Skeleton }
