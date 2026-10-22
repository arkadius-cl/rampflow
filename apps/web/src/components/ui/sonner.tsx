"use client"

import { useResolvedTheme } from "@/hooks/use-theme"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import { CircleCheckIcon, InfoIcon, TriangleAlertIcon, OctagonXIcon, Loader2Icon } from "lucide-react"

const Toaster = ({ ...props }: ToasterProps) => {
  // The resolved appearance of <html> (hooks/use-theme.ts); toasts are shadow-lg popovers (design/yrd/components/status/Toast.jsx).
  const theme = useResolvedTheme()

  return (
    <Sonner
      theme={theme}
      className="toaster group"
      icons={{
        success: (
          <CircleCheckIcon className="size-4" />
        ),
        info: (
          <InfoIcon className="size-4" />
        ),
        warning: (
          <TriangleAlertIcon className="size-4" />
        ),
        error: (
          <OctagonXIcon className="size-4" />
        ),
        loading: (
          <Loader2Icon className="size-4 animate-spin" />
        ),
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius-lg)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "cn-toast shadow-lg! border-border!",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
