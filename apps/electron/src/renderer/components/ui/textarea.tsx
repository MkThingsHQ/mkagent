import * as React from "react"

import { cn } from "@/lib/utils"

/** Multi-line field: same material as Input (field-surface); grows with its content. */
function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "field-surface flex field-sizing-content min-h-16 w-full rounded-md px-2.5 py-2 text-base md:text-label disabled:cursor-not-allowed",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
