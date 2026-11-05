"use client";

import { useId, type ComponentPropsWithRef } from "react";
import { Field, fieldControl, fieldDescription } from "./field";

export type SelectProps = ComponentPropsWithRef<"select"> & { label: string; hint?: string; error?: string; wrapperClassName?: string };

/** Labeled native select; preserves keyboard behavior. @example <Select label="Location"><option>Europe</option></Select> */
export function Select({ id, label, hint, error, className = "", wrapperClassName, "aria-describedby": describedBy, "aria-invalid": invalid, ...props }: SelectProps) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  return (
    <Field id={fieldId} label={label} hint={hint} error={error} className={wrapperClassName}>
      <select {...props} id={fieldId} aria-invalid={error ? true : invalid} aria-describedby={fieldDescription(fieldId, hint, error, describedBy)} className={`${fieldControl} ${className}`} />
    </Field>
  );
}
