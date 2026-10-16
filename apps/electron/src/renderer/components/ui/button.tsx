import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import { Tooltip, TooltipContent, TooltipTrigger } from "@mkagent/ui/ui/tooltip"
import { cn } from "@/lib/utils"
import { Kbd, KbdGroup } from "./kbd"

/**
 * Buttons (design spec D5): ONE primary treatment — the solid accent — for the action that moves
 * the user forward (Continue, confirm, Allow, Send). Secondary is a raised neutral; Cancel/Deny are
 * ghost; danger-solid only for irreversible confirmations. Hover-in is instant, hover-out 100ms,
 * press scales to .97 (motion-press).
 */
const buttonVariants = cva(
  "motion-press inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-md font-medium select-none disabled:pointer-events-none disabled:text-disabled aria-disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        primary: "state-overlay bg-accent-solid text-on-accent disabled:bg-fill-hover",
        secondary: "state-overlay bg-raised text-foreground shadow-elev-1 disabled:bg-fill-hover disabled:shadow-none",
        ghost: "text-foreground hover:bg-fill-hover active:bg-fill-pressed data-[state=open]:bg-fill-hover aria-expanded:bg-fill-hover",
        /** Destructive action that is not irreversible (e.g. Remove) */
        danger: "text-destructive hover:bg-destructive-tint active:bg-destructive-tint",
        /** Irreversible confirmations only */
        "danger-solid": "state-overlay bg-destructive-solid text-on-destructive disabled:bg-fill-hover",
        link: "text-accent underline-offset-4 hover:underline",
        /** @deprecated use `primary` */
        default: "state-overlay bg-accent-solid text-on-accent disabled:bg-fill-hover",
        /** @deprecated use `secondary` */
        outline: "state-overlay bg-raised text-foreground shadow-elev-1 disabled:bg-fill-hover disabled:shadow-none",
        /** @deprecated use `danger-solid` */
        destructive: "state-overlay bg-destructive-solid text-on-destructive disabled:bg-fill-hover",
      },
      size: {
        sm: "h-control-sm rounded-sm px-2 text-label-sm",
        md: "h-control px-2.5 text-label",
        lg: "h-control-lg px-3 text-label",
        xl: "h-control-xl px-4 text-label-lg",
        "icon-sm": "size-control-sm rounded-sm",
        icon: "size-control",
        "icon-lg": "size-control-lg",
        /** @deprecated use `md` */
        default: "h-control px-2.5 text-label",
      },
    },
    // Links read as inline text: no control height or padding whatever the size
    compoundVariants: [{ variant: "link", className: "h-auto px-0" }],
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        data-slot="button"
        data-variant={variant ?? "primary"}
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

const iconButtonVariants = cva(
  "motion-press inline-grid flex-none place-items-center rounded-md text-secondary hover:bg-fill-hover hover:text-foreground active:bg-fill-pressed aria-expanded:bg-fill-hover aria-expanded:text-foreground aria-pressed:bg-fill-hover aria-pressed:text-foreground data-[state=open]:bg-fill-hover data-[state=open]:text-foreground disabled:pointer-events-none disabled:text-disabled [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      size: {
        sm: "size-control-sm rounded-sm",
        md: "size-control",
        lg: "size-control-lg",
      },
    },
    defaultVariants: { size: "md" },
  }
)

export interface IconButtonProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "aria-label" | "children">,
    VariantProps<typeof iconButtonVariants> {
  /** Accessible name — required: icon-only controls must be named (WCAG 4.1.2). */
  "aria-label": string
  /** The icon (16px by default) */
  icon: React.ReactNode
  /** Show a tooltip: `true` repeats the aria-label, or pass custom content. */
  tooltip?: React.ReactNode | true
  /** Keycaps shown in the tooltip, e.g. ["⌘", "B"] */
  shortcut?: string[]
  asChild?: boolean
}

/**
 * Icon-only button: ≥ 28px (36px in the compact shell), never shrinks, always named.
 */
const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ className, size, icon, tooltip, shortcut, asChild = false, type = "button", ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    const button = (
      <Comp
        data-slot="icon-button"
        type={asChild ? undefined : type}
        className={cn(iconButtonVariants({ size, className }))}
        ref={ref}
        {...props}
      >
        {icon}
      </Comp>
    )
    if (!tooltip && !shortcut?.length) return button
    return (
      <Tooltip>
        <TooltipTrigger asChild>{button}</TooltipTrigger>
        <TooltipContent>
          {tooltip === true || tooltip === undefined ? props["aria-label"] : tooltip}
          {shortcut?.length ? (
            <KbdGroup>
              {shortcut.map((key) => (
                <Kbd key={key}>{key}</Kbd>
              ))}
            </KbdGroup>
          ) : null}
        </TooltipContent>
      </Tooltip>
    )
  }
)
IconButton.displayName = "IconButton"

export { Button, buttonVariants, IconButton, iconButtonVariants }
