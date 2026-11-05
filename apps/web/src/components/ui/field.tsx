import type { ReactNode } from "react";

export type FieldProps = {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
  className?: string;
};

export const fieldControl = "min-h-11 w-full min-w-0 rounded-control border border-border bg-background/60 px-3 py-2 text-base text-foreground placeholder:text-muted/70 enabled:hover:border-accent disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-accent sm:text-sm";

/** Shared field structure; callers own validation. @example <Field id="name" label="Name">...</Field> */
export function Field({ id, label, hint, error, children, className = "" }: FieldProps) {
  return (
    <div className={`min-w-0 space-y-1.5 ${className}`}>
      <label htmlFor={id} className="block text-xs font-medium text-muted">{label}</label>
      {children}
      {hint && <p id={`${id}-hint`} className="text-xs text-muted">{hint}</p>}
      {error && <p id={`${id}-error`} className="text-sm font-medium text-accent">{error}</p>}
    </div>
  );
}

/** Combines caller descriptions with generated hint/error IDs. */
export function fieldDescription(id: string, hint?: string, error?: string, description?: string) {
  return [description, hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(" ") || undefined;
}
