import * as React from "react"
import { cn } from "@/lib/utils"

/** Text field: sunken well, hairline, focus-ring tint (field-surface). 16px text below md avoids iOS zoom. */
const Input = React.forwardRef<HTMLInputElement, React.ComponentPropsWithoutRef<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        ref={ref}
        data-slot="input"
        className={cn(
          "field-surface flex h-control-lg w-full min-w-0 rounded-md px-2.5 py-1 text-base md:text-label file:border-0 file:bg-transparent file:text-label file:font-medium file:text-foreground disabled:cursor-not-allowed",
          className
        )}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
