import { Tabs as TabsPrimitive } from "@base-ui/react/tabs"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"

// shadcn tabs on Base UI with the yrd design system's two looks (design/yrd/components/surfaces/Tabs.jsx):
// "default" is the segmented filter (Today · Tomorrow · Week), "line" the underlined page sections.
// The height follows the density (--control-h).
function Tabs({
  className,
  orientation = "horizontal",
  ...props
}: TabsPrimitive.Root.Props) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      data-orientation={orientation}
      className={cn(
        "group/tabs flex gap-2 data-horizontal:flex-col",
        className
      )}
      {...props}
    />
  )
}

const tabsListVariants = cva(
  "group/tabs-list inline-flex w-fit items-center justify-center text-muted-foreground group-data-vertical/tabs:h-fit group-data-vertical/tabs:flex-col",
  {
    variants: {
      variant: {
        default:
          "gap-0.5 rounded-control border border-border bg-muted p-0.5",
        line: "gap-1 rounded-none border-b border-border bg-transparent",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function TabsList({
  className,
  variant = "default",
  ...props
}: TabsPrimitive.List.Props & VariantProps<typeof tabsListVariants>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      data-variant={variant}
      className={cn(tabsListVariants({ variant }), className)}
      {...props}
    />
  )
}

// Exported so routed page tabs (shells/page.tsx) draw exactly like a line tab.
const tabTriggerClass = {
  base: "relative inline-flex flex-1 items-center justify-center gap-2 px-3 text-base font-medium whitespace-nowrap text-muted-foreground transition-colors duration-150 ease-yrd outline-none group-data-vertical/tabs:w-full group-data-vertical/tabs:justify-start hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 data-active:text-foreground aria-[current=page]:text-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-icon",
  segmented:
    "group-data-[variant=default]/tabs-list:h-[calc(var(--control-h)-4px)] group-data-[variant=default]/tabs-list:rounded-[calc(var(--radius)-2px)] group-data-[variant=default]/tabs-list:data-active:bg-background group-data-[variant=default]/tabs-list:data-active:shadow-sm",
  line: "-mb-px h-control rounded-t-sm border-b-2 border-transparent data-active:border-primary aria-[current=page]:border-primary",
}

function TabsTrigger({ className, ...props }: TabsPrimitive.Tab.Props) {
  return (
    <TabsPrimitive.Tab
      data-slot="tabs-trigger"
      className={cn(
        tabTriggerClass.base,
        tabTriggerClass.segmented,
        "group-data-[variant=line]/tabs-list:-mb-px group-data-[variant=line]/tabs-list:h-control group-data-[variant=line]/tabs-list:rounded-t-sm group-data-[variant=line]/tabs-list:border-b-2 group-data-[variant=line]/tabs-list:border-transparent group-data-[variant=line]/tabs-list:data-active:border-primary",
        className
      )}
      {...props}
    />
  )
}

function TabsContent({ className, ...props }: TabsPrimitive.Panel.Props) {
  return (
    <TabsPrimitive.Panel
      data-slot="tabs-content"
      className={cn("flex-1 text-base outline-none", className)}
      {...props}
    />
  )
}

export { Tabs, TabsList, TabsTrigger, TabsContent, tabsListVariants, tabTriggerClass }
