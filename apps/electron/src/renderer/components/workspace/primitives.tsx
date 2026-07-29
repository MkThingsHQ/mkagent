import { Spinner } from '@mkagent/ui'
import { cn } from '@/lib/utils'
import { Button, type ButtonProps } from '@/components/ui/button'

export function AddWorkspaceContainer({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('flex w-full max-w-[28rem] flex-col items-center rounded-[20px] bg-background p-8 shadow-strong', className)}>{children}</div>
}

export function AddWorkspaceStepHeader({ title, description }: { title: string; description?: React.ReactNode }) {
  return <div className="text-center"><h1 className="text-lg font-semibold tracking-tight">{title}</h1>{description && <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>}</div>
}

export function AddWorkspacePrimaryButton({ children = 'Continue', loading, loadingText, className, disabled, ...props }: Omit<ButtonProps, 'variant' | 'children'> & { children?: React.ReactNode; loading?: boolean; loadingText?: string }) {
  return <Button className={cn('w-full', className)} disabled={disabled || loading} {...props}>{loading ? <><Spinner className="mr-2" />{loadingText || children}</> : children}</Button>
}

export function AddWorkspaceSecondaryButton({ children, className, ...props }: Omit<ButtonProps, 'variant'>) {
  return <Button variant="secondary" size="sm" className={cn('bg-background shadow-minimal', className)} {...props}>{children}</Button>
}
