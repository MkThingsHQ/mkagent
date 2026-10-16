/**
 * Info_Alert
 *
 * Banner (mockup `.banner`): a role tint with a matching inset hairline, the icon in the role's
 * solved text color, a semibold title and secondary body text.
 * - warning: neutral (paused / disabled notices)
 * - error:   destructive tint
 * - info:    info (amber "needs you") tint
 * - success: success tint
 */

import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const alertVariants = cva('rounded-lg', {
  variants: {
    variant: {
      warning: 'bg-fill-hover inset-ring inset-ring-border',
      error: 'bg-destructive-tint inset-ring inset-ring-[var(--destructive-border)]',
      info: 'bg-info-tint inset-ring inset-ring-[var(--info-border)]',
      success: 'bg-success-tint inset-ring inset-ring-[var(--success-border)]',
    },
    inline: {
      true: 'px-3.5 py-2',
      false: 'px-3.5 py-3',
    },
  },
  defaultVariants: {
    variant: 'warning',
    inline: false,
  },
})

const iconColor: Record<NonNullable<VariantProps<typeof alertVariants>['variant']>, string> = {
  warning: 'text-secondary',
  error: 'text-destructive',
  info: 'text-info',
  success: 'text-success',
}

export interface Info_AlertProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof alertVariants> {
  /** Optional leading icon */
  icon?: React.ReactNode
}

function Info_AlertRoot({
  variant,
  inline,
  icon,
  className,
  children,
  ...props
}: Info_AlertProps) {
  return (
    <div className={cn(alertVariants({ variant, inline }), className)} {...props}>
      <div className="flex items-start gap-2.5 text-label">
        {icon && (
          <span className={cn('mt-px shrink-0 [&_svg]:size-4', iconColor[variant ?? 'warning'])}>{icon}</span>
        )}
        <div className="flex-1 min-w-0">{children}</div>
      </div>
    </div>
  )
}

function Info_AlertTitle({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn('font-semibold text-foreground', className)} {...props} />
}

function Info_AlertDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('mt-0.5 leading-5 text-secondary', className)} {...props} />
}

export const Info_Alert = Object.assign(Info_AlertRoot, {
  Title: Info_AlertTitle,
  Description: Info_AlertDescription,
})
