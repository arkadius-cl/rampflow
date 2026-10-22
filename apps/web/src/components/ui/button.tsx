import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"

// shadcn button on Base UI with the yrd design system's variants (design/yrd/components/core/Button.jsx):
// the height follows the density (--control-h), size "lg" is the one primary button of the hall (72 px).
const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center gap-2 rounded-control border border-transparent font-medium whitespace-nowrap transition-colors duration-150 ease-yrd outline-none select-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-icon",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground hover:brightness-110 dark:hover:brightness-95",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-accent hover:text-accent-foreground aria-expanded:bg-accent aria-expanded:text-accent-foreground",
        outline:
          "border-border bg-background text-foreground hover:bg-muted aria-expanded:bg-muted",
        ghost:
          "bg-transparent text-foreground hover:bg-muted aria-expanded:bg-muted",
        destructive:
          "bg-destructive text-destructive-foreground hover:brightness-110 focus-visible:ring-destructive",
        link: "bg-transparent text-primary underline underline-offset-4 hover:text-accent-foreground",
      },
      size: {
        default: "h-control px-4 text-base",
        xs: "h-6 px-2 text-xs [&_svg:not([class*='size-'])]:size-3",
        sm: "h-control-sm px-3 text-sm [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-control-primary px-6 text-md [&_svg:not([class*='size-'])]:size-6",
        icon: "size-control p-0",
        "icon-xs": "size-6 p-0 [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-control-sm p-0 [&_svg:not([class*='size-'])]:size-3.5",
        "icon-lg": "size-control-primary p-0 [&_svg:not([class*='size-'])]:size-6",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
