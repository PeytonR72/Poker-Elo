import type React from "react"
import { Toaster as Sonner } from "sonner"

type ToasterProps = React.ComponentProps<typeof Sonner>

function Toaster({ ...props }: ToasterProps) {
  return (
    <Sonner
      theme="dark"
      position="top-center"
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast flex items-center gap-3 rounded-lg border border-edge bg-surface-3 p-4 text-sm text-neutral-100 shadow-e2",
          title: "font-medium text-neutral-50",
          description: "text-muted-foreground",
          actionButton:
            "rounded-md bg-emerald px-2 py-1 text-xs font-medium text-primary-foreground",
          cancelButton:
            "rounded-md bg-surface-2 px-2 py-1 text-xs font-medium text-neutral-300",
          success: "[&_[data-icon]]:text-emerald",
          error: "border-danger-dim [&_[data-icon]]:text-danger",
        },
      }}
      style={
        {
          "--normal-bg": "var(--color-surface-3)",
          "--normal-border": "var(--color-edge)",
          "--normal-text": "#e6e6e6",
        } as React.CSSProperties
      }
      {...props}
    />
  )
}

export { Toaster }
