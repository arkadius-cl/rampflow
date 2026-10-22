"use client"

import { Toggle as TogglePrimitive } from "@base-ui/react/toggle"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"

// shadcn toggle on Base UI with the yrd design system's chip (design/yrd/components/core/ToggleGroup.jsx):
// outlined, pressed = accent surface with a primary border, the height follows the density.
const toggleVariants = cva(
  "group/toggle inline-flex items-center justify-center gap-2 rounded-control border border-border bg-background font-medium whitespace-nowrap text-foreground transition-colors duration-150 ease-yrd outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-pressed:border-primary aria-pressed:bg-accent aria-pressed:text-accent-foreground data-[state=on]:border-primary data-[state=on]:bg-accent data-[state=on]:text-accent-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-icon",
  {
    variants: {
      variant: {
        default: "",
        outline: "",
      },
      size: {
        default: "min-h-control min-w-control px-3.5 text-base",
        sm: "min-h-control-sm min-w-control-sm px-3 text-sm [&_svg:not([class*='size-'])]:size-3.5",
        lg: "min-h-control-primary min-w-control-primary px-5 text-md [&_svg:not([class*='size-'])]:size-6",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Toggle({
  className,
  variant = "default",
  size = "default",
  ...props
}: TogglePrimitive.Props & VariantProps<typeof toggleVariants>) {
  return (
    <TogglePrimitive
      data-slot="toggle"
      className={cn(toggleVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Toggle, toggleVariants }
