import * as React from "react"
import * as TabsPrimitive from "@radix-ui/react-tabs"
import { cn } from "@/lib/utils"

const Tabs = TabsPrimitive.Root

/** Segmented control: neutral well, the selected item is raised (floating + elev-1). */
function TabsList({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn(
        "inline-flex h-control items-center justify-center gap-0.5 rounded-md bg-fill-hover p-0.5 text-secondary",
        className
      )}
      {...props}
    />
  )
}

function TabsTrigger({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        "motion-press inline-flex h-control-sm items-center justify-center gap-1.5 whitespace-nowrap rounded-sm px-2.5 text-label-sm font-medium text-secondary hover:text-foreground disabled:pointer-events-none disabled:text-disabled data-[state=active]:bg-floating data-[state=active]:text-foreground data-[state=active]:shadow-elev-1 [&_svg]:size-3.5 [&_svg]:shrink-0",
        className
      )}
      {...props}
    />
  )
}

function TabsContent({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn("mt-2 outline-none", className)}
      {...props}
    />
  )
}

export { Tabs, TabsList, TabsTrigger, TabsContent }
