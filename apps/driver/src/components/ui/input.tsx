import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"
import { cn } from "cn"

// shadcn input with the yrd design system's field (design/yrd/components/forms/Input.jsx): the height
// follows the density (--control-h), radius-control, a 2 px focus ring with 2 px offset.
function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        "h-control w-full min-w-0 rounded-control border border-input bg-background px-3 text-base text-foreground transition-colors duration-150 outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-50 aria-invalid:border-destructive aria-invalid:focus-visible:ring-destructive",
        className
      )}
      {...props}
    />
  )
}

export { Input }
