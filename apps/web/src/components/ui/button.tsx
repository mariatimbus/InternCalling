import type { ComponentPropsWithRef } from "react";

/** Native button properties plus the shared visual options. */
export type ButtonProps = ComponentPropsWithRef<"button"> & {
  /** Visual emphasis; defaults to primary. */
  variant?: "primary" | "secondary" | "ghost";
  /** Control dimensions; defaults to md. */
  size?: "sm" | "md";
};

const variants = {
  primary: "border-transparent bg-primary text-on-primary enabled:hover:bg-primary-hover",
  secondary: "border-border/60 bg-surface text-foreground enabled:hover:border-accent/70 enabled:hover:bg-elevated",
  ghost: "border-transparent bg-transparent text-muted enabled:hover:bg-elevated enabled:hover:text-foreground",
};

const sizes = {
  sm: "min-h-10 px-3",
  md: "min-h-11 px-4",
};

/**
 * Presentation-only action button. Defaults to primary, md, and type="button".
 * Uses the global B1 keyboard focus outline and native disabled behavior.
 * Provide visible children or an accessible name for icon-only content.
 * Use className for contextual layout; use Link for navigation.
 * Event handlers must be supplied from a Client Component.
 * @example <Button variant="secondary" size="sm">Close</Button>
 */
export function Button({
  variant = "primary",
  size = "md",
  type = "button",
  className,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      type={type}
      className={[
        "inline-flex items-center justify-center gap-2 rounded-control border py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50",
        variants[variant],
        sizes[size],
        className,
      ].filter(Boolean).join(" ")}
    >
      {children}
    </button>
  );
}
