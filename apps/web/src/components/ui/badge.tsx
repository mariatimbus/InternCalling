import type { ComponentPropsWithRef } from "react";

export type BadgeProps = ComponentPropsWithRef<"span"> & {
  variant?: "neutral" | "accent";
};

/** Non-interactive label. Defaults to neutral. @example <Badge>Remote</Badge> */
export function Badge({ variant = "neutral", className = "", ...props }: BadgeProps) {
  return <span {...props} className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium ${variant === "accent" ? "bg-primary/10 text-accent" : "bg-elevated text-muted"} ${className}`} />;
}
