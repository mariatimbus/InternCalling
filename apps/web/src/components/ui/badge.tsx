import type { ComponentPropsWithRef } from "react";

export type BadgeProps = ComponentPropsWithRef<"span"> & {
  variant?: "neutral" | "accent";
};

/** Non-interactive label. Defaults to neutral. @example <Badge>Remote</Badge> */
export function Badge({ variant = "neutral", className = "", ...props }: BadgeProps) {
  return <span {...props} className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium ${variant === "accent" ? "bg-primary/15 text-accent" : "bg-accent/8 text-muted"} ${className}`} />;
}
