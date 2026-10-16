import { cn } from "@/lib/utils"
import { Button, type ButtonProps } from "@/components/ui/button"
import { Spinner } from "@mkagent/ui"

/* =============================================================================
   ONBOARDING PRIMITIVES

   Shared components for consistent styling across all onboarding steps.
   These primitives make it easy to:
   - Change styles globally (one place to update)
   - Maintain consistent spacing and typography
   - Keep step components focused on their logic
============================================================================= */

// =============================================================================
// STEP ICON
// =============================================================================

export type StepIconVariant = 'primary' | 'success' | 'error' | 'loading' | 'none'

interface StepIconProps {
  /** The icon to display (should be a lucide-react icon or SVG) */
  children: React.ReactNode
  /** Visual variant - affects icon color */
  variant?: StepIconVariant
  className?: string
}

const iconVariantStyles: Record<StepIconVariant, { container: string; icon: string }> = {
  primary: {
    container: '',
    icon: 'text-foreground',
  },
  success: {
    container: '',
    icon: 'text-success',
  },
  error: {
    container: '',
    icon: 'text-destructive',
  },
  loading: {
    container: '',
    icon: 'text-foreground',
  },
  none: {
    container: '',
    icon: '',
  },
}

/**
 * StepIcon - Circular icon container for step headers
 *
 * Use at the top of centered step layouts to provide visual context.
 */
export function StepIcon({ children, variant = 'primary', className }: StepIconProps) {
  const styles = iconVariantStyles[variant]

  return (
    <div
      className={cn(
        "step-icon",
        "mb-6 flex size-16 items-center justify-center",
        styles.container,
        className
      )}
    >
      <div className={cn("size-8 [&>svg]:size-full", styles.icon)}>
        {children}
      </div>
    </div>
  )
}

// =============================================================================
// STEP HEADER
// =============================================================================

interface StepHeaderProps {
  /** The main title */
  title: string
  /** Optional description below the title */
  description?: React.ReactNode
  /** Whether to center the text (default: true) */
  centered?: boolean
  className?: string
}

/**
 * StepHeader - Title and description for steps
 *
 * Works for both centered layouts (with icon) and form layouts.
 */
export function StepHeader({
  title,
  description,
  centered = true,
  className
}: StepHeaderProps) {
  return (
    <div className={cn(centered && "text-center", className)}>
      {/* Display moment (spec §3): serif 30/36; the lede is reading copy */}
      <h1 className="step-title font-serif text-display text-foreground text-balance">
        {title}
      </h1>
      {description && (
        <p className={cn("step-description mt-2 text-copy text-secondary", centered && "mx-auto")}>
          {description}
        </p>
      )}
    </div>
  )
}

// =============================================================================
// STEP LAYOUT
// =============================================================================

interface StepFormLayoutProps {
  /** Icon to display at the top, wrapped in StepIcon (optional) */
  icon?: React.ReactNode
  /** Icon variant */
  iconVariant?: StepIconVariant
  /** Raw icon element to display without StepIcon wrapper (optional) */
  iconElement?: React.ReactNode
  /** Step title */
  title: string
  /** Step description */
  description?: React.ReactNode
  /** Action buttons at the bottom */
  actions?: React.ReactNode
  /** Form content */
  children?: React.ReactNode
  /** Whether children should grow to fill available space (for scrollable content) */
  grow?: boolean
  /** Whether to fill parent height without max-height limit */
  fillHeight?: boolean
  className?: string
}

/**
 * StepFormLayout - Unified layout for onboarding steps
 *
 * One visual language for onboarding, login and reauth (spec §7.15): a paper card on the navigator
 * canvas (radius 16, elev-1) with the brand/status mark above it, a left-aligned serif title, a
 * copy lede, full-width content and the actions row. In narrow windows the card flattens onto the
 * canvas (no ring or shadow) so it reads as the page.
 */
export function StepFormLayout({
  icon,
  iconVariant = 'primary',
  iconElement,
  title,
  description,
  actions,
  children,
  grow = false,
  fillHeight = false,
  className
}: StepFormLayoutProps) {
  return (
    <div className={cn(
      "flex w-full max-w-[440px] flex-col items-center",
      grow && !fillHeight && "h-full max-h-[680px]",
      fillHeight && "h-full",
      className
    )}>
      {iconElement && (
        <div className="mb-4 shrink-0">
          {iconElement}
        </div>
      )}
      {icon && !iconElement && (
        <StepIcon variant={iconVariant} className="mb-4">
          {icon}
        </StepIcon>
      )}

      <div className={cn(
        "flex w-full flex-col rounded-xl bg-paper shadow-elev-1 px-7 pt-7 pb-6",
        "max-sm:bg-transparent max-sm:shadow-none max-sm:px-1 max-sm:pt-2",
        (grow || fillHeight) && "flex-1 min-h-0",
      )}>
        <div className="shrink-0">
          <StepHeader title={title} description={description} centered={false} />
        </div>

        {children && (
          <div className={cn(
            "mt-5 w-full",
            (grow || fillHeight) && "flex-1 min-h-0"
          )}>
            {children}
          </div>
        )}

        {actions && (
          <StepActions variant="flex" className="mt-6 w-full shrink-0">
            {actions}
          </StepActions>
        )}
      </div>
    </div>
  )
}

// =============================================================================
// STEP ACTIONS
// =============================================================================

interface StepActionsProps {
  children: React.ReactNode
  /** Layout variant: 'stack' for vertical, 'flex' for horizontal with flex-1 buttons */
  variant?: 'stack' | 'flex'
  className?: string
}

/**
 * StepActions - Container for action buttons
 *
 * - 'stack' variant: Vertical stack, used for centered layouts with multiple CTAs
 * - 'flex' variant: Horizontal with flex-1 buttons, used for Back/Continue patterns
 */
export function StepActions({ children, variant = 'stack', className }: StepActionsProps) {
  return (
    <div
      className={cn(
        "step-actions mt-8",
        variant === 'stack' && "flex flex-col gap-2",
        variant === 'flex' && "flex gap-2 justify-center",
        className
      )}
    >
      {children}
    </div>
  )
}

// =============================================================================
// BUTTON HELPERS
// =============================================================================

interface BackButtonProps extends Omit<ButtonProps, 'variant' | 'children'> {
  children?: React.ReactNode
}

/**
 * BackButton - Back/cancel is a ghost button (spec D5) — never heavier than the primary action
 */
export function BackButton({ children = 'Back', className, ...props }: BackButtonProps) {
  return (
    <Button variant="ghost" size="lg" className={cn("flex-1", className)} {...props}>
      {children}
    </Button>
  )
}

interface ContinueButtonProps extends Omit<ButtonProps, 'children'> {
  children?: React.ReactNode
  loading?: boolean
  loadingText?: string
}

/**
 * ContinueButton - The step's one primary action: solid accent (spec D5)
 */
export function ContinueButton({
  children = 'Continue',
  loading,
  loadingText = 'Loading...',
  className,
  disabled,
  ...props
}: ContinueButtonProps) {
  return (
    <Button variant="primary" size="lg" className={cn("flex-1", className)} disabled={disabled || loading} {...props}>
      {loading ? (
        <>
          <Spinner className="mr-2" />
          {loadingText}
        </>
      ) : (
        children
      )}
    </Button>
  )
}
